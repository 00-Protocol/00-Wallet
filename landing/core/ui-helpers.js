/* ══════════════════════════════════════════
   00 Wallet — Shared UI Helpers
   ══════════════════════════════════════════
   Reusable components: balance chips, status dots,
   info tooltips, chart tooltip.
   ══════════════════════════════════════════ */

import * as state from './state.js';

/* ── Balance chip HTML ── */
export function balanceChipHtml(chains = ['bch']) {
  return `<div style="display:flex;gap:12px;margin-bottom:20px">
    ${chains.map(c => {
      const icons = { bch: 'icons/bch.png', btc: 'icons/btc.png', eth: 'icons/eth.png', ltc: 'icons/ltc.png', xmr: 'icons/xmr.png' };
      const tickers = { bch: 'BCH', btc: 'BTC', eth: 'ETH', ltc: 'LTC', xmr: 'XMR' };
      const decs = { bch: 8, btc: 8, eth: 18, ltc: 8, xmr: 12 };
      const balances = state.get('balances') || {};
      const bal = balances[c] || 0;
      const n = typeof bal === 'string' ? parseFloat(bal) : bal;
      const val = (n / Math.pow(10, decs[c] || 8)).toFixed(8);
      return `<div class="dt-card" style="flex:1;margin:0;padding:16px 20px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <img src="${icons[c] || ''}" style="width:16px;height:16px;border-radius:50%">
          <span class="dt-form-lbl" style="margin:0">${tickers[c] || c.toUpperCase()} Balance</span>
        </div>
        <div style="font-size:18px;font-weight:700;color:var(--dt-text)" id="ui-bal-${c}">${val}</div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ── Connection status dots ── */
export function statusDotsHtml(services = ['fulcrum']) {
  return `<div style="display:flex;align-items:center;gap:12px">
    ${services.map(s => {
      const labels = { fulcrum: 'Fulcrum', nostr: 'Nostr', btc: 'BTC Node' };
      const colors = { fulcrum: '#0AC18E', nostr: '#627EEA', btc: '#F7931A' };
      return `<div style="display:flex;align-items:center;gap:4px">
        <div id="ui-dot-${s}" style="width:6px;height:6px;border-radius:50%;background:var(--dt-text-secondary);opacity:.3;transition:all .3s"></div>
        <span style="font-size:10px;color:var(--dt-text-secondary);font-weight:500">${labels[s] || s}</span>
      </div>`;
    }).join('')}
  </div>`;
}

/* ── Update status dot ── */
export function setDotStatus(id, connected) {
  const dot = document.getElementById('ui-dot-' + id);
  if (dot) {
    dot.style.background = connected ? '#0AC18E' : 'var(--dt-text-secondary)';
    dot.style.opacity = connected ? '1' : '.3';
    if (connected) dot.style.boxShadow = '0 0 4px #0AC18E';
    else dot.style.boxShadow = 'none';
  }
}

/* ── Update balance chip ── */
export function updateBalanceChip(chain) {
  const el = document.getElementById('ui-bal-' + chain);
  if (!el) return;
  const balances = state.get('balances') || {};
  const decs = { bch: 8, btc: 8, eth: 18, ltc: 8, xmr: 12 };
  const bal = balances[chain] || 0;
  const n = typeof bal === 'string' ? parseFloat(bal) : bal;
  el.textContent = (n / Math.pow(10, decs[chain] || 8)).toFixed(8);
}

/* ── Info tooltip button ── */
export function infoBtn(text) {
  const id = 'info-' + Math.random().toString(36).slice(2, 8);
  return `<div style="position:relative;display:inline-block">
    <div onclick="var t=document.getElementById('${id}');t.style.display=t.style.display==='none'?'block':'none'" style="width:20px;height:20px;border-radius:50%;background:rgba(240,165,0,.15);color:#f0a500;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;font-style:italic" title="Info">i</div>
    <div id="${id}" style="display:none;position:absolute;top:28px;left:-100px;width:280px;padding:12px 16px;background:var(--dt-surface,#fff);border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:100;font-size:12px;color:var(--dt-text-secondary);line-height:1.6;font-style:normal;font-weight:400">${text}</div>
  </div>`;
}
