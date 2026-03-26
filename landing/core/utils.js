/* ══════════════════════════════════════════
   00 Wallet — Shared Utilities
   ══════════════════════════════════════════
   Extracted from 10+ duplicated copies across
   onion.html, fusion.html, wallet.html, swap.html,
   chat.html, vault.html, sub.html, pay.html, etc.
   ══════════════════════════════════════════ */

import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';

/* ── DOM helpers ── */
export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);

/* ── Byte encoding ── */
export function u32LE(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}

export function u64LE(n) {
  const b = new Uint8Array(8);
  const v = new DataView(b.buffer);
  v.setUint32(0, n >>> 0, true);
  v.setUint32(4, Math.floor(n / 0x100000000) >>> 0, true);
  return b;
}

export function writeVarint(n) {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n < 0x10000) return concat(new Uint8Array([0xfd]), new Uint8Array([n & 0xff, (n >> 8) & 0xff]));
  return concat(new Uint8Array([0xfe]), u32LE(n));
}

/* ── Byte array helpers ── */
export function concat(...arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

export function b2h(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function h2b(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.substr(i, 2), 16);
  return arr;
}

export function utf8(str) {
  return new TextEncoder().encode(str);
}

export function rand(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/* ── Hash ── */
export function dsha256(data) {
  return sha256(sha256(data));
}

/* ── BCH formatting ── */
export function satsToBch(s) {
  return (s / 1e8).toFixed(8);
}

export function bchToSats(b) {
  return Math.round(parseFloat(b) * 1e8);
}

/* ── Toast notifications ── */
const _toastStack = [];
export function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'app-toast ' + type;
  el.textContent = msg;
  const offset = _toastStack.reduce((sum, t) => sum + t.offsetHeight + 8, 0);
  el.style.bottom = (30 + offset) + 'px';
  document.body.appendChild(el);
  _toastStack.push(el);
  setTimeout(() => {
    el.remove();
    const idx = _toastStack.indexOf(el);
    if (idx >= 0) _toastStack.splice(idx, 1);
    let y = 0;
    for (const t of _toastStack) { t.style.bottom = (30 + y) + 'px'; y += t.offsetHeight + 8; }
  }, 4000);
}

/* ── Hex/buffer conversions ── */
export function bufToHex(buf) { return b2h(new Uint8Array(buf)); }
export function hexToBuf(hex) { return h2b(hex).buffer; }
