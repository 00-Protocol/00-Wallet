/* ══════════════════════════════════════════
   send-legacy.js — BTC & LTC P2PKH Transaction Builder
   ══════════════════════════════════════════
   Legacy sighash (SIGHASH_ALL = 0x01, no FORKID).
   Works for BTC (version 1) and LTC (version 2).
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 }    from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 }  from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';

/* ── Byte helpers ── */
const h2b = h => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x, 16)));
const b2h = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
function concat(...a) { const r = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let o = 0; for (const x of a) { r.set(x, o); o += x.length; } return r; }
function u32LE(v) { const b = new Uint8Array(4); b[0]=v&0xff; b[1]=(v>>8)&0xff; b[2]=(v>>16)&0xff; b[3]=(v>>24)&0xff; return b; }
function u64LE(v) { const b = new Uint8Array(8); const lo=v&0xffffffff, hi=Math.floor(v/0x100000000); b[0]=lo&0xff; b[1]=(lo>>8)&0xff; b[2]=(lo>>16)&0xff; b[3]=(lo>>24)&0xff; b[4]=hi&0xff; b[5]=(hi>>8)&0xff; b[6]=(hi>>16)&0xff; b[7]=(hi>>24)&0xff; return b; }
function varint(v) { if (v < 0xfd) return new Uint8Array([v]); const b = new Uint8Array(3); b[0]=0xfd; b[1]=v&0xff; b[2]=(v>>8)&0xff; return b; }

/* ── P2PKH script: OP_DUP OP_HASH160 <20> hash160 OP_EQUALVERIFY OP_CHECKSIG ── */
function p2pkhScript(hash160) {
  return new Uint8Array([0x76, 0xa9, 0x14, ...hash160, 0x88, 0xac]);
}

/* ── Base58Check ── */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58CheckDecode(addr) {
  let n = 0n;
  for (const c of addr) { const i = B58.indexOf(c); if (i < 0) throw new Error('Invalid base58'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  while (hex.length < 50) hex = '0' + hex; // 25 bytes = 50 hex
  // Version(1) + Hash160(20) + Checksum(4) = 25 bytes
  return h2b(hex.slice(2, 42)); // return hash160 (skip version byte)
}

function base58CheckEncode(versionByte, hash160) {
  const payload = new Uint8Array([versionByte, ...hash160]);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = concat(payload, checksum);
  let n = 0n;
  for (const b of full) n = n * 256n + BigInt(b);
  let str = '';
  while (n > 0n) { str = B58[Number(n % 58n)] + str; n /= 58n; }
  for (const b of full) { if (b === 0) str = '1' + str; else break; }
  return str;
}

/* ── Address derivation ── */
export function btcAddr(pubKey33) {
  return base58CheckEncode(0x00, ripemd160(sha256(pubKey33)));
}
export function ltcAddr(pubKey33) {
  return base58CheckEncode(0x30, ripemd160(sha256(pubKey33)));
}

/* ── Scripthash for Electrum ── */
export function addrScriptHash(hash160) {
  const script = p2pkhScript(hash160);
  return b2h(sha256(script).reverse());
}

/* ══════════════════════════════════════════
   BUILD & SIGN LEGACY P2PKH TX
   ══════════════════════════════════════════
   Uses legacy sighash (SIGHASH_ALL = 0x01).
   BTC: txVersion=1, LTC: txVersion=2.
   ══════════════════════════════════════════ */

function buildSignedLegacyTx(inputs, outputs, privKey, pubKey33, txVersion = 1) {
  const myScript = p2pkhScript(ripemd160(sha256(pubKey33)));

  // Sign each input
  const sigs = [];
  for (let idx = 0; idx < inputs.length; idx++) {
    // Build preimage: full tx with only current input's script populated
    const parts = [u32LE(txVersion), varint(inputs.length)];
    for (let j = 0; j < inputs.length; j++) {
      parts.push(h2b(inputs[j].txid).reverse()); // txid LE
      parts.push(u32LE(inputs[j].vout));
      if (j === idx) {
        parts.push(varint(myScript.length));
        parts.push(myScript);
      } else {
        parts.push(varint(0)); // empty script
      }
      parts.push(u32LE(0xffffffff)); // sequence
    }
    parts.push(varint(outputs.length));
    for (const o of outputs) {
      parts.push(u64LE(o.value));
      parts.push(varint(o.script.length));
      parts.push(o.script);
    }
    parts.push(u32LE(0)); // locktime
    parts.push(u32LE(1)); // SIGHASH_ALL

    const preimage = concat(...parts);
    const sighash = sha256(sha256(preimage));
    const sig = secp256k1.sign(sighash, privKey);
    sigs.push(concat(sig.toDERRawBytes(), new Uint8Array([0x01]))); // + SIGHASH_ALL
  }

  // Build final raw TX
  const rawParts = [u32LE(txVersion), varint(inputs.length)];
  for (let i = 0; i < inputs.length; i++) {
    const scriptSig = concat(varint(sigs[i].length), sigs[i], varint(pubKey33.length), pubKey33);
    rawParts.push(h2b(inputs[i].txid).reverse());
    rawParts.push(u32LE(inputs[i].vout));
    rawParts.push(varint(scriptSig.length));
    rawParts.push(scriptSig);
    rawParts.push(u32LE(0xffffffff));
  }
  rawParts.push(varint(outputs.length));
  for (const o of outputs) {
    rawParts.push(u64LE(o.value));
    rawParts.push(varint(o.script.length));
    rawParts.push(o.script);
  }
  rawParts.push(u32LE(0)); // locktime
  return b2h(concat(...rawParts));
}

/* ══════════════════════════════════════════
   SEND BTC
   ══════════════════════════════════════════ */
export async function sendBtc({ toAddress, amountSats, feeRate = 2, utxos, privKey, pubKey, sendMax = false }) {
  if (!utxos?.length) throw new Error('No UTXOs available');
  if (!privKey || !pubKey) throw new Error('No signing key');

  const toHash160 = base58CheckDecode(toAddress);
  const myHash160 = ripemd160(sha256(pubKey));

  // Coin selection (simple: select all, greedy)
  utxos.sort((a, b) => b.value - a.value);
  const selected = [];
  let total = 0;
  for (const u of utxos) {
    selected.push(u);
    total += u.value;
    const txSize = 10 + selected.length * 148 + 2 * 34;
    const fee = Math.ceil(txSize * feeRate);
    if (total >= amountSats + fee) break;
  }

  const txSize = 10 + selected.length * 148 + (sendMax ? 1 : 2) * 34;
  const fee = Math.ceil(txSize * feeRate);

  // Send max: adjust amount to total minus fee (single output, no change)
  let finalAmount = amountSats;
  if (sendMax || total < amountSats + fee) {
    const maxSize = 10 + selected.length * 148 + 1 * 34;
    const maxFee = Math.ceil(maxSize * feeRate);
    finalAmount = total - maxFee;
    if (finalAmount < 546) throw new Error('Balance too low to cover fees');
  }

  const change = total - finalAmount - fee;

  // Build outputs
  const outputs = [{ value: finalAmount, script: p2pkhScript(toHash160) }];
  if (!sendMax && change >= 546) outputs.push({ value: change, script: p2pkhScript(myHash160) });

  // Recalculate fee with actual output count
  const realSize = 10 + selected.length * 148 + outputs.length * 34;
  const realFee = Math.ceil(realSize * feeRate);

  // Build and sign (BTC = version 1)
  const rawHex = buildSignedLegacyTx(selected, outputs, privKey, pubKey, 1);

  // Broadcast via Electrum
  if (!window._btcCall) throw new Error('BTC Electrum not connected');
  const result = await window._btcCall('blockchain.transaction.broadcast', [rawHex]);

  if (result && typeof result === 'string' && result.length === 64) {
    return { txid: result, rawHex, fee: realFee, change };
  }
  throw new Error(typeof result === 'string' ? result : JSON.stringify(result));
}

/* ══════════════════════════════════════════
   SEND LTC
   ══════════════════════════════════════════ */
export async function sendLtc({ toAddress, amountSats, feeRate = 2, utxos, privKey, pubKey, sendMax = false }) {
  if (!utxos?.length) throw new Error('No UTXOs available');
  if (!privKey || !pubKey) throw new Error('No signing key');

  const toHash160 = base58CheckDecode(toAddress);
  const myHash160 = ripemd160(sha256(pubKey));

  // Coin selection
  utxos.sort((a, b) => b.value - a.value);
  const selected = [];
  let total = 0;
  for (const u of utxos) {
    selected.push(u);
    total += u.value;
    const txSize = 10 + selected.length * 148 + 2 * 34;
    const fee = Math.ceil(txSize * feeRate);
    if (total >= amountSats + fee) break;
  }

  const txSize = 10 + selected.length * 148 + (sendMax ? 1 : 2) * 34;
  const fee = Math.ceil(txSize * feeRate);

  // Send max: adjust amount to total minus fee (single output, no change)
  let finalAmount = amountSats;
  if (sendMax || total < amountSats + fee) {
    const maxSize = 10 + selected.length * 148 + 1 * 34; // single output
    const maxFee = Math.ceil(maxSize * feeRate);
    finalAmount = total - maxFee;
    if (finalAmount < 546) throw new Error('Balance too low to cover fees');
  }

  const change = total - finalAmount - fee;

  const outputs = [{ value: finalAmount, script: p2pkhScript(toHash160) }];
  if (!sendMax && change >= 546) outputs.push({ value: change, script: p2pkhScript(myHash160) });

  const realSize = 10 + selected.length * 148 + outputs.length * 34;
  const realFee = Math.ceil(realSize * feeRate);

  // Build and sign (LTC = version 2)
  const rawHex = buildSignedLegacyTx(selected, outputs, privKey, pubKey, 2);

  // Broadcast via REST API
  const resp = await fetch('/ltc-api/tx', { method: 'POST', body: rawHex });
  if (!resp.ok) throw new Error('LTC broadcast failed: ' + (await resp.text()));
  const txid = (await resp.text()).trim();

  if (txid && txid.length === 64) {
    return { txid, rawHex, fee: realFee, change };
  }
  throw new Error('Unexpected broadcast result: ' + txid);
}

/* ── Exports ── */
export { p2pkhScript, base58CheckDecode, base58CheckEncode, buildSignedLegacyTx, b2h, h2b };
