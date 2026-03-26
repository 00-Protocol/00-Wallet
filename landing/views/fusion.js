/* 00 Wallet — Fusion View (SPA v2) — CoinJoin Privacy Mixing */
import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, statusDotsHtml, infoBtn, updateBalanceChip, setDotStatus } from '../core/ui-helpers.js';

export const id = 'fusion';
export const title = '00 Fusion';
export const icon = '⚗';
let _container = null, _unsubs = [];

function _template() {
  const keys = auth.getKeys();
  const balances = state.get('balances') || {};
  const bal = balances.bch || 0;
  const balStr = (bal / 1e8).toFixed(8);
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon">⚗</div><div><div class="dt-page-title">Fusion</div><div class="dt-page-sub">Silent Joiner · Privacy Mixing</div></div></div>
      <div class="dt-page-actions">${statusDotsHtml(['fulcrum', 'nostr'])}</div>
    </div>
    <div class="dt-tabs" id="dt-fus-tabs">
      <button class="dt-tab active" data-tab="pool">Pool</button>
      <button class="dt-tab" data-tab="mix">Mix</button>
      <button class="dt-tab" data-tab="history">History</button>
    </div>
    <div class="dt-pane active" id="dt-fus-p-pool">
      ${balanceChipHtml(['bch'])}
      <div class="dt-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px"><div class="dt-card-title" style="margin:0">Joiner</div>${infoBtn('The Silent Joiner creates CoinJoin transactions via onion-encrypted relay. Your inputs and outputs are mixed with other participants — nobody can link them. Each round uses ephemeral keys.')}</div>
          <div style="display:flex;gap:8px">
            <button class="dt-action-btn" id="dt-fus-join" style="width:auto;padding:8px 20px;background:var(--dt-accent)">⚗ Join Round</button>
            <button class="dt-action-btn-outline" id="dt-fus-auto" style="width:auto;padding:8px 16px;font-size:11px">Auto-Mix: OFF</button>
          </div>
        </div>
        <div id="dt-fus-relays"><div class="dt-empty"><div class="dt-empty-icon">⚗</div><div class="dt-empty-text">Searching for relays...</div><div style="font-size:11px;color:var(--dt-text-secondary);margin-top:4px">Waiting for relay announcements on Nostr</div></div></div>
      </div>
    </div>
    <div class="dt-pane" id="dt-fus-p-mix">
      <div class="dt-card" id="dt-mix-idle">
        <div class="dt-empty"><div class="dt-empty-icon">⚗</div><div class="dt-empty-text">No active mix</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Join a round from the Pool tab to start mixing</div></div>
      </div>
      <div class="dt-card" id="dt-mix-active" style="display:none">
        <div class="dt-card-title">Mix in Progress</div>
        <div style="font-size:14px;font-weight:600;color:var(--dt-accent);margin-bottom:16px" id="dt-mix-status">SIGNALING READY...</div>
        <div id="dt-mix-phases">
          ${[['1','Discovery'],['2','Input Registration'],['3','Blind Output'],['4','TX Assembly'],['5','Verify & Sign'],['6','Broadcast']].map(([n,label]) =>
            `<div class="dt-phase-item" data-phase="${n}" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--dt-border)">
              <div style="width:28px;height:28px;border-radius:50%;border:2px solid var(--dt-border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--dt-text-secondary)">${n}</div>
              <span style="font-size:13px;color:var(--dt-text)">${label}</span>
            </div>`
          ).join('')}
        </div>
      </div>
    </div>
    <div class="dt-pane" id="dt-fus-p-history">
      <div id="dt-fus-history"><div class="dt-empty"><div class="dt-empty-icon">📋</div><div class="dt-empty-text">No mix history yet</div></div></div>
    </div>
  </div>`;
}

function _renderHistory() {
  const el = document.getElementById('dt-fus-history'); if (!el) return;
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem('00_fusion_history') || '[]'); } catch {}
  if (!hist.length) return;
  el.innerHTML = hist.slice(0, 20).map(h => `<div class="dt-row"><div class="dt-row-left"><div class="dt-row-icon in"><span>⚗</span></div><div><div class="dt-row-title">CoinJoin Round</div><div class="dt-row-sub">${h.txid?.slice(0, 16) || '—'}…</div></div></div><div class="dt-row-right"><div class="dt-row-amount">${h.participants || '?'} participants</div></div></div>`).join('');
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();
  setDotStatus('fulcrum', true);
  _renderHistory();
  // Tabs
  document.querySelectorAll('#dt-fus-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-fus-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('dt-fus-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });
  _unsubs.push(state.subscribe('balances', () => updateBalanceChip('bch')));
  // TODO: connect to joiner-service for relay discovery + mix state
}
export function unmount() { _unsubs.forEach(fn => fn()); _unsubs = []; if (_container) _container.innerHTML = ''; _container = null; }
