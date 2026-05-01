/**
 * BIP352 Stealth Address – standalone Node.js SDK
 * Core ECDH derivation logic for BCH stealth payments.
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

const N = secp256k1.CURVE.n;

/** Concat Uint8Arrays */
function concat(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

/** hex → Uint8Array */
export function h2b(hex) {
  if (hex.length % 2) throw new Error('odd hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Uint8Array → hex */
export function b2h(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute the one-time stealth pubkey for a recipient.
 * Simplified BIP352 (no UTXO outpoints – suitable for single-use keys).
 *
 * @param {Uint8Array} recipScanPub  33-byte compressed pubkey
 * @param {Uint8Array} recipSpendPub 33-byte compressed pubkey
 * @param {Uint8Array} senderPriv    32-byte private key
 * @returns {{ pub: Uint8Array, senderPub: Uint8Array, spendPriv: Uint8Array }}
 */
export function stealthSend(recipScanPub, recipSpendPub, senderPriv) {
  const senderPub  = secp256k1.getPublicKey(senderPriv, true);
  const shared     = secp256k1.getSharedSecret(senderPriv, recipScanPub);
  const sharedX    = shared.slice(1, 33);
  const c          = sha256(concat(sha256(sharedX), senderPub));
  const cBig       = BigInt('0x' + b2h(c)) % N;

  const spendPoint  = secp256k1.ProjectivePoint.fromHex(recipSpendPub);
  const outputPoint = spendPoint.add(secp256k1.ProjectivePoint.BASE.multiply(cBig));
  const pub         = outputPoint.toRawBytes(true);

  return { pub, senderPub };
}

/**
 * Scan a transaction output to check if it belongs to the recipient.
 *
 * @param {object} myKeys  { scanPriv: Uint8Array, spendPub: Uint8Array }
 * @param {Uint8Array} senderPub  33-byte sender pubkey (from input)
 * @param {Uint8Array} outputPub  33-byte output pubkey to test
 * @returns {boolean}
 */
export function stealthScan(myKeys, senderPub, outputPub) {
  const shared  = secp256k1.getSharedSecret(myKeys.scanPriv, senderPub);
  const sharedX = shared.slice(1, 33);
  const c       = sha256(concat(sha256(sharedX), senderPub));
  const cBig    = BigInt('0x' + b2h(c)) % N;

  const spendPoint    = secp256k1.ProjectivePoint.fromHex(myKeys.spendPub);
  const expectedPoint = spendPoint.add(secp256k1.ProjectivePoint.BASE.multiply(cBig));
  const outPoint      = secp256k1.ProjectivePoint.fromHex(outputPub);

  return expectedPoint.equals(outPoint);
}

/**
 * Recover the stealth private key for claiming a matched output.
 *
 * @param {object} myKeys  { scanPriv: Uint8Array, spendPriv: Uint8Array }
 * @param {Uint8Array} senderPub
 * @returns {Uint8Array} 32-byte private key
 */
export function stealthPriv(myKeys, senderPub) {
  const shared  = secp256k1.getSharedSecret(myKeys.scanPriv, senderPub);
  const sharedX = shared.slice(1, 33);
  const c       = sha256(concat(sha256(sharedX), senderPub));
  const cBig    = BigInt('0x' + b2h(c)) % N;
  const spendBig = BigInt('0x' + b2h(myKeys.spendPriv));
  const privBig  = (spendBig + cBig) % N;
  const hex      = privBig.toString(16).padStart(64, '0');
  return h2b(hex);
}
