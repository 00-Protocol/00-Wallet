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
async function _deriveKeys(profile) {
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

  // XMR keys (derived at m/44'/145'/0'/5/0)
  let xmrKeys = null;
  if (acctPriv && acctChain) {
    try {
      const { deriveXmrKeys } = await import('./xmr-keys.js');
      xmrKeys = deriveXmrKeys(acctPriv, acctChain, bip32Child);
    } catch (e) { console.warn('[auth] XMR key derivation failed:', e.message); }
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
    xmr: xmrKeys,
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
  _keys = await _deriveKeys(profile);

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

/* ══════════════════════════════════════════
   LEDGER HARDWARE WALLET SUPPORT
   ══════════════════════════════════════════
   Uses ledger.js (loaded as a <script> in v2.html)
   which exposes window.Ledger.
   Scan addresses, set keys without private key.
   ══════════════════════════════════════════ */

let _ledgerDevice = null;
let _ledgerAddresses = [];    // [{pubKey, addr, path5}]
let _ledgerChangePath = null;
let _ledgerChangeHash160 = null;
let _ledgerChangePub33 = null;

export function isLedger() { return !!_ledgerDevice; }
export function getLedgerDevice() { return _ledgerDevice; }
export function getLedgerAddresses() { return _ledgerAddresses; }
export function getLedgerChangePath() { return _ledgerChangePath; }
export function getLedgerChangeHash160() { return _ledgerChangeHash160; }

/**
 * Connect to Ledger, scan addresses, set up wallet.
 * @param {function} onProgress - callback(message) for UI status updates
 * @returns {Promise<{addr: string, addressCount: number}>}
 */
export async function connectLedger(onProgress) {
  if (!window.Ledger) throw new Error('Ledger module not loaded');
  const L = window.Ledger;

  onProgress?.('Connecting to Ledger...');
  const device = await L.connectLedger();

  onProgress?.('Reading account xpub...');
  const { pubKey: rawAcct, chainCode: acctChain } = await L.getLedgerPubKey(device, L.ACCOUNT_PATH);

  // Compress pubkey if needed (Ledger may return uncompressed 65-byte key)
  const acctPub = rawAcct.length === 65
    ? new Uint8Array([rawAcct[64] & 1 ? 0x03 : 0x02, ...rawAcct.slice(1, 33)])
    : rawAcct;

  _ledgerDevice = device;
  _ledgerAddresses = [];

  onProgress?.('Scanning addresses...');

  // Scan receive (change=0) and change (change=1) branches, gap limit 20, max 50 per branch
  for (const changeIdx of [0, 1]) {
    const changeKey = bip32Child(acctPub, acctChain, changeIdx);
    let gap = 0;
    for (let i = 0; i < 50 && gap < 20; i++) {
      const child = bip32Child(changeKey.pub, changeKey.chain, i);
      const h160 = ripemd160(sha256(child.pub));
      const addr = pubHashToCashAddr(h160);

      // Check if address has been used
      const script = new Uint8Array([0x76, 0xa9, 0x14, ...h160, 0x88, 0xac]);
      const sh = Array.from(sha256(script)).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
      try {
        const hist = await window._fvCall('blockchain.scripthash.get_history', [sh]) || [];
        const utxos = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
        const path5 = _ledgerPath(changeIdx, i);
        if (hist.length > 0 || utxos.length > 0) {
          _ledgerAddresses.push({ pubKey: child.pub, addr, path5 });
          gap = 0;
        } else {
          gap++;
        }
      } catch { gap++; }
    }
  }

  // If no addresses found, add the first receive address
  if (_ledgerAddresses.length === 0) {
    const firstChild = bip32Child(bip32Child(acctPub, acctChain, 0).pub, bip32Child(acctPub, acctChain, 0).chain, 0);
    const h160 = ripemd160(sha256(firstChild.pub));
    _ledgerAddresses.push({
      pubKey: firstChild.pub,
      addr: pubHashToCashAddr(h160),
      path5: _ledgerPath(0, 0),
    });
  }

  // Primary address = first receive address (or one with most value)
  const primary = _ledgerAddresses.find(a => a.path5[3] === 0) || _ledgerAddresses[0];

  // Setup change address: next unused internal (change=1) index
  const usedChg1 = _ledgerAddresses.filter(a => a.path5[3] === 1);
  const nextChgIdx = usedChg1.length > 0 ? Math.max(...usedChg1.map(a => a.path5[4])) + 1 : 0;
  const chgLvl = bip32Child(acctPub, acctChain, 1);
  const chgChild = bip32Child(chgLvl.pub, chgLvl.chain, nextChgIdx);
  const chgH160 = ripemd160(sha256(chgChild.pub));
  const chgPath = _ledgerPath(1, nextChgIdx);
  _ledgerChangeHash160 = chgH160;
  _ledgerChangePub33 = chgChild.pub;
  _ledgerChangePath = chgPath;

  // Set keys (no private key — Ledger signs on device)
  _keys = {
    privKey: null,           // No private key — Ledger signs
    pubKey: primary.pubKey,
    hash160: ripemd160(sha256(primary.pubKey)),
    bchAddr: primary.addr,
    acctPriv: null,
    acctChain: acctChain,
    sessionPriv: rand(32),
    sessionPub: b2h(secp256k1.getPublicKey(rand(32), true)),
    stealthSpendPriv: null,
    stealthSpendPub: null,
    stealthScanPriv: null,
    stealthScanPub: null,
    stealthCode: null,
    ledger: true,            // Flag for send flow
  };
  _profile = { type: 'ledger' };

  // Store Ledger addresses for HD scanner / balance service
  const { set } = await import('./state.js');
  set('hdAddresses', _ledgerAddresses.map(a => ({ addr: a.addr, branch: a.path5[3], index: a.path5[4] })));
  set('hdChangeAddr', pubHashToCashAddr(chgH160));

  _notifyListeners();

  onProgress?.(`Connected — ${_ledgerAddresses.length} addresses found`);

  return { addr: primary.addr, addressCount: _ledgerAddresses.length };
}

/**
 * Sign a TX using the connected Ledger device.
 * @param {Array} utxos - [{txid, vout, value, addr?}]
 * @param {Array} outputs - [{value, script}]
 * @returns {Promise<string>} raw signed TX hex
 */
export async function ledgerSignTx(utxos, outputs) {
  if (!_ledgerDevice) throw new Error('No Ledger connected');
  const L = window.Ledger;

  // Build per-input scripts and paths
  const scripts = utxos.map(u => {
    const la = _ledgerAddresses.find(a => a.addr === u.addr);
    if (!la) {
      // Fallback: use first address script
      const h = ripemd160(sha256(_ledgerAddresses[0].pubKey));
      return new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
    }
    const h = ripemd160(sha256(la.pubKey));
    return new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
  });
  const paths = utxos.map(u => {
    const la = _ledgerAddresses.find(a => a.addr === u.addr);
    return la ? la.path5 : L.BCH_PATH;
  });
  const pubKeys = utxos.map(u => {
    const la = _ledgerAddresses.find(a => a.addr === u.addr);
    return la ? la.pubKey : _ledgerAddresses[0].pubKey;
  });

  // Sign on device
  const sigs = await L.signLedgerTx(_ledgerDevice, utxos, outputs, scripts, paths);

  // Build raw TX
  return L.buildLedgerTx(utxos, sigs, pubKeys, outputs);
}

function _ledgerPath(changeIdx, addrIdx) {
  return [0x8000002c, 0x80000091, 0x80000000, changeIdx, addrIdx];
}

/* ══════════════════════════════════════════
   WALLETCONNECT v2 SUPPORT
   ══════════════════════════════════════════ */

let _wcClient = null, _wcSession = null;
const WC_PROJECT_ID = '082bda1ddb7c62dc3aee194b5e8dc8f9';

export function isWalletConnect() { return !!_wcSession; }
export function getWcClient() { return _wcClient; }
export function getWcSession() { return _wcSession; }

async function _initWC() {
  if (_wcClient) return _wcClient;
  const mod = await import('https://esm.sh/@walletconnect/sign-client@2.17.5');
  const SC = mod.SignClient || mod.default;
  _wcClient = await SC.init({
    projectId: WC_PROJECT_ID,
    metadata: { name: '0penw0rld', description: 'BCH Self-Custody', url: 'https://0penw0rld.com', icons: ['https://0penw0rld.com/icons/icon-180.png'] },
  });
  return _wcClient;
}

export async function connectWalletConnect(onUri, onProgress) {
  onProgress?.('Loading WalletConnect SDK...');
  const client = await _initWC();
  onProgress?.('Pairing...');
  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      bch: { chains: ['bch:bitcoincash'], methods: ['bch_getAddresses', 'bch_signTransaction', 'bch_signMessage'], events: ['addressesChanged'] },
    },
  });
  if (uri) onUri?.(uri);
  _wcSession = await approval();
  const addresses = await client.request({ chainId: 'bch:bitcoincash', topic: _wcSession.topic, request: { method: 'bch_getAddresses', params: {} } });
  const bchAddr = addresses[0];
  _wcSubEvents(client);
  localStorage.setItem('00_wc_session', 'true');
  const sp = rand(32);
  _keys = { privKey: null, pubKey: null, hash160: cashAddrToHash20(bchAddr), bchAddr, acctPriv: null, acctChain: null, sessionPriv: sp, sessionPub: b2h(secp256k1.getPublicKey(sp, true)), stealthSpendPriv: null, stealthSpendPub: null, stealthScanPriv: null, stealthScanPub: null, stealthCode: null, walletConnect: true };
  _profile = { type: 'walletconnect' };
  _notifyListeners();
  return { addr: bchAddr };
}

export async function restoreWcSession() {
  if (!localStorage.getItem('00_wc_session')) return false;
  try {
    const client = await _initWC();
    if (!client.session.length) { localStorage.removeItem('00_wc_session'); return false; }
    const key = client.session.keys[client.session.keys.length - 1];
    _wcSession = client.session.get(key);
    const addrs = await client.request({ chainId: 'bch:bitcoincash', topic: _wcSession.topic, request: { method: 'bch_getAddresses', params: {} } });
    const bchAddr = addrs[0]; const sp = rand(32);
    _keys = { privKey: null, pubKey: null, hash160: cashAddrToHash20(bchAddr), bchAddr, acctPriv: null, acctChain: null, sessionPriv: sp, sessionPub: b2h(secp256k1.getPublicKey(sp, true)), stealthSpendPriv: null, stealthSpendPub: null, stealthScanPriv: null, stealthScanPub: null, stealthCode: null, walletConnect: true };
    _profile = { type: 'walletconnect' };
    _wcSubEvents(client); _notifyListeners();
    return true;
  } catch { localStorage.removeItem('00_wc_session'); return false; }
}

export async function wcSignTx(unsignedHex, sourceOutputs, userPrompt) {
  if (!_wcClient || !_wcSession) throw new Error('WalletConnect not connected');
  const r = await _wcClient.request({ chainId: 'bch:bitcoincash', topic: _wcSession.topic, request: { method: 'bch_signTransaction', params: { transaction: unsignedHex, sourceOutputs, broadcast: false, userPrompt } } });
  if (!r?.signedTransaction) throw new Error('Signing rejected');
  return r.signedTransaction;
}

export async function wcDisconnect() {
  if (_wcClient && _wcSession) { try { await _wcClient.disconnect({ topic: _wcSession.topic, reason: { code: 6000, message: 'USER_DISCONNECTED' } }); } catch {} }
  _wcSession = null; _wcClient = null; _keys = null; _profile = null;
  localStorage.removeItem('00_wc_session'); _notifyListeners();
}

function _wcSubEvents(client) {
  client.on('session_delete', () => { _wcSession = null; _keys = null; _profile = null; localStorage.removeItem('00_wc_session'); _notifyListeners(); });
  client.on('session_event', (args) => { if (args.params?.event?.name === 'addressesChanged' && _keys) { _keys.bchAddr = args.params.event.data[0]; _keys.hash160 = cashAddrToHash20(_keys.bchAddr); _notifyListeners(); } });
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
  _keys = await _deriveKeys(profile);
  for (const cb of _listeners) {
    try { cb('unlock', _keys); } catch (e) {}
  }
  return _keys;
}

export { decryptVault, encryptVault };
