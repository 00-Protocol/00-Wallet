/* 00 Wallet — DEX View (SPA v2) — Cauldron DEX */
import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, infoBtn, updateBalanceChip } from '../core/ui-helpers.js';

export const id = 'dex';
export const title = '00 DEX';
export const icon = '◈';

let _container = null, _unsubs = [], _tokens = [], _bchPrice = 0, _selToken = null, _sortKey = 'tvl_sats';
const INDEXER = localStorage.getItem('00_ep_indexer') || 'https://0penw0rld.com';
const CAULDRON = 'https://app.cauldron.quest';
const META = localStorage.getItem('00_ep_meta') || 'https://meta.riften.net';

function fmtUsd(v) { if (v == null || isNaN(v)) return '—'; if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'; if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'; if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'K'; if (v < 0.001 && v > 0) return '$' + v.toExponential(2); return '$' + v.toFixed(v < 1 ? 4 : 2); }
function fmtBp(bp) { return bp ? (bp / 100).toFixed(2) + '%' : '0.00%'; }
function tSym(t) { const s = t.bcmr?.token?.symbol || t.display_symbol || ''; return s.length > 10 ? s.slice(0, 10) + '…' : (s || (t.token_id ? t.token_id.slice(0, 6) + '…' : '???')); }
function tName(t) { const n = t.bcmr?.name || t.display_name || ''; return n.length > 20 ? n.slice(0, 20) + '…' : (n || (t.token_id ? t.token_id.slice(0, 8) + '…' : 'Unknown')); }
function tIcon(t) { return META + '/icon/' + t.token_id; }

function _template() {
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon">◈</div><div><div class="dt-page-title">DEX</div><div class="dt-page-sub">Cauldron Decentralized Exchange</div></div></div>
      <div class="dt-page-actions"><div class="dt-oracle" id="dt-dex-price">BCH $—</div><div class="dt-oracle" id="dt-dex-tvl">TVL —</div></div>
    </div>
    <div class="dt-tabs" id="dt-dex-tabs">
      <button class="dt-tab active" data-tab="swap"><span>⇄</span> Swap</button>
      <button class="dt-tab" data-tab="tokens">Tokens</button>
      <button class="dt-tab" data-tab="pools">Pools</button>
    </div>
    <div class="dt-pane active" id="dt-dex-p-swap">
      ${balanceChipHtml(['bch'])}
      <div class="dt-card">
        <div class="dt-swap-box"><div class="dt-swap-box-label">You Pay</div><div class="dt-swap-amount-row"><input class="dt-swap-amount-input" id="dt-swap-from" type="number" placeholder="0"><div class="dt-token-badge"><span style="font-size:16px">₿</span><span class="dt-token-badge-name">BCH</span></div></div><div class="dt-swap-usd" id="dt-swap-from-usd">≈ $0.00 USD</div></div>
        <div class="dt-swap-arrow"><div class="dt-swap-arrow-btn" id="dt-dex-flip">⇅</div></div>
        <div class="dt-swap-box"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px"><div class="dt-swap-box-label" style="margin:0">You Receive</div><button class="dt-token-badge" id="dt-dex-to-badge"><span class="dt-token-badge-name" id="dt-dex-to-name">Select ▾</span></button></div><div style="font-family:Inter,sans-serif;font-size:24px;font-weight:700;color:var(--dt-text)" id="dt-swap-to">0</div><div class="dt-swap-usd" id="dt-swap-to-usd">Select a token</div></div>
        <div class="dt-swap-rate" id="dt-swap-rate">Select a token to see quote</div>
        <button class="dt-action-btn" id="dt-dex-swap-btn" style="margin-top:16px;background:var(--dt-accent)">Swap on Cauldron →</button>
        <div style="text-align:center;font-size:11px;color:var(--dt-text-secondary);margin-top:8px">Powered by Cauldron DEX · 0.3% LP fee</div>
      </div>
    </div>
    <div class="dt-pane" id="dt-dex-p-tokens"><div class="dt-list"><div class="dt-table-head"><div style="flex:1">Token</div><div style="width:100px;text-align:right;cursor:pointer" id="dt-sort-price">Price</div><div style="width:80px;text-align:right;cursor:pointer" id="dt-sort-change">24h</div><div style="width:80px;text-align:right;cursor:pointer" id="dt-sort-tvl">TVL</div></div><div id="dt-tokens-list"><div class="dt-empty"><div class="dt-empty-text">Loading tokens...</div></div></div></div></div>
    <div class="dt-pane" id="dt-dex-p-pools">
      <div style="display:flex;gap:12px;margin-bottom:20px">
        <div class="dt-card" style="flex:1;text-align:center;margin:0"><div class="dt-form-lbl" style="margin-bottom:4px">Total TVL</div><div style="font-size:20px;font-weight:700;color:var(--dt-text)" id="dt-pools-tvl">—</div></div>
        <div class="dt-card" style="flex:1;text-align:center;margin:0"><div class="dt-form-lbl" style="margin-bottom:4px">Tokens</div><div style="font-size:20px;font-weight:700;color:var(--dt-text)" id="dt-pools-count">—</div></div>
      </div>
      <div class="dt-list" id="dt-pools-list"><div class="dt-empty"><div class="dt-empty-text">Loading pools...</div></div></div>
      <a class="dt-action-btn-outline" href="${CAULDRON}/pools" target="_blank" style="display:block;text-align:center;text-decoration:none;margin-top:20px">Open Cauldron Pools →</a>
    </div>
    <!-- Token selector modal -->
    <div id="dt-dex-modal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.4);align-items:center;justify-content:center">
      <div class="dt-card" style="width:440px;max-height:520px;display:flex;flex-direction:column;padding:0;overflow:hidden">
        <div style="display:flex;align-items:center;gap:12px;padding:20px 24px 12px;border-bottom:1px solid var(--dt-border)">
          <button id="dt-dex-modal-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--dt-text-secondary);padding:0">←</button>
          <span style="font-size:13px;font-weight:600;color:var(--dt-text)">Select Token</span>
        </div>
        <div style="padding:12px 24px"><input class="dt-form-input" id="dt-dex-modal-search" placeholder="Search name or symbol..."></div>
        <div style="flex:1;overflow-y:auto" id="dt-dex-modal-list"></div>
      </div>
    </div>
  </div>`;
}

function _quote() {
  const fromAmt = parseFloat(document.getElementById('dt-swap-from')?.value) || 0;
  document.getElementById('dt-swap-from-usd').textContent = '≈ ' + fmtUsd(fromAmt * _bchPrice) + ' USD';
  if (!_selToken || !fromAmt) {
    document.getElementById('dt-swap-to').textContent = '0';
    document.getElementById('dt-swap-to-usd').textContent = _selToken ? 'Enter amount' : 'Select a token';
    document.getElementById('dt-swap-rate').textContent = 'Select a token to see quote';
    return;
  }
  const priceNow = _selToken.price_now / 1e12;
  const priceUsd = _selToken.price_now_usd;
  const toAmt = priceNow > 0 ? fromAmt / priceNow : 0;
  const fee = fromAmt * 0.003;
  const toFinal = toAmt * (1 - 0.003);
  const toUsd = toFinal * priceUsd;
  const sym = tSym(_selToken);
  document.getElementById('dt-swap-to').textContent = toFinal > 1e6 ? toFinal.toExponential(4) : toFinal.toFixed(4);
  document.getElementById('dt-swap-to-usd').textContent = '≈ ' + fmtUsd(toUsd);
  const rate = priceNow > 0 ? (1 / priceNow) : 0;
  document.getElementById('dt-swap-rate').innerHTML =
    '<div>Rate: <span>1 BCH ≈ ' + (rate >= 1 ? rate.toFixed(4) : rate.toExponential(4)) + ' ' + sym + '</span></div>' +
    '<div>LP Fee: <span>0.3% (' + fee.toFixed(4) + ' BCH)</span></div>' +
    '<div>Source: <span>Cauldron AMM</span></div>';
}

function _renderTokens() {
  const sorted = _tokens.slice().sort((a, b) => (b[_sortKey] || 0) - (a[_sortKey] || 0));
  const el = document.getElementById('dt-tokens-list');
  if (!el) return;
  el.innerHTML = sorted.slice(0, 50).map(t => {
    const sym = tSym(t), ch24 = t.change_24h_bp || 0;
    const tvlBch = (t.tvl_sats || 0) / 1e8, tvlUsd = tvlBch * _bchPrice;
    return `<div class="dt-row" style="cursor:pointer" data-tid="${t.token_id}">
      <div class="dt-row-left" style="flex:1"><div class="dt-row-icon swap"><img src="${tIcon(t)}" style="width:24px;height:24px;border-radius:50%" onerror="this.style.display='none'"></div><div><div class="dt-row-title">${sym}</div><div class="dt-row-sub">${tName(t)}</div></div></div>
      <div style="width:100px;text-align:right;font-size:13px;font-weight:600;color:var(--dt-text)">${fmtUsd(t.price_now_usd)}</div>
      <div style="width:80px;text-align:right;font-size:12px;font-weight:600;color:${ch24 >= 0 ? 'var(--dt-accent)' : 'var(--dt-danger)'}">${ch24 >= 0 ? '+' : ''}${fmtBp(Math.abs(ch24))}</div>
      <div style="width:80px;text-align:right;font-size:12px;color:var(--dt-text-secondary)">${fmtUsd(tvlUsd)}</div>
    </div>`;
  }).join('');
  // Click token → select and go to swap
  el.querySelectorAll('.dt-row').forEach(row => {
    row.addEventListener('click', () => {
      const tid = row.dataset.tid;
      _selToken = _tokens.find(t => t.token_id === tid);
      if (_selToken) {
        document.getElementById('dt-dex-to-name').textContent = tSym(_selToken) + ' ▾';
        // Switch to swap tab
        document.querySelectorAll('#dt-dex-tabs .dt-tab').forEach(b => b.classList.remove('active'));
        document.querySelector('#dt-dex-tabs .dt-tab[data-tab="swap"]')?.classList.add('active');
        document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
        document.getElementById('dt-dex-p-swap')?.classList.add('active');
        _quote();
      }
    });
  });
}

function _renderPools() {
  const sorted = _tokens.slice().sort((a, b) => (b.tvl_sats || 0) - (a.tvl_sats || 0)).slice(0, 15);
  const el = document.getElementById('dt-pools-list');
  if (!el) return;
  let totalTvl = 0;
  _tokens.forEach(t => totalTvl += ((t.tvl_sats || 0) / 1e8) * _bchPrice);
  const tvlEl = document.getElementById('dt-pools-tvl');
  if (tvlEl) tvlEl.textContent = fmtUsd(totalTvl);
  const cntEl = document.getElementById('dt-pools-count');
  if (cntEl) cntEl.textContent = _tokens.length.toString();

  el.innerHTML = sorted.map(t => {
    const sym = tSym(t), tvlBch = (t.tvl_sats || 0) / 1e8, tvlUsd = tvlBch * _bchPrice;
    const apy = t.apy_30d_bp ? fmtBp(t.apy_30d_bp) : '—';
    return `<div class="dt-row" style="cursor:pointer" onclick="window.open('${CAULDRON}','_blank')">
      <div class="dt-row-left"><div class="dt-row-icon swap"><img src="${tIcon(t)}" style="width:24px;height:24px;border-radius:50%" onerror="this.style.display='none'"></div><div><div class="dt-row-title">BCH / ${sym}</div><div class="dt-row-sub">TVL ${fmtUsd(tvlUsd)}</div></div></div>
      <div class="dt-row-right"><div class="dt-row-amount" style="color:var(--dt-accent)">${apy} APY</div></div>
    </div>`;
  }).join('');
}

function _renderModalTokens(list) {
  const el = document.getElementById('dt-dex-modal-list');
  if (!el) return;
  el.innerHTML = list.slice(0, 60).map(t => {
    const sym = tSym(t);
    return `<div class="dt-row" style="cursor:pointer" data-mtid="${t.token_id}">
      <div class="dt-row-left"><div class="dt-row-icon swap"><img src="${tIcon(t)}" style="width:24px;height:24px;border-radius:50%" onerror="this.style.display='none'"></div><div><div class="dt-row-title">${sym}</div><div class="dt-row-sub">${tName(t)}</div></div></div>
      <div class="dt-row-right"><div class="dt-row-amount">${fmtUsd(t.price_now_usd)}</div></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.dt-row').forEach(row => {
    row.addEventListener('click', () => {
      _selToken = _tokens.find(t => t.token_id === row.dataset.mtid);
      if (_selToken) {
        document.getElementById('dt-dex-to-name').textContent = tSym(_selToken) + ' ▾';
        document.getElementById('dt-dex-modal').style.display = 'none';
        _quote();
      }
    });
  });
}

async function _loadTokens() {
  try {
    const r = await fetch(INDEXER + '/cauldron/tokens/list_cached');
    const data = await r.json();
    _tokens = data || [];
    _renderTokens();
    _renderPools();
  } catch (e) { console.warn('[dex] token load failed:', e); }
}

function _bind() {
  // Tabs
  document.querySelectorAll('#dt-dex-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-dex-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('dt-dex-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });
  // Swap input
  document.getElementById('dt-swap-from')?.addEventListener('input', _quote);
  // Flip
  document.getElementById('dt-dex-flip')?.addEventListener('click', () => {
    document.getElementById('dt-swap-from').value = '';
    document.getElementById('dt-swap-to').textContent = '0';
    _quote();
  });
  // Swap button → open Cauldron
  document.getElementById('dt-dex-swap-btn')?.addEventListener('click', () => {
    if (!_selToken) { alert('Select a token first'); return; }
    window.open(CAULDRON + '/?swap=' + _selToken.token_id, '_blank');
  });
  // Token modal
  document.getElementById('dt-dex-to-badge')?.addEventListener('click', () => {
    _renderModalTokens(_tokens);
    document.getElementById('dt-dex-modal').style.display = 'flex';
    document.getElementById('dt-dex-modal-search').value = '';
  });
  document.getElementById('dt-dex-modal-close')?.addEventListener('click', () => {
    document.getElementById('dt-dex-modal').style.display = 'none';
  });
  document.getElementById('dt-dex-modal-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = q ? _tokens.filter(t => tSym(t).toLowerCase().includes(q) || tName(t).toLowerCase().includes(q)) : _tokens;
    _renderModalTokens(filtered);
  });
  // Sort headers
  document.getElementById('dt-sort-price')?.addEventListener('click', () => { _sortKey = 'price_now_usd'; _renderTokens(); });
  document.getElementById('dt-sort-change')?.addEventListener('click', () => { _sortKey = 'change_24h_bp'; _renderTokens(); });
  document.getElementById('dt-sort-tvl')?.addEventListener('click', () => { _sortKey = 'tvl_sats'; _renderTokens(); });
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();
  _bind();
  const prices = state.get('prices') || {};
  _bchPrice = prices.bch?.price || 0;
  const prEl = document.getElementById('dt-dex-price');
  if (prEl && _bchPrice) prEl.textContent = 'BCH $' + _bchPrice.toFixed(2);
  _loadTokens();
  _unsubs.push(state.subscribe('prices', p => {
    _bchPrice = p?.bch?.price || 0;
    if (prEl) prEl.textContent = 'BCH $' + _bchPrice.toFixed(2);
    updateBalanceChip('bch');
    _renderTokens();
    _renderPools();
  }));
  _unsubs.push(state.subscribe('balances', () => updateBalanceChip('bch')));
}

export function unmount() { _unsubs.forEach(fn => fn()); _unsubs = []; _selToken = null; if (_container) _container.innerHTML = ''; _container = null; }
