/* ══════════════════════════════════════════
   00 Wallet — Balance & Price Service
   ══════════════════════════════════════════
   Background service. Runs once, never unmounted.
   Polls balances and prices, writes to state store.
   All views subscribe to state — no duplicate fetching.

   Usage (from app.js):
     import * as balanceService from './services/balance-service.js';
     balanceService.start(keys);    // after auth
     balanceService.stop();         // on disconnect
   ══════════════════════════════════════════ */

import * as state from '../core/state.js';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { b2h } from '../core/utils.js';
import { cashAddrToHash20 } from '../core/cashaddr.js';
import { deriveAllAddresses } from '../core/addr-derive.js';

/* ── Config ── */
const BALANCE_INTERVAL = 15000;  // 15s
const PRICE_INTERVAL   = 20000;  // 20s
const STEALTH_INTERVAL = 30000;  // 30s

let _balanceTimer = null;
let _priceTimer = null;
let _stealthTimer = null;
let _addresses = {};
let _keys = null;
let _running = false;

/* ── Address → Electrum scriptHash ── */
function _addrToScriptHash(cashAddr) {
  try {
    const hash20 = cashAddrToHash20(cashAddr);
    // P2PKH script: OP_DUP OP_HASH160 <20 bytes> OP_EQUALVERIFY OP_CHECKSIG
    const script = new Uint8Array([0x76, 0xa9, 0x14, ...hash20, 0x88, 0xac]);
    const hash = sha256(script);
    // Reverse for Electrum
    return b2h(hash.reverse());
  } catch { return null; }
}

/* ── Derive addresses from keys ── */
function _deriveAddresses(keys) {
  // Use addr-derive.js to derive ALL chain addresses from the HD keys
  const derived = deriveAllAddresses(keys);

  // Convert BCH cashAddr → scriptHash for Electrum
  const addrs = {};
  if (derived.bch) {
    const sh = _addrToScriptHash(derived.bch);
    if (sh) addrs.bch = sh;
  }

  // Copy all other addresses as-is (ETH, BTC, SOL, etc.)
  for (const [chain, addr] of Object.entries(derived)) {
    if (chain !== 'bch' && addr) addrs[chain] = addr;
  }

  console.log('[balance-service] derived addresses:', Object.keys(addrs).join(', '));
  return addrs;
}

/* ── Balance polling ── */
async function _refreshBalances() {
  if (!_running || !Object.keys(_addresses).length) return;
  try {
    // chainsRefreshAll is from chains.js (already loaded via script tag)
    if (window.chainsRefreshAll) {
      const results = await window.chainsRefreshAll(_addresses);
      // Write to state store
      const balances = {};
      for (const [chain, res] of Object.entries(results)) {
        if (res.loaded) {
          balances[chain] = res.balance;
          // Store UTXOs if available (BCH)
          if (res.utxos) state.set('utxos', res.utxos);
        }
      }
      state.merge('balances', balances);

      // Check for new BCH transactions and enrich tx history
      _refreshBchHistory();
    }
  } catch (e) {
    console.warn('[balance-service] refresh failed:', e.message);
  }
}

/* ── BCH tx history refresh (detect new tx, enrich cache) ── */
let _lastKnownTxCount = -1;
let _lastHistoryRefresh = 0;
async function _refreshBchHistory() {
  if (!_keys || !_keys.bchAddr || !window._fvCall) return;
  // Don't re-enrich more than once per 30s
  if (Date.now() - _lastHistoryRefresh < 30000) return;
  _lastHistoryRefresh = Date.now();
  try {
    const sh = _addrToScriptHash(_keys.bchAddr);
    if (!sh) return;
    const hist = await window._fvCall('blockchain.scripthash.get_history', [sh]) || [];

    // Only process if tx count changed
    if (hist.length === _lastKnownTxCount) return;
    _lastKnownTxCount = hist.length;

    // Check which tx are missing from cache
    let cached = [];
    try { cached = JSON.parse(localStorage.getItem('00_tx_history') || '[]'); } catch {}
    const cachedIds = new Set(cached.filter(t => t.chain === 'bch').map(t => t.txid));
    const missing = hist.filter(h => !cachedIds.has(h.tx_hash));

    if (!missing.length) return;

    // Compute our script for output matching
    const { cashAddrToHash20 } = await import('../core/cashaddr.js');
    const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    const h160 = cashAddrToHash20(_keys.bchAddr);
    const myScript = ['76','a9','14',...Array.from(h160, b => b.toString(16).padStart(2,'0')),'88','ac'].join('');

    const newTxs = [];
    for (const h of missing.slice(-10)) { // max 10 at a time
      try {
        const hex = await window._fvCall('blockchain.transaction.get', [h.tx_hash]);
        if (!hex) continue;
        const outputs = _parseTxOutputsSimple(hex);
        if (!outputs) continue;
        const myVal = outputs.filter(o => o.script === myScript).reduce((s, o) => s + o.value, 0);
        const totalOut = outputs.reduce((s, o) => s + o.value, 0);
        const dir = myVal > 0 ? 'in' : 'out';
        const amount = dir === 'in' ? myVal : totalOut - myVal;

        // Get timestamp from block header
        let timestamp = Math.floor(Date.now() / 1000);
        if (h.height > 0) {
          try {
            const header = await window._fvCall('blockchain.block.header', [h.height]);
            if (header && header.length >= 152) {
              const tsHex = header.slice(136, 144);
              timestamp = parseInt(tsHex.slice(6,8)+tsHex.slice(4,6)+tsHex.slice(2,4)+tsHex.slice(0,2), 16);
            }
          } catch {}
        }

        newTxs.push({ txid: h.tx_hash, chain: 'bch', dir, amount, height: h.height || 0, timestamp });
      } catch {}
    }

    if (newTxs.length) {
      cached = cached.concat(newTxs);
      localStorage.setItem('00_tx_history', JSON.stringify(cached.slice(-500)));
      // Send new tx data to views (prepend instead of full reload)
      state.set('newTxs', newTxs);
      console.log(`[balance-service] enriched ${newTxs.length} new BCH tx`);
    }
  } catch {}
}

/* ── Simple TX output parser ── */
function _parseTxOutputsSimple(hex) {
  try {
    const b = []; for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16));
    let p = 0;
    const rB = n => { p += n; return b.slice(p-n, p); };
    const rLE = n => { let r = 0; for(let i=0;i<n;i++) r |= b[p+i] << (i*8); p+=n; return r >>> 0; };
    const rVI = () => { const f = b[p++]; if(f<0xfd)return f; if(f===0xfd)return rLE(2); return rLE(4); };
    const rLE8 = () => { let lo = rLE(4), hi = rLE(4); return hi * 0x100000000 + lo; };
    rLE(4);
    const inCount = rVI();
    for (let i=0;i<inCount;i++) { rB(32); rLE(4); rB(rVI()); rLE(4); }
    const outCount = rVI();
    const outputs = [];
    for (let i=0;i<outCount;i++) {
      const value = rLE8();
      const sLen = rVI();
      const script = b.slice(p, p+sLen).map(x => x.toString(16).padStart(2,'0')).join('');
      p += sLen;
      outputs.push({ value, script });
    }
    return outputs;
  } catch { return null; }
}

/* ── Price polling ── */
async function _refreshPrices() {
  if (!_running) return;
  try {
    if (window.chainsGetPrices) {
      const prices = await window.chainsGetPrices();
      state.set('prices', prices);
    }
  } catch (e) {
    console.warn('[balance-service] price fetch failed:', e.message);
  }
}

/* ── Stealth UTXO scanning ── */
async function _scanStealth() {
  if (!_running || !_keys || !_keys.stealthScanPriv) return;
  try {
    const indexerUrl = (window._00ep && window._00ep.indexer) || 'https://0penw0rld.com';

    // Get current block height from Fulcrum
    let tipHeight = 0;
    if (window._fvCall) {
      try { const h = await window._fvCall('blockchain.headers.subscribe', []); tipHeight = h?.height || 0; } catch {}
    }
    if (!tipHeight) return; // Can't scan without knowing the tip

    // Scan last 10 blocks for stealth pubkeys
    const lastScan = state.get('stealthScanHeight') || (tipHeight - 10);
    const from = Math.max(0, lastScan);
    const to = tipHeight;
    if (from >= to) return; // Already up to date

    const pubkeysRes = await fetch(`${indexerUrl}/api/pubkeys?from=${from}&to=${to}`);
    if (!pubkeysRes.ok) return;
    const data = await pubkeysRes.json();
    const pubkeys = data.pubkeys || data;

    if (pubkeys && pubkeys.length > 0) {
      // TODO: implement stealth scanning with _keys.stealthScanPriv
      // For now, just update the last scan height
      state.set('stealthScanHeight', to);
    }
  } catch (e) {
    // Stealth scanning is optional — don't spam console
  }
}

/* ── Public API ── */

export function start(keys) {
  if (_running) stop();
  _running = true;
  _keys = keys;
  _addresses = _deriveAddresses(keys);

  console.log('[balance-service] started, addresses:', Object.keys(_addresses).join(', '));

  // Initial fetches
  _refreshBalances();
  _refreshPrices();

  // Start polling
  _balanceTimer = setInterval(_refreshBalances, BALANCE_INTERVAL);
  _priceTimer = setInterval(_refreshPrices, PRICE_INTERVAL);

  // Stealth scanning (only if we have scan keys)
  if (keys.stealthScanPriv) {
    _stealthTimer = setInterval(_scanStealth, STEALTH_INTERVAL);
    setTimeout(_scanStealth, 5000); // first scan after 5s
  }
}

export function stop() {
  _running = false;
  clearInterval(_balanceTimer);
  clearInterval(_priceTimer);
  clearInterval(_stealthTimer);
  _balanceTimer = null;
  _priceTimer = null;
  _stealthTimer = null;
  _keys = null;
  _addresses = {};
  console.log('[balance-service] stopped');
}

export function isRunning() {
  return _running;
}

/* ── Force refresh (user-triggered) ── */
export async function refreshNow() {
  await Promise.all([_refreshBalances(), _refreshPrices()]);
}

/* ── Update addresses (e.g. after adding a chain) ── */
export function setAddress(chain, addr) {
  _addresses[chain] = addr;
  // Persist
  try {
    const cached = JSON.parse(localStorage.getItem('00_chain_addrs') || '{}');
    cached[chain] = addr;
    localStorage.setItem('00_chain_addrs', JSON.stringify(cached));
  } catch {}
}

export function getAddresses() {
  return { ..._addresses };
}
