/* ══════════════════════════════════════════
   00 Wallet — Pay View (SPA v2)
   ══════════════════════════════════════════
   BCH Payment Terminal: Invoice, History, Address, Send
   Reuses dt-* CSS classes from desktop.css
   ══════════════════════════════════════════ */

import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, statusDotsHtml, infoBtn, updateBalanceChip, setDotStatus } from '../core/ui-helpers.js';

export const id = 'pay';
export const title = '00 Pay';
export const icon = '↗';

let _container = null;
let _unsubs = [];
let _curMode = 'usd'; // 'usd' | 'bch'
let _bchPrice = 0;
let _watchTimer = null;
let _watchAddr = '';
let _watchExpected = 0;
let _QRLib = null;

/* ── QR code lib ── */
async function _qr(canvasId, text, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !text) return;
  if (!_QRLib) { const m = await import('https://esm.sh/qrcode@1.5.4'); _QRLib = m.default || m; }
  await _QRLib.toCanvas(canvas, text, { width: 220, margin: 1, errorCorrectionLevel: 'M', color: { dark: color || '#0AC18E', light: '#ffffff' } });
}

/* ── Fetch BCH price ── */
async function _fetchPrice() {
  try {
    const prices = state.get('prices') || {};
    if (prices.bch?.price) { _bchPrice = prices.bch.price; _updateOracle(); return; }
    const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=BCHUSD');
    const j = await r.json();
    _bchPrice = parseFloat(j.result?.BCHUSD?.c?.[0]) || 0;
    _updateOracle();
  } catch {}
}
function _updateOracle() {
  const el = document.getElementById('dt-pay-oracle');
  if (el) el.textContent = _bchPrice ? 'BCH $' + _bchPrice.toFixed(2) : 'BCH $—';
}

/* ── Template ── */
function _template() {
  return `
  <div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap">
        <div class="dt-page-icon"><img src="icons/pay.png" style="width:28px;height:28px"></div>
        <div><div class="dt-page-title">Pay</div><div class="dt-page-sub">BCH Payment Terminal</div></div>
      </div>
      <div class="dt-page-actions">${statusDotsHtml(['fulcrum'])}<div class="dt-oracle" id="dt-pay-oracle">BCH $—</div></div>
    </div>

    <div class="dt-tabs" id="dt-pay-tabs">
      <button class="dt-tab active" data-tab="invoice">Invoice</button>
      <button class="dt-tab" data-tab="history"><span>📋</span> History</button>
      <button class="dt-tab" data-tab="address">Address</button>
      <button class="dt-tab" data-tab="send"><span>↑</span> Send</button>
    </div>

    <!-- INVOICE -->
    <div class="dt-pane active" id="dt-pay-p-invoice">
      ${balanceChipHtml(['bch'])}
      <div class="dt-card" id="dt-pay-inv-form">
        <div style="display:flex;align-items:center;gap:8px"><div class="dt-card-title" style="margin:0">Create Invoice</div>${infoBtn('Generate a BIP21 payment request with QR code. The terminal watches for incoming payments in real-time via Fulcrum.')}</div>
        <div class="dt-form-group">
          <div class="dt-form-lbl">Currency</div>
          <div class="dt-toggle-group">
            <button class="dt-toggle-btn active" id="dt-cur-usd" data-cur="usd">$ USD</button>
            <button class="dt-toggle-btn" id="dt-cur-bch" data-cur="bch">₿ BCH</button>
          </div>
        </div>
        <div class="dt-form-group">
          <div class="dt-form-lbl">Amount</div>
          <input class="dt-form-input" id="dt-inv-amount" type="number" step="any" placeholder="0.00">
        </div>
        <div class="dt-amount-hero" id="dt-convert-display">—</div>
        <div class="dt-amount-sub" id="dt-convert-label">Enter amount above</div>
        <div class="dt-form-group">
          <div class="dt-form-lbl">Label (Optional)</div>
          <input class="dt-form-input" id="dt-inv-label" placeholder="e.g. Coffee, Invoice #42...">
        </div>
        <button class="dt-action-btn" id="dt-gen-btn" style="background:var(--dt-accent)">Generate Invoice</button>
      </div>

      <div class="dt-card" id="dt-pay-qr-card" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div class="dt-card-title" style="margin:0">Payment QR</div>
          <button class="dt-action-btn-outline" id="dt-new-inv-btn" style="width:auto;padding:6px 16px;font-size:11px">+ New Invoice</button>
        </div>
        <div class="dt-qr-wrap"><canvas id="dt-pay-qr"></canvas></div>
        <div class="dt-watch-status watching" id="dt-pay-watch">
          <div class="dt-watch-dot"></div>
          <span id="dt-pay-watch-label">Watching for payment...</span>
        </div>
        <div class="dt-addr" id="dt-pay-uri" style="font-size:11px;line-height:1.6"></div>
        <div class="dt-copy-row">
          <button class="dt-copy-btn" id="dt-copy-uri" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">Copy URI</button>
          <button class="dt-copy-btn" id="dt-copy-addr" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">Copy Address</button>
        </div>
      </div>
    </div>

    <!-- HISTORY -->
    <div class="dt-pane" id="dt-pay-p-history">
      <div class="dt-list" id="dt-pay-history-list">
        <div class="dt-empty"><div class="dt-empty-icon">📋</div><div class="dt-empty-text">No payments yet</div></div>
      </div>
    </div>

    <!-- ADDRESS -->
    <div class="dt-pane" id="dt-pay-p-address">
      <div class="dt-card" style="text-align:center">
        <div class="dt-card-title">Your BCH Address</div>
        <div class="dt-qr-wrap"><canvas id="dt-addr-qr"></canvas></div>
        <div class="dt-addr" id="dt-addr-display" style="font-family:'SF Mono',monospace;font-size:11px;font-weight:500;word-break:break-all;line-height:1.6"></div>
        <div class="dt-copy-row" style="justify-content:center">
          <button class="dt-copy-btn" id="dt-copy-myaddr" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">Copy Address</button>
        </div>
        <div style="margin-top:16px;font-size:11px;color:var(--dt-text-secondary);letter-spacing:.5px">BIP44 · m/44'/145'/0'/0/0 · Bitcoin Cash Mainnet</div>
      </div>
    </div>

    <!-- SEND -->
    <div class="dt-pane" id="dt-pay-p-send">
      <div class="dt-card">
        <div class="dt-card-title">Send BCH</div>
        <div class="dt-form-group">
          <div class="dt-form-lbl">Recipient Address</div>
          <input class="dt-form-input" id="dt-send-addr" placeholder="bitcoincash:qp...">
        </div>
        <div class="dt-form-group">
          <div class="dt-form-lbl">Amount (BCH)</div>
          <input class="dt-form-input" id="dt-send-amt" type="number" step="0.00000001" placeholder="0.00000000">
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="font-size:12px;color:var(--dt-text-secondary)" id="dt-send-usd">≈ $0.00</div>
          <button class="dt-action-btn-outline" id="dt-send-max" style="width:auto;padding:5px 14px;font-size:11px">MAX</button>
        </div>
        <div style="font-size:12px;color:#ef4444;min-height:18px" id="dt-send-err"></div>
        <button class="dt-action-btn" id="dt-send-btn" style="background:var(--dt-accent)">⚡ Send →</button>
      </div>
      <div class="dt-card" id="dt-send-result" style="display:none">
        <div class="dt-card-title">Transaction Sent ✓</div>
        <div style="font-size:12px;color:var(--dt-text-secondary);line-height:1.8;word-break:break-all" id="dt-send-txid"></div>
      </div>
    </div>

    <!-- Success overlay -->
    <div id="dt-success-overlay" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.5);align-items:center;justify-content:center">
      <div class="dt-card" style="width:400px;text-align:center;padding:40px">
        <div style="font-size:56px;margin-bottom:16px">💸</div>
        <div style="font-size:18px;font-weight:700;color:var(--dt-accent);margin-bottom:12px">Payment Received</div>
        <div style="font-size:28px;font-weight:800;color:var(--dt-text);margin-bottom:8px" id="dt-succ-amount"></div>
        <div style="font-size:14px;color:var(--dt-text-secondary);margin-bottom:24px" id="dt-succ-usd"></div>
        <button class="dt-action-btn" id="dt-succ-close" style="background:var(--dt-accent)">Close</button>
      </div>
    </div>
  </div>`;
}

/* ── Bind events ── */
function _bind() {
  const keys = auth.getKeys();
  if (!keys) return;

  // Tab switching
  document.querySelectorAll('#dt-pay-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-pay-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById('dt-pay-p-' + btn.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });

  // Currency toggle
  document.querySelectorAll('.dt-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dt-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _curMode = btn.dataset.cur;
      _convert();
    });
  });

  // Amount conversion on input
  document.getElementById('dt-inv-amount')?.addEventListener('input', _convert);

  // Generate invoice
  document.getElementById('dt-gen-btn')?.addEventListener('click', _generateInvoice);
  document.getElementById('dt-new-inv-btn')?.addEventListener('click', _newInvoice);

  // Copy buttons
  document.getElementById('dt-copy-uri')?.addEventListener('click', () => _copy('dt-pay-uri', 'dt-copy-uri'));
  document.getElementById('dt-copy-addr')?.addEventListener('click', () => _copy('dt-addr-display', 'dt-copy-addr'));
  document.getElementById('dt-copy-myaddr')?.addEventListener('click', () => _copy('dt-addr-display', 'dt-copy-myaddr'));

  // Address tab — show QR
  const addrEl = document.getElementById('dt-addr-display');
  if (addrEl && keys.bchAddr) {
    addrEl.textContent = keys.bchAddr;
    _qr('dt-addr-qr', keys.bchAddr, '#0AC18E');
  }

  // Send tab
  document.getElementById('dt-send-amt')?.addEventListener('input', _updateSendUsd);
  document.getElementById('dt-send-max')?.addEventListener('click', _sendMax);
  document.getElementById('dt-send-btn')?.addEventListener('click', _sendExec);

  // Success close
  document.getElementById('dt-succ-close')?.addEventListener('click', () => {
    document.getElementById('dt-success-overlay').style.display = 'none';
    _newInvoice();
  });

  // Load history
  _renderHistory();
}

/* ── Amount conversion ── */
function _convert() {
  const amt = parseFloat(document.getElementById('dt-inv-amount')?.value) || 0;
  const display = document.getElementById('dt-convert-display');
  const label = document.getElementById('dt-convert-label');
  if (!display || !label) return;
  if (!amt || !_bchPrice) { display.textContent = '—'; label.textContent = 'Enter amount above'; return; }
  if (_curMode === 'usd') {
    const bch = amt / _bchPrice;
    display.textContent = bch.toFixed(8) + ' BCH';
    label.textContent = '≈ $' + amt.toFixed(2) + ' USD at $' + _bchPrice.toFixed(2) + '/BCH';
  } else {
    const usd = amt * _bchPrice;
    display.textContent = '$' + usd.toFixed(2) + ' USD';
    label.textContent = amt.toFixed(8) + ' BCH at $' + _bchPrice.toFixed(2) + '/BCH';
  }
}

/* ── Generate invoice ── */
async function _generateInvoice() {
  const keys = auth.getKeys();
  if (!keys?.bchAddr) return;
  const amt = parseFloat(document.getElementById('dt-inv-amount')?.value) || 0;
  const label = document.getElementById('dt-inv-label')?.value || '';
  if (!amt) return;

  let bchAmt;
  if (_curMode === 'usd' && _bchPrice) bchAmt = (amt / _bchPrice).toFixed(8);
  else bchAmt = amt.toFixed(8);

  const uri = `bitcoincash:${keys.bchAddr.replace('bitcoincash:', '')}?amount=${bchAmt}${label ? '&label=' + encodeURIComponent(label) : ''}`;

  // Show QR card, hide form
  document.getElementById('dt-pay-inv-form').style.display = 'none';
  document.getElementById('dt-pay-qr-card').style.display = '';
  document.getElementById('dt-pay-uri').textContent = uri;

  await _qr('dt-pay-qr', uri, '#0AC18E');

  // Start watching for payment
  _watchAddr = keys.bchAddr;
  _watchExpected = Math.round(parseFloat(bchAmt) * 1e8);
  _startWatching();
}

/* ── Watch for incoming payment ── */
async function _startWatching() {
  if (_watchTimer) clearInterval(_watchTimer);
  if (!window._fvCall || !_watchAddr) return;

  const { cashAddrToHash20 } = await import('../core/cashaddr.js');
  const { sha256 } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
  const h = cashAddrToHash20(_watchAddr);
  const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
  const sh = Array.from(sha256(script)).reverse().map(b => b.toString(16).padStart(2, '0')).join('');

  // Get initial UTXOs
  let initialUtxos = [];
  try { initialUtxos = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || []; } catch {}
  const initialIds = new Set(initialUtxos.map(u => u.tx_hash + ':' + u.tx_pos));

  // Poll every 5s
  _watchTimer = setInterval(async () => {
    try {
      const utxos = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
      for (const u of utxos) {
        const id = u.tx_hash + ':' + u.tx_pos;
        if (!initialIds.has(id)) {
          // New UTXO detected — check if it matches expected amount (±1000 sats tolerance)
          if (Math.abs(u.value - _watchExpected) < 1000 || _watchExpected === 0) {
            clearInterval(_watchTimer);
            _watchTimer = null;
            _onPaymentReceived(u.value);
            return;
          }
        }
      }
    } catch {}
  }, 5000);
}

function _onPaymentReceived(satoshis) {
  const bch = (satoshis / 1e8).toFixed(8);
  const usd = _bchPrice ? (satoshis / 1e8 * _bchPrice).toFixed(2) : '0';

  // Update watch status
  const watch = document.getElementById('dt-pay-watch');
  if (watch) { watch.className = 'dt-watch-status confirmed'; }
  const watchLabel = document.getElementById('dt-pay-watch-label');
  if (watchLabel) watchLabel.textContent = '✓ Payment received!';

  // Show success overlay
  const overlay = document.getElementById('dt-success-overlay');
  if (overlay) { overlay.style.display = 'flex'; }
  const amtEl = document.getElementById('dt-succ-amount');
  if (amtEl) amtEl.textContent = bch + ' BCH';
  const usdEl = document.getElementById('dt-succ-usd');
  if (usdEl) usdEl.textContent = '≈ $' + usd + ' USD';

  // Save to history
  try {
    const hist = JSON.parse(localStorage.getItem('00pay_history') || '[]');
    hist.unshift({ bch, usd, date: new Date().toISOString(), status: 'received', label: document.getElementById('dt-inv-label')?.value || '' });
    localStorage.setItem('00pay_history', JSON.stringify(hist.slice(0, 100)));
    _renderHistory();
  } catch {}

  // Refresh balance
  setTimeout(async () => {
    try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
  }, 2000);
}

/* ── New invoice (reset) ── */
function _newInvoice() {
  if (_watchTimer) { clearInterval(_watchTimer); _watchTimer = null; }
  document.getElementById('dt-pay-inv-form').style.display = '';
  document.getElementById('dt-pay-qr-card').style.display = 'none';
  const amtEl = document.getElementById('dt-inv-amount');
  if (amtEl) amtEl.value = '';
  const lblEl = document.getElementById('dt-inv-label');
  if (lblEl) lblEl.value = '';
  const display = document.getElementById('dt-convert-display');
  if (display) display.textContent = '—';
  const label = document.getElementById('dt-convert-label');
  if (label) label.textContent = 'Enter amount above';
  const watch = document.getElementById('dt-pay-watch');
  if (watch) watch.className = 'dt-watch-status watching';
  const watchLabel = document.getElementById('dt-pay-watch-label');
  if (watchLabel) watchLabel.textContent = 'Watching for payment...';
}

/* ── Copy helper ── */
async function _copy(srcId, btnId) {
  const text = document.getElementById(srcId)?.textContent;
  if (text) {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById(btnId);
    if (btn) { const orig = btn.textContent; btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = orig, 1500); }
  }
}

/* ── History rendering ── */
function _renderHistory() {
  const el = document.getElementById('dt-pay-history-list');
  if (!el) return;
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem('00pay_history') || '[]'); } catch {}
  if (!hist.length) { el.innerHTML = '<div class="dt-empty"><div class="dt-empty-icon">📋</div><div class="dt-empty-text">No payments yet</div></div>'; return; }

  el.innerHTML = hist.map(h => {
    const d = new Date(h.date);
    const time = d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `<div class="dt-row">
      <div class="dt-row-left">
        <div class="dt-row-icon in"><span>↓</span></div>
        <div><div class="dt-row-title">${h.label || 'Payment'}</div><div class="dt-row-sub">${time}</div></div>
      </div>
      <div class="dt-row-right">
        <div class="dt-row-amount">${h.bch} BCH</div>
        <div class="dt-row-fiat">≈ $${h.usd}</div>
      </div>
    </div>`;
  }).join('');
}

/* ── Send: USD display ── */
function _updateSendUsd() {
  const amt = parseFloat(document.getElementById('dt-send-amt')?.value) || 0;
  const el = document.getElementById('dt-send-usd');
  if (el) el.textContent = _bchPrice && amt ? '≈ $' + (amt * _bchPrice).toFixed(2) : '≈ $0.00';
}

/* ── Send: MAX ── */
async function _sendMax() {
  const balances = state.get('balances') || {};
  const bal = balances.bch || 0;
  const fee = Math.ceil((10 + 148 + 34) * 1);
  const max = Math.max(0, bal - fee);
  const el = document.getElementById('dt-send-amt');
  if (el) el.value = (max / 1e8).toFixed(8);
  _updateSendUsd();
}

/* ── Send: Execute ── */
async function _sendExec() {
  const errEl = document.getElementById('dt-send-err');
  const btn = document.getElementById('dt-send-btn');
  if (errEl) errEl.textContent = '';

  const addr = document.getElementById('dt-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('dt-send-amt')?.value) || 0;
  if (!addr) { if (errEl) errEl.textContent = 'Address required'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter amount'; return; }

  const keys = auth.getKeys();
  if (!keys) return;

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending...'; }

  try {
    const { sendBch } = await import('../core/send-bch.js');
    const { secp256k1 } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
    const { sha256 } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    const { ripemd160 } = await import('https://esm.sh/@noble/hashes@1.7.1/ripemd160');

    // Get UTXOs
    const { cashAddrToHash20 } = await import('../core/cashaddr.js');
    const h = cashAddrToHash20(keys.bchAddr);
    const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
    const hash = sha256(script);
    const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
    const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
    const utxos = raw.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value }));

    const changeHash = ripemd160(sha256(secp256k1.getPublicKey(keys.privKey, true)));

    const result = await sendBch({
      toAddress: addr,
      amountSats: Math.round(amt * 1e8),
      feeRate: 1,
      utxos,
      privKey: keys.privKey,
      pubKey: secp256k1.getPublicKey(keys.privKey, true),
      changeHash160: changeHash,
    });

    if (btn) btn.textContent = '✓ Sent';
    document.getElementById('dt-send-result').style.display = '';
    document.getElementById('dt-send-txid').textContent = result.txid;

    setTimeout(async () => {
      try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
    }, 2000);

  } catch (e) {
    if (errEl) errEl.textContent = 'Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '⚡ Send →'; }
  }
}

/* ══════════════════════════════════════════
   LIFECYCLE
   ══════════════════════════════════════════ */
export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }

  container.innerHTML = _template();
  _fetchPrice();
  _bind();

  // Update price when state changes
  _unsubs.push(state.subscribe('prices', () => {
    const prices = state.get('prices') || {};
    if (prices.bch?.price) { _bchPrice = prices.bch.price; _updateOracle(); }
  }));
}

export function unmount() {
  if (_watchTimer) { clearInterval(_watchTimer); _watchTimer = null; }
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  if (_container) _container.innerHTML = '';
  _container = null;
}
