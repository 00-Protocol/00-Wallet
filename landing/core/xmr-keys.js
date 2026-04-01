/* ══════════════════════════════════════════
   xmr-keys.js — Monero Key Derivation
   ══════════════════════════════════════════
   Derives XMR spend/view keys from BIP32 HD seed.
   Path: m/44'/145'/0'/5/0

   spendPriv = scReduce32(childPriv)
   viewPriv  = scReduce32(keccak256(spendPriv))
   ══════════════════════════════════════════ */

import { ed25519 } from 'https://esm.sh/@noble/curves@1.8.1/ed25519';
import { keccak_256 as _nobleKeccak } from 'https://esm.sh/@noble/hashes@1.7.1/sha3';

/* ── Keccak-256 — use noble/hashes (correct impl) ── */
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KECCAK_ROT = [
  [0,1,62,28,27],[36,44,6,55,20],[3,10,43,25,39],[41,45,15,21,8],[18,2,61,56,14]
];

function keccakF1600(state) {
  for (let round = 0; round < 24; round++) {
    // θ
    const C = new Array(5);
    for (let x = 0; x < 5; x++) C[x] = state[x] ^ state[x+5] ^ state[x+10] ^ state[x+15] ^ state[x+20];
    for (let x = 0; x < 5; x++) {
      const D = C[(x+4)%5] ^ ((C[(x+1)%5] << 1n) | (C[(x+1)%5] >> 63n)) & 0xFFFFFFFFFFFFFFFFn;
      for (let y = 0; y < 25; y += 5) state[y+x] ^= D;
    }
    // ρ + π
    const B = new Array(25);
    for (let x = 0; x < 5; x++)
      for (let y = 0; y < 5; y++) {
        const r = BigInt(KECCAK_ROT[y][x]);
        const v = state[y*5+x];
        B[((2*x+3*y)%5)*5+x] = r ? ((v << r) | (v >> (64n - r))) & 0xFFFFFFFFFFFFFFFFn : v;
      }
    // χ
    for (let y = 0; y < 25; y += 5)
      for (let x = 0; x < 5; x++)
        state[y+x] = B[y+x] ^ ((~B[y+(x+1)%5]) & B[y+(x+2)%5]) & 0xFFFFFFFFFFFFFFFFn;
    // ι
    state[0] ^= KECCAK_RC[round];
    state[0] &= 0xFFFFFFFFFFFFFFFFn;
  }
}

export function keccak256(data) {
  return new Uint8Array(_nobleKeccak(data));
}

/* ── Ed25519 group order L ── */
const L = 0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3edn;

/* ── Scalar reduce mod L ── */
export function scReduce32(bytes) {
  let n = 0n;
  for (let i = 31; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  n = n % L;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) { out[i] = Number(n & 0xFFn); n >>= 8n; }
  return out;
}

/* ── Ed25519 point multiply (pub from priv) ── */
const G_ED = ed25519.ExtendedPoint.BASE;

export function xmrPubFromPriv(privLE) {
  let n = 0n;
  for (let i = 31; i >= 0; i--) n = (n << 8n) | BigInt(privLE[i]);
  const point = G_ED.multiply(n);
  return new Uint8Array(point.toRawBytes());
}

/* ── View key from spend key ── */
export function xmrViewKeyFromSpend(spendPriv) {
  return scReduce32(keccak256(spendPriv));
}

/* ── Monero Base58 encoding ── */
const XMR_ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const XMR_BLOCK_SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11];

function _xmrBase58Block(data, padLen) {
  let n = 0n;
  for (let i = 0; i < data.length; i++) n = (n << 8n) | BigInt(data[i]);
  let s = '';
  while (n > 0n) { s = XMR_ALPHA[Number(n % 58n)] + s; n /= 58n; }
  while (s.length < padLen) s = '1' + s;
  return s;
}

export function xmrBase58Encode(data) {
  let result = '';
  const fullBlocks = Math.floor(data.length / 8);
  for (let i = 0; i < fullBlocks; i++) result += _xmrBase58Block(data.slice(i * 8, i * 8 + 8), 11);
  const rem = data.length % 8;
  if (rem > 0) result += _xmrBase58Block(data.slice(fullBlocks * 8), XMR_BLOCK_SIZES[rem]);
  return result;
}

/* ── Monero standard address ── */
export function xmrAddress(pubSpend, pubView, network = 18) {
  const d = new Uint8Array(1 + 32 + 32);
  d[0] = network;
  d.set(pubSpend, 1);
  d.set(pubView, 33);
  const checksum = keccak256(d).slice(0, 4);
  const full = new Uint8Array(d.length + 4);
  full.set(d);
  full.set(checksum, d.length);
  return xmrBase58Encode(full);
}

/* ── Derive full XMR key set from BIP32 account node ── */
export function deriveXmrKeys(acctPriv, acctChain, bip32Child) {
  // m/44'/145'/0'/5 (non-hardened child at index 5)
  const xmrChain = bip32Child(acctPriv, acctChain, 5);
  // m/44'/145'/0'/5/0
  const xmrNode = bip32Child(xmrChain.priv || xmrChain.pub, xmrChain.chain, 0);

  const spendPriv = scReduce32(xmrNode.priv);
  const spendPub = xmrPubFromPriv(spendPriv);
  const viewPriv = xmrViewKeyFromSpend(spendPriv);
  const viewPub = xmrPubFromPriv(viewPriv);
  const addr = xmrAddress(spendPub, viewPub);

  return { spendPriv, spendPub, viewPriv, viewPub, addr };
}

/* ── Hex helpers ── */
export const b2h = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
export const h2b = h => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x, 16)));
