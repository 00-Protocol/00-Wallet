/* ══════════════════════════════════════════
   00 Wallet — BIP352 Stealth Address Logic
   ══════════════════════════════════════════
   Extracted from onion.html, fusion.html, wallet.html.
   ECDH-based stealth derivation for BCH.
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';
import { concat, b2h, h2b } from './utils.js';
import { pubHashToCashAddr } from './cashaddr.js';

const N_SECP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

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
   Stealth scanning (receiver side)
   Given receiver's scan private key + sender's pubkey,
   check if an output belongs to us.
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
   Stealth code (compact encoding for sharing)
   Format: "stealth:" + hex(scanPub) + hex(spendPub)
   66 + 66 = 132 hex chars after prefix
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
   Used during scanning: for each input pubkey in a TX,
   derive the expected stealth address and compare.
   ────────────────────────────────────────── */
export function checkStealthMatch(scanPriv, spendPub, senderInputPub, outputHash160, tweakData) {
  const { pub } = stealthScan(scanPriv, senderInputPub, spendPub, tweakData);
  const expectedHash = ripemd160(sha256(pub));
  return b2h(expectedHash) === b2h(outputHash160);
}

/* ══════════════════════════════════════════
   SELF-STEALTH — derive a one-time stealth
   address for yourself (fusion outputs,
   stealth change, etc.)

   Uses ECDH: inputPriv × scanPub
   Nonce: outpoint || outputIndex
   P = B_spend + c*G
   Spending key: b_spend + c
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
  // ECDH: inputPriv × scanPub (symmetric: scanPriv × inputPub)
  const shared = secp256k1.getSharedSecret(inputPriv, scanPub);
  const sharedX = shared.slice(1, 33);

  // Nonce = outpoint + outputIndex (unique per output, deterministic, on-chain recoverable)
  const idxBytes = new Uint8Array(4);
  idxBytes[0] = outputIdx & 0xff;
  idxBytes[1] = (outputIdx >> 8) & 0xff;
  idxBytes[2] = (outputIdx >> 16) & 0xff;
  idxBytes[3] = (outputIdx >> 24) & 0xff;
  const nonce = concat(outpoint, idxBytes);

  // Tweak: c = sha256(sha256(sharedX) || nonce)
  const c = sha256(concat(sha256(sharedX), nonce));
  const cBig = BigInt('0x' + b2h(c)) % N_SECP;

  // Stealth pubkey: P = B_spend + c*G
  const spendPoint = secp256k1.ProjectivePoint.fromHex(spendPub);
  const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(cBig);
  const stealthPoint = spendPoint.add(tweakPoint);
  const stealthPubBytes = stealthPoint.toRawBytes(true);

  // Address from stealth pubkey
  const addr = pubHashToCashAddr(ripemd160(sha256(stealthPubBytes)));

  // Spending key: b + c  (so we can later spend this output)
  const bBig = BigInt('0x' + b2h(spendPriv));
  const pBig = (bBig + cBig) % N_SECP;
  const privKey = h2b(pBig.toString(16).padStart(64, '0'));

  return { addr, pub: stealthPubBytes, priv: privKey };
}

/**
 * Save a stealth UTXO to localStorage so the wallet can spend it.
 * Used after fusion rounds or stealth change creation.
 */
export function saveStealthUtxo(addr, priv, pub, source = 'fusion') {
  const existing = JSON.parse(localStorage.getItem('00stealth_utxos') || '[]');
  // Deduplicate by address
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

/**
 * Load all saved stealth UTXOs.
 */
export function loadStealthUtxos() {
  return JSON.parse(localStorage.getItem('00stealth_utxos') || '[]');
}

/* ══════════════════════════════════════════
   SCAN FOR STEALTH PAYMENTS
   Given an array of pubkey entries from the indexer,
   try every input pubkey as potential ephemeral key.
   For each, derive the expected stealth address and
   check outputs for a match.
   ══════════════════════════════════════════ */

/**
 * Scan pubkey entries for stealth payments addressed to us.
 *
 * @param {Object} keys  - Wallet keys: { stealthScanPriv, stealthSpendPub }
 * @param {Array}  entries - Array of { txid, vin, pubkey, height } from indexer
 * @returns {Array} Found payments: [{ txid, height, value, addr, cBig, outputIdx }]
 */
export async function scanForStealthPayments(keys, entries) {
  const scanPrivHex = keys.stealthScanPriv;
  const spendPubHex = keys.stealthSpendPub;
  if (!scanPrivHex || !spendPubHex) return [];

  const scanPriv = typeof scanPrivHex === 'string' ? h2b(scanPrivHex) : scanPrivHex;
  const spendPub = typeof spendPubHex === 'string' ? h2b(spendPubHex) : spendPubHex;

  // Group entries by txid to avoid re-fetching same TX
  const txMap = new Map();
  for (const e of entries) {
    if (!e.pubkey || !e.txid) continue;
    if (!txMap.has(e.txid)) txMap.set(e.txid, []);
    txMap.get(e.txid).push(e);
  }

  const found = [];

  for (const [txid, pks] of txMap) {
    // For each unique input pubkey in this TX, try ECDH
    const seenPubs = new Set();
    for (const pk of pks) {
      const pubHex = typeof pk.pubkey === 'string' ? pk.pubkey : b2h(pk.pubkey);
      if (seenPubs.has(pubHex)) continue;
      seenPubs.add(pubHex);

      try {
        const senderPub = h2b(pubHex);

        // ECDH: scanPriv × senderPub → shared secret
        const shared = secp256k1.getSharedSecret(scanPriv, senderPub);
        const sharedX = shared.slice(1, 33);

        // Tweak: c = sha256(sha256(sharedX) || senderPub)
        // Must match the sender's derivation in deriveStealthSendAddr which uses ephPub as tweakData
        const c = sha256(concat(sha256(sharedX), senderPub));
        const cBig = BigInt('0x' + b2h(c)) % N_SECP;

        // Expected stealth pubkey: spendPub + c*G
        const spendPoint = secp256k1.ProjectivePoint.fromHex(spendPub);
        const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(cBig);
        const stealthPoint = spendPoint.add(tweakPoint);
        const stealthPubBytes = stealthPoint.toRawBytes(true);

        // Expected address hash
        const expectedHash = b2h(ripemd160(sha256(stealthPubBytes)));
        const addr = pubHashToCashAddr(ripemd160(sha256(stealthPubBytes)));

        // Fetch raw TX and check outputs
        let rawHex;
        try {
          rawHex = await window._fvCall('blockchain.transaction.get', [txid]);
        } catch { continue; }
        if (!rawHex) continue;

        // Parse outputs from raw TX hex looking for P2PKH matching our hash
        const matches = _matchOutputs(rawHex, expectedHash);
        for (const m of matches) {
          found.push({
            txid,
            height: pk.height,
            value: m.value,
            outputIdx: m.idx,
            addr,
            cBig,
          });
          // Auto-save so wallet can spend it
          const privKey = stealthSpendingKey(
            typeof keys.stealthSpendPriv === 'string' ? h2b(keys.stealthSpendPriv) : keys.stealthSpendPriv,
            cBig
          );
          saveStealthUtxo(addr, privKey, stealthPubBytes, 'scan');
        }
      } catch {
        // Invalid pubkey or math error — skip
      }
    }
  }

  return found;
}

/**
 * Parse raw TX hex and find P2PKH outputs matching a given hash160.
 * Returns [{ idx, value }] for each match.
 */
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
      // Value (8 bytes LE)
      const valueLo = raw[offset] | (raw[offset+1] << 8) | (raw[offset+2] << 16) | (raw[offset+3] << 24);
      const valueHi = raw[offset+4] | (raw[offset+5] << 8) | (raw[offset+6] << 16) | (raw[offset+7] << 24);
      const value = valueLo + valueHi * 0x100000000;
      offset += 8;

      const scriptLen = _readVarInt(raw, offset);
      offset = scriptLen.next;
      const script = raw.slice(offset, offset + scriptLen.value);
      offset += scriptLen.value;

      // Check for P2PKH: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
      if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac) {
        const hash160 = b2h(script.slice(3, 23));
        if (hash160 === targetHash160) {
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
  return { value: 0, next: offset + 9 }; // 8-byte — rare
}

/**
 * Derive a stealth address for sending TO a recipient.
 * Uses the sender's own input key for ECDH — the input pubkey is visible
 * in the TX and the receiver scans it via the pubkey indexer.
 * No ephemeral key, no OP_RETURN — zero on-chain fingerprint.
 *
 * @param {Uint8Array} recipScanPub   - Recipient scan pubkey (33 bytes)
 * @param {Uint8Array} recipSpendPub  - Recipient spend pubkey (33 bytes)
 * @param {Uint8Array} senderPrivKey  - Sender's input private key (32 bytes)
 * @returns {{ addr: string, pub: Uint8Array, senderPub: Uint8Array }}
 */
export function deriveStealthSendAddr(recipScanPub, recipSpendPub, senderPrivKey) {
  // Sender's pubkey (will be visible in the TX input — this is the "ephemeral" key)
  const senderPub = secp256k1.getPublicKey(senderPrivKey, true);

  // ECDH: senderPriv × recipScanPub
  const shared = secp256k1.getSharedSecret(senderPrivKey, recipScanPub);
  const sharedX = shared.slice(1, 33);

  // Tweak: c = sha256(sha256(sharedX) || senderPub)
  // Must match scanner's derivation which uses the input pubkey as tweakData
  const c = sha256(concat(sha256(sharedX), senderPub));
  const cBig = BigInt('0x' + b2h(c)) % N_SECP;

  // Stealth pubkey: P = B_spend + c*G
  const spendPoint = secp256k1.ProjectivePoint.fromHex(recipSpendPub);
  const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(cBig);
  const stealthPoint = spendPoint.add(tweakPoint);
  const stealthPubBytes = stealthPoint.toRawBytes(true);

  // Address
  const addr = pubHashToCashAddr(ripemd160(sha256(stealthPubBytes)));

  return { addr, pub: stealthPubBytes, senderPub };
}
