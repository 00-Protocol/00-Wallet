/* 00 Wallet — Swap View (SPA v2) — Atomic Cross-Chain Swaps */
import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, statusDotsHtml, infoBtn, updateBalanceChip, setDotStatus } from '../core/ui-helpers.js';

export const id = 'swap';
export const title = '00 Swap';
export const icon = '⇄';

let _container = null, _unsubs = [], _bchPrice = 0, _btcPrice = 0;

function _template() {
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon">⇄</div><div><div class="dt-page-title">Swap</div><div class="dt-page-sub">Atomic Cross-Chain Swaps</div></div></div>
      <div class="dt-page-actions">
        ${statusDotsHtml(['fulcrum', 'nostr'])}
        <div class="dt-oracle" id="dt-swap-bch">BCH $—</div>
        <div class="dt-oracle" id="dt-swap-btc">BTC $—</div>
      </div>
    </div>
    <div class="dt-tabs" id="dt-swap-tabs">
      <button class="dt-tab active" data-tab="book">OTC Book</button>
      <button class="dt-tab" data-tab="swap">Swap</button>
    </div>
    <div class="dt-pane active" id="dt-swap-p-book">
      ${balanceChipHtml(['bch', 'btc'])}
      <div class="dt-card">
        <div style="display:flex;align-items:center;gap:8px"><div class="dt-card-title" style="margin:0">Order Book</div>${infoBtn('Offers are published on Nostr relays. Swaps use Hash Time-Locked Contracts (HTLC) — trustless, no counterparty risk. Both parties lock funds simultaneously.')}</div>
        <div style="display:flex;gap:12px;margin-bottom:16px">
          <div class="dt-toggle-group" style="flex:1">
            <button class="dt-toggle-btn active" id="sw-pair-bchbtc">BCH ⇄ BTC</button>
            <button class="dt-toggle-btn" id="sw-pair-bchltc">BCH ⇄ LTC</button>
            <button class="dt-toggle-btn" id="sw-pair-bchxmr">BCH ⇄ XMR</button>
          </div>
        </div>
        <div id="dt-order-list"><div class="dt-empty"><div class="dt-empty-icon">⇄</div><div class="dt-empty-text">No offers found</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Create the first offer or wait for peers</div></div></div>
      </div>
      <div class="dt-card" style="margin-top:20px">
        <div class="dt-card-title">Post an Offer</div>
        <div class="dt-form-group"><div class="dt-form-lbl">You Send</div>
          <div style="display:flex;gap:8px"><input class="dt-form-input" id="dt-offer-amount" type="number" step="any" placeholder="0.001" style="flex:1"><select class="dt-form-input" id="dt-offer-from" style="width:100px"><option>BCH</option><option>BTC</option><option>LTC</option><option>XMR</option></select></div>
        </div>
        <div class="dt-form-group"><div class="dt-form-lbl">You Receive</div>
          <div style="display:flex;gap:8px"><input class="dt-form-input" id="dt-offer-receive" type="number" step="any" placeholder="0.0001" style="flex:1"><select class="dt-form-input" id="dt-offer-to" style="width:100px"><option>BTC</option><option>BCH</option><option>LTC</option><option>XMR</option></select></div>
        </div>
        <button class="dt-action-btn" style="background:var(--dt-accent);margin-top:8px" id="dt-post-offer">Post Offer via Nostr →</button>
        <div style="text-align:center;font-size:11px;color:var(--dt-text-secondary);margin-top:8px">Offers published on Nostr · Trustless HTLC swaps</div>
      </div>
    </div>
    <div class="dt-pane" id="dt-swap-p-swap">
      <div class="dt-card" style="text-align:center;padding:40px">
        <div style="font-size:48px;margin-bottom:16px">⇄</div>
        <div style="font-size:16px;font-weight:600;color:var(--dt-text);margin-bottom:8px">Quick Swap</div>
        <div style="font-size:13px;color:var(--dt-text-secondary);margin-bottom:24px;line-height:1.6">Select an offer from the OTC Book to start an atomic swap. The swap uses Hash Time-Locked Contracts (HTLC) — trustless, no counterparty risk.</div>
        <a class="dt-action-btn-outline" href="#/swap" style="display:inline-block;text-decoration:none">← Browse Offers</a>
      </div>
    </div>
  </div>`;
}

function _bind() {
  document.querySelectorAll('#dt-swap-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-swap-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('dt-swap-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });
}

function _updatePrices() {
  const prices = state.get('prices') || {};
  _bchPrice = prices.bch?.price || 0;
  _btcPrice = prices.btc?.price || 0;
  const bEl = document.getElementById('dt-swap-bch');
  const tEl = document.getElementById('dt-swap-btc');
  if (bEl && _bchPrice) bEl.textContent = 'BCH $' + _bchPrice.toFixed(2);
  if (tEl && _btcPrice) tEl.textContent = 'BTC $' + _btcPrice.toFixed(0);
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();
  _bind();
  _updatePrices();
  _unsubs.push(state.subscribe('prices', _updatePrices));
  _unsubs.push(state.subscribe('balances', () => { updateBalanceChip('bch'); updateBalanceChip('btc'); }));
  setDotStatus('fulcrum', true); // TODO: wire to actual connection status
}

export function unmount() { _unsubs.forEach(fn => fn()); _unsubs = []; if (_container) _container.innerHTML = ''; _container = null; }
