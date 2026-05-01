/* ══════════════════════════════════════════
   00 Wallet — BIP32/BIP39/BIP44/BIP352 HD Keys
   ══════════════════════════════════════════
   Extracted from 11 duplicated copies.
   Master seed → account nodes → child keys.
   ══════════════════════════════════════════ */

import { secp256k1 } from '../lib/noble-curves.js';
import { sha256 } from '../lib/noble-hashes.js';
import { sha512 } from '../lib/noble-hashes.js';
import { hmac } from '../lib/noble-hashes.js';
import { ripemd160 } from '../lib/noble-hashes.js';
import { concat, b2h, h2b, utf8, rand } from './utils.js';
import { pubHashToCashAddr } from './cashaddr.js';

const N_SECP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

export interface HdNode {
  priv: Uint8Array;
  chain: Uint8Array;
}

export interface HdPubNode {
  pub: Uint8Array;
  chain: Uint8Array;
}

export interface StealthKeys {
  spendPriv: Uint8Array;
  spendPub: Uint8Array;
  scanPriv: Uint8Array;
  scanPub: Uint8Array;
}

export interface DerivedBchPriv {
  priv: Uint8Array;
  acctPriv: Uint8Array;
  acctChain: Uint8Array;
}

/* ── BIP32 core ── */
export function bip32Master(seed: Uint8Array): HdNode {
  const I = hmac(sha512, utf8('Bitcoin seed'), seed);
  return { priv: I.slice(0, 32), chain: I.slice(32) };
}

export function bip32Child(priv: Uint8Array, chain: Uint8Array, idx: number, hard: boolean): HdNode {
  const ib = new Uint8Array([idx >>> 24, (idx >>> 16) & 0xff, (idx >>> 8) & 0xff, idx & 0xff]);
  const data = hard
    ? concat(new Uint8Array([0]), priv, ib)
    : concat(secp256k1.getPublicKey(priv, true), ib);
  const I = hmac(sha512, chain, data);
  const child = ((BigInt('0x' + b2h(I.slice(0, 32))) + BigInt('0x' + b2h(priv))) % N_SECP)
    .toString(16).padStart(64, '0');
  return { priv: h2b(child), chain: I.slice(32) };
}

export function bip32ChildPub(parentPub: Uint8Array, parentChain: Uint8Array, index: number): HdPubNode {
  const ib = new Uint8Array([index >>> 24, (index >>> 16) & 0xff, (index >>> 8) & 0xff, index & 0xff]);
  const data = concat(parentPub, ib);
  const I = hmac(sha512, parentChain, data);
  const il = I.slice(0, 32);
  const childPoint = secp256k1.ProjectivePoint.fromHex(b2h(parentPub))
    .add(secp256k1.ProjectivePoint.BASE.multiply(BigInt('0x' + b2h(il))));
  return { pub: childPoint.toRawBytes(true), chain: I.slice(32) };
}

/* ── BIP44 (m/44'/145'/0') ── */
export function deriveAccountNode(seed64: Uint8Array): HdNode {
  let n = bip32Master(seed64);
  n = bip32Child(n.priv, n.chain, 0x8000002c, true);  // 44'
  n = bip32Child(n.priv, n.chain, 0x80000091, true);  // 145' (BCH)
  n = bip32Child(n.priv, n.chain, 0x80000000, true);  // 0'
  return n;
}

/* ── BIP352 (m/352'/145'/0') — Stealth ── */
export function deriveBip352Node(seed64: Uint8Array): HdNode {
  let n = bip32Master(seed64);
  n = bip32Child(n.priv, n.chain, 0x80000160, true);  // 352'
  n = bip32Child(n.priv, n.chain, 0x80000091, true);  // 145' (BCH)
  n = bip32Child(n.priv, n.chain, 0x80000000, true);  // 0'
  return n;
}

/* ── Derive BCH private key (m/44'/145'/0'/0/0) ── */
export function deriveBchPriv(seed64: Uint8Array): DerivedBchPriv {
  const acct = deriveAccountNode(seed64);
  let n = bip32Child(acct.priv, acct.chain, 0, false);  // external
  n = bip32Child(n.priv, n.chain, 0, false);              // index 0
  return { priv: n.priv, acctPriv: acct.priv, acctChain: acct.chain };
}

/* ── Derive stealth keys (scan + spend) ── */
export function deriveStealth(seed64: Uint8Array): StealthKeys {
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
export function privToBchAddr(priv32: Uint8Array): string {
  const pub = secp256k1.getPublicKey(priv32, true);
  return pubHashToCashAddr(ripemd160(sha256(pub)));
}

/* ── Pub → hash160 ── */
export function pubToHash160(pub: Uint8Array): Uint8Array {
  return ripemd160(sha256(pub));
}

/* ── BIP39 ── */
let _bip39Words: string[] | null = null;
async function _loadBip39Wordlist(): Promise<string[]> {
  if (_bip39Words) return _bip39Words;
  const resp = await fetch('https://raw.githubusercontent.com/bitcoin/bips/master/bip-0039/english.txt');
  const text = await resp.text();
  _bip39Words = text.trim().split('\n');
  if (_bip39Words.length !== 2048) throw new Error('BIP39 wordlist invalid');
  return _bip39Words;
}

export async function generateMnemonic(strength: number = 128): Promise<string> {
  const words = await _loadBip39Wordlist();
  const entropy = rand(strength / 8);
  const hash = sha256(entropy);
  const checksumBits = strength / 32;
  let bits = '';
  for (const b of entropy) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < checksumBits; i++) bits += ((hash[0] >> (7 - i)) & 1).toString();
  const indices: number[] = [];
  for (let i = 0; i < bits.length; i += 11) indices.push(parseInt(bits.slice(i, i + 11), 2));
  return indices.map(i => words[i]).join(' ');
}

export async function mnemonicToSeed(words: string): Promise<Uint8Array> {
  const normalized = words.trim().toLowerCase().replace(/\s+/g, ' ');
  const key = await crypto.subtle.importKey('raw', utf8(normalized) as unknown as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-512', salt: utf8('mnemonic') as unknown as BufferSource, iterations: 2048 },
    key, 512
  );
  return new Uint8Array(bits);
}

export async function validateMnemonic(words: string): Promise<boolean> {
  const wordList = await _loadBip39Wordlist();
  const parts = words.trim().toLowerCase().split(/\s+/);
  if (![12, 15, 18, 21, 24].includes(parts.length)) return false;
  return parts.every(w => wordList.includes(w));
}

/* ── Re-exports for convenience ── */
export { secp256k1, sha256, ripemd160, hmac };
export { N_SECP };



