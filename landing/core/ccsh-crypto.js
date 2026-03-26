/**
 * ccsh-crypto.js — CCSH (Chat Cash) cryptographic protocol module
 *
 * Pure cryptographic primitives extracted from chat.html.
 * Zero DOM/UI dependencies. All functions are stateless except BIP39 word cache.
 *
 * Covers: byte utils, BIP32/BIP44 HD derivation, BCH CashAddr encoding,
 * vault AES-256-GCM encryption, CCSH v1 & v2 split-knowledge protocol,
 * Nostr event helpers, BIP39 mnemonic generation, BCH TX builder & parser.
 */

import { secp256k1, schnorr } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { x25519 } from 'https://esm.sh/@noble/curves@1.8.1/ed25519';
import { hmac } from 'https://esm.sh/@noble/hashes@1.7.1/hmac';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { sha512 } from 'https://esm.sh/@noble/hashes@1.7.1/sha512';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';

/* ───────────────────────── Byte utilities ───────────────────────── */

const h2b = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const b2h = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

function concat(...arrs) {
  const r = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
  let o = 0; for (const a of arrs) { r.set(a, o); o += a.length; } return r;
}

const u32LE = n => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);

function u64LE(n) {
  const b = new Uint8Array(8); let v = BigInt(n);
  for (let i = 0; i < 8; i++) { b[i] = Number(v & 0xffn); v >>= 8n; } return b;
}

function writeVarint(n) {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, (n >> 8) & 0xff]);
  return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

function readVarint(b, o = 0) {
  const f = b[o];
  if (f < 0xfd) return { v: f, l: 1 };
  if (f === 0xfd) return { v: b[o + 1] | (b[o + 2] << 8), l: 3 };
  return { v: b[o + 1] | (b[o + 2] << 8) | (b[o + 3] << 16) | (b[o + 4] * 16777216), l: 5 };
}

const dsha256 = d => sha256(sha256(d));

/* ───────────────────────── BIP32 / BIP44 ───────────────────────── */

const N_SECP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

function bip32Master(seed) {
  const I = hmac(sha512, new TextEncoder().encode('Bitcoin seed'), seed);
  return { priv: I.slice(0, 32), chain: I.slice(32) };
}

function _bip32Child(priv, chain, idx, hardened) {
  const idxBytes = new Uint8Array([idx >>> 24, (idx >>> 16) & 0xff, (idx >>> 8) & 0xff, idx & 0xff]);
  const data = hardened
    ? concat(new Uint8Array([0x00]), priv, idxBytes)
    : concat(secp256k1.getPublicKey(priv, true), idxBytes);
  const I = hmac(sha512, chain, data);
  const IL = I.slice(0, 32); const IR = I.slice(32);
  const child = ((BigInt('0x' + b2h(IL)) + BigInt('0x' + b2h(priv))) % N_SECP).toString(16).padStart(64, '0');
  return { priv: h2b(child), chain: IR };
}

function bip44BchPriv(seed64) {
  let n = bip32Master(seed64);
  n = _bip32Child(n.priv, n.chain, 0x8000002c, true); // 44'
  n = _bip32Child(n.priv, n.chain, 0x80000091, true); // 145' (BCH)
  n = _bip32Child(n.priv, n.chain, 0x80000000, true); // 0'
  n = _bip32Child(n.priv, n.chain, 0, false);          // 0
  n = _bip32Child(n.priv, n.chain, 0, false);          // 0
  return n.priv;
}

/* ───────────────────── BCH / CashAddr encoding ─────────────────── */

const _CA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function _caPolymod(v) {
  const g = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
  let c = 1n;
  for (const x of v) {
    const c0 = c >> 35n;
    c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(x);
    for (let i = 0; i < 5; i++) if ((c0 >> BigInt(i)) & 1n) c ^= g[i];
  }
  return c ^ 1n;
}

function _caExpand(prefix) { const r = []; for (const ch of prefix) r.push(ch.charCodeAt(0) & 0x1f); r.push(0); return r; }

function pubHashToCashAddr(hash20, prefix = 'bitcoincash') {
  const payload = [0x00, ...hash20]; const d5 = []; let acc = 0, bits = 0;
  for (const b of payload) { acc = (acc << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; d5.push((acc >> bits) & 0x1f); } }
  if (bits > 0) d5.push((acc << (5 - bits)) & 0x1f);
  const chkIn = [..._caExpand(prefix), ...d5, 0, 0, 0, 0, 0, 0, 0, 0];
  const chk = _caPolymod(chkIn); let chkStr = '';
  for (let i = 7; i >= 0; i--) chkStr += _CA_CHARSET[Number((chk >> BigInt(i * 5)) & 0x1fn)];
  return prefix + ':' + d5.map(x => _CA_CHARSET[x]).join('') + chkStr;
}

function cashAddrToHash20(addr) {
  const payload = addr.includes(':') ? addr.split(':')[1] : addr;
  const d5 = Array.from(payload.slice(0, -8), c => _CA_CHARSET.indexOf(c));
  let acc = 0, bits = 0; const bytes = [];
  for (const v of d5) { acc = (acc << 5) | v; bits += 5; while (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); } }
  return new Uint8Array(bytes.slice(1, 21));
}

function privToBchAddr(priv32) {
  const pub = secp256k1.getPublicKey(priv32, true);
  const hash = ripemd160(sha256(pub));
  return pubHashToCashAddr(Array.from(hash));
}

function _addrSH(addr) {
  const h = cashAddrToHash20(addr);
  const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
  return b2h(sha256(script).reverse());
}

/* ──────────────────── Vault AES-256-GCM encryption ─────────────── */

async function _pbkdf2Key(password, salt) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200000 },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function encryptVault(profile, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await _pbkdf2Key(password, salt);
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key,
    new TextEncoder().encode(JSON.stringify(profile)));
  return JSON.stringify({ v: 1, salt: b2h(salt), iv: b2h(iv), data: b2h(new Uint8Array(ct)) });
}

async function decryptVault(enc_json, password) {
  const { salt, iv, data } = JSON.parse(enc_json);
  const key = await _pbkdf2Key(password, h2b(salt));
  const pt  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: h2b(iv) }, key, h2b(data));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ───────────────────────── CCSH v1 protocol ────────────────────── */

const CCSH_MAGIC = new Uint8Array([0x43, 0x43, 0x53, 0x48]);

function packPacket(pkt) {
  const c = pkt.ciphertext_chunk;
  return concat(
    CCSH_MAGIC,
    new Uint8Array([0x01, pkt.msg_type || 0x01, pkt.flags || 0]),
    pkt.msg_id, pkt.sender_pub,
    new Uint8Array([(pkt.chunk_index >> 8) & 0xff, pkt.chunk_index & 0xff]),
    new Uint8Array([(pkt.chunk_total >> 8) & 0xff, pkt.chunk_total & 0xff]),
    new Uint8Array([(c.length >> 8) & 0xff, c.length & 0xff]),
    c
  );
}

function unpackPacket(raw) {
  if (raw.length < 61) throw new Error('packet too short');
  if (raw[0] !== 0x43 || raw[1] !== 0x43 || raw[2] !== 0x53 || raw[3] !== 0x48) throw new Error('bad magic');
  if (raw[4] !== 0x01) throw new Error('bad version');
  let pos = 7;
  const msg_id      = raw.slice(pos, pos + 16); pos += 16;
  const sender_pub  = raw.slice(pos, pos + 32); pos += 32;
  const chunk_index = (raw[pos] << 8) | raw[pos + 1]; pos += 2;
  const chunk_total = (raw[pos] << 8) | raw[pos + 1]; pos += 2;
  const clen        = (raw[pos] << 8) | raw[pos + 1]; pos += 2;
  return { msg_type: raw[5], msg_id, sender_pub, chunk_index, chunk_total,
           ciphertext_chunk: raw.slice(pos, pos + clen) };
}

async function ccshEncryptMsg(text, recipientPubHex, senderPriv32, senderPub32, msgType = 0x01) {
  const recipientPub = h2b(recipientPubHex);
  const ephPriv = crypto.getRandomValues(new Uint8Array(32));
  const ephPub  = x25519.getPublicKey(ephPriv);
  const shared  = x25519.getSharedSecret(ephPriv, recipientPub);
  const aesKey  = sha256(shared);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ck = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 }, ck, new TextEncoder().encode(text)));
  const ciphertext_chunk = concat(ephPub, iv, ct);
  const msg_id = crypto.getRandomValues(new Uint8Array(16));
  return packPacket({ msg_id, sender_pub: senderPub32, chunk_index: 0, chunk_total: 1,
                      ciphertext_chunk, msg_type: msgType, flags: 0 });
}

async function ccshDecryptPacket(raw, myPriv32) {
  const pkt  = unpackPacket(raw);
  const cc   = pkt.ciphertext_chunk;
  const shared = x25519.getSharedSecret(myPriv32, cc.slice(0, 32));
  const aesKey = sha256(shared);
  const ck = await crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: cc.slice(32, 44), tagLength: 128 }, ck, cc.slice(44)));
  return { text: new TextDecoder().decode(pt), senderPubHex: b2h(pkt.sender_pub), msgType: pkt.msg_type };
}

/* ─────────────────── CCSH v2 split-knowledge protocol ──────────── */

const CCSH_V2 = 0x02;
const MSG_SPLIT_CHAIN = 0x10;
const MSG_SPLIT_RELAY = 0x11;
const FLAG_SPLIT = 0x01;
const NOSTR_KIND_CCSH = 21059;

function xorSplit(data) {
  const pad = crypto.getRandomValues(new Uint8Array(data.length));
  const shard = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) shard[i] = data[i] ^ pad[i];
  return [shard, pad];
}

function xorMerge(shard, pad) {
  if (shard.length !== pad.length) throw new Error('XOR length mismatch');
  const out = new Uint8Array(shard.length);
  for (let i = 0; i < shard.length; i++) out[i] = shard[i] ^ pad[i];
  return out;
}

function deriveKeyChain(shared) { return sha256(concat(shared, new TextEncoder().encode('ccsh-chain'))); }
function deriveKeyRelay(shared) { return sha256(concat(shared, new TextEncoder().encode('ccsh-relay'))); }

async function aesWrap(data, key) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ck = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, ck, data));
  return concat(nonce, ct);
}

async function aesUnwrap(blob, key) {
  if (blob.length < 12) throw new Error('blob too short');
  const ck = await crypto.subtle.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12), tagLength: 128 }, ck, blob.slice(12)));
}

async function splitEncrypt(plaintext, recipientPubHex) {
  const recipientPub = h2b(recipientPubHex);
  const ephPriv = crypto.getRandomValues(new Uint8Array(32));
  const ephPub = x25519.getPublicKey(ephPriv);
  const shared = x25519.getSharedSecret(ephPriv, recipientPub);
  const innerKey = sha256(shared);
  const innerNonce = crypto.getRandomValues(new Uint8Array(12));
  const ck = await crypto.subtle.importKey('raw', innerKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const innerCt = concat(innerNonce, new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: innerNonce, tagLength: 128 }, ck, new TextEncoder().encode(plaintext))));
  const [shard, pad] = xorSplit(innerCt);
  const chainBlob = await aesWrap(shard, deriveKeyChain(shared));
  const relayBlob = await aesWrap(pad, deriveKeyRelay(shared));
  return { chainBlob, relayBlob, ephPub };
}

async function splitDecrypt(chainBlob, relayBlob, ephPub, myPriv32) {
  const shared = x25519.getSharedSecret(myPriv32, ephPub);
  const shard = await aesUnwrap(chainBlob, deriveKeyChain(shared));
  const pad = await aesUnwrap(relayBlob, deriveKeyRelay(shared));
  const innerCt = xorMerge(shard, pad);
  const innerKey = sha256(shared);
  const ck = await crypto.subtle.importKey('raw', innerKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: innerCt.slice(0, 12), tagLength: 128 }, ck, innerCt.slice(12)));
  return new TextDecoder().decode(pt);
}

function packV2(pkt) {
  const c = pkt.ciphertext_chunk;
  return concat(
    CCSH_MAGIC,
    new Uint8Array([CCSH_V2, pkt.msg_type, pkt.flags || FLAG_SPLIT]),
    pkt.msg_id, pkt.sender_pub,
    new Uint8Array([(pkt.chunk_index >> 8) & 0xff, pkt.chunk_index & 0xff]),
    new Uint8Array([(pkt.chunk_total >> 8) & 0xff, pkt.chunk_total & 0xff]),
    new Uint8Array([(c.length >> 8) & 0xff, c.length & 0xff]),
    c
  );
}

function unpackAny(raw) {
  if (raw.length < 61) throw new Error('packet too short');
  if (raw[0] !== 0x43 || raw[1] !== 0x43 || raw[2] !== 0x53 || raw[3] !== 0x48) throw new Error('bad magic');
  let pos = 7;
  const msg_id = raw.slice(pos, pos + 16); pos += 16;
  const sender_pub = raw.slice(pos, pos + 32); pos += 32;
  const chunk_index = (raw[pos] << 8) | raw[pos + 1]; pos += 2;
  const chunk_total = (raw[pos] << 8) | raw[pos + 1]; pos += 2;
  const clen = (raw[pos] << 8) | raw[pos + 1]; pos += 2;
  return { version: raw[4], msg_type: raw[5], flags: raw[6], msg_id, sender_pub,
           chunk_index, chunk_total, ciphertext_chunk: raw.slice(pos, pos + clen) };
}

/* ──────────────────────── Nostr helpers ─────────────────────────── */

function _deriveNostrPriv(x25519PrivHex) {
  return sha256(concat(h2b(x25519PrivHex), new TextEncoder().encode('ccsh-nostr')));
}

function _nostrPubFromPriv(privBytes) {
  return b2h(secp256k1.getPublicKey(privBytes, true).slice(1));
}

async function _makeNostrEvent(privBytes, kind, content, tags) {
  const pub = _nostrPubFromPriv(privBytes);
  const created_at = Math.floor(Date.now() / 1000);
  const idHash = sha256(new TextEncoder().encode(JSON.stringify([0, pub, created_at, kind, tags, content])));
  const sig = b2h(schnorr.sign(idHash, privBytes));
  return { id: b2h(idHash), pubkey: pub, created_at, kind, tags, content, sig };
}

/* ─────────────────────── BIP39 mnemonic ────────────────────────── */

let _bip39Words = null, _bip39Loading = null;

async function loadBip39Words() {
  if (_bip39Words) return _bip39Words;
  if (_bip39Loading) return _bip39Loading;
  _bip39Loading = fetch('https://raw.githubusercontent.com/trezor/python-mnemonic/master/src/mnemonic/wordlist/english.txt')
    .then(r => r.text())
    .then(t => { _bip39Words = t.split('\n').map(w => w.trim()).filter(Boolean); return _bip39Words; })
    .catch(() => null);
  return _bip39Loading;
}

async function bip39Generate() {
  const words = await loadBip39Words();
  if (!words || words.length !== 2048) throw new Error('wordlist unavailable');
  const ent = crypto.getRandomValues(new Uint8Array(16));
  const hash = await crypto.subtle.digest('SHA-256', ent);
  const cs = new Uint8Array(hash)[0];
  const bits = [];
  for (const b of ent) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  for (let i = 7; i >= 4; i--) bits.push((cs >> i) & 1);
  const indices = [];
  for (let i = 0; i < 12; i++) {
    let idx = 0;
    for (let j = 0; j < 11; j++) idx = (idx << 1) | bits[i * 11 + j];
    indices.push(idx);
  }
  return indices.map(i => words[i]);
}

async function bip39Seed(phrase) {
  const enc = new TextEncoder();
  const km  = await crypto.subtle.importKey('raw', enc.encode(phrase.normalize('NFKD')), 'PBKDF2', false, ['deriveBits']);
  const sb  = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-512', salt: enc.encode('mnemonic'.normalize('NFKD')), iterations: 2048 }, km, 512);
  return new Uint8Array(sb);
}

function deriveProfileFromSeed(seed64) {
  const x25519Priv = seed64.slice(0, 32);
  const x25519Pub  = x25519.getPublicKey(x25519Priv);
  const bchPriv    = bip44BchPriv(seed64);
  return {
    x25519_priv_hex: b2h(x25519Priv),
    x25519_pub_hex:  b2h(x25519Pub),
    bch_priv_hex:    b2h(bchPriv),
    bch_address:     privToBchAddr(bchPriv),
  };
}

/* ─────────────────────── BCH TX builder ────────────────────────── */

function p2pkhScript(hash20) {
  return concat(new Uint8Array([0x76, 0xa9, 0x14]), hash20, new Uint8Array([0x88, 0xac]));
}

function p2pkhAddrScript(cashAddr) { return p2pkhScript(cashAddrToHash20(cashAddr)); }

function opReturnScript(data) {
  if (data.length <= 75) return concat(new Uint8Array([0x6a, data.length]), data);
  if (data.length <= 255) return concat(new Uint8Array([0x6a, 0x4c, data.length]), data);
  return concat(new Uint8Array([0x6a, 0x4d, data.length & 0xff, (data.length >> 8) & 0xff]), data);
}

function bchSighash(version, locktime, inputs, outputs, i, utxoScript, utxoValue) {
  const prevouts = concat(...inputs.map(x => concat(x.txidLE, u32LE(x.vout))));
  const seqs     = concat(...inputs.map(x => u32LE(x.sequence)));
  const outsData = concat(...outputs.map(o => concat(u64LE(o.value), writeVarint(o.script.length), o.script)));
  const inp = inputs[i];
  const pre = concat(
    u32LE(version), dsha256(prevouts), dsha256(seqs),
    inp.txidLE, u32LE(inp.vout),
    writeVarint(utxoScript.length), utxoScript,
    u64LE(utxoValue), u32LE(inp.sequence),
    dsha256(outsData), u32LE(locktime),
    u32LE(0x41)
  );
  return dsha256(pre);
}

function serializeTx(version, locktime, inputs, outputs) {
  return concat(
    u32LE(version),
    writeVarint(inputs.length),
    ...inputs.flatMap(inp => [inp.txidLE, u32LE(inp.vout), writeVarint(inp.scriptSig.length), inp.scriptSig, u32LE(inp.sequence)]),
    writeVarint(outputs.length),
    ...outputs.flatMap(o => [u64LE(o.value), writeVarint(o.script.length), o.script]),
    u32LE(locktime)
  );
}

/* ─────────────────────── TX parser ─────────────────────────────── */

function parseTxOpReturns(rawHex) {
  try {
    const raw = h2b(rawHex); let pos = 4;
    let { v: inCount, l } = readVarint(raw, pos); pos += l;
    for (let i = 0; i < inCount; i++) {
      pos += 36;
      const { v: sLen, l: sl } = readVarint(raw, pos); pos += sl + sLen + 4;
    }
    const { v: outCount, l: ol } = readVarint(raw, pos); pos += ol;
    const opReturns = [];
    for (let i = 0; i < outCount; i++) {
      pos += 8;
      const { v: sLen, l: sl } = readVarint(raw, pos); pos += sl;
      const script = raw.slice(pos, pos + sLen); pos += sLen;
      if (script[0] === 0x6a) {
        let pay = null;
        if (script[1] <= 75) pay = script.slice(2, 2 + script[1]);
        else if (script[1] === 0x4c) pay = script.slice(3, 3 + script[2]);
        else if (script[1] === 0x4d) { const dlen = script[2] | (script[3] << 8); pay = script.slice(4, 4 + dlen); }
        if (pay?.length) opReturns.push(pay);
      }
    }
    return opReturns;
  } catch { return []; }
}

function extractSenderBchAddr(rawHex) {
  try {
    const raw = h2b(rawHex);
    let pos = 4;
    const { v: inCount, l } = readVarint(raw, pos); pos += l;
    if (inCount === 0) return null;
    pos += 36;
    const { v: sLen, l: sl } = readVarint(raw, pos); pos += sl;
    const ss = raw.slice(pos, pos + sLen);
    if (ss.length < 35 || ss[ss.length - 34] !== 0x21) return null;
    const pub33 = ss.slice(ss.length - 33);
    if (pub33[0] !== 0x02 && pub33[0] !== 0x03) return null;
    return pubHashToCashAddr(Array.from(ripemd160(sha256(pub33))));
  } catch { return null; }
}

/* ─────────────────────── Exports ───────────────────────────────── */

export {
  // Byte utils
  h2b, b2h, concat, u32LE, u64LE, writeVarint, readVarint, dsha256,

  // BIP32/BIP44
  bip32Master, _bip32Child, bip44BchPriv,

  // BCH / CashAddr
  pubHashToCashAddr, cashAddrToHash20, privToBchAddr, _addrSH,

  // Vault encryption
  encryptVault, decryptVault,

  // CCSH v1 protocol
  CCSH_MAGIC, packPacket, unpackPacket, ccshEncryptMsg, ccshDecryptPacket,

  // CCSH v2 split-knowledge
  CCSH_V2, MSG_SPLIT_CHAIN, MSG_SPLIT_RELAY, FLAG_SPLIT, NOSTR_KIND_CCSH,
  xorSplit, xorMerge, deriveKeyChain, deriveKeyRelay, aesWrap, aesUnwrap,
  splitEncrypt, splitDecrypt, packV2, unpackAny,

  // Nostr helpers
  _deriveNostrPriv, _nostrPubFromPriv, _makeNostrEvent,

  // BIP39
  loadBip39Words, bip39Generate, bip39Seed, deriveProfileFromSeed,

  // BCH TX builder
  p2pkhScript, p2pkhAddrScript, opReturnScript, bchSighash, serializeTx,

  // TX parser
  parseTxOpReturns, extractSenderBchAddr,
};
