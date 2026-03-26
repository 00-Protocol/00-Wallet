/**
 * onion-crypto.js — Shared onion encryption, NIP-04/NIP-44, and Nostr event signing
 * Used by: fusion.html, onion.html, wallet.html, relay.js
 */

import { secp256k1, schnorr } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { extract as hkdfExtract, expand as hkdfExpand } from 'https://esm.sh/@noble/hashes@1.7.1/hkdf';
import { hmac } from 'https://esm.sh/@noble/hashes@1.7.1/hmac';
import { chacha20 } from 'https://esm.sh/@noble/ciphers@1.2.1/chacha';

/* ──────────────────────────────────────────
   UTILITIES
   ────────────────────────────────────────── */
export const b2h = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
export const h2b = h => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x, 16)));
export const rand = n => crypto.getRandomValues(new Uint8Array(n));
export const utf8 = s => new TextEncoder().encode(s);
export function concat(...arrs) {
  const r = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
  let o = 0; for (const a of arrs) { r.set(a, o); o += a.length; } return r;
}

/* ──────────────────────────────────────────
   ONION ENCRYPTION (secp256k1 ECDH + AES-256-GCM)
   Each layer: eph_pub(33) || nonce(12) || ciphertext+tag
   ────────────────────────────────────────── */
export async function onionLayer(data, peelerPubHex) {
  const eph = rand(32);
  const ephPub = secp256k1.getPublicKey(eph, true); // 33 bytes compressed
  const shared = secp256k1.getSharedSecret(eph, h2b('02' + peelerPubHex)).slice(1, 33);
  const aesKey = sha256(shared);
  const iv = rand(12);
  const key = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, data));
  return concat(ephPub, iv, ct);
}

export async function onionPeel(blob, myPriv) {
  const ephPub = blob.slice(0, 33);
  const iv = blob.slice(33, 45);
  const ct = blob.slice(45);
  const shared = secp256k1.getSharedSecret(myPriv, ephPub).slice(1, 33);
  const aesKey = sha256(shared);
  const key = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, ct));
}

// Wrap payload in layers: innermost = last peeler, outermost = first peeler
// v2 payload format: "addr|value_sats", padded to 80 bytes
export const JOINER_PAD_SIZE = 80;

export async function onionWrap(payload, peelerPubHexes) {
  const raw = utf8(payload);
  const padded = new Uint8Array(JOINER_PAD_SIZE);
  padded.set(raw);
  padded[raw.length] = 0x01; // delimiter
  let data = padded;
  for (let i = peelerPubHexes.length - 1; i >= 0; i--) {
    data = await onionLayer(data, peelerPubHexes[i]);
  }
  return data;
}

export function onionUnpad(data) {
  const idx = data.indexOf(0x01);
  const str = new TextDecoder().decode(data.slice(0, idx > 0 ? idx : data.length));
  // v2: parse "addr|value" format
  const sep = str.lastIndexOf('|');
  if (sep > 0) {
    return { addr: str.slice(0, sep), value: parseInt(str.slice(sep + 1)) || 0 };
  }
  return { addr: str, value: 0 }; // v1 fallback
}

/* ──────────────────────────────────────────
   NIP-01 NOSTR EVENT SIGNING
   ────────────────────────────────────────── */
export async function makeEvent(privBytes, kind, content, tags = []) {
  const pub = b2h(secp256k1.getPublicKey(privBytes, true).slice(1)); // x-only
  const created_at = Math.floor(Date.now() / 1000);
  const idHash = sha256(utf8(JSON.stringify([0, pub, created_at, kind, tags, content])));
  const sig = b2h(await schnorr.sign(idHash, privBytes));
  return { id: b2h(idHash), pubkey: pub, created_at, kind, tags, content, sig };
}

/* ──────────────────────────────────────────
   NIP-04 ENCRYPTION (secp256k1 ECDH + AES-CBC)
   ────────────────────────────────────────── */
export async function nip04Encrypt(myPriv, theirPubHex, msg) {
  const shared = secp256k1.getSharedSecret(myPriv, h2b('02' + theirPubHex)).slice(1, 33);
  const iv = rand(16);
  const key = await crypto.subtle.importKey('raw', shared, { name: 'AES-CBC' }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, utf8(msg));
  return btoa(String.fromCharCode(...new Uint8Array(ct))) + '?iv=' + btoa(String.fromCharCode(...iv));
}

export async function nip04Decrypt(myPriv, senderPubHex, encContent) {
  try {
    const [ctB64, ivB64] = encContent.split('?iv=');
    const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const shared = secp256k1.getSharedSecret(myPriv, h2b('02' + senderPubHex)).slice(1, 33);
    const key = await crypto.subtle.importKey('raw', shared, { name: 'AES-CBC' }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

/* ──────────────────────────────────────────
   NIP-44 ENCRYPTION (ChaCha20 + HKDF + HMAC-SHA256)
   Versioned, padded, authenticated encryption per NIP-44 v2
   ────────────────────────────────────────── */
const NIP44_SALT = utf8('nip44-v2');

function nip44ConversationKey(myPriv, theirPubHex) {
  const shared = secp256k1.getSharedSecret(myPriv, h2b('02' + theirPubHex)).slice(1, 33);
  return hkdfExtract(sha256, shared, NIP44_SALT);
}

function nip44CalcPaddedLen(len) {
  if (len <= 32) return 32;
  return 1 << (32 - Math.clz32(len - 1));
}

function nip44Pad(plaintext) {
  const raw = utf8(plaintext);
  if (raw.length < 1 || raw.length > 65535) throw new Error('invalid plaintext length');
  const padded = new Uint8Array(2 + nip44CalcPaddedLen(raw.length));
  new DataView(padded.buffer).setUint16(0, raw.length); // big-endian length
  padded.set(raw, 2);
  return padded;
}

function nip44Unpad(padded) {
  const len = new DataView(padded.buffer, padded.byteOffset).getUint16(0);
  if (len < 1 || len > padded.length - 2) throw new Error('invalid padding');
  return new TextDecoder().decode(padded.slice(2, 2 + len));
}

export async function nip44Encrypt(myPriv, theirPubHex, msg) {
  const convKey = nip44ConversationKey(myPriv, theirPubHex);
  const nonce = rand(32);
  const keys = hkdfExpand(sha256, convKey, nonce, 76);
  const chachaKey  = keys.slice(0, 32);
  const chaChaNonce = keys.slice(32, 44);
  const hmacKey    = keys.slice(44, 76);
  const padded     = nip44Pad(msg);
  const ciphertext = chacha20(chachaKey, chaChaNonce, padded);
  const mac        = hmac(sha256, hmacKey, concat(nonce, ciphertext));
  const payload    = concat(new Uint8Array([2]), nonce, ciphertext, mac);
  return btoa(String.fromCharCode(...payload));
}

export async function nip44Decrypt(myPriv, senderPubHex, b64payload) {
  try {
    const raw = Uint8Array.from(atob(b64payload), c => c.charCodeAt(0));
    if (raw[0] !== 2) throw new Error('unsupported version');
    const nonce      = raw.slice(1, 33);
    const ciphertext = raw.slice(33, raw.length - 32);
    const mac        = raw.slice(raw.length - 32);
    const convKey    = nip44ConversationKey(myPriv, senderPubHex);
    const keys       = hkdfExpand(sha256, convKey, nonce, 76);
    const hmacKey    = keys.slice(44, 76);
    const expectedMac = hmac(sha256, hmacKey, concat(nonce, ciphertext));
    let ok = expectedMac.length === mac.length ? 1 : 0;
    for (let i = 0; i < expectedMac.length; i++) ok &= (expectedMac[i] === mac[i]) ? 1 : 0;
    if (!ok) throw new Error('bad mac');
    const chachaKey   = keys.slice(0, 32);
    const chaChaNonce = keys.slice(32, 44);
    const padded = chacha20(chachaKey, chaChaNonce, ciphertext);
    return nip44Unpad(padded);
  } catch { return null; }
}

/* ──────────────────────────────────────────
   NIP-59 GIFT WRAP (rumor → seal → wrap)
   Hides sender, recipient, and timestamp metadata from Nostr relays
   ────────────────────────────────────────── */
const TWO_DAYS = 2 * 24 * 60 * 60;

function randomTimeShift() {
  // Random offset 0..TWO_DAYS seconds in the past
  const buf = rand(4);
  return (buf[0] | (buf[1] << 8) | (buf[2] << 16) | ((buf[3] & 0x01) << 24)) % TWO_DAYS;
}

function eventId(pub, created_at, kind, tags, content) {
  return b2h(sha256(utf8(JSON.stringify([0, pub, created_at, kind, tags, content]))));
}

// Create an unsigned rumor (Layer 1)
function createRumor(authorPubHex, kind, content, tags = []) {
  const created_at = Math.floor(Date.now() / 1000);
  const id = eventId(authorPubHex, created_at, kind, tags, content);
  return { id, pubkey: authorPubHex, created_at, kind, tags, content };
  // Note: no sig field — intentional for deniability
}

// Create a sealed event (Layer 2, kind 13)
async function createSeal(authorPriv, recipientPubHex, rumor) {
  const authorPub = b2h(secp256k1.getPublicKey(authorPriv, true).slice(1));
  const content = await nip44Encrypt(authorPriv, recipientPubHex, JSON.stringify(rumor));
  const created_at = Math.floor(Date.now() / 1000) - randomTimeShift();
  const tags = []; // MUST be empty per spec
  const id = eventId(authorPub, created_at, 13, tags, content);
  const idHash = sha256(utf8(JSON.stringify([0, authorPub, created_at, 13, tags, content])));
  const sig = b2h(await schnorr.sign(idHash, authorPriv));
  return { id, pubkey: authorPub, created_at, kind: 13, tags, content, sig };
}

// Create a gift wrap (Layer 3, kind 1059)
async function createWrap(recipientPubHex, seal) {
  const ephPriv = rand(32);
  const ephPub = b2h(secp256k1.getPublicKey(ephPriv, true).slice(1));
  const content = await nip44Encrypt(ephPriv, recipientPubHex, JSON.stringify(seal));
  const created_at = Math.floor(Date.now() / 1000) - randomTimeShift();
  const tags = [['p', recipientPubHex]];
  const idHash = sha256(utf8(JSON.stringify([0, ephPub, created_at, 1059, tags, content])));
  const id = b2h(idHash);
  const sig = b2h(await schnorr.sign(idHash, ephPriv));
  return { id, pubkey: ephPub, created_at, kind: 1059, tags, content, sig };
}

/**
 * giftWrap — Full NIP-59 wrap: rumor → seal → gift wrap
 * @param {Uint8Array} authorPriv - Author's real private key
 * @param {string} recipientPubHex - Recipient's x-only pubkey hex
 * @param {number} innerKind - Kind for the inner rumor (e.g. 22231)
 * @param {string} innerContent - Content for the rumor
 * @param {Array} innerTags - Tags for the rumor
 * @returns {Object} Kind 1059 Nostr event ready to publish
 */
export async function giftWrap(authorPriv, recipientPubHex, innerKind, innerContent, innerTags = []) {
  const authorPub = b2h(secp256k1.getPublicKey(authorPriv, true).slice(1));
  const rumor = createRumor(authorPub, innerKind, innerContent, innerTags);
  const seal = await createSeal(authorPriv, recipientPubHex, rumor);
  return createWrap(recipientPubHex, seal);
}

/**
 * giftUnwrap — Unwrap NIP-59 gift wrap → seal → rumor
 * @param {Uint8Array} myPriv - Recipient's private key
 * @param {Object} wrapEvent - Kind 1059 event
 * @returns {{rumor, sealPubkey}} The inner rumor + real sender pubkey, or null
 */
export async function giftUnwrap(myPriv, wrapEvent) {
  try {
    if (wrapEvent.kind !== 1059) return null;
    // Verify wrap signature (ephemeral key)
    const wrapIdHash = sha256(utf8(JSON.stringify([0, wrapEvent.pubkey, wrapEvent.created_at, 1059, wrapEvent.tags, wrapEvent.content])));
    if (!schnorr.verify(h2b(wrapEvent.sig), wrapIdHash, h2b(wrapEvent.pubkey))) return null;
    // Unwrap Layer 3: decrypt gift wrap
    const sealJson = await nip44Decrypt(myPriv, wrapEvent.pubkey, wrapEvent.content);
    if (!sealJson) return null;
    const seal = JSON.parse(sealJson);
    if (seal.kind !== 13) return null;
    // Verify seal signature (author key)
    const sealIdHash = sha256(utf8(JSON.stringify([0, seal.pubkey, seal.created_at, 13, seal.tags, seal.content])));
    if (!schnorr.verify(h2b(seal.sig), sealIdHash, h2b(seal.pubkey))) return null;
    // Unwrap Layer 2: decrypt seal
    const rumorJson = await nip44Decrypt(myPriv, seal.pubkey, seal.content);
    if (!rumorJson) return null;
    const rumor = JSON.parse(rumorJson);
    return { rumor, sealPubkey: seal.pubkey };
  } catch { return null; }
}

/* ──────────────────────────────────────────
   RE-EXPORTS for convenience
   ────────────────────────────────────────── */
export { secp256k1, schnorr, sha256 };
