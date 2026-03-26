/* ══════════════════════════════════════════
   00 Wallet — Authentication & Session
   ══════════════════════════════════════════
   Centralized auth: vault decrypt, session
   management, key derivation. Replaces
   duplicated auth logic across all pages.

   All private keys stay in this module's closure.
   Views call auth.getKeys() — never touch localStorage.
   ══════════════════════════════════════════ */

import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { deriveBchPriv, deriveStealth, bip32Child, deriveAccountNode } from './hd.js';
import { pubHashToCashAddr } from './cashaddr.js';
import { b2h, h2b, utf8, rand } from './utils.js';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';

/* ── Private state (never exposed) ── */
let _keys = null;
let _profile = null;
let _password = null;
let _listeners = new Set();

const SESSION_TTL = 30 * 60 * 1000; // 30 minutes

/* ── Vault encryption (AES-256-GCM via Web Crypto) ── */
/* Compatible with wallet.html v1 format: JSON { v:1, salt:hex, iv:hex, data:hex } */
/* PBKDF2 200,000 iterations (matches v1) */

async function _pbkdf2Key(password, salt) {
  const km = await crypto.subtle.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 200000 },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

async function decryptVault(vaultStr, password) {
  const { salt, iv, data } = JSON.parse(vaultStr);
  const key = await _pbkdf2Key(password, h2b(salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: h2b(iv) }, key, h2b(data));
  return JSON.parse(new TextDecoder().decode(pt));
}

async function encryptVault(profile, password) {
  const salt = rand(16);
  const iv = rand(12);
  const key = await _pbkdf2Key(password, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(JSON.stringify(profile)));
  return JSON.stringify({ v: 1, salt: b2h(salt), iv: b2h(iv), data: b2h(new Uint8Array(ct)) });
}

/* ── Key derivation from profile ── */
function _deriveKeys(profile) {
  let privKey, acctPriv, acctChain;

  // Support both v1 (seedHex) and v2 (seed) profile formats
  const seedHex = profile.seed || profile.seedHex;

  if (seedHex) {
    const seed64 = h2b(seedHex);
    const bch = deriveBchPriv(seed64);
    privKey = bch.priv;
    acctPriv = bch.acctPriv;
    acctChain = bch.acctChain;
  } else if (profile.bchPrivHex) {
    // v1 profile with pre-derived keys
    privKey = h2b(profile.bchPrivHex);
    acctPriv = profile.acctPrivHex ? h2b(profile.acctPrivHex) : null;
    acctChain = profile.acctChainHex ? h2b(profile.acctChainHex) : null;
  } else if (profile.wif || profile.priv) {
    privKey = h2b(profile.priv || profile.wif);
    acctPriv = null;
    acctChain = null;
  }

  if (!privKey) return null;

  const pubKey = secp256k1.getPublicKey(privKey, true);
  const hash160 = ripemd160(sha256(pubKey));
  const bchAddr = pubHashToCashAddr(hash160);

  // Session keypair (ephemeral, for Nostr)
  const sessionPriv = rand(32);
  const sessionPub = b2h(secp256k1.getPublicKey(sessionPriv, true));

  // Stealth keys
  let stealthSpendPriv = null, stealthSpendPub = null;
  let stealthScanPriv = null, stealthScanPub = null;
  let stealthCode = null;

  if (seedHex) {
    const seed64 = h2b(seedHex);
    const stealth = deriveStealth(seed64);
    stealthSpendPriv = stealth.spendPriv;
    stealthSpendPub = stealth.spendPub;
    stealthScanPriv = stealth.scanPriv;
    stealthScanPub = stealth.scanPub;
    stealthCode = 'stealth:' + b2h(stealth.scanPub) + b2h(stealth.spendPub);
  }

  return {
    privKey,
    pubKey,
    hash160,
    bchAddr,
    acctPriv,
    acctChain,
    sessionPriv,
    sessionPub,
    stealthSpendPriv,
    stealthSpendPub,
    stealthScanPriv,
    stealthScanPub,
    stealthCode,
  };
}

/* ── Public API ── */

export function isConnected() {
  return !!(
    localStorage.getItem('00_wif') ||
    localStorage.getItem('00_pub') ||
    localStorage.getItem('00_ledger') ||
    localStorage.getItem('00wallet_vault') ||
    localStorage.getItem('00_wc_session') ||
    localStorage.getItem('00_session_auth')
  );
}

export function isUnlocked() {
  return _keys !== null;
}

export async function unlock(password) {
  const vault = localStorage.getItem('00wallet_vault');
  if (!vault) throw new Error('No wallet vault found');

  const profile = await decryptVault(vault, password);
  _profile = profile;
  _password = password;
  _keys = _deriveKeys(profile);

  if (!_keys) throw new Error('Failed to derive keys from profile');

  // Save session auth (30 min TTL)
  localStorage.setItem('00_session_auth', JSON.stringify({
    p: btoa(password),
    ts: Date.now()
  }));

  // Notify listeners
  for (const cb of _listeners) {
    try { cb('unlock', _keys); } catch (e) { console.error('[auth] listener error:', e); }
  }

  return _keys;
}

export async function tryAutoUnlock() {
  const vault = localStorage.getItem('00wallet_vault');
  if (!vault) return false;

  try {
    const sess = JSON.parse(localStorage.getItem('00_session_auth') || '{}');
    if (sess.p && sess.ts && Date.now() - sess.ts < SESSION_TTL) {
      const pass = atob(sess.p);
      await unlock(pass);
      return true;
    }
  } catch { /* session expired */ }
  return false;
}

export function refreshSession() {
  try {
    const sess = JSON.parse(localStorage.getItem('00_session_auth') || '{}');
    if (sess.p) {
      localStorage.setItem('00_session_auth', JSON.stringify({ p: sess.p, ts: Date.now() }));
    }
  } catch {}
}

export function getKeys() {
  return _keys;
}

export function getProfile() {
  return _profile;
}

export function getPassword() {
  return _password;
}

export function lock() {
  _keys = null;
  _profile = null;
  _password = null;
  localStorage.removeItem('00_session_auth');
  for (const cb of _listeners) {
    try { cb('lock', null); } catch (e) {}
  }
}

export function disconnect() {
  lock();
  // Clear all wallet data
  const keysToKeep = ['00_theme', '00_lang', '00_ep_fulcrum', '00_ep_btc_electrum', '00_ep_relays'];
  const allKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('00') && !keysToKeep.includes(k)) allKeys.push(k);
  }
  allKeys.forEach(k => localStorage.removeItem(k));
  for (const cb of _listeners) {
    try { cb('disconnect', null); } catch (e) {}
  }
}

export function onAuth(callback) {
  _listeners.add(callback);
  return () => _listeners.delete(callback);
}

/* ── Vault management ── */
export async function createVault(profile, password) {
  const vaultB64 = await encryptVault(profile, password);
  localStorage.setItem('00wallet_vault', vaultB64);
  localStorage.setItem('00_session_auth', JSON.stringify({ p: btoa(password), ts: Date.now() }));
  _profile = profile;
  _password = password;
  _keys = _deriveKeys(profile);
  for (const cb of _listeners) {
    try { cb('unlock', _keys); } catch (e) {}
  }
  return _keys;
}

export { decryptVault, encryptVault };
