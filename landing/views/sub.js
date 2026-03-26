/* 00 Wallet — Subscriptions View (SPA v2) */
import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, statusDotsHtml, infoBtn, updateBalanceChip, setDotStatus } from '../core/ui-helpers.js';

export const id = 'sub';
export const title = '00 Subscriptions';
export const icon = '↻';

let _container = null, _unsubs = [], _bchPrice = 0, _subMode = 'bch';

function _template() {
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon">↻</div><div><div class="dt-page-title">Subscriptions</div><div class="dt-page-sub">BCH Recurring Payments · Trustless</div></div></div>
      <div class="dt-page-actions"><div class="dt-oracle" id="dt-sub-oracle">BCH $—</div></div>
    </div>
    <div class="dt-tabs" id="dt-sub-tabs">
      <button class="dt-tab active" data-tab="create"><span>+</span> Create</button>
      <button class="dt-tab" data-tab="active">Active</button>
      <button class="dt-tab" data-tab="receive"><span>↓</span> Receive</button>
      <button class="dt-tab" data-tab="history">History</button>
    </div>
    <div class="dt-pane" id="dt-sub-p-active">
      <div id="dt-sub-active-list"><div class="dt-empty"><div class="dt-empty-icon">↻</div><div class="dt-empty-text">No active subscriptions</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Create one or scan for incoming</div></div></div>
    </div>
    <div class="dt-pane active" id="dt-sub-p-create">
      <div class="dt-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><div class="dt-card-title" style="margin:0">NEW SUBSCRIPTION</div>${infoBtn('<b>Fixed BCH</b> — Your wallet pre-signs a chain of time-locked transactions. Each payment unlocks on schedule. The receiver broadcasts them — your wallet can be closed. Cancel anytime by spending the change output.<br><br><b>Fixed USD</b> — Your wallet listens for Nostr invoices from the merchant, converts USD to BCH at current price, and auto-pays. Wallet must be open.')}</div>
        <div class="dt-form-group"><div class="dt-form-lbl">MODE</div>
          <div class="dt-toggle-group"><button class="dt-toggle-btn active" id="sub-mode-bch" data-mode="bch">Fixed BCH</button><button class="dt-toggle-btn" id="sub-mode-usd" data-mode="usd">Fixed USD</button></div>
        </div>
        <div class="dt-form-group" id="dt-sub-amt-group"><div class="dt-form-lbl" id="dt-sub-amt-lbl">AMOUNT (SATS)</div><input class="dt-form-input" id="dt-sub-sats" type="number" value="1000" min="1" placeholder="1000"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">EVERY (DAYS)</div><input class="dt-form-input" id="dt-sub-days" type="number" value="30" min="1" placeholder="30"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">NUMBER OF PERIODS</div><input class="dt-form-input" id="dt-sub-periods" type="number" value="12" min="1" max="52" placeholder="12"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">RECIPIENT ADDRESS</div><input class="dt-form-input" id="dt-sub-addr" placeholder="bitcoincash:qp..."></div>
        <div class="dt-form-group"><div class="dt-form-lbl">RECIPIENT NOSTR PUBKEY (FOR NOTIFICATIONS)</div><input class="dt-form-input" id="dt-sub-nostr" placeholder="hex pubkey (optional for BCH mode)"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">LABEL</div><input class="dt-form-input" id="dt-sub-label" placeholder="e.g. VPN monthly, Server hosting..."></div>
        <div style="background:var(--dt-bg,#f5f6f8);border-radius:10px;padding:14px 18px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--dt-text-secondary)"><span>Per period</span><span id="dt-sub-per" style="color:var(--dt-text);font-weight:600">—</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--dt-text-secondary)"><span>Est. fees (total)</span><span id="dt-sub-fees" style="color:var(--dt-text);font-weight:600">—</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-top:1px solid var(--dt-border);margin-top:4px"><span style="font-weight:700;color:var(--dt-text)">Total locked</span><span id="dt-sub-total" style="color:var(--dt-accent);font-weight:700">—</span></div>
        </div>
        <button class="dt-action-btn" style="background:var(--dt-accent)" id="dt-sub-create-btn">Create Subscription</button>
      </div>
      <div class="dt-card" style="margin-top:20px">
        <div class="dt-card-title">HOW IT WORKS</div>
        <div style="font-size:13px;color:var(--dt-text-secondary);line-height:1.8">
          <p style="margin:0 0 12px"><b style="color:var(--dt-text)">Fixed BCH</b> — Your wallet pre-signs a chain of time-locked transactions. Each payment unlocks on schedule. The receiver broadcasts them — your wallet can be closed. Cancel anytime by spending the change output.</p>
          <p style="margin:0"><b style="color:var(--dt-text)">Fixed USD</b> — Your wallet listens for Nostr invoices from the merchant, converts USD to BCH at current price, and auto-pays. Wallet must be open.</p>
        </div>
      </div>
    </div>
    <div class="dt-pane" id="dt-sub-p-receive">
      <div class="dt-card" style="text-align:center;padding:32px">
        <div style="font-size:36px;margin-bottom:12px">↓</div>
        <div style="font-size:14px;font-weight:600;color:var(--dt-text);margin-bottom:8px">Receive Subscriptions</div>
        <div style="font-size:13px;color:var(--dt-text-secondary);line-height:1.6;margin-bottom:20px">Share your address or Nostr pubkey to receive recurring BCH payments from subscribers.</div>
        <div class="dt-addr" id="dt-sub-myaddr" style="font-size:11px;word-break:break-all;margin-bottom:12px">—</div>
        <button class="dt-copy-btn" id="dt-sub-copy" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">Copy Address</button>
      </div>
    </div>
    <div class="dt-pane" id="dt-sub-p-history">
      <div id="dt-sub-history-list"><div class="dt-empty"><div class="dt-empty-icon">📋</div><div class="dt-empty-text">No subscription history</div></div></div>
    </div>
  </div>`;
}

function _bind() {
  const keys = auth.getKeys();
  // Tabs
  document.querySelectorAll('#dt-sub-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-sub-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('dt-sub-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });
  // Mode toggle — switch amount label + placeholder
  _subMode = 'bch';
  document.querySelectorAll('.dt-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dt-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _subMode = btn.dataset.mode;
      const lbl = document.getElementById('dt-sub-amt-lbl');
      const inp = document.getElementById('dt-sub-sats');
      if (_subMode === 'usd') {
        if (lbl) lbl.textContent = 'AMOUNT (USD)';
        if (inp) { inp.placeholder = '5.00'; inp.step = '0.01'; inp.value = '5'; inp.min = '0.01'; }
      } else {
        if (lbl) lbl.textContent = 'AMOUNT (SATS)';
        if (inp) { inp.placeholder = '1000'; inp.step = '1'; inp.value = '1000'; inp.min = '1'; }
      }
      calcSummary();
    });
  });
  // Receive address
  const addrEl = document.getElementById('dt-sub-myaddr');
  if (addrEl && keys?.bchAddr) addrEl.textContent = keys.bchAddr;
  document.getElementById('dt-sub-copy')?.addEventListener('click', async () => {
    if (keys?.bchAddr) { await navigator.clipboard.writeText(keys.bchAddr); const b = document.getElementById('dt-sub-copy'); if (b) { b.textContent = '✓ Copied!'; setTimeout(() => b.textContent = 'Copy Address', 1500); } }
  });
  // Summary calculation
  const calcSummary = () => {
    const rawAmt = parseFloat(document.getElementById('dt-sub-sats')?.value) || 0;
    const periods = parseInt(document.getElementById('dt-sub-periods')?.value) || 0;
    const feePerTx = 192; // ~192 bytes * 1 sat/byte
    const perEl = document.getElementById('dt-sub-per');
    const feesEl = document.getElementById('dt-sub-fees');
    const totalEl = document.getElementById('dt-sub-total');

    let sats, usdPer;
    if (_subMode === 'usd') {
      // USD mode: rawAmt is USD
      usdPer = rawAmt;
      sats = _bchPrice > 0 ? Math.round((rawAmt / _bchPrice) * 1e8) : 0;
    } else {
      // BCH mode: rawAmt is sats
      sats = Math.round(rawAmt);
      usdPer = _bchPrice > 0 ? (sats / 1e8) * _bchPrice : 0;
    }

    const bchPer = (sats / 1e8).toFixed(8);
    const usdStr = usdPer > 0 ? ' ≈ $' + usdPer.toFixed(2) : '';
    const feeSats = feePerTx * periods;
    const feeUsd = _bchPrice > 0 ? (feeSats / 1e8) * _bchPrice : 0;
    const totalSats = (sats * periods) + feeSats;
    const totalUsd = _bchPrice > 0 ? (totalSats / 1e8) * _bchPrice : 0;

    if (perEl) perEl.textContent = sats > 0 ? bchPer + ' BCH' + usdStr : '—';
    if (feesEl) feesEl.textContent = periods > 0 ? (feeSats / 1e8).toFixed(8) + ' BCH' + (feeUsd > 0.01 ? ' ≈ $' + feeUsd.toFixed(2) : '') : '—';
    if (totalEl) totalEl.textContent = totalSats > 0 ? (totalSats / 1e8).toFixed(8) + ' BCH' + (totalUsd > 0.01 ? ' ≈ $' + totalUsd.toFixed(2) : '') : '—';
  };
  document.getElementById('dt-sub-sats')?.addEventListener('input', calcSummary);
  document.getElementById('dt-sub-days')?.addEventListener('input', calcSummary);
  document.getElementById('dt-sub-periods')?.addEventListener('input', calcSummary);
  calcSummary();

  // Load active subs + history
  _renderActive();
  _renderHistory();
}

function _renderActive() {
  const el = document.getElementById('dt-sub-active-list');
  if (!el) return;
  let subs = [];
  try { subs = JSON.parse(localStorage.getItem('00_subscriptions') || '[]').filter(s => s.status === 'active'); } catch {}
  if (!subs.length) return;
  el.innerHTML = subs.map(s => `<div class="dt-row"><div class="dt-row-left"><div class="dt-row-icon out"><span>↻</span></div><div><div class="dt-row-title">${s.label || 'Subscription'}</div><div class="dt-row-sub">${s.interval === 86400 ? 'Daily' : s.interval === 604800 ? 'Weekly' : 'Monthly'} · ${s.periods} periods</div></div></div><div class="dt-row-right"><div class="dt-row-amount">${s.amount} BCH</div></div></div>`).join('');
}

function _renderHistory() {
  const el = document.getElementById('dt-sub-history-list');
  if (!el) return;
  let subs = [];
  try { subs = JSON.parse(localStorage.getItem('00_subscriptions') || '[]').filter(s => s.status !== 'active'); } catch {}
  if (!subs.length) return;
  el.innerHTML = subs.map(s => `<div class="dt-row"><div class="dt-row-left"><div class="dt-row-icon"><span>↻</span></div><div><div class="dt-row-title">${s.label || 'Subscription'}</div><div class="dt-row-sub">${s.status}</div></div></div><div class="dt-row-right"><div class="dt-row-amount">${s.amount} BCH</div></div></div>`).join('');
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();
  _bind();
  const prices = state.get('prices') || {};
  _bchPrice = prices.bch?.price || 0;
  const el = document.getElementById('dt-sub-oracle');
  if (el && _bchPrice) el.textContent = 'BCH $' + _bchPrice.toFixed(2);
  _unsubs.push(state.subscribe('prices', p => { _bchPrice = p?.bch?.price || 0; if (el) el.textContent = 'BCH $' + _bchPrice.toFixed(2); }));
}

export function unmount() { _unsubs.forEach(fn => fn()); _unsubs = []; if (_container) _container.innerHTML = ''; _container = null; }
