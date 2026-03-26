/* ══════════════════════════════════════════
   00 Wallet — BIP32/BIP39/BIP44/BIP352 HD Keys
   ══════════════════════════════════════════
   Extracted from 11 duplicated copies.
   Master seed → account nodes → child keys.
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { sha512 } from 'https://esm.sh/@noble/hashes@1.7.1/sha512';
import { hmac } from 'https://esm.sh/@noble/hashes@1.7.1/hmac';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';
import { concat, b2h, h2b, utf8, rand } from './utils.js';
import { pubHashToCashAddr } from './cashaddr.js';

const N_SECP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

/* ── BIP32 core ── */
export function bip32Master(seed) {
  const I = hmac(sha512, utf8('Bitcoin seed'), seed);
  return { priv: I.slice(0, 32), chain: I.slice(32) };
}

export function bip32Child(priv, chain, idx, hard) {
  const ib = new Uint8Array([idx >>> 24, (idx >>> 16) & 0xff, (idx >>> 8) & 0xff, idx & 0xff]);
  const data = hard
    ? concat(new Uint8Array([0]), priv, ib)
    : concat(secp256k1.getPublicKey(priv, true), ib);
  const I = hmac(sha512, chain, data);
  const child = ((BigInt('0x' + b2h(I.slice(0, 32))) + BigInt('0x' + b2h(priv))) % N_SECP)
    .toString(16).padStart(64, '0');
  return { priv: h2b(child), chain: I.slice(32) };
}

export function bip32ChildPub(parentPub, parentChain, index) {
  const ib = new Uint8Array([index >>> 24, (index >>> 16) & 0xff, (index >>> 8) & 0xff, index & 0xff]);
  const data = concat(parentPub, ib);
  const I = hmac(sha512, parentChain, data);
  const il = I.slice(0, 32);
  const childPoint = secp256k1.ProjectivePoint.fromHex(b2h(parentPub))
    .add(secp256k1.ProjectivePoint.BASE.multiply(BigInt('0x' + b2h(il))));
  return { pub: childPoint.toRawBytes(true), chain: I.slice(32) };
}

/* ── BIP44 (m/44'/145'/0') ── */
export function deriveAccountNode(seed64) {
  let n = bip32Master(seed64);
  n = bip32Child(n.priv, n.chain, 0x8000002c, true);  // 44'
  n = bip32Child(n.priv, n.chain, 0x80000091, true);  // 145' (BCH)
  n = bip32Child(n.priv, n.chain, 0x80000000, true);  // 0'
  return n;
}

/* ── BIP352 (m/352'/145'/0') — Stealth ── */
export function deriveBip352Node(seed64) {
  let n = bip32Master(seed64);
  n = bip32Child(n.priv, n.chain, 0x80000160, true);  // 352'
  n = bip32Child(n.priv, n.chain, 0x80000091, true);  // 145' (BCH)
  n = bip32Child(n.priv, n.chain, 0x80000000, true);  // 0'
  return n;
}

/* ── Derive BCH private key (m/44'/145'/0'/0/0) ── */
export function deriveBchPriv(seed64) {
  const acct = deriveAccountNode(seed64);
  let n = bip32Child(acct.priv, acct.chain, 0, false);  // external
  n = bip32Child(n.priv, n.chain, 0, false);              // index 0
  return { priv: n.priv, acctPriv: acct.priv, acctChain: acct.chain };
}

/* ── Derive stealth keys (scan + spend) ── */
export function deriveStealth(seed64) {
  const stealthNode = deriveBip352Node(seed64);
  // m/352'/145'/0'/0' — spend branch
  const spend = bip32Child(stealthNode.priv, stealthNode.chain, 0x80000000, true);
  const spendKey = bip32Child(spend.priv, spend.chain, 0, false);
  // m/352'/145'/0'/1' — scan branch
  const scan = bip32Child(stealthNode.priv, stealthNode.chain, 0x80000001, true);
  const scanKey = bip32Child(scan.priv, scan.chain, 0, false);
  return {
    spendPriv: spendKey.priv,
    spendPub: secp256k1.getPublicKey(spendKey.priv, true),
    scanPriv: scanKey.priv,
    scanPub: secp256k1.getPublicKey(scanKey.priv, true),
  };
}

/* ── Priv → BCH address ── */
export function privToBchAddr(priv32) {
  const pub = secp256k1.getPublicKey(priv32, true);
  return pubHashToCashAddr(Array.from(ripemd160(sha256(pub))));
}

/* ── Pub → hash160 ── */
export function pubToHash160(pub) {
  return ripemd160(sha256(pub));
}

/* ── BIP39 ── */
let _bip39Words = null;
async function _loadBip39Wordlist() {
  if (_bip39Words) return _bip39Words;
  const resp = await fetch('https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt');
  const text = await resp.text();
  _bip39Words = text.trim().split('\n');
  if (_bip39Words.length !== 2048) throw new Error('BIP39 wordlist invalid');
  return _bip39Words;
}

export async function generateMnemonic(strength = 128) {
  const words = await _loadBip39Wordlist();
  const entropy = rand(strength / 8);
  const hash = sha256(entropy);
  const checksumBits = strength / 32;
  let bits = '';
  for (const b of entropy) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < checksumBits; i++) bits += ((hash[0] >> (7 - i)) & 1).toString();
  const indices = [];
  for (let i = 0; i < bits.length; i += 11) indices.push(parseInt(bits.slice(i, i + 11), 2));
  return indices.map(i => words[i]).join(' ');
}

export async function mnemonicToSeed(words) {
  const normalized = words.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = await crypto.subtle.importKey('raw', utf8(normalized), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-512', salt: utf8('mnemonic'), iterations: 2048 },
    key, 512
  );
  return new Uint8Array(bits);
}

export async function validateMnemonic(words) {
  const wordList = await _loadBip39Wordlist();
  const parts = words.trim().toLowerCase().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(parts.length)) return false;
  return parts.every(w => wordList.includes(w));
}

/* ── Re-exports for convenience ── */
export { secp256k1, sha256, ripemd160, hmac };
export { N_SECP };
