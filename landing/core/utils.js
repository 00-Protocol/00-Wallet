import { sha256 } from '../lib/noble-hashes.js';
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
function u32LE(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function u64LE(n) {
  const b = new Uint8Array(8);
  const v = new DataView(b.buffer);
  v.setUint32(0, n >>> 0, true);
  v.setUint32(4, Math.floor(n / 4294967296) >>> 0, true);
  return b;
}
function writeVarint(n) {
  if (n < 253) return new Uint8Array([n]);
  if (n < 65536) return concat(new Uint8Array([253]), new Uint8Array([n & 255, n >> 8 & 255]));
  return concat(new Uint8Array([254]), u32LE(n));
}
function concat(...arrays) {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}
function b2h(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function h2b(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.substr(i, 2), 16);
  return arr;
}
function utf8(str) {
  return new TextEncoder().encode(str);
}
function rand(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}
function dsha256(data) {
  return sha256(sha256(data));
}
function satsToBch(s) {
  return (s / 1e8).toFixed(8);
}
function bchToSats(b) {
  return Math.round(parseFloat(String(b)) * 1e8);
}
const _toastStack = [];
function showToast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = "app-toast " + type;
  el.textContent = msg;
  const offset = _toastStack.reduce((sum, t) => sum + t.offsetHeight + 8, 0);
  el.style.bottom = 30 + offset + "px";
  document.body.appendChild(el);
  _toastStack.push(el);
  setTimeout(() => {
    el.remove();
    const idx = _toastStack.indexOf(el);
    if (idx >= 0) _toastStack.splice(idx, 1);
    let y = 0;
    for (const t of _toastStack) {
      t.style.bottom = 30 + y + "px";
      y += t.offsetHeight + 8;
    }
  }, 4e3);
}
function bufToHex(buf) {
  return b2h(new Uint8Array(buf));
}
function hexToBuf(hex) {
  return h2b(hex).buffer;
}
export {
  $,
  $$,
  b2h,
  bchToSats,
  bufToHex,
  concat,
  dsha256,
  h2b,
  hexToBuf,
  rand,
  satsToBch,
  showToast,
  u32LE,
  u64LE,
  utf8,
  writeVarint
};


