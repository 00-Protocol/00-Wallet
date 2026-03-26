/* ══════════════════════════════════════════
   00 Wallet — CashAddr Encode/Decode
   ══════════════════════════════════════════
   Extracted from 12 duplicated copies.
   BCH CashAddr (bitcoincash: prefix) encoding
   and decoding to/from hash160.
   ══════════════════════════════════════════ */

const _caCharset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function _caPolymod(v) {
  const G = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  let c = 1n;
  for (const d of v) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
    if (c0 & 1n) c ^= G[0]; if (c0 & 2n) c ^= G[1];
    if (c0 & 4n) c ^= G[2]; if (c0 & 8n) c ^= G[3]; if (c0 & 16n) c ^= G[4];
  }
  return c ^ 1n;
}

function _hashToCashAddr(hash20, versionByte, prefix = 'bitcoincash') {
  const payload = new Uint8Array([versionByte, ...hash20]);
  const d5 = []; let acc = 0, bits = 0;
  for (const b of payload) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; d5.push((acc >> bits) & 31); } }
  if (bits > 0) d5.push((acc << (5 - bits)) & 31);
  const pe = [...prefix.split('').map(c => c.charCodeAt(0) & 31), 0];
  const mod = _caPolymod([...pe, ...d5, 0, 0, 0, 0, 0, 0, 0, 0]);
  const cs = []; for (let i = 7; i >= 0; i--) cs.push(Number((mod >> (BigInt(i) * 5n)) & 31n));
  return prefix + ':' + [...d5, ...cs].map(v => _caCharset[v]).join('');
}

export function pubHashToCashAddr(hash20) {
  return _hashToCashAddr(hash20, 0x00);
}

export function scriptHashToCashAddr(hash20) {
  return _hashToCashAddr(hash20, 0x08);
}

export function cashAddrToHash20(addr) {
  const raw = addr.toLowerCase().replace(/^bitcoincash:/, '');
  const data = [];
  for (const c of raw) {
    const v = _caCharset.indexOf(c);
    if (v === -1) throw new Error('invalid cashaddr character: ' + c);
    data.push(v);
  }
  const payload = data.slice(0, -8); // strip checksum
  const bytes = []; let acc = 0, bits = 0;
  for (const v of payload) { acc = (acc << 5) | v; bits += 5; while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); } }
  return new Uint8Array(bytes.slice(1, 21)); // skip version byte
}

/* ── Base58Check (for BTC legacy and WIF) ── */
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { concat } from './utils.js';

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function dsha256(d) { return sha256(sha256(d)); }

export function base58Check(payload) {
  const input = concat(payload, dsha256(payload).slice(0, 4));
  let n = BigInt('0x' + Array.from(input, b => b.toString(16).padStart(2, '0')).join(''));
  let str = '';
  while (n > 0n) { str = B58_ALPHABET[Number(n % 58n)] + str; n = n / 58n; }
  for (const b of input) { if (b === 0) str = '1' + str; else break; }
  return str;
}

export function base58Decode(str) {
  let n = 0n;
  for (const c of str) {
    const idx = B58_ALPHABET.indexOf(c);
    if (idx === -1) throw new Error('invalid base58 char: ' + c);
    n = n * 58n + BigInt(idx);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
  // Restore leading zeros
  for (const c of str) { if (c === '1') bytes.unshift(0); else break; }
  const data = new Uint8Array(bytes);
  // Verify checksum
  const payload = data.slice(0, -4);
  const checksum = data.slice(-4);
  const expected = dsha256(payload).slice(0, 4);
  if (!expected.every((b, i) => b === checksum[i])) throw new Error('bad checksum');
  return payload;
}
