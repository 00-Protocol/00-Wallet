import { secp256k1, schnorr } from "./lib/noble-curves.js";
import { sha256 } from "./lib/noble-hashes.js";
import { hkdfExtract, hkdfExpand } from "./lib/noble-hashes.js";
import { hmac } from "./lib/noble-hashes.js";
import { chacha20 } from "./lib/noble-ciphers.js";
const b2h = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const h2b = (h) => new Uint8Array(h.match(/.{2}/g).map((x) => parseInt(x, 16)));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const utf8 = (s) => new TextEncoder().encode(s);
function concat(...arrs) {
  const r = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    r.set(a, o);
    o += a.length;
  }
  return r;
}
async function onionLayer(data, peelerPubHex) {
  const eph = rand(32);
  const ephPub = secp256k1.getPublicKey(eph, true);
  const shared = secp256k1.getSharedSecret(eph, h2b("02" + peelerPubHex)).slice(1, 33);
  const aesKey = sha256(shared);
  const iv = rand(12);
  const key = await crypto.subtle.importKey("raw", aesKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, data));
  return concat(ephPub, iv, ct);
}
async function onionPeel(blob, myPriv) {
  const ephPub = blob.slice(0, 33);
  const iv = blob.slice(33, 45);
  const ct = blob.slice(45);
  const shared = secp256k1.getSharedSecret(myPriv, ephPub).slice(1, 33);
  const aesKey = sha256(shared);
  const key = await crypto.subtle.importKey("raw", aesKey, { name: "AES-GCM" }, false, ["decrypt"]);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, ct));
}
const JOINER_PAD_SIZE = 80;
async function onionWrap(payload, peelerPubHexes) {
  const raw = utf8(payload);
  const padded = new Uint8Array(JOINER_PAD_SIZE);
  padded.set(raw);
  padded[raw.length] = 1;
  let data = padded;
  for (let i = peelerPubHexes.length - 1; i >= 0; i--) {
    data = await onionLayer(data, peelerPubHexes[i]);
  }
  return data;
}
function onionUnpad(data) {
  const idx = data.indexOf(1);
  const str = new TextDecoder().decode(data.slice(0, idx > 0 ? idx : data.length));
  const sep = str.lastIndexOf("|");
  if (sep > 0) {
    return { addr: str.slice(0, sep), value: parseInt(str.slice(sep + 1)) || 0 };
  }
  return { addr: str, value: 0 };
}
async function makeEvent(privBytes, kind, content, tags = []) {
  const pub = b2h(secp256k1.getPublicKey(privBytes, true).slice(1));
  const created_at = Math.floor(Date.now() / 1e3);
  const idHash = sha256(utf8(JSON.stringify([0, pub, created_at, kind, tags, content])));
  const sig = b2h(await schnorr.sign(idHash, privBytes));
  return { id: b2h(idHash), pubkey: pub, created_at, kind, tags, content, sig };
}
async function nip04Encrypt(myPriv, theirPubHex, msg) {
  const shared = secp256k1.getSharedSecret(myPriv, h2b("02" + theirPubHex)).slice(1, 33);
  const iv = rand(16);
  const key = await crypto.subtle.importKey("raw", shared, { name: "AES-CBC" }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, utf8(msg));
  return btoa(String.fromCharCode(...new Uint8Array(ct))) + "?iv=" + btoa(String.fromCharCode(...iv));
}
async function nip04Decrypt(myPriv, senderPubHex, encContent) {
  try {
    const [ctB64, ivB64] = encContent.split("?iv=");
    const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
    const shared = secp256k1.getSharedSecret(myPriv, h2b("02" + senderPubHex)).slice(1, 33);
    const key = await crypto.subtle.importKey("raw", shared, { name: "AES-CBC" }, false, ["decrypt"]);
    const pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}
const NIP44_SALT = utf8("nip44-v2");
function nip44ConversationKey(myPriv, theirPubHex) {
  const shared = secp256k1.getSharedSecret(myPriv, h2b("02" + theirPubHex)).slice(1, 33);
  return hkdfExtract(sha256, shared, NIP44_SALT);
}
function nip44CalcPaddedLen(len) {
  if (len <= 32) return 32;
  return 1 << 32 - Math.clz32(len - 1);
}
function nip44Pad(plaintext) {
  const raw = utf8(plaintext);
  if (raw.length < 1 || raw.length > 65535) throw new Error("invalid plaintext length");
  const padded = new Uint8Array(2 + nip44CalcPaddedLen(raw.length));
  new DataView(padded.buffer).setUint16(0, raw.length);
  padded.set(raw, 2);
  return padded;
}
function nip44Unpad(padded) {
  const len = new DataView(padded.buffer, padded.byteOffset).getUint16(0);
  if (len < 1 || len > padded.length - 2) throw new Error("invalid padding");
  return new TextDecoder().decode(padded.slice(2, 2 + len));
}
async function nip44Encrypt(myPriv, theirPubHex, msg) {
  const convKey = nip44ConversationKey(myPriv, theirPubHex);
  const nonce = rand(32);
  const keys = hkdfExpand(sha256, convKey, nonce, 76);
  const chachaKey = keys.slice(0, 32);
  const chaChaNonce = keys.slice(32, 44);
  const hmacKey = keys.slice(44, 76);
  const padded = nip44Pad(msg);
  const ciphertext = chacha20(chachaKey, chaChaNonce, padded);
  const mac = hmac(sha256, hmacKey, concat(nonce, ciphertext));
  const payload = concat(new Uint8Array([2]), nonce, ciphertext, mac);
  return btoa(String.fromCharCode(...payload));
}
async function nip44Decrypt(myPriv, senderPubHex, b64payload) {
  try {
    const raw = Uint8Array.from(atob(b64payload), (c) => c.charCodeAt(0));
    if (raw[0] !== 2) throw new Error("unsupported version");
    const nonce = raw.slice(1, 33);
    const ciphertext = raw.slice(33, raw.length - 32);
    const mac = raw.slice(raw.length - 32);
    const convKey = nip44ConversationKey(myPriv, senderPubHex);
    const keys = hkdfExpand(sha256, convKey, nonce, 76);
    const hmacKey = keys.slice(44, 76);
    const expectedMac = hmac(sha256, hmacKey, concat(nonce, ciphertext));
    let ok = expectedMac.length === mac.length ? 1 : 0;
    for (let i = 0; i < expectedMac.length; i++) ok &= expectedMac[i] === mac[i] ? 1 : 0;
    if (!ok) throw new Error("bad mac");
    const chachaKey = keys.slice(0, 32);
    const chaChaNonce = keys.slice(32, 44);
    const padded = chacha20(chachaKey, chaChaNonce, ciphertext);
    return nip44Unpad(padded);
  } catch {
    return null;
  }
}
const TWO_DAYS = 2 * 24 * 60 * 60;
function randomTimeShift() {
  const buf = rand(4);
  return (buf[0] | buf[1] << 8 | buf[2] << 16 | (buf[3] & 1) << 24) % TWO_DAYS;
}
function eventId(pub, created_at, kind, tags, content) {
  return b2h(sha256(utf8(JSON.stringify([0, pub, created_at, kind, tags, content]))));
}
function createRumor(authorPubHex, kind, content, tags = []) {
  const created_at = Math.floor(Date.now() / 1e3);
  const id = eventId(authorPubHex, created_at, kind, tags, content);
  return { id, pubkey: authorPubHex, created_at, kind, tags, content };
}
async function createSeal(authorPriv, recipientPubHex, rumor) {
  const authorPub = b2h(secp256k1.getPublicKey(authorPriv, true).slice(1));
  const content = await nip44Encrypt(authorPriv, recipientPubHex, JSON.stringify(rumor));
  const created_at = Math.floor(Date.now() / 1e3) - randomTimeShift();
  const tags = [];
  const id = eventId(authorPub, created_at, 13, tags, content);
  const idHash = sha256(utf8(JSON.stringify([0, authorPub, created_at, 13, tags, content])));
  const sig = b2h(await schnorr.sign(idHash, authorPriv));
  return { id, pubkey: authorPub, created_at, kind: 13, tags, content, sig };
}
async function createWrap(recipientPubHex, seal) {
  const ephPriv = rand(32);
  const ephPub = b2h(secp256k1.getPublicKey(ephPriv, true).slice(1));
  const content = await nip44Encrypt(ephPriv, recipientPubHex, JSON.stringify(seal));
  const created_at = Math.floor(Date.now() / 1e3) - randomTimeShift();
  const tags = [["p", recipientPubHex]];
  const idHash = sha256(utf8(JSON.stringify([0, ephPub, created_at, 1059, tags, content])));
  const id = b2h(idHash);
  const sig = b2h(await schnorr.sign(idHash, ephPriv));
  return { id, pubkey: ephPub, created_at, kind: 1059, tags, content, sig };
}
async function giftWrap(authorPriv, recipientPubHex, innerKind, innerContent, innerTags = []) {
  const authorPub = b2h(secp256k1.getPublicKey(authorPriv, true).slice(1));
  const rumor = createRumor(authorPub, innerKind, innerContent, innerTags);
  const seal = await createSeal(authorPriv, recipientPubHex, rumor);
  return createWrap(recipientPubHex, seal);
}
async function giftUnwrap(myPriv, wrapEvent) {
  try {
    if (wrapEvent.kind !== 1059) return null;
    const wrapIdHash = sha256(utf8(JSON.stringify([0, wrapEvent.pubkey, wrapEvent.created_at, 1059, wrapEvent.tags, wrapEvent.content])));
    if (!schnorr.verify(h2b(wrapEvent.sig), wrapIdHash, h2b(wrapEvent.pubkey))) return null;
    const sealJson = await nip44Decrypt(myPriv, wrapEvent.pubkey, wrapEvent.content);
    if (!sealJson) return null;
    const seal = JSON.parse(sealJson);
    if (seal.kind !== 13) return null;
    const sealIdHash = sha256(utf8(JSON.stringify([0, seal.pubkey, seal.created_at, 13, seal.tags, seal.content])));
    if (!schnorr.verify(h2b(seal.sig), sealIdHash, h2b(seal.pubkey))) return null;
    const rumorJson = await nip44Decrypt(myPriv, seal.pubkey, seal.content);
    if (!rumorJson) return null;
    const rumor = JSON.parse(rumorJson);
    return { rumor, sealPubkey: seal.pubkey };
  } catch {
    return null;
  }
}
export {
  JOINER_PAD_SIZE,
  b2h,
  concat,
  giftUnwrap,
  giftWrap,
  h2b,
  makeEvent,
  nip04Decrypt,
  nip04Encrypt,
  nip44Decrypt,
  nip44Encrypt,
  onionLayer,
  onionPeel,
  onionUnpad,
  onionWrap,
  rand,
  schnorr,
  secp256k1,
  sha256,
  utf8
};
