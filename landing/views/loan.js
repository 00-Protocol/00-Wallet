/* 00 Wallet — Loan View (SPA v2) — Moria Protocol */
import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, infoBtn, updateBalanceChip } from '../core/ui-helpers.js';

export const id = 'loan';
export const title = '00 Loan';
export const icon = '∞';

let _container = null, _unsubs = [], _bchPrice = 0;

function _template() {
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon"><img src="icons/loan.png" style="width:28px;height:28px"></div><div><div class="dt-page-title">Loan</div><div class="dt-page-sub">Moria Protocol · BCH Collateralized Lending</div></div></div>
      <div class="dt-page-actions"><div class="dt-oracle" id="dt-loan-oracle">BCH $—</div></div>
    </div>
    <div class="dt-tabs" id="dt-loan-tabs">
      <button class="dt-tab active" data-tab="borrow">Borrow</button>
      <button class="dt-tab" data-tab="info"><span>ℹ</span> Info</button>
    </div>
    <div class="dt-pane active" id="dt-loan-p-borrow">
      ${balanceChipHtml(['bch'])}
      <div class="dt-card">
        <div style="display:flex;align-items:center;gap:8px"><div class="dt-card-title" style="margin:0">Borrow Calculator</div>${infoBtn('Borrow MUSD stablecoin by locking BCH as collateral. Higher ratio = safer vault but less borrowing power. Liquidation happens at 120%.')}</div>
        <div class="dt-form-group"><div class="dt-form-lbl">Collateral (BCH)</div><input class="dt-form-input" id="dt-coll-bch" type="number" step="any" placeholder="e.g. 0.5"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">Collateral Ratio</div>
          <div style="text-align:center;font-size:32px;font-weight:800;color:var(--dt-text);padding:4px 0" id="dt-ratio-display">200%</div>
          <div style="text-align:center;font-size:12px;font-weight:600;margin-bottom:8px" id="dt-ratio-zone"><span style="color:var(--dt-accent)">Safe Zone</span></div>
          <input class="dt-slider" type="range" id="dt-ratio-slider" min="150" max="500" value="200">
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--dt-text-secondary);margin-top:4px"><span style="color:var(--dt-danger)">150% Min</span><span>200%</span><span style="color:var(--dt-accent)">500%</span></div>
        </div>
      </div>
      <div class="dt-card" style="margin-top:16px;padding:20px">
        <div class="dt-card-title">Results</div>
        <div class="dt-results-grid" id="dt-results-grid" style="margin-top:8px">
          <div class="dt-result-card highlight"><div class="dt-result-label">Max MUSD</div><div class="dt-result-value safe" id="dt-res-musd">—</div></div>
          <div class="dt-result-card"><div class="dt-result-label">Collateral Value</div><div class="dt-result-value" id="dt-res-coll">—</div></div>
          <div class="dt-result-card"><div class="dt-result-label">Interest Rate</div><div class="dt-result-value" id="dt-res-rate">—</div></div>
          <div class="dt-result-card"><div class="dt-result-label">Liquidation Price</div><div class="dt-result-value danger" id="dt-res-liq">—</div></div>
        </div>
      </div>
      <div class="dt-card" style="margin-top:20px;padding:16px 28px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div class="dt-form-lbl" style="margin:0">Vault Health</div><span style="font-size:11px;color:var(--dt-text-secondary)" id="dt-health-pct">—</span></div>
        <div class="dt-health-bar"><div class="dt-health-fill" id="dt-health-bar" style="width:0%"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--dt-text-secondary);margin-top:6px"><span style="color:var(--dt-danger)">Liquidation 120%</span><span>Safe</span><span style="color:var(--dt-accent)">Max Safe</span></div>
      </div>
      <a class="dt-action-btn" href="https://www.moria.money" target="_blank" style="display:block;text-align:center;text-decoration:none;margin-top:20px;background:var(--dt-accent)">Borrow MUSD on Moria →</a>
      <div style="text-align:center;font-size:11px;color:var(--dt-text-secondary);margin-top:8px">Powered by Moria Protocol · Open Source · Decentralized</div>
    </div>
    <div class="dt-pane" id="dt-loan-p-info">
      <div class="dt-card">
        <div class="dt-info-section"><div class="dt-info-title">Moria Protocol</div><div class="dt-info-text">Borrow MUSD (USD stablecoin) by locking BCH as collateral. Open source, immutable, zero custodians.</div></div>
      </div>
      <div class="dt-card">
        <div class="dt-card-title">Key Parameters</div>
        <div style="display:flex;flex-direction:column;gap:0">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--dt-border-subtle,var(--dt-border));font-size:13px"><span style="color:var(--dt-text-secondary)">Min Collateral</span><span style="font-weight:600">150%</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--dt-border-subtle,var(--dt-border));font-size:13px"><span style="color:var(--dt-text-secondary)">Liquidation</span><span style="font-weight:600">120%</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--dt-border-subtle,var(--dt-border));font-size:13px"><span style="color:var(--dt-text-secondary)">Min Debt</span><span style="font-weight:600">10 MUSD</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--dt-border-subtle,var(--dt-border));font-size:13px"><span style="color:var(--dt-text-secondary)">Collateral</span><span style="font-weight:600">BCH only</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--dt-border-subtle,var(--dt-border));font-size:13px"><span style="color:var(--dt-text-secondary)">Interest</span><span style="font-weight:600">Self-set</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px"><span style="color:var(--dt-text-secondary)">Oracle</span><span style="font-weight:600">D3lphi (on-chain)</span></div>
        </div>
      </div>
    </div>
  </div>`;
}

function _calc() {
  const bch = parseFloat(document.getElementById('dt-coll-bch')?.value) || 0;
  const ratio = parseInt(document.getElementById('dt-ratio-slider')?.value) || 200;
  document.getElementById('dt-ratio-display').textContent = ratio + '%';
  const zone = document.getElementById('dt-ratio-zone');
  if (ratio < 200) zone.innerHTML = '<span style="color:var(--dt-danger)">Danger Zone</span>';
  else if (ratio < 300) zone.innerHTML = '<span style="color:#f59e0b">Moderate</span>';
  else zone.innerHTML = '<span style="color:var(--dt-accent)">Safe Zone</span>';
  if (!bch || !_bchPrice) { document.getElementById('dt-res-musd').textContent = '—'; return; }
  const collUsd = bch * _bchPrice;
  const musd = collUsd / (ratio / 100);
  const liqPrice = (musd * 1.2) / bch;
  const healthPct = Math.min(100, Math.max(0, ((ratio - 120) / (500 - 120)) * 100));
  document.getElementById('dt-res-musd').textContent = musd.toFixed(2) + ' MUSD';
  document.getElementById('dt-res-coll').textContent = '$' + collUsd.toFixed(2);
  document.getElementById('dt-res-rate').textContent = 'Variable';
  document.getElementById('dt-res-liq').textContent = '$' + liqPrice.toFixed(2);
  document.getElementById('dt-health-pct').textContent = healthPct.toFixed(0) + '%';
  document.getElementById('dt-health-bar').style.width = healthPct + '%';
  document.getElementById('dt-health-bar').style.background = healthPct > 50 ? 'var(--dt-accent)' : healthPct > 25 ? '#f59e0b' : 'var(--dt-danger)';
}

function _bind() {
  document.querySelectorAll('#dt-loan-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-loan-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('dt-loan-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });
  document.getElementById('dt-coll-bch')?.addEventListener('input', _calc);
  document.getElementById('dt-ratio-slider')?.addEventListener('input', _calc);
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();
  _bind();
  const prices = state.get('prices') || {};
  _bchPrice = prices.bch?.price || 0;
  const el = document.getElementById('dt-loan-oracle');
  if (el && _bchPrice) el.textContent = 'BCH $' + _bchPrice.toFixed(2);
  _unsubs.push(state.subscribe('prices', p => { _bchPrice = p?.bch?.price || 0; if (el) el.textContent = 'BCH $' + _bchPrice.toFixed(2); _calc(); }));
}

export function unmount() { _unsubs.forEach(fn => fn()); _unsubs = []; if (_container) _container.innerHTML = ''; _container = null; }
