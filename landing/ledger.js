// ─────────────────────────────────────────────────────────────────────────────
// 00 Ledger.js — WebHID APDU transport for Ledger BCH signing
// Supported devices (vendorId 0x2c97):
//   Nano-S 0x0001 | Nano-X 0x0004 | Nano-S+ 0x0005
//   Nano-S new 0x1000 | Nano-X new 0x4000 | Nano-S-Plus 0x5000
//   Stax 0x6000 | Flex 0x7000 | Apex P 0x8000
// BCH: m/44'/145'/0'/0/0, CashAddr, SIGHASH_ALL|FORKID (0x41)
// Uses BIP143 segwit-like mode (type 0x02) — no GET_TRUSTED_INPUT needed
// ─────────────────────────────────────────────────────────────────────────────
(function(G) { 'use strict';

const VENDOR = 0x2c97;
const PIDS   = [
  0x0001, 0x0004, 0x0005,   // Nano S (classic), Nano X (classic), Nano S+
  0x1000, 0x4000, 0x5000,   // Nano-S, Nano-X, Nano-S-Plus (new PIDs — ElectrumABC b03bd41)
  0x6000, 0x7000, 0x8000,   // Stax, Flex, Apex P
];

// BCH derivation path: m/44'/145'/0'/0/0
const BCH_PATH     = [0x8000002c, 0x80000091, 0x80000000, 0x00000000, 0x00000000];
// Account-level path for xpub: m/44'/145'/0'
const ACCOUNT_PATH = [0x8000002c, 0x80000091, 0x80000000];

// ── Binary helpers ─────────────────────────────────────────────────────────────
function concat(...arrs) {
  const r = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of arrs) { r.set(a, o); o += a.length; }
  return r;
}
function le32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}
function le64(n) {
  const big = typeof n === 'bigint' ? n : BigInt(n);
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, Number(big & 0xFFFFFFFFn) >>> 0, true);
  dv.setUint32(4, Number((big >> 32n) & 0xFFFFFFFFn) >>> 0, true);
  return b;
}
function varint(n) {
  if (n < 0xfd)   return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}
function hexToBytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b;
}
function bytesToHex(b) {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}
function encodePath(path) {
  const b = new Uint8Array(1 + path.length * 4);
  b[0] = path.length;
  const dv = new DataView(b.buffer);
  path.forEach((n, i) => dv.setUint32(1 + i * 4, n, false)); // big-endian per BIP32
  return b;
}

// ── HID framing ────────────────────────────────────────────────────────────────
// Ledger HID: 64-byte packets, channel=0x0101, tag=0x05
// Packet 0: [ch(2)] [tag(1)] [seq(2)] [apdu_len(2)] [data≤57]
// Packet N: [ch(2)] [tag(1)] [seq(2)]               [data≤59]
function wrapAPDU(apdu) {
  const pkts = [];
  let off = 0, seq = 0;
  while (true) {
    const pkt = new Uint8Array(64);
    pkt[0] = 0x01; pkt[1] = 0x01; pkt[2] = 0x05;
    pkt[3] = (seq >> 8) & 0xff; pkt[4] = seq & 0xff;
    let ds = 5;
    if (seq === 0) { pkt[5] = (apdu.length >> 8) & 0xff; pkt[6] = apdu.length & 0xff; ds = 7; }
    const chunk = apdu.slice(off, off + (64 - ds));
    pkt.set(chunk, ds);
    pkts.push(pkt); off += chunk.length; seq++;
    if (off >= apdu.length) break;
  }
  return pkts;
}

// ── Device exchange ────────────────────────────────────────────────────────────
async function exchange(device, apduData) {
  for (const pkt of wrapAPDU(apduData)) await device.sendReport(0, pkt);

  return new Promise((resolve, reject) => {
    let resp = null, total = 0, received = 0;
    const tOut = setTimeout(() => {
      device.removeEventListener('inputreport', handler);
      reject(new Error('Ledger timeout — is the Bitcoin Cash app open and unlocked?'));
    }, 30000);

    function handler(e) {
      const raw = new Uint8Array(e.data.buffer);
      if (raw[0] !== 0x01 || raw[1] !== 0x01 || raw[2] !== 0x05) return;
      const seqNum = (raw[3] << 8) | raw[4];
      let ds = 5;
      if (seqNum === 0) { total = (raw[5] << 8) | raw[6]; resp = new Uint8Array(total); ds = 7; }
      if (!resp) return;
      const take = Math.min(raw.slice(ds).length, total - received);
      resp.set(raw.slice(ds, ds + take), received); received += take;
      if (received >= total) {
        device.removeEventListener('inputreport', handler);
        clearTimeout(tOut);
        const sw = (resp[resp.length - 2] << 8) | resp[resp.length - 1];
        if (sw === 0x6985) { reject(new Error('Ledger: request denied on device')); return; }
        if (sw === 0x6e00 || sw === 0x6d00) { reject(new Error('Ledger: open the Bitcoin Cash app on your device')); return; }
        if (sw === 0x6b0c) { reject(new Error('Ledger: device is locked — enter PIN first')); return; }
        if (sw !== 0x9000) { reject(new Error(`Ledger error 0x${sw.toString(16)}`)); return; }
        resolve(resp.slice(0, resp.length - 2));
      }
    }
    device.addEventListener('inputreport', handler);
  });
}

// Build a 5-byte APDU header + data
function apdu(ins, p1, p2, data = new Uint8Array(0)) {
  if (data.length > 255) throw new Error(`APDU data too large: ${data.length}`);
  return concat(new Uint8Array([0xe0, ins, p1, p2, data.length]), data);
}

// ── Connect Ledger via WebHID ──────────────────────────────────────────────────
async function connectLedger() {
  if (!navigator.hid) throw new Error('WebHID not available — use Chrome or Edge');
  const filters = PIDS.map(pid => ({ vendorId: VENDOR, productId: pid }));
  const devs = await navigator.hid.requestDevice({ filters });
  if (!devs.length) throw new Error('No Ledger device selected');
  const dev = devs[0];
  if (!dev.opened) await dev.open();
  return dev;
}

// ── GET WALLET PUBLIC KEY (INS=0x40) ──────────────────────────────────────────
// P1=0x00 no display | P2=0x03 CashAddr output format
// Response: pubKeyLen(1) + pubKey + addrLen(1) + cashaddr + chainCode(32)
async function getLedgerPubKey(device, path = BCH_PATH) {
  const pathB = encodePath(path);
  const resp = await exchange(device, apdu(0x40, 0x00, 0x03, pathB));
  const pkLen = resp[0];
  const pubKey = resp.slice(1, 1 + pkLen);
  const addrLen  = resp[1 + pkLen];
  const addrRaw  = new TextDecoder().decode(resp.slice(2 + pkLen, 2 + pkLen + addrLen));
  const chainCode = resp.slice(2 + pkLen + addrLen, 2 + pkLen + addrLen + 32);
  return { pubKey, addrRaw, chainCode };
}

// ── Build input data for HASH_TX_INPUT_START ────────────────────────────────
// Type 0x02 (BCH/segwit-like): embeds value, no GET_TRUSTED_INPUT needed
// utxo: { txid: hex, vout: number, value: number|bigint }
// scriptCode: Uint8Array (P2PKH scriptPubKey of signing addr) or null → empty script
function buildInputData(utxo, scriptCode) {
  const hash = hexToBytes(utxo.txid).reverse();     // txhash in LE
  const idx  = le32(utxo.vout);
  const val  = le64(utxo.value);
  const seq  = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
  const sc   = scriptCode || new Uint8Array(0);
  return concat(new Uint8Array([0x02]), hash, idx, val, varint(sc.length), sc, seq);
}

// ── Sign BCH transaction on Ledger ────────────────────────────────────────────
// Uses Ledger BIP143 mode (HASH_TX_INPUT_START P2=0x02)
// One signing round per input (N rounds for N inputs)
// In each round: all inputs streamed, only input[i] carries its scriptPubKey
//
// utxos:        [{txid, vout, value}]  — txid as hex string
// outputs:      [{value: number|BigInt, script: Uint8Array}]
// scriptPubKey: Uint8Array OR array of Uint8Array (one per input)
// path:         single path array OR array of path arrays (one per input)
// changePath:   optional BIP32 path array for the change output (outputs[1])
//               → sent via HASH_TX_INPUT_FINALIZE_FULL P1=0xFF so Ledger
//                 recognises the change as internal (no double confirmation)
// Returns: array of Uint8Array — DER signatures with 0x41 sighash byte appended
async function signLedgerTx(device, utxos, outputs, scriptPubKey, path = BCH_PATH) {
  const version = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
  // Support per-input scripts and paths
  const getScript = Array.isArray(scriptPubKey) ? i => scriptPubKey[i] : () => scriptPubKey;
  const getPath   = Array.isArray(path[0])      ? i => path[i]         : () => path;

  // Serialise outputs once (reused for every signing round)
  const outBytes = concat(
    varint(outputs.length),
    ...outputs.map(o => concat(le64(o.value), varint(o.script.length), o.script))
  );

  console.log(`[Ledger] sign: ${utxos.length} input(s), ${outputs.length} output(s), outBytes=${outBytes.length}`);
  outputs.forEach((o, i) => console.log(`[Ledger]   out[${i}] val=${o.value} scriptLen=${o.script.length} head=${bytesToHex(o.script.slice(0,4))}`));

  const sigs = [];

  for (let sigIdx = 0; sigIdx < utxos.length; sigIdx++) {

    // ── HASH_TX_INPUT_START — stream all inputs ──────────────────────────────
    for (let j = 0; j < utxos.length; j++) {
      // Only the input being signed carries the scriptCode; all others → empty
      const sc      = (j === sigIdx) ? getScript(sigIdx) : null;
      const inpData = buildInputData(utxos[j], sc);

      if (j === 0) {
        // P1=0x00 (new tx), P2=0x02 (BCH / BIP143 mode)
        // First APDU also carries version + nInputs varint
        const first = concat(version, varint(utxos.length), inpData);
        console.log(`[Ledger] INPUT_START r${sigIdx} j=0 P2=02 len=${first.length} scLen=${sc ? sc.length : 0}`);
        try { await exchange(device, apdu(0x44, 0x00, 0x02, first)); }
        catch (e) { throw new Error(`INPUT_START r${sigIdx} j=0: ${e.message}`); }
      } else {
        // P1=0x80 (add input), P2=0x00
        console.log(`[Ledger] INPUT_START r${sigIdx} j=${j} P1=80 len=${inpData.length} scLen=${sc ? sc.length : 0}`);
        try { await exchange(device, apdu(0x44, 0x80, 0x00, inpData)); }
        catch (e) { throw new Error(`INPUT_START r${sigIdx} j=${j}: ${e.message}`); }
      }
    }

    // ── HASH_TX_INPUT_FINALIZE_FULL — stream outputs (max 255 bytes/chunk) ───
    let pos = 0;
    while (pos < outBytes.length) {
      const chunk = outBytes.slice(pos, pos + 255);
      pos += 255;
      const p1 = (pos >= outBytes.length) ? 0x80 : 0x00; // 0x80 = last chunk
      console.log(`[Ledger] FINALIZE_FULL r${sigIdx} P1=${p1===0x80?'80':'00'} chunk=${chunk.length}`);
      try { await exchange(device, apdu(0x4a, p1, 0x00, chunk)); }
      catch (e) { throw new Error(`FINALIZE_FULL r${sigIdx} @${pos}: ${e.message}`); }
    }

    // ── HASH_SIGN — sign input[sigIdx] and retrieve DER signature ────────────
    // Data: path | 0x00 (no 2FA) | locktime LE32 | sighash_type (0x41 = BCH)
    const pathB    = encodePath(getPath(sigIdx));
    const signData = concat(pathB, new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x41]));
    console.log(`[Ledger] HASH_SIGN r${sigIdx} path=[${getPath(sigIdx).map(x=>(x>>>0).toString(16)).join('/')}]`);
    let sigResp;
    try { sigResp = await exchange(device, apdu(0x48, 0x00, 0x00, signData)); }
    catch (e) { throw new Error(`HASH_SIGN r${sigIdx}: ${e.message}`); }

    // sigResp may start with a parity/recovery byte before the DER sequence
    const derStart = (sigResp[0] === 0x30) ? 0 : 1;
    const der      = sigResp.slice(derStart);
    sigs.push(concat(der, new Uint8Array([0x41]))); // append BCH sighash type
  }

  return sigs;
}

// ── Build raw signed transaction ───────────────────────────────────────────────
// utxos:   [{txid, vout}]
// sigs:    [Uint8Array] — one DER+sighash per input (from signLedgerTx)
// pubKey:  Uint8Array(33) — compressed public key
// outputs: [{value: number|BigInt, script: Uint8Array}]
// Returns: hex string of the complete raw transaction
function buildLedgerTx(utxos, sigs, pubKey, outputs) {
  const getPub = Array.isArray(pubKey) ? i => pubKey[i] : () => pubKey;
  const inputBytes = utxos.map((u, i) => {
    const hash      = hexToBytes(u.txid).reverse();    // txhash LE
    const idx       = le32(u.vout);
    const seq       = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const sig       = sigs[i];
    const pk        = getPub(i);
    // scriptSig: OP_PUSH(sig_len) sig OP_PUSH(pubkey_len) pubkey
    const scriptSig = concat(new Uint8Array([sig.length]), sig, new Uint8Array([pk.length]), pk);
    return concat(hash, idx, varint(scriptSig.length), scriptSig, seq);
  });

  const outBytes = outputs.map(o => concat(le64(o.value), varint(o.script.length), o.script));

  const raw = concat(
    new Uint8Array([0x01, 0x00, 0x00, 0x00]),   // version 1 LE
    varint(utxos.length),  ...inputBytes,
    varint(outputs.length), ...outBytes,
    new Uint8Array([0x00, 0x00, 0x00, 0x00])    // locktime 0
  );
  return bytesToHex(raw);
}

// ── Public API ────────────────────────────────────────────────────────────────
G.Ledger = { BCH_PATH, ACCOUNT_PATH, connectLedger, getLedgerPubKey, signLedgerTx, buildLedgerTx };

})(window);
