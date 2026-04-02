/* ══════════════════════════════════════════
   00 Wallet — BIP352 Stealth Address Logic
   ══════════════════════════════════════════
   ECDH-based stealth derivation for BCH.
   v2 — BIP352 aggregated ECDH:
     sender aggregates all input privkeys (a_sum)
     receiver aggregates all input pubkeys (A_sum)
     → 1 ECDH per TX regardless of input count
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';
import { concat, b2h, h2b } from './utils.js';
import { pubHashToCashAddr } from './cashaddr.js';

const N_SECP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

/* ──────────────────────────────────────────
   Internal helpers
   ────────────────────────────────────────── */

/** Lexicographic byte comparison. Returns negative / 0 / positive. */
function _compareBytes(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** 32-bit little-endian Uint8Array from number. */
function _u32LE(v) {
  return new Uint8Array([v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
}

/* ──────────────────────────────────────────
   Stealth derivation (BIP352-style)
   Given sender's private key + recipient's scan/spend pubkeys,
   derive a one-time stealth public key.
   ────────────────────────────────────────── */
export function stealthDerive(senderPriv, recipScanPub, recipSpendPub, tweakData) {
  const sharedPoint = secp256k1.getSharedSecret(senderPriv, recipScanPub);
  const sharedX = sharedPoint.slice(1, 33);
  const c = sha256(concat(sha256(sharedX), tweakData));
  const cBig = BigInt('0x' + b2h(c)) % N_SECP;
  const spendPoint = secp256k1.ProjectivePoint.fromHex(recipSpendPub);
  const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(cBig);
  const stealthPoint = spendPoint.add(tweakPoint);
  const stealthPub = stealthPoint.toRawBytes(true);
  return { pub: stealthPub, cBig };
}

/* ──────────────────────────────────────────
   Stealth scanning (receiver side, single pubkey)
   ────────────────────────────────────────── */
export function stealthScan(scanPriv, senderPub, spendPub, tweakData) {
  const sharedPoint = secp256k1.getSharedSecret(scanPriv, senderPub);
  const sharedX = sharedPoint.slice(1, 33);
  const c = sha256(concat(sha256(sharedX), tweakData));
  const cBig = BigInt('0x' + b2h(c)) % N_SECP;
  const spendPoint = secp256k1.ProjectivePoint.fromHex(spendPub);
  const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(cBig);
  const stealthPoint = spendPoint.add(tweakPoint);
  return { pub: stealthPoint.toRawBytes(true), cBig };
}

/* ──────────────────────────────────────────
   Compute spending key for a stealth output
   ────────────────────────────────────────── */
export function stealthSpendingKey(spendPriv, cBig) {
  const bBig = BigInt('0x' + b2h(spendPriv));
  return h2b(((bBig + cBig) % N_SECP).toString(16).padStart(64, '0'));
}

/* ──────────────────────────────────────────
   Stealth pub → BCH address
   ────────────────────────────────────────── */
export function stealthPubToAddr(stealthPub) {
  const hash = ripemd160(sha256(stealthPub));
  return pubHashToCashAddr(hash);
}

/* ──────────────────────────────────────────
   Stealth code encoding / decoding
   Format: "stealth:" + hex(scanPub) + hex(spendPub)
   ────────────────────────────────────────── */
export function encodeStealthCode(scanPub, spendPub) {
  return 'stealth:' + b2h(scanPub) + b2h(spendPub);
}

export function decodeStealthCode(code) {
  const hex = code.replace(/^stealth:/, '');
  if (hex.length !== 132) throw new Error('invalid stealth code length');
  return {
    scanPub: h2b(hex.slice(0, 66)),
    spendPub: h2b(hex.slice(66, 132)),
  };
}

/* ──────────────────────────────────────────
   Check if a TX output pubkey matches our stealth
   ────────────────────────────────────────── */
export function checkStealthMatch(scanPriv, spendPub, senderInputPub, outputHash160, tweakData) {
  const { pub } = stealthScan(scanPriv, senderInputPub, spendPub, tweakData);
  const expectedHash = ripemd160(sha256(pub));
  return b2h(expectedHash) === b2h(outputHash160);
}

/* ══════════════════════════════════════════
   SELF-STEALTH — derive one-time stealth address for yourself
   (fusion outputs, stealth change, etc.)
   ══════════════════════════════════════════ */

/**
 * Derive a self-stealth address from own keys.
 * Used when creating CoinJoin fusion outputs or stealth change.
 *
 * @param {Uint8Array} inputPriv     - Private key of the input being spent (32 bytes)
 * @param {Uint8Array} scanPub       - Own stealth scan public key (33 bytes compressed)
 * @param {Uint8Array} spendPub      - Own stealth spend public key (33 bytes compressed)
 * @param {Uint8Array} spendPriv     - Own stealth spend private key (32 bytes)
 * @param {Uint8Array} outpoint      - TXID:vout of the input (36 bytes)
 * @param {number}     outputIdx     - Index of this output in the TX
 * @returns {{ addr: string, pub: Uint8Array, priv: Uint8Array }}
 */
export function deriveSelfStealth(inputPriv, scanPub, spendPub, spendPriv, outpoint, outputIdx) {
  const shared = secp256k1.getSharedSecret(inputPriv, scanPub);
  const sharedX = shared.slice(1, 33);

  const nonce = concat(outpoint, _u32LE(outputIdx));
  const c = sha256(concat(sha256(sharedX), nonce));
  const cBig = BigInt('0x' + b2h(c)) % N_SECP;

  const spendPoint = secp256k1.ProjectivePoint.fromHex(spendPub);
  const stealthPoint = spendPoint.add(secp256k1.ProjectivePoint.BASE.multiply(cBig));
  const stealthPubBytes = stealthPoint.toRawBytes(true);

  const addr = pubHashToCashAddr(ripemd160(sha256(stealthPubBytes)));

  const bBig = BigInt('0x' + b2h(spendPriv));
  const pBig = (bBig + cBig) % N_SECP;
  const privKey = h2b(pBig.toString(16).padStart(64, '0'));

  return { addr, pub: stealthPubBytes, priv: privKey };
}

/* ──────────────────────────────────────────
   Stealth UTXO storage
   ────────────────────────────────────────── */

export function saveStealthUtxo(addr, priv, pub, source = 'fusion') {
  const existing = JSON.parse(localStorage.getItem('00stealth_utxos') || '[]');
  if (existing.some(u => u.addr === addr)) return;
  existing.push({
    addr,
    priv: priv instanceof Uint8Array ? b2h(priv) : priv,
    pub: pub instanceof Uint8Array ? b2h(pub) : pub,
    from: source,
    ts: Math.floor(Date.now() / 1000),
  });
  localStorage.setItem('00stealth_utxos', JSON.stringify(existing));
}

export function loadStealthUtxos() {
  return JSON.parse(localStorage.getItem('00stealth_utxos') || '[]');
}

/* ══════════════════════════════════════════
   SEND — BIP352 aggregated stealth address derivation

   Sender aggregates all input private keys (a_sum = Σ a_i mod N).
   Uses smallest outpoint for input_hash to ensure uniqueness.
   Result: 1 ECDH per send regardless of input count.

   Backward compatible: if no outpoints provided, falls back to
   single-input method (first privkey only).
   ══════════════════════════════════════════ */

/**
 * Derive a stealth address for sending TO a recipient (BIP352 aggregated).
 *
 * @param {Uint8Array}            recipScanPub   - Recipient scan pubkey (33 bytes)
 * @param {Uint8Array}            recipSpendPub  - Recipient spend pubkey (33 bytes)
 * @param {Uint8Array|Uint8Array[]} senderPrivKeys - Sender input private key(s) (32 bytes each)
 * @param {Array}                 [outpoints]    - [{ txid: string (big-endian hex), vout: number }]
 *                                                 If omitted → legacy single-input mode
 * @param {number}                [outputIndex]  - Output index k (default 0)
 * @returns {{ addr: string, pub: Uint8Array, A_sum: Uint8Array }}
 */
export function deriveStealthSendAddr(recipScanPub, recipSpendPub, senderPrivKeys, outpoints, outputIndex = 0) {
  // Normalize to array
  if (!Array.isArray(senderPrivKeys)) senderPrivKeys = [senderPrivKeys];

  // ── Legacy fallback: no outpoints → single-input ECDH (v1 compat) ────────
  if (!outpoints || outpoints.length === 0) {
    const senderPrivKey = typeof senderPrivKeys[0] === 'string'
      ? h2b(senderPrivKeys[0]) : senderPrivKeys[0];
    const senderPub = secp256k1.getPublicKey(senderPrivKey, true);
    const shared = secp256k1.getSharedSecret(senderPrivKey, recipScanPub);
    const sharedX = shared.slice(1, 33);
    const c = sha256(concat(sha256(sharedX), senderPub));
    const cBig = BigInt('0x' + b2h(c)) % N_SECP;
    const spendPoint = secp256k1.ProjectivePoint.fromHex(recipSpendPub);
    const stealthPoint = spendPoint.add(secp256k1.ProjectivePoint.BASE.multiply(cBig));
    const stealthPubBytes = stealthPoint.toRawBytes(true);
    return {
      addr: pubHashToCashAddr(ripemd160(sha256(stealthPubBytes))),
      pub: stealthPubBytes,
      A_sum: senderPub,
    };
  }

  // ── BIP352 aggregation ────────────────────────────────────────────────────

  // 1. a_sum = Σ a_i  mod N  (sum all input private keys)
  let a_sum = 0n;
  for (const priv of senderPrivKeys) {
    const privBytes = typeof priv === 'string' ? h2b(priv) : priv;
    a_sum = (a_sum + BigInt('0x' + b2h(privBytes))) % N_SECP;
  }
  const a_sum_bytes = h2b(a_sum.toString(16).padStart(64, '0'));
  const A_sum = secp256k1.getPublicKey(a_sum_bytes, true); // A_sum = a_sum × G

  // 2. Smallest outpoint: lex-min of (txid_LE || vout_LE 4-byte)
  //    txid string from wallet is big-endian → reverse to little-endian for wire format
  let smallest = null;
  for (const op of outpoints) {
    const txidHex = typeof op.txid === 'string' ? op.txid : b2h(op.txid);
    const txidLE = h2b(txidHex).reverse(); // big-endian hex → little-endian bytes
    const vout = op.vout || 0;
    const outpoint = concat(txidLE, _u32LE(vout));
    if (!smallest || _compareBytes(outpoint, smallest) < 0) smallest = outpoint;
  }

  // 3. input_hash = SHA256(smallest_outpoint || A_sum)
  const input_hash = sha256(concat(smallest, A_sum));
  const input_hash_big = BigInt('0x' + b2h(input_hash)) % N_SECP;

  // 4. Tweaked ECDH: shared = (a_sum × input_hash) × B_scan
  //    = tweaked_priv × B_scan  where tweaked_priv = a_sum × input_hash mod N
  const tweaked_a = (a_sum * input_hash_big) % N_SECP;
  const tweaked_a_bytes = h2b(tweaked_a.toString(16).padStart(64, '0'));
  const shared = secp256k1.getSharedSecret(tweaked_a_bytes, recipScanPub);
  const sharedX = shared.slice(1, 33);

  // 5. t_k = SHA256(sharedX || ser_32(k))
  const t = sha256(concat(sharedX, _u32LE(outputIndex)));
  const tBig = BigInt('0x' + b2h(t)) % N_SECP;

  // 6. Stealth pubkey: P = B_spend + t*G
  const spendPoint = secp256k1.ProjectivePoint.fromHex(recipSpendPub);
  const stealthPoint = spendPoint.add(secp256k1.ProjectivePoint.BASE.multiply(tBig));
  const stealthPubBytes = stealthPoint.toRawBytes(true);
  const addr = pubHashToCashAddr(ripemd160(sha256(stealthPubBytes)));

  return { addr, pub: stealthPubBytes, A_sum };
}

/* ══════════════════════════════════════════
   SCAN — BIP352 aggregated scanning

   Groups indexer entries by txid. For each TX:
   - Aggregates all input pubkeys: A_sum = Σ A_i
   - Finds smallest outpoint (from indexer data)
   - Computes input_hash, tweaks scan privkey
   - 1 ECDH per TX, tries k=0,1,2 for multiple outputs

   Legacy fallback: if entries lack outpointTxid (old indexer
   format or manual TX check), falls back to single-input ECDH (v1 compat).
   ══════════════════════════════════════════ */

/**
 * Scan indexer entries for stealth payments to us.
 *
 * @param {Object} keys    - { stealthScanPriv, stealthSpendPub, stealthSpendPriv? }
 * @param {Array}  entries - [{ txid, vin, pubkey, height, outpointTxid?, outpointVout? }]
 * @returns {Array}        - Found payments [{ txid, height, value, outputIdx, addr, tBig }]
 */
export async function scanForStealthPayments(keys, entries) {
  const scanPrivHex = keys.stealthScanPriv;
  const spendPubHex = keys.stealthSpendPub;
  if (!scanPrivHex || !spendPubHex) return [];

  const scanPriv = typeof scanPrivHex === 'string' ? h2b(scanPrivHex) : scanPrivHex;
  const spendPub = typeof spendPubHex === 'string' ? h2b(spendPubHex) : spendPubHex;
  const scanPrivBig = BigInt('0x' + b2h(scanPriv)) % N_SECP;

  // Group entries by txid
  const txMap = new Map();
  for (const e of entries) {
    if (!e.pubkey || !e.txid) continue;
    if (!txMap.has(e.txid)) txMap.set(e.txid, []);
    txMap.get(e.txid).push(e);
  }

  const found = [];

  for (const [txid, inputs] of txMap) {

    // ── Determine if we have outpoints (BIP352) or not (legacy) ───────────
    const hasOutpoints = inputs.some(inp => inp.outpointTxid != null);

    if (!hasOutpoints) {
      // ── Legacy path: single-input ECDH (no outpoints in entries) ─────────
      // Covers old indexer format and _doStealthCheckTx before parseRawTxInputs
      let rawHex;
      try { rawHex = await window._fvCall('blockchain.transaction.get', [txid]); } catch { continue; }
      if (!rawHex) continue;

      const seenPubs = new Set();
      for (const inp of inputs) {
        const pubHex = typeof inp.pubkey === 'string' ? inp.pubkey : b2h(inp.pubkey);
        if (seenPubs.has(pubHex)) continue;
        seenPubs.add(pubHex);
        try {
          const senderPub = h2b(pubHex);
          const shared = secp256k1.getSharedSecret(scanPriv, senderPub);
          const sharedX = shared.slice(1, 33);
          const c = sha256(concat(sha256(sharedX), senderPub));
          const cBig = BigInt('0x' + b2h(c)) % N_SECP;
          const spendPoint = secp256k1.ProjectivePoint.fromHex(spendPub);
          const stealthPubBytes = spendPoint.add(secp256k1.ProjectivePoint.BASE.multiply(cBig)).toRawBytes(true);
          const expectedHash = b2h(ripemd160(sha256(stealthPubBytes)));
          const addr = pubHashToCashAddr(ripemd160(sha256(stealthPubBytes)));
          for (const m of _matchOutputs(rawHex, expectedHash)) {
            found.push({ txid, height: inp.height, value: m.value, outputIdx: m.idx, addr, tBig: cBig });
            if (keys.stealthSpendPriv) {
              const spendPriv = typeof keys.stealthSpendPriv === 'string' ? h2b(keys.stealthSpendPriv) : keys.stealthSpendPriv;
              saveStealthUtxo(addr, stealthSpendingKey(spendPriv, cBig), stealthPubBytes, 'scan-legacy');
            }
          }
        } catch { /* invalid pubkey */ }
      }
      continue;
    }

    // ── BIP352 path ────────────────────────────────────────────────────────

    // 1. A_sum = Σ input pubkeys (EC point addition)
    let A_sum = null;
    for (const inp of inputs) {
      const pubHex = typeof inp.pubkey === 'string' ? inp.pubkey : b2h(inp.pubkey);
      try {
        const pt = secp256k1.ProjectivePoint.fromHex(pubHex);
        A_sum = A_sum ? A_sum.add(pt) : pt;
      } catch { continue; }
    }
    if (!A_sum) continue;
    const A_sum_bytes = A_sum.toRawBytes(true); // 33 bytes compressed

    // 2. Smallest outpoint: lex-min of (txid_LE || vout_LE)
    //    outpointTxid from indexer is big-endian hex → reverse to LE
    let smallest = null;
    for (const inp of inputs) {
      if (inp.outpointTxid == null) continue;
      const txidHex = typeof inp.outpointTxid === 'string' ? inp.outpointTxid : b2h(inp.outpointTxid);
      const txidLE = h2b(txidHex).reverse();
      const outpoint = concat(txidLE, _u32LE(inp.outpointVout || 0));
      if (!smallest || _compareBytes(outpoint, smallest) < 0) smallest = outpoint;
    }
    if (!smallest) continue;

    // 3. input_hash = SHA256(smallest_outpoint || A_sum)
    const input_hash = sha256(concat(smallest, A_sum_bytes));
    const input_hash_big = BigInt('0x' + b2h(input_hash)) % N_SECP;

    // 4. Tweaked scan key: b_scan × input_hash  (so ECDH = tweaked_scan × A_sum)
    const tweakedScanPrivBig = (scanPrivBig * input_hash_big) % N_SECP;
    const tweakedScanPriv = h2b(tweakedScanPrivBig.toString(16).padStart(64, '0'));

    const shared = secp256k1.getSharedSecret(tweakedScanPriv, A_sum_bytes);
    const sharedX = shared.slice(1, 33);

    // Fetch raw TX once (needed to match outputs)
    let rawHex;
    try { rawHex = await window._fvCall('blockchain.transaction.get', [txid]); } catch { continue; }
    if (!rawHex) continue;

    // 5. Try output index k = 0, 1, 2 (covers single and multi-output stealth)
    //    Stop when k yields no match (no more outputs to us in this TX)
    for (let k = 0; k < 3; k++) {
      const t = sha256(concat(sharedX, _u32LE(k)));
      const tBig = BigInt('0x' + b2h(t)) % N_SECP;

      const spendPoint = secp256k1.ProjectivePoint.fromHex(spendPub);
      const stealthPubBytes = spendPoint.add(secp256k1.ProjectivePoint.BASE.multiply(tBig)).toRawBytes(true);
      const expectedHash = b2h(ripemd160(sha256(stealthPubBytes)));
      const addr = pubHashToCashAddr(ripemd160(sha256(stealthPubBytes)));

      const matches = _matchOutputs(rawHex, expectedHash);
      if (matches.length === 0) break; // No match for k → done for this TX

      for (const m of matches) {
        found.push({
          txid,
          height: inputs[0]?.height,
          value: m.value,
          outputIdx: m.idx,
          addr,
          tBig,
        });
        if (keys.stealthSpendPriv) {
          const spendPriv = typeof keys.stealthSpendPriv === 'string' ? h2b(keys.stealthSpendPriv) : keys.stealthSpendPriv;
          saveStealthUtxo(addr, stealthSpendingKey(spendPriv, tBig), stealthPubBytes, 'scan');
        }
      }
    }
  }

  return found;
}

/* ══════════════════════════════════════════
   Parse raw TX hex → input pubkeys + outpoints
   Used by _doStealthCheckTx to feed BIP352 scanner
   with full entry data (pubkey + outpointTxid + outpointVout).
   ══════════════════════════════════════════ */

/**
 * Parse a raw TX hex and extract all P2PKH input pubkeys + their outpoints.
 * Returns entries compatible with scanForStealthPayments.
 *
 * @param {string} rawHex - Raw transaction hex
 * @param {string} [txid] - Transaction ID (big-endian hex). Computed if omitted.
 * @returns {Array} [{ txid, vin, pubkey, outpointTxid, outpointVout, height }]
 */
export function parseRawTxInputs(rawHex, txid) {
  const results = [];
  try {
    const raw = h2b(rawHex);

    // Compute txid if not provided: dSHA256(raw) reversed
    if (!txid) {
      const h1 = sha256(raw);
      const h2 = sha256(h1);
      txid = b2h(new Uint8Array([...h2].reverse()));
    }

    let offset = 4; // skip version
    const inputCount = _readVarInt(raw, offset);
    offset = inputCount.next;

    for (let vin = 0; vin < inputCount.value; vin++) {
      // Outpoint: prevTxid (32 bytes LE) + vout (4 bytes LE)
      const prevTxidLE = raw.slice(offset, offset + 32);
      offset += 32;
      const vout = raw[offset] | (raw[offset + 1] << 8) | (raw[offset + 2] << 16) | (raw[offset + 3] << 24);
      offset += 4;

      const scriptLen = _readVarInt(raw, offset);
      offset = scriptLen.next;
      const script = raw.slice(offset, offset + scriptLen.value);
      offset += scriptLen.value;
      offset += 4; // sequence

      // P2PKH scriptSig: <sigPush><DER_sig+sighash><0x21><33-byte-pubkey>
      if (script.length >= 35) {
        const sigLen = script[0];
        if (sigLen >= 0x47 && sigLen <= 0x49 && script[sigLen + 1] === 0x21) {
          const pk = script.slice(sigLen + 2, sigLen + 2 + 33);
          if ((pk[0] === 0x02 || pk[0] === 0x03) && pk.length === 33) {
            // prevTxid: reverse LE bytes → big-endian hex
            const outpointTxid = b2h(new Uint8Array([...prevTxidLE].reverse()));
            results.push({
              txid,
              vin,
              pubkey: b2h(pk),
              outpointTxid,
              outpointVout: vout,
              height: 0,
            });
          }
        }
      }
    }
  } catch { /* partial parse ok */ }
  return results;
}

/* ──────────────────────────────────────────
   Parse raw TX outputs for P2PKH hash160 match
   Returns [{ idx, value }] for each match.
   ────────────────────────────────────────── */
function _matchOutputs(rawHex, targetHash160) {
  const matches = [];
  try {
    const raw = h2b(rawHex);
    let offset = 4; // skip version

    // Skip inputs
    let inputCount = raw[offset++];
    if (inputCount === 0) { offset++; inputCount = raw[offset++]; } // segwit marker
    for (let i = 0; i < inputCount; i++) {
      offset += 32 + 4; // prev txid + vout
      const scriptLen = _readVarInt(raw, offset);
      offset = scriptLen.next + scriptLen.value + 4; // script + sequence
    }

    // Parse outputs
    const outputCount = _readVarInt(raw, offset);
    offset = outputCount.next;
    for (let i = 0; i < outputCount.value; i++) {
      const valueLo = raw[offset] | (raw[offset+1] << 8) | (raw[offset+2] << 16) | (raw[offset+3] << 24);
      const valueHi = raw[offset+4] | (raw[offset+5] << 8) | (raw[offset+6] << 16) | (raw[offset+7] << 24);
      const value = valueLo + valueHi * 0x100000000;
      offset += 8;

      const scriptLen = _readVarInt(raw, offset);
      offset = scriptLen.next;
      const script = raw.slice(offset, offset + scriptLen.value);
      offset += scriptLen.value;

      // P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
      if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9 &&
          script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac) {
        if (b2h(script.slice(3, 23)) === targetHash160) {
          matches.push({ idx: i, value });
        }
      }
    }
  } catch {}
  return matches;
}

function _readVarInt(buf, offset) {
  const first = buf[offset];
  if (first < 0xfd) return { value: first, next: offset + 1 };
  if (first === 0xfd) return { value: buf[offset+1] | (buf[offset+2] << 8), next: offset + 3 };
  if (first === 0xfe) return { value: buf[offset+1] | (buf[offset+2] << 8) | (buf[offset+3] << 16) | (buf[offset+4] << 24), next: offset + 5 };
  return { value: 0, next: offset + 9 }; // 8-byte varint — rare
}
