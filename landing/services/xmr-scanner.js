/* ══════════════════════════════════════════
   xmr-scanner.js — Monero WASM Scanner & Balance Service
   ══════════════════════════════════════════
   Uses monero-ts WASM for fast wallet sync, balance,
   and sending. Replaces slow HTTP block-by-block scanning.
   ══════════════════════════════════════════ */

import { b2h, h2b } from '../core/xmr-keys.js';

/* ── State ── */
let _spendPriv = null, _spendPub = null, _viewPriv = null, _viewPub = null, _addr = null;
let _balance = '0';     // piconeros string
let _height = 0;
let _connected = false;
let _scanning = false;
let _scanTimer = null;
let _xmrWallet = null;  // monero-ts wallet instance (used for scan + send)
let _rpcModule = null;

/* ── Initialize with keys ── */
export function init(keys) {
  _spendPriv = keys.spendPriv;
  _spendPub = keys.spendPub;
  _viewPriv = keys.viewPriv;
  _viewPub = keys.viewPub;
  _addr = keys.addr;
  // Load cached balance
  try {
    const cached = JSON.parse(localStorage.getItem('00_xmr_scan') || 'null');
    if (cached && cached.addr === _addr) {
      _balance = cached.balance || '0';
      _height = cached.height || 0;
    }
  } catch {}
}

/* ── Getters ── */
export function getBalance() { return _balance; }
export function getBalanceXMR() { return (Number(BigInt(_balance)) / 1e12).toFixed(12); }
export function getOutputs() { return []; }
export function getHeight() { return _height; }
export function isConnected() { return _connected; }
export function getAddr() { return _addr; }

/* ── Lazy load xmr-rpc.js (for connect/height only) ── */
async function _rpc() {
  if (!_rpcModule) _rpcModule = await import('../xmr-rpc.js');
  return _rpcModule;
}

/* ── Connect to XMR node ── */
export async function connect() {
  const rpc = await _rpc();
  const conn = await rpc.autoConnect();
  if (!conn.connected) throw new Error('No XMR node available');
  _connected = true;
  _height = conn.height || 0;
  console.log('[xmr] connected to', conn.name, 'height:', _height);
  return conn;
}

/* ── Ensure WASM wallet is loaded ── */
async function _ensureWallet(onStatus) {
  if (_xmrWallet) return _xmrWallet;

  onStatus?.('Loading WASM library...');
  const moneroMod = await import('../lib/monero-ts.js');
  const moneroTs = moneroMod.default || moneroMod;

  // Setup Web Worker
  moneroTs.LibraryUtils.WORKER_LOADER = () => {
    const code = "importScripts('" + location.origin + "/monero.worker.js');";
    const blob = new Blob([code], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  };

  onStatus?.('Creating wallet...');

  // Restore height: use cached height or last 200 blocks
  const restoreH = _height > 200 ? _height - 200 : 0;

  _xmrWallet = await moneroTs.createWalletFull({
    password: 'x',
    networkType: 0, // MAINNET
    primaryAddress: _addr,
    privateViewKey: b2h(_viewPriv),
    privateSpendKey: b2h(_spendPriv),
    restoreHeight: restoreH,
    server: { uri: location.origin },
    proxyToWorker: true,
  });

  console.log('[xmr] WASM wallet created, restoreHeight:', restoreH);
  return _xmrWallet;
}

/* ── Scan using WASM sync ── */
export async function scan(onProgress) {
  if (_scanning || !_viewPriv || !_spendPub) return;
  _scanning = true;

  try {
    // Connect if needed (to get height)
    if (!_connected) await connect();

    onProgress?.('Loading WASM scanner...');
    const wallet = await _ensureWallet(onProgress);

    onProgress?.('Syncing...');
    console.log('[xmr] starting WASM sync...');

    // Sync wallet — this is the fast WASM scan
    await wallet.sync();

    // Get balance
    const balBigInt = await wallet.getBalance();
    const unlockedBigInt = await wallet.getUnlockedBalance();
    _balance = balBigInt.toString();
    const unlocked = unlockedBigInt.toString();

    // Get height
    _height = await wallet.getHeight();

    console.log('[xmr] WASM sync done — balance:', (Number(balBigInt) / 1e12).toFixed(6), 'XMR, unlocked:', (Number(unlockedBigInt) / 1e12).toFixed(6), 'XMR, height:', _height);

    // Persist
    try {
      localStorage.setItem('00_xmr_scan', JSON.stringify({ addr: _addr, height: _height, balance: _balance }));
    } catch {}

    // Get TXs and persist to history
    try {
      const txs = await wallet.getTxs();
      _persistTxHistory(txs);
    } catch (e) { console.warn('[xmr] getTxs error:', e.message); }

    onProgress?.('Done — ' + (Number(balBigInt) / 1e12).toFixed(6) + ' XMR');
  } catch (e) {
    console.warn('[xmr] WASM scan error:', e.message);
    onProgress?.('Scan error: ' + e.message);
  } finally {
    _scanning = false;
  }
}

/* ── Persist TXs to global history ── */
function _persistTxHistory(txs) {
  if (!txs || !txs.length) return;
  try {
    let hist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
    const existing = new Set(hist.filter(h => h.chain === 'xmr').map(h => h.txid));
    for (const tx of txs) {
      const hash = tx.getHash();
      if (existing.has(hash)) continue;
      const isIn = tx.getIsIncoming();
      const amount = isIn ? (tx.getIncomingAmount()?.toString() || '0') : (tx.getOutgoingAmount()?.toString() || '0');
      hist.push({
        txid: hash,
        chain: 'xmr',
        dir: isIn ? 'in' : 'out',
        amount,
        height: tx.getHeight() || 0,
        timestamp: Math.floor((tx.getTimestamp() || Date.now()) / 1000),
      });
    }
    if (hist.length > 500) hist = hist.slice(-500);
    localStorage.setItem('00_tx_history', JSON.stringify(hist));
  } catch {}
}

/* ══════════════════════════════════════════
   SEND XMR — Uses the same WASM wallet
   ══════════════════════════════════════════ */
export async function sendXmr(recipientAddr, amountPiconeros, onStatus) {
  if (!_spendPriv || !_viewPriv || !_addr) throw new Error('XMR keys not initialized');

  const wallet = await _ensureWallet(onStatus);

  // Sync before send to get latest outputs
  onStatus?.('Syncing...');
  await wallet.sync();

  onStatus?.('Building transaction...');
  const tx = await wallet.createTx({
    accountIndex: 0,
    address: recipientAddr,
    amount: amountPiconeros.toString(),
    relay: false,
  });

  onStatus?.('Broadcasting...');
  await wallet.relayTx(tx);

  const txHash = tx.getHash();
  console.log('[xmr] sent:', txHash);

  // Update balance
  _balance = (await wallet.getBalance()).toString();
  try {
    localStorage.setItem('00_xmr_scan', JSON.stringify({ addr: _addr, height: _height, balance: _balance }));
  } catch {}

  // Persist to history
  try {
    let hist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
    hist.push({ txid: txHash, chain: 'xmr', dir: 'out', amount: amountPiconeros.toString(), height: 0, timestamp: Math.floor(Date.now() / 1000) });
    localStorage.setItem('00_tx_history', JSON.stringify(hist));
  } catch {}

  return txHash;
}

/* ── Start periodic scanning ── */
export function startAutoScan(intervalMs = 120000) {
  if (_scanTimer) return;
  // Initial scan after 3s (let UI load first)
  setTimeout(() => scan().catch(e => console.warn('[xmr] initial scan error:', e.message)), 3000);
  // Then periodic (every 2 min — WASM sync is fast after first load)
  _scanTimer = setInterval(() => {
    scan().catch(e => console.warn('[xmr] periodic scan error:', e.message));
  }, intervalMs);
}

export function stopAutoScan() {
  if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
}
