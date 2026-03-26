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
