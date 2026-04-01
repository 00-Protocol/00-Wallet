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
import { cashAddrToHash20, base58Decode } from '../core/cashaddr.js';
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
    return _hash20ToScriptHash(hash20);
  } catch { return null; }
}

/* ── BTC legacy address → Electrum scriptHash ── */
function _btcAddrToScriptHash(btcAddr) {
  try {
    const decoded = base58Decode(btcAddr);
    // base58check payload: [version(1)] [hash160(20)] [checksum(4)]
    const hash20 = decoded.slice(1, 21);
    return _hash20ToScriptHash(hash20);
  } catch { return null; }
}

/* ── Common: hash160 → P2PKH scriptHash ── */
function _hash20ToScriptHash(hash20) {
  const script = new Uint8Array([0x76, 0xa9, 0x14, ...hash20, 0x88, 0xac]);
  const hash = sha256(script);
  // Reverse for Electrum
  return b2h(hash.reverse());
}

/* ── Derive addresses from keys ── */
// _cleanAddresses: display-ready addresses (cashAddr, 0x-prefixed, etc.)
// _electrumAddresses: scriptHash versions for Electrum chains only
let _cleanAddresses = {};

function _deriveAddresses(keys) {
  // Use addr-derive.js to derive ALL chain addresses from the HD keys
  const derived = deriveAllAddresses(keys);

  // Store clean addresses for display/state (cashAddr, not scriptHash)
  _cleanAddresses = { ...derived };

  // Build address map for chains.js fetchers:
  // - BCH/BTC/LTC need scriptHash for Electrum
  // - Everything else uses the raw address
  const addrs = {};
  for (const [chain, addr] of Object.entries(derived)) {
    if (chain === 'bch' || chain === 'sbch') {
      const sh = _addrToScriptHash(addr);
      if (sh) addrs[chain] = sh;
    } else if (chain === 'btc') {
      // BTC uses Electrum — convert legacy base58 address to scriptHash
      const sh = _btcAddrToScriptHash(addr);
      if (sh) addrs[chain] = sh;
    } else {
      addrs[chain] = addr;
    }
  }

  return addrs;
}

/* ── Get clean display addresses (for other modules) ── */
export function getAddresses() { return { ..._cleanAddresses }; }
export function getAddress(chain) { return _cleanAddresses[chain] || null; }

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

      // Check for new transactions on Electrum chains (BCH, BTC, LTC)
      _refreshElectrumHistoryAll();
    }
  } catch (e) {
    console.warn('[balance-service] refresh failed:', e.message);
  }
}

/* ── Electrum tx history refresh (BCH, BTC, LTC) ── */
const _lastKnownTxCounts = {};
let _lastHistoryRefresh = 0;

/** Refresh tx history for all Electrum chains */
async function _refreshElectrumHistoryAll() {
  if (Date.now() - _lastHistoryRefresh < 30000) return;
  _lastHistoryRefresh = Date.now();

  // BCH — uses _fvCall (Fulcrum SharedWorker)
  if (_cleanAddresses.bch && window._fvCall) {
    const sh = _addrToScriptHash(_cleanAddresses.bch);
    if (sh) await _refreshElectrumHistory('bch', sh, window._fvCall);
  }
  // BTC — uses _btcCall (BTC Electrum SharedWorker)
  if (_cleanAddresses.btc && window._btcCall) {
    const sh = _btcAddrToScriptHash(_cleanAddresses.btc);
    if (sh) await _refreshElectrumHistory('btc', sh, window._btcCall);
  }
  // LTC — uses _ltcCall (LTC Electrum SharedWorker)
  if (_cleanAddresses.ltc && window._ltcCall) {
    const sh = _ltcAddrToScriptHash(_cleanAddresses.ltc);
    if (sh) await _refreshElectrumHistory('ltc', sh, window._ltcCall);
  }
}

/** Generic Electrum tx history enrichment for a single chain */
async function _refreshElectrumHistory(chain, scriptHash, caller) {
  try {
    const hist = await caller('blockchain.scripthash.get_history', [scriptHash]) || [];

    // Only process if tx count changed
    if (hist.length === (_lastKnownTxCounts[chain] || -1)) return;
    _lastKnownTxCounts[chain] = hist.length;

    // Check which tx are missing from cache
    let cached = [];
    try { cached = JSON.parse(localStorage.getItem('00_tx_history') || '[]'); } catch {}
    const cachedIds = new Set(cached.filter(t => t.chain === chain).map(t => t.txid));
    const missing = hist.filter(h => !cachedIds.has(h.tx_hash));
    if (!missing.length) return;

    // Build our P2PKH script for output matching
    const myScript = _buildP2PKHScript(chain);
    if (!myScript) return;

    const newTxs = [];
    for (const h of missing.slice(-10)) { // max 10 at a time
      try {
        const hex = await caller('blockchain.transaction.get', [h.tx_hash]);
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
            const header = await caller('blockchain.block.header', [h.height]);
            if (header && header.length >= 152) {
              const tsHex = header.slice(136, 144);
              timestamp = parseInt(tsHex.slice(6,8)+tsHex.slice(4,6)+tsHex.slice(2,4)+tsHex.slice(0,2), 16);
            }
          } catch {}
        }

        newTxs.push({ txid: h.tx_hash, chain, dir, amount, height: h.height || 0, timestamp });
      } catch {}
    }

    if (newTxs.length) {
      cached = cached.concat(newTxs);
      localStorage.setItem('00_tx_history', JSON.stringify(cached.slice(-500)));
      state.set('newTxs', newTxs);
    }
  } catch {}
}

/** Build the hex P2PKH locking script for our address on a given chain */
function _buildP2PKHScript(chain) {
  try {
    const addr = _cleanAddresses[chain];
    if (!addr) return null;
    let hash20;
    if (chain === 'bch') {
      hash20 = cashAddrToHash20(addr);
    } else {
      // BTC/LTC: base58check decode → skip version byte → 20 bytes hash
      const decoded = base58Decode(addr);
      hash20 = decoded.slice(1, 21);
    }
    return ['76','a9','14',...Array.from(hash20, b => b.toString(16).padStart(2,'0')),'88','ac'].join('');
  } catch { return null; }
}

/** LTC address → Electrum scriptHash */
function _ltcAddrToScriptHash(ltcAddr) {
  try {
    const decoded = base58Decode(ltcAddr);
    const hash20 = decoded.slice(1, 21);
    return _hash20ToScriptHash(hash20);
  } catch { return null; }
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
      try {
        const { scanForStealthPayments } = await import('../core/stealth.js');
        const found = await scanForStealthPayments(_keys, pubkeys);
        if (found.length > 0) {
          // Update sbch balance from saved stealth UTXOs
          _updateStealthBalance();
        }
      } catch (e) { console.warn('[balance-service] stealth scan error:', e); }
      state.set('stealthScanHeight', to);
    }
  } catch (e) {
    // Stealth scanning is optional — don't spam console
  }
}

/* ── Stealth balance from saved UTXOs ── */
async function _updateStealthBalance() {
  try {
    const { loadStealthUtxos } = await import('../core/stealth.js');
    const utxos = loadStealthUtxos();
    if (!utxos.length) return;

    // For each stealth UTXO, check if it's still unspent via Fulcrum
    let totalSats = 0;
    for (const u of utxos) {
      if (!u.addr || u.spent) continue;
      try {
        const h = cashAddrToHash20(u.addr);
        const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
        const hash = sha256(script);
        const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
        const unspent = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
        for (const utxo of unspent) totalSats += utxo.value;
      } catch {}
    }

    // Update sbch balance in state (store as sats, like all other chains)
    state.set('balances', { ...state.get('balances'), sbch: totalSats });
  } catch (e) {
    console.warn('[balance-service] stealth balance error:', e);
  }
}

/* ── Public API ── */

export function start(keys) {
  if (_running) stop();
  _running = true;
  _keys = keys;
  _addresses = _deriveAddresses(keys);

  // Expose CLEAN addresses to state store (cashAddr, 0x-prefixed — NOT scriptHash)
  state.set('addresses', { ..._cleanAddresses });


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
    _updateStealthBalance(); // load existing stealth UTXOs immediately
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
}

export function isRunning() {
  return _running;
}

/* ── Force refresh (user-triggered) ── */
export async function refreshNow() {
  await Promise.all([_refreshBalances(), _refreshPrices(), _updateStealthBalance()]);
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

/* getAddresses() and getAddress() are defined above (line ~81) */
