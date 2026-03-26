/* ══════════════════════════════════════════
   00 Wallet — Wallet View (SPA v2)
   ══════════════════════════════════════════
   Two sub-views:
   - #/wallet → coin list (portfolio)
   - #/wallet/bch → coin detail (balance, send, receive, txs)
   Reuses exact CSS from desktop.css (cd-*, wd-*)
   ══════════════════════════════════════════ */

import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';

export const id = 'wallet';
export const title = '00 Wallet';
export const icon = '₿';

let _container = null;
let _unsubs = [];
let _currentCoin = null;
let _txFilter = 'all';  // 'all' | 'in' | 'out'
let _txPageSize = 50;

/* ── Chain config ── */
const CHAINS = [
  { id:'bch',  chain:'BITCOIN CASH',        name:'Bitcoin Cash',        ticker:'BCH',  dec:8,  color:'#0AC18E', icon:'icons/bch.png',  iconType:'img', type:'chain' },
  { id:'sbch', chain:'STEALTH BITCOIN CASH', name:'Stealth Bitcoin Cash',ticker:'BCH', dec:8,  color:'#BF5AF2', icon:'₿',             iconType:'span', type:'chain', stealth:true },
  { id:'btc',  chain:'BITCOIN',              name:'Bitcoin',             ticker:'BTC',  dec:8,  color:'#F7931A', icon:'icons/btc.png',  iconType:'img', type:'chain' },
  { id:'eth',  chain:'ETHEREUM',             name:'Ethereum',            ticker:'ETH',  dec:18, color:'#627EEA', icon:'icons/eth.png',  iconType:'img', type:'chain' },
  { id:'usdc', chain:'',                     name:'USDC',                ticker:'USDC', dec:6,  color:'#2775CA', icon:'icons/usdc.png', iconType:'img', type:'token' },
  { id:'usdt', chain:'',                     name:'USDT',                ticker:'USDT', dec:6,  color:'#26A17B', icon:'icons/usdt.png', iconType:'img', type:'token' },
  { id:'xmr',  chain:'MONERO',              name:'Monero',              ticker:'XMR',  dec:12, color:'#FF6600', icon:'icons/xmr.png',  iconType:'img', type:'chain' },
  { id:'ltc',  chain:'LITECOIN',            name:'Litecoin',            ticker:'LTC',  dec:8,  color:'#BFBBBB', icon:'icons/ltc.png',  iconType:'img', type:'chain' },
  { id:'bnb',  chain:'BNB SMART CHAIN',     name:'BNB',                 ticker:'BNB',  dec:18, color:'#F0B90B', icon:'icons/bnb.png',  iconType:'img', type:'chain' },
  { id:'usdc_bsc', chain:'',                name:'USDC',                ticker:'USDC', dec:6,  color:'#2775CA', icon:'icons/usdc.png', iconType:'img', type:'token' },
  { id:'usdt_bsc', chain:'',                name:'USDT',                ticker:'USDT', dec:6,  color:'#26A17B', icon:'icons/usdt.png', iconType:'img', type:'token' },
  { id:'avax', chain:'AVALANCHE',           name:'Avalanche',           ticker:'AVAX', dec:18, color:'#E84142', icon:'icons/avax.png', iconType:'img', type:'chain' },
  { id:'usdc_avax', chain:'',               name:'USDC',                ticker:'USDC', dec:6,  color:'#2775CA', icon:'icons/usdc.png', iconType:'img', type:'token' },
  { id:'usdt_avax', chain:'',               name:'USDT',                ticker:'USDT', dec:6,  color:'#26A17B', icon:'icons/usdt.png', iconType:'img', type:'token' },
  { id:'sol',  chain:'SOLANA',              name:'Solana',              ticker:'SOL',  dec:9,  color:'#9945FF', icon:'icons/sol.png',  iconType:'img', type:'chain' },
  { id:'usdc_sol', chain:'',                name:'USDC',                ticker:'USDC', dec:6,  color:'#2775CA', icon:'icons/usdc.png', iconType:'img', type:'token' },
  { id:'usdt_sol', chain:'',                name:'USDT',                ticker:'USDT', dec:6,  color:'#26A17B', icon:'icons/usdt.png', iconType:'img', type:'token' },
  { id:'trx',  chain:'TRON',               name:'TRON',                ticker:'TRX',  dec:6,  color:'#FF0013', icon:'icons/trx.png',  iconType:'img', type:'chain' },
  { id:'usdt_trx', chain:'',               name:'USDT',                ticker:'USDT', dec:6,  color:'#26A17B', icon:'icons/usdt.png', iconType:'img', type:'token' },
  { id:'xrp',  chain:'XRP',                name:'XRP',                 ticker:'XRP',  dec:6,  color:'#0085C0', icon:'icons/xrp.png',  iconType:'img', type:'chain' },
  { id:'rlusd_xrp', chain:'',              name:'RLUSD',               ticker:'RLUSD',dec:6,  color:'#0085C0', icon:'icons/xrp.png',  iconType:'img', type:'token' },
  { id:'xlm',  chain:'STELLAR',            name:'Stellar',             ticker:'XLM',  dec:7,  color:'#14B6E7', icon:'icons/xlm.png',  iconType:'img', type:'chain' },
];

function fmtBal(raw, dec, ticker) {
  if (raw === undefined || raw === null) return '0 ' + ticker;
  const n = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (isNaN(n)) return '0 ' + ticker;
  const val = n / Math.pow(10, dec);
  if (val === 0) return '0 ' + ticker;
  return val.toFixed(dec > 6 ? 8 : Math.min(dec, 4)) + ' ' + ticker;
}
function fmtFiat(raw, dec, price) {
  if (!price || raw === undefined || raw === null) return '$0.00';
  const n = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (isNaN(n)) return '$0.00';
  const v = (n / Math.pow(10, dec)) * price;
  return '$' + v.toLocaleString('en', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function pk(id) {
  if (id === 'sbch') return 'bch';
  if (id.startsWith('usdc')) return 'usdc';
  if (id.startsWith('usdt')) return 'usdt';
  if (id.startsWith('rlusd')) return 'usdc';
  return id;
}
function getC(id) { return CHAINS.find(c => c.id === id); }

/* ══════════════════════════════════════════
   COIN LIST
   ══════════════════════════════════════════ */
function renderCoinList() {
  if (!_container) return;
  const balances = state.get('balances') || {};
  const prices = state.get('prices') || {};

  const cards = CHAINS.map(c => {
    const bal = balances[c.id];
    const p = prices[pk(c.id)]?.price || 0;
    const balStr = fmtBal(bal, c.dec, c.ticker);
    const fiatStr = fmtFiat(bal, c.dec, p);
    const href = `#/wallet/${c.id}`;

    if (c.type === 'token') {
      return `<a class="wd-token" href="${href}" style="text-decoration:none">
        <div class="wd-acc-left"><span class="wd-token-indent">└</span><img class="wd-acc-icon wd-token-icon" src="${c.icon}" alt="${c.ticker}"><div><div class="wd-acc-name">${c.name}</div></div></div>
        <div class="wd-acc-right"><span class="wd-acc-balance">${balStr}</span><span class="wd-acc-fiat">${fiatStr}</span></div>
      </a>`;
    }
    const cls = c.stealth ? ' stealth' : '';
    const ico = c.iconType === 'img'
      ? `<img class="wd-acc-icon" src="${c.icon}" alt="${c.ticker}">`
      : `<div class="wd-acc-icon" style="background:${c.color}"><span>${c.icon}</span></div>`;
    return `<a class="wd-account${cls}" href="${href}" style="text-decoration:none">
      <div class="wd-acc-left">${ico}<div><div class="wd-acc-chain">${c.chain}</div><div class="wd-acc-name">${c.name}</div></div></div>
      <div class="wd-acc-right"><span class="wd-acc-balance">${balStr}</span><span class="wd-acc-fiat">${fiatStr}</span></div>
    </a>`;
  }).join('');

  _container.innerHTML = `<div style="padding:32px 40px"><div class="wd-accounts">${cards}</div></div>`;
}

/* ══════════════════════════════════════════
   COIN DETAIL
   ══════════════════════════════════════════ */
function renderCoinDetail(coinId) {
  if (!_container) return;
  const c = getC(coinId);
  if (!c) { navigate('wallet'); return; }
  _currentCoin = coinId;

  const balances = state.get('balances') || {};
  const prices = state.get('prices') || {};
  const bal = balances[coinId];
  const p = prices[pk(coinId)]?.price || 0;
  const n = (typeof bal === 'string' ? parseFloat(bal) : bal) || 0;
  const valNum = n / Math.pow(10, c.dec);
  const balStr = valNum === 0 ? '0' : valNum.toFixed(c.dec > 6 ? 8 : Math.min(c.dec, 4));
  const fiatStr = fmtFiat(bal, c.dec, p);
  const priceStr = p ? '$' + p.toLocaleString('en', {maximumFractionDigits:2}) : '';
  const ico = c.iconType === 'img'
    ? `<img src="${c.icon}" alt="${c.ticker}" style="width:48px;height:48px;border-radius:50%">`
    : `<div style="width:48px;height:48px;border-radius:50%;background:${c.color};display:flex;align-items:center;justify-content:center"><span style="color:#fff;font-size:22px;font-weight:700">${c.icon}</span></div>`;

  const stealthBar = coinId === 'bch' ? `
    <div class="cd-auto-stealth-bar" id="cd-auto-stealth">
      <div class="cd-as-left">
        <div class="cd-as-toggle as-toggle"><div class="cd-as-knob as-knob"></div></div>
        <span class="cd-as-label">Auto Stealth</span>
        <span class="cd-as-status">OFF</span>
      </div>
      <div class="cd-as-rounds">
        <button class="cd-as-round-btn cj-round-btn">5x</button>
        <button class="cd-as-round-btn cj-round-btn">10x</button>
        <button class="cd-as-round-btn cj-round-btn">∞</button>
      </div>
    </div>` : '';

  _container.innerHTML = `
  <div style="padding:0 40px 40px" class="v2-coin-detail">
    <div class="cd-back" onclick="window.location.hash='#/wallet'" style="cursor:pointer">← Back</div>
    <div class="cd-head">
      <div class="cd-head-left">${ico}<div><div class="cd-chain">${c.chain || c.name}</div><div class="cd-name">${c.name}</div></div></div>
      <div class="cd-actions">
        <a class="cd-action-btn" href="#/swap"><span>⇄</span> Swap</a>
        <button class="cd-action-btn cd-primary" onclick="document.getElementById('cd-send-modal')?.classList.add('open')"><span>↑</span> Send</button>
        <button class="cd-action-btn" onclick="document.getElementById('cd-recv-modal')?.classList.add('open')"><span>↓</span> Receive</button>
      </div>
    </div>
    ${stealthBar}
    <div class="cd-balance-card">
      <div class="cd-bal-top">
        <div style="display:flex;align-items:center;gap:8px;justify-content:center">
          <div class="cd-bal-amount" id="cd-bal-amount">${balStr} ${c.ticker}</div>
          <button onclick="import('../services/balance-service.js').then(m=>m.refreshNow())" style="background:none;border:none;cursor:pointer;font-size:36px;opacity:.4;padding:8px;transition:all .3s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.4'" title="Refresh">⟳</button>
        </div>
        <div class="cd-bal-row"><span class="cd-bal-fiat" id="cd-bal-fiat">${fiatStr}</span><span class="cd-bal-price" id="cd-bal-price">${priceStr}</span></div>
      </div>
      <div class="cd-chart-wrap">
        <div class="cd-periods">
          <button class="cd-period" data-days="1">1D</button><button class="cd-period" data-days="7">1W</button><button class="cd-period" data-days="30">1M</button>
          <button class="cd-period active" data-days="365">1Y</button><button class="cd-period" data-days="max">ALL</button>
        </div>
        <div class="cd-chart-container" style="height:200px;display:flex;align-items:center;justify-content:center">
          <svg viewBox="0 0 800 200" preserveAspectRatio="none" style="width:100%;height:100%" id="cd-chart">
            <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c.color}" stop-opacity=".2"/><stop offset="100%" stop-color="${c.color}" stop-opacity="0"/></linearGradient></defs>
            <path id="cd-fill" fill="url(#cg)" d=""/><path id="cd-line" fill="none" stroke="${c.color}" stroke-width="2" d=""/>
          </svg>
        </div>
      </div>
    </div>
    <div class="cd-tx-card">
      <div class="cd-tx-head">
        <div class="cd-tx-tabs">
          <button class="cd-tx-tab active" data-tab="txs" id="tab-txs">Transactions</button>
          <button class="cd-tx-tab" data-tab="utxos" id="tab-utxos">UTXOs</button>
        </div>
        <div style="display:flex;align-items:center;gap:10px" id="cd-tx-controls">
          <div style="display:flex;border:1px solid var(--dt-border,#e2e8f0);border-radius:8px;overflow:hidden;font-size:11px;font-weight:600">
            <button class="cd-dir-btn active" data-dir="all" style="padding:6px 12px;border:none;background:var(--dt-accent);color:#fff;cursor:pointer;font-size:11px;font-weight:600">All</button>
            <button class="cd-dir-btn" data-dir="in" style="padding:6px 12px;border:none;background:transparent;color:var(--dt-text-secondary);cursor:pointer;font-size:11px;font-weight:600">Received</button>
            <button class="cd-dir-btn" data-dir="out" style="padding:6px 12px;border:none;background:transparent;color:var(--dt-text-secondary);cursor:pointer;font-size:11px;font-weight:600">Sent</button>
          </div>
          <select id="cd-page-size" style="padding:6px 10px;border:1px solid var(--dt-border,#e2e8f0);border-radius:8px;font-size:12px;font-weight:600;background:var(--dt-surface,#fff);color:var(--dt-text);cursor:pointer">
            <option value="20">20</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>
      <div id="cd-tx-list"><div class="cd-tx-empty">Loading transactions...</div></div>
      <div id="cd-utxo-list" style="display:none"></div>
    </div>

    <!-- Send Modal -->
    <div class="cd-modal-overlay" id="cd-send-modal" onclick="if(event.target===this)this.classList.remove('open')">
      <div class="cd-modal">
        <div class="cd-modal-header"><span>Send</span><div class="cd-modal-close" onclick="document.getElementById('cd-send-modal').classList.remove('open')">✕</div></div>
        ${(coinId === 'bch') ? `<div class="cd-send-mode" id="cd-send-mode">
          <button class="cd-send-mode-btn active" data-mode="normal" id="send-mode-normal">Normal</button>
          <button class="cd-send-mode-btn" data-mode="stealth" id="send-mode-stealth">Stealth</button>
        </div>` : ''}
        <!-- Normal send -->
        <div id="cd-send-normal" style="display:flex;flex-direction:column;gap:16px">
          <div><div class="cd-form-lbl">RECIPIENT ADDRESS</div><input class="cd-form-input" id="cd-send-addr" placeholder="bitcoincash:q..."></div>
          <div><div class="cd-form-lbl">AMOUNT (${c.ticker})</div><div class="cd-amount-wrap"><input class="cd-form-input" id="cd-send-amount" type="number" step="0.00000001" min="0" placeholder="0.00000000"><div class="cd-max-btn" id="cd-max-btn">MAX</div></div></div>
          ${(coinId === 'bch' || coinId === 'btc') ? `<div><div class="cd-form-lbl">FEE RATE (SAT/BYTE)</div>
            <div class="cd-fee-row">
              <div class="cd-fee-opt active" data-rate="1">LOW<br><span style="opacity:.6">1 sat/B</span></div>
              <div class="cd-fee-opt" data-rate="1.5">NORMAL<br><span style="opacity:.6">1.5 sat/B</span></div>
              <div class="cd-fee-opt" data-rate="2">HIGH<br><span style="opacity:.6">2 sat/B</span></div>
            </div>
          </div>` : ''}
          <div class="cd-send-summary" id="cd-send-summary" style="display:none"></div>
          <div class="cd-send-error" id="cd-send-error"></div>
          <button class="cd-broadcast-btn" id="cd-broadcast-btn" style="background:var(--dt-accent,#0AC18E)">⚡ BROADCAST →</button>
        </div>
        <!-- Stealth send (BCH only) -->
        ${(coinId === 'bch') ? `<div id="cd-send-stealth" style="display:none;flex-direction:column;gap:16px">
          <div><div class="cd-form-lbl">RECIPIENT STEALTH CODE</div><input class="cd-form-input" id="cd-stealth-code" placeholder="stealth:02abc..."></div>
          <div><div class="cd-form-lbl">AMOUNT (BCH)</div><div class="cd-amount-wrap"><input class="cd-form-input" id="cd-stealth-amount" type="number" step="0.00000001" min="0" placeholder="0.00000000"><div class="cd-max-btn" id="cd-stealth-max">MAX</div></div></div>
          <div class="cd-send-error" id="cd-stealth-error"></div>
          <button class="cd-broadcast-btn" id="cd-stealth-btn">⚡ STEALTH SEND →</button>
        </div>` : ''}
      </div>
    </div>

    <!-- Receive Modal -->
    <div class="cd-modal-overlay" id="cd-recv-modal" onclick="if(event.target===this)this.classList.remove('open')">
      <div class="cd-modal">
        <div class="cd-modal-header"><span>Receive</span><div class="cd-modal-close" onclick="document.getElementById('cd-recv-modal').classList.remove('open')">✕</div></div>
        ${(coinId === 'bch') ? `<div class="cd-send-mode" id="cd-recv-mode">
          <button class="cd-send-mode-btn active" data-mode="normal" id="recv-mode-normal">Normal</button>
          <button class="cd-send-mode-btn" data-mode="stealth" id="recv-mode-stealth">Stealth</button>
        </div>` : ''}
        <!-- Normal receive -->
        <div id="cd-recv-normal">
          <div class="cd-receive-label">YOUR ${c.ticker} ADDRESS</div>
          <div class="cd-qr-wrap"><canvas id="cd-qr-canvas" width="200" height="200"></canvas></div>
          <div class="cd-addr-display" id="cd-recv-addr" style="font-family:'SF Mono','Fira Code',monospace;font-size:11px;font-weight:500;letter-spacing:.3px;word-break:break-all;line-height:1.6">Loading...</div>
          <div class="cd-copy-row">
            <button class="cd-copy-btn" id="cd-copy-full" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">📋 COPY FULL</button>
            <button class="cd-copy-btn" id="cd-copy-short" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">COPY SHORT</button>
          </div>
          <div class="cd-path-info" id="cd-path-info"></div>
        </div>
        <!-- Stealth receive (BCH only) -->
        ${(coinId === 'bch') ? `<div id="cd-recv-stealth" style="display:none">
          <div class="cd-receive-label">YOUR STEALTH CODE</div>
          <div class="cd-qr-wrap"><canvas id="cd-qr-canvas-st" width="200" height="200"></canvas></div>
          <div class="cd-addr-display" id="cd-recv-stealth-code" style="font-size:10px;word-break:break-all">Loading...</div>
          <div class="cd-copy-row">
            <button class="cd-copy-btn" id="cd-copy-stealth" style="background:#BF5AF2;color:#fff;border-color:#BF5AF2">📋 COPY STEALTH CODE</button>
          </div>
          <div class="cd-path-info">// ECDH STEALTH · SCAN + SPEND PUBKEYS</div>
        </div>` : ''}
      </div>
    </div>
  </div>`;

  _loadReceiveAddr(coinId);
  _loadTransactions(coinId);
  _loadChart(coinId, 365);

  // Bind COPY buttons
  document.getElementById('cd-copy-full')?.addEventListener('click', async () => {
    const addr = document.getElementById('cd-recv-addr')?.textContent;
    if (addr) { await navigator.clipboard.writeText(addr); const b = document.getElementById('cd-copy-full'); if (b) { b.textContent = '✓ Copied!'; setTimeout(() => b.textContent = '📋 COPY FULL', 1500); } }
  });
  document.getElementById('cd-copy-short')?.addEventListener('click', async () => {
    const addr = document.getElementById('cd-recv-addr')?.textContent;
    if (addr) { await navigator.clipboard.writeText(addr.slice(0, 25) + '...'); const b = document.getElementById('cd-copy-short'); if (b) { b.textContent = '✓ Copied!'; setTimeout(() => b.textContent = 'COPY SHORT', 1500); } }
  });
  document.getElementById('cd-copy-stealth')?.addEventListener('click', async () => {
    const code = document.getElementById('cd-recv-stealth-code')?.textContent;
    if (code) { await navigator.clipboard.writeText(code); const b = document.getElementById('cd-copy-stealth'); if (b) { b.textContent = '✓ Copied!'; setTimeout(() => b.textContent = '📋 COPY STEALTH CODE', 1500); } }
  });

  // Bind BROADCAST button
  document.getElementById('cd-broadcast-btn')?.addEventListener('click', () => _doSendBch(coinId));

  // Bind MAX buttons (deduct fee for send-all)
  document.getElementById('cd-max-btn')?.addEventListener('click', async () => {
    const amtEl = document.getElementById('cd-send-amount');
    if (!amtEl) return;
    // Get total spendable sats from UTXOs
    let totalSats = 0;
    let nUtxos = 0;
    const hdAddrs = state.get('hdAddresses') || [];
    if (hdAddrs.length > 0 && window._fvCall) {
      const { cashAddrToHash20 } = await import('../core/cashaddr.js');
      const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
      for (const hd of hdAddrs) {
        try {
          const h = cashAddrToHash20(hd.addr);
          const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
          const hash = sha(script);
          const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
          const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
          for (const u of raw) { totalSats += u.value; nUtxos++; }
        } catch {}
      }
    }
    if (!totalSats) {
      const balances = state.get('balances') || {};
      totalSats = balances[coinId] || 0;
      nUtxos = Math.max(1, nUtxos);
    }
    // Deduct fee (1 output only — send all, no change)
    const activeFee = document.querySelector('.cd-fee-opt.active');
    const feeRate = activeFee ? parseFloat(activeFee.dataset.rate) || 1 : 1;
    const fee = Math.ceil((10 + nUtxos * 148 + 34) * feeRate);
    const maxSats = Math.max(0, totalSats - fee);
    amtEl.value = (maxSats / 1e8).toFixed(8);
  });
  document.getElementById('cd-stealth-max')?.addEventListener('click', async () => {
    const balances = state.get('balances') || {};
    const bal = balances[coinId] || 0;
    const amtEl = document.getElementById('cd-stealth-amount');
    // Rough fee deduction for stealth (1 in, 1 out)
    const fee = Math.ceil((10 + 148 + 34) * 1);
    if (amtEl && bal > 0) amtEl.value = (Math.max(0, bal - fee) / 1e8).toFixed(8);
  });

  // Bind send mode toggle (Normal / Stealth)
  document.getElementById('send-mode-normal')?.addEventListener('click', () => {
    document.querySelectorAll('#cd-send-mode .cd-send-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'normal'));
    const n = document.getElementById('cd-send-normal'); if (n) n.style.display = 'flex';
    const s = document.getElementById('cd-send-stealth'); if (s) s.style.display = 'none';
  });
  document.getElementById('send-mode-stealth')?.addEventListener('click', () => {
    document.querySelectorAll('#cd-send-mode .cd-send-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'stealth'));
    const n = document.getElementById('cd-send-normal'); if (n) n.style.display = 'none';
    const s = document.getElementById('cd-send-stealth'); if (s) s.style.display = 'flex';
  });

  // Bind receive mode toggle (Normal / Stealth)
  document.getElementById('recv-mode-normal')?.addEventListener('click', () => {
    document.querySelectorAll('#cd-recv-mode .cd-send-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'normal'));
    const n = document.getElementById('cd-recv-normal'); if (n) n.style.display = '';
    const s = document.getElementById('cd-recv-stealth'); if (s) s.style.display = 'none';
  });
  document.getElementById('recv-mode-stealth')?.addEventListener('click', () => {
    document.querySelectorAll('#cd-recv-mode .cd-send-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'stealth'));
    const n = document.getElementById('cd-recv-normal'); if (n) n.style.display = 'none';
    const s = document.getElementById('cd-recv-stealth'); if (s) s.style.display = '';
  });

  // Bind fee selector
  document.querySelectorAll('.cd-fee-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.cd-fee-opt').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
    });
  });

  // Bind tab switching (Transactions / UTXOs)
  document.getElementById('tab-txs')?.addEventListener('click', () => {
    document.querySelectorAll('.cd-tx-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'txs'));
    document.getElementById('cd-tx-list').style.display = '';
    document.getElementById('cd-utxo-list').style.display = 'none';
    document.getElementById('cd-tx-controls').style.display = 'flex';
  });
  document.getElementById('tab-utxos')?.addEventListener('click', () => {
    document.querySelectorAll('.cd-tx-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'utxos'));
    document.getElementById('cd-tx-list').style.display = 'none';
    document.getElementById('cd-utxo-list').style.display = '';
    document.getElementById('cd-tx-controls').style.display = 'none';
    _loadUtxos(coinId);
  });

  // Bind direction filter
  document.querySelectorAll('.cd-dir-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cd-dir-btn').forEach(b => { b.classList.remove('active'); b.style.background = 'transparent'; b.style.color = 'var(--dt-text-secondary)'; });
      btn.classList.add('active'); btn.style.background = 'var(--dt-accent)'; btn.style.color = '#fff';
      _txFilter = btn.dataset.dir;
      _loadTransactions(coinId);
    });
  });

  // Bind page size
  document.getElementById('cd-page-size')?.addEventListener('change', (e) => {
    _txPageSize = parseInt(e.target.value);  // Reset to selected size
    _loadTransactions(coinId);
  });
}

/* ── Load receive address + stealth code + QR ── */
async function _loadReceiveAddr(coinId) {
  const keys = auth.getKeys();
  const el = document.getElementById('cd-recv-addr');
  if (!el || !keys) return;

  let addr = '';
  if (coinId === 'bch' || coinId === 'sbch') {
    addr = keys.bchAddr || '—';
  } else {
    try {
      const { deriveAllAddresses } = await import('../core/addr-derive.js');
      addr = deriveAllAddresses(keys)[coinId] || 'N/A';
    } catch { addr = 'N/A'; }
  }
  el.textContent = addr;

  // Path info
  const pathEl = document.getElementById('cd-path-info');
  if (pathEl) {
    const pathMap = {bch:"m/44'/145'/0'/0/0",btc:"m/44'/145'/0'/3/0",eth:"m/44'/145'/0'/4/0",ltc:"m/44'/145'/0'/6/0"};
    pathEl.textContent = pathMap[coinId] ? '// ' + pathMap[coinId] : '';
  }

  // Stealth code (BCH only)
  if (coinId === 'bch' && keys.stealthCode) {
    const stEl = document.getElementById('cd-recv-stealth-code');
    if (stEl) stEl.textContent = keys.stealthCode;
  }

  // Generate QR
  const c = getC(coinId);
  const qrColor = c?.color || '#000000';
  _generateQR('cd-qr-canvas', addr, qrColor);
  if (coinId === 'bch' && keys.stealthCode) {
    _generateQR('cd-qr-canvas-st', keys.stealthCode, '#BF5AF2');
  }
}

/* ── QR Code generation ── */
let _QRLib = null;
async function _generateQR(canvasId, text, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !text || text === '—' || text === 'N/A' || text === 'Loading...') return;
  try {
    if (!_QRLib) {
      const mod = await import('https://esm.sh/qrcode@1.5.4');
      _QRLib = mod.default || mod;
    }
    await _QRLib.toCanvas(canvas, text, {
      width: 200, margin: 1, errorCorrectionLevel: 'M',
      color: { dark: color || '#000000', light: '#ffffff' }
    });
  } catch (e) {
    console.warn('[wallet] QR generation failed:', e);
  }
}

/* ── Address → scriptHash (for Electrum) ── */
function _addrSH(addr) {
  try {
    const { cashAddrToHash20 } = window._v2CashAddr || {};
    if (!cashAddrToHash20) {
      // Inline: import is async, we cache it
      return null;
    }
    const h = cashAddrToHash20(addr);
    const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
    const hash = new Uint8Array(32); // placeholder — need sha256
    return null; // will use async version below
  } catch { return null; }
}

async function _addrToSH(addr) {
  const { cashAddrToHash20 } = await import('../core/cashaddr.js');
  const { sha256 } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
  const h = cashAddrToHash20(addr);
  const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
  const hash = sha256(script);
  return Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── Load transactions ── */
async function _loadTransactions(coinId) {
  const el = document.getElementById('cd-tx-list');
  if (!el) return;
  const c = getC(coinId);
  if (!c) return;
  // Show loading only if cache is empty for this coin
  const chain = coinId === 'sbch' ? 'bch' : coinId;
  let hasCachedTxs = false;
  try { const c2 = JSON.parse(localStorage.getItem('00_tx_history') || '[]'); hasCachedTxs = c2.some(t => t.chain === chain); } catch {}
  if (!hasCachedTxs) {
    el.innerHTML = '<div class="cd-tx-empty" style="display:flex;align-items:center;gap:8px;justify-content:center"><span style="display:inline-block;animation:spin .8s linear infinite">⟳</span> Loading...</div>';
  }

  try {
    const keys = auth.getKeys();
    if (!keys) { el.innerHTML = '<div class="cd-tx-empty">Not connected</div>'; return; }

    let allTxs = [];
    const chain = coinId === 'sbch' ? 'bch' : coinId;

    // 1. Read cached tx history
    try {
      const cached = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
      allTxs = cached.filter(tx => {
        if (tx.chain !== chain) return false;
        if (coinId === 'sbch' && tx.dir !== 'stealth') return false;
        if (coinId === 'bch' && tx.dir === 'stealth') return false;
        return true;
      });
    } catch {}

    // 2. Supplement with live Fulcrum history (only if cache might be stale)
    // Check cache freshness — skip heavy enrichment if scanned recently
    const cacheKey = '00_tx_scan_ts_' + chain;
    const lastScanTs = parseInt(localStorage.getItem(cacheKey) || '0');
    const scanCooldown = 60000; // 60s — don't re-scan more than once per minute
    const needsScan = (Date.now() - lastScanTs > scanCooldown);

    if (needsScan && (coinId === 'bch' || coinId === 'sbch') && window._fvCall && keys.bchAddr) {
      try {
        const sh = await _addrToSH(keys.bchAddr);
        const hist = await window._fvCall('blockchain.scripthash.get_history', [sh]) || [];
        const knownTxids = new Set(allTxs.map(t => t.txid));

        // Add missing tx (direction unknown from history alone — try to enrich)
        const missing = hist.filter(h => !knownTxids.has(h.tx_hash));
        if (missing.length > 0) {
          // Compute our P2PKH script hex
          const { cashAddrToHash20 } = await import('../core/cashaddr.js');
          const h160 = cashAddrToHash20(keys.bchAddr);
          const myScript = ['76','a9','14',...Array.from(h160, b => b.toString(16).padStart(2,'0')),'88','ac'].join('');

          // Fetch tx details (up to 30 at a time)
          for (const h of missing.slice(-30)) {
            try {
              const hex = await window._fvCall('blockchain.transaction.get', [h.tx_hash]);
              if (hex) {
                const outputs = _parseTxOutputs(hex);
                if (outputs) {
                  const myVal = outputs.filter(o => o.script === myScript).reduce((s, o) => s + o.value, 0);
                  const totalOut = outputs.reduce((s, o) => s + o.value, 0);
                  allTxs.push({
                    txid: h.tx_hash, height: h.height || 0, chain: 'bch',
                    dir: myVal > 0 ? 'in' : 'out',
                    amount: myVal > 0 ? myVal : totalOut - myVal,
                    timestamp: 0,
                  });
                  continue;
                }
              }
            } catch {}
            // Fallback: add with unknown amount
            allTxs.push({ txid: h.tx_hash, height: h.height || 0, chain: 'bch', dir: 'in', amount: 0, timestamp: 0 });
          }

          // Fetch block timestamps for tx without timestamp
          const needTs = allTxs.filter(t => t.height > 0 && !t.timestamp);
          const heights = [...new Set(needTs.map(t => t.height))].slice(0, 20);
          for (const ht of heights) {
            try {
              const header = await window._fvCall('blockchain.block.header', [ht]);
              if (header && header.length >= 152) {
                const tsHex = header.slice(136, 144);
                const ts = parseInt(tsHex.slice(6,8)+tsHex.slice(4,6)+tsHex.slice(2,4)+tsHex.slice(0,2), 16);
                for (const tx of allTxs) { if (tx.height === ht && !tx.timestamp) tx.timestamp = ts; }
              }
            } catch {}
          }

          // Save to cache for next time
          try {
            let existing = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
            const existingIds = new Set(existing.map(t => t.txid));
            const toSave = allTxs.filter(t => t.chain === 'bch' && !existingIds.has(t.txid) && t.amount > 0);
            if (toSave.length) {
              localStorage.setItem('00_tx_history', JSON.stringify(existing.concat(toSave).slice(-500)));
            }
          } catch {}
        }
        // Mark scan as done
        localStorage.setItem(cacheKey, Date.now().toString());
      } catch (e) { console.warn('[wallet] live tx enrich:', e); }
    }
    // Other chains: if cache empty, fetch live
    if (!allTxs.length && window.chainsGetHistory) {
      try {
        const { deriveAllAddresses } = await import('../core/addr-derive.js');
        const addrs = deriveAllAddresses(keys);
        const addr = addrs[coinId];
        if (addr) allTxs = await window.chainsGetHistory(coinId, addr, 100) || [];
      } catch {}
    }

    // Sort newest first
    allTxs.sort((a, b) => (b.timestamp || b.ts || 0) - (a.timestamp || a.ts || 0));

    // Total before filter
    const totalCount = allTxs.length;

    // Apply direction filter
    let filtered = allTxs;
    if (_txFilter === 'in') filtered = allTxs.filter(tx => tx.dir === 'in' || tx.dir === 'stealth' || tx.dir === 'fusion');
    else if (_txFilter === 'out') filtered = allTxs.filter(tx => tx.dir === 'out');
    console.log(`[wallet] txs: ${totalCount} total, filter=${_txFilter}, showing=${filtered.length}, dirs:`, [...new Set(allTxs.map(t=>t.dir))]);

    const filteredCount = filtered.length;

    // Page
    let txs = filtered.slice(0, _txPageSize);

    // Get tip height for confirmations
    let tipHeight = 0;
    if ((coinId === 'bch' || coinId === 'sbch') && window._fvCall) {
      try { const h = await window._fvCall('blockchain.headers.subscribe', []); tipHeight = h?.height || 0; } catch {}
    } else if (coinId === 'btc' && window._btcCall) {
      try { const h = await window._btcCall('blockchain.headers.subscribe', []); tipHeight = h?.height || 0; } catch {}
    }
    txs = txs.map(tx => ({ ...tx, confirmations: tx.height > 0 && tipHeight > 0 ? tipHeight - tx.height + 1 : 0 }));

    if (!txs.length) {
      el.innerHTML = '<div class="cd-tx-empty">No transactions yet</div>';
      return;
    }

    // Counter header
    const showing = Math.min(_txPageSize, filteredCount);
    const counterText = _txFilter === 'all'
      ? `Showing ${showing} of ${totalCount} transactions`
      : `Showing ${showing} of ${filteredCount} ${_txFilter === 'in' ? 'received' : 'sent'} (${totalCount} total)`;
    let html = `<div style="padding:8px 24px;font-size:11px;color:var(--dt-text-secondary);background:var(--dt-bg)">${counterText}</div>`;

    // Explorer URL per chain
    const explorerMap = {bch:'https://www.blockchain.com/explorer/transactions/bch/',btc:'https://www.blockchain.com/explorer/transactions/btc/',eth:'https://etherscan.io/tx/',xmr:'https://xmrchain.net/tx/',ltc:'https://litecoinspace.org/tx/',bnb:'https://bscscan.com/tx/',avax:'https://snowtrace.io/tx/',sol:'https://solscan.io/tx/',trx:'https://tronscan.org/#/transaction/',xrp:'https://xrpscan.com/tx/',xlm:'https://stellarchain.io/tx/'};
    const explorerBase = explorerMap[coinId] || explorerMap.bch;

    // Price for fiat
    const prices = state.get('prices') || {};
    const coinPrice = prices[pk(coinId)]?.price || 0;

    // Group by date
    let lastDateLabel = '';
    const now = Date.now();

    for (const tx of txs) {
      const rawTs = tx.timestamp || tx.ts || 0;
      const tsMs = rawTs > 0 ? rawTs * 1000 : now;

      // Date group header
      const groupLabel = _dateLabel(tsMs);
      if (groupLabel !== lastDateLabel) {
        html += `<div class="cd-tx-date">${groupLabel}</div>`;
        lastDateLabel = groupLabel;
      }

      const dir = tx.dir || 'in';
      const dirIcon = dir === 'stealth' ? '↓' : dir === 'in' ? '↓' : dir === 'fusion' ? '⇄' : '↑';
      const dirLabel = dir === 'stealth' ? 'Stealth' : dir === 'in' ? 'Received' : dir === 'fusion' ? 'CashFusion' : 'Sent';
      const dirClass = dir === 'stealth' ? 'stealth' : dir === 'in' ? 'in' : dir === 'fusion' ? 'fusion' : 'out';
      const sign = dir === 'out' ? '-' : '+';
      const coins = tx.amount ? tx.amount / Math.pow(10, c.dec) : 0;
      const decPlaces = (c.ticker === 'USDC' || c.ticker === 'USDT') ? 2 : 8;
      const amtStr = coins !== 0 ? sign + coins.toFixed(decPlaces) + ' ' + c.ticker : '';

      // Confirmation badge
      const conf = tx.confirmations || 0;
      let confBadge = '';
      if (!tx.height || tx.height <= 0) {
        confBadge = '<span class="cd-tx-pending">MEMPOOL</span>';
      } else if (conf >= 1 && conf <= 3) {
        confBadge = `<span style="font-size:10px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,.1);padding:2px 8px;border-radius:4px;margin-left:8px">${conf} confirmation${conf > 1 ? 's' : ''}</span>`;
      } else if (conf >= 4) {
        confBadge = '<span style="font-size:10px;font-weight:700;color:#0AC18E;background:rgba(10,193,142,.1);padding:2px 8px;border-radius:4px;margin-left:8px">CONFIRMED</span>';
      }

      // Fiat
      const usdVal = coinPrice > 0 && coins !== 0 ? Math.abs(coins) * coinPrice : 0;
      const usdStr = usdVal > 0.01 ? '≈ $' + usdVal.toFixed(2) : '';

      // Time
      const timeStr = _fmtTime(rawTs);

      // Recent highlight
      const isRecent = (now - tsMs) < 600000;
      const rowClass = 'cd-tx-row' + (isRecent ? ' cd-tx-recent' : '');

      html += `<div class="${rowClass}" onclick="window.open('${explorerBase}${tx.txid}','_blank')" style="cursor:pointer">
        <div class="cd-tx-left"><div class="cd-tx-icon ${dirClass}"><span>${dirIcon}</span></div><div>
          <div class="cd-tx-type">${dirLabel}${confBadge}</div>
          <div class="cd-tx-time">${timeStr}</div>
          <div class="cd-tx-addr">${tx.txid || '—'}</div>
        </div></div>
        <div class="cd-tx-right">
          ${amtStr ? `<div class="cd-tx-amount ${dirClass}">${amtStr}</div>` : ''}
          ${usdStr ? `<div class="cd-tx-usd">${usdStr}</div>` : ''}
        </div>
      </div>`;
    }

    // Pagination: Load more button
    if (showing < filteredCount) {
      const remaining = filteredCount - showing;
      html += `<div style="text-align:center;padding:16px">
        <button id="cd-load-more" style="padding:10px 32px;background:var(--dt-accent,#0AC18E);color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px">
          Load ${Math.min(remaining, _txPageSize)} more (${remaining} remaining)
        </button>
      </div>`;
    }

    el.innerHTML = html;

    // Bind load more
    document.getElementById('cd-load-more')?.addEventListener('click', () => {
      _txPageSize += parseInt(document.getElementById('cd-page-size')?.value || 50);
      _loadTransactions(coinId);
    });

  } catch (e) {
    console.warn('[wallet] tx load error:', e);
    el.innerHTML = '<div class="cd-tx-empty">Error loading transactions</div>';
  }
}

/* ── Prepend new tx (from balance-service) without full reload ── */
function _prependNewTxs(txs, coinId) {
  if (!txs || !txs.length) return;
  const chain = coinId === 'sbch' ? 'bch' : coinId;
  const relevant = txs.filter(tx => tx.chain === chain);
  if (!relevant.length) return;

  const txListEl = document.getElementById('cd-tx-list');
  if (!txListEl) return;

  const c = getC(coinId);
  if (!c) return;
  const prices = state.get('prices') || {};
  const coinPrice = prices[pk(coinId)]?.price || 0;

  for (const tx of relevant) {
    // Skip if already visible
    if (txListEl.querySelector(`[data-txid="${tx.txid}"]`)) continue;

    const dir = tx.dir || 'in';
    const dirIcon = dir === 'in' ? '↓' : '↑';
    const dirLabel = dir === 'in' ? 'Received' : 'Sent';
    const dirClass = dir === 'in' ? 'in' : 'out';
    const sign = dir === 'out' ? '-' : '+';
    const coins = tx.amount ? tx.amount / Math.pow(10, c.dec) : 0;
    const amtStr = coins !== 0 ? sign + coins.toFixed(8) + ' ' + c.ticker : '';
    const usdVal = coinPrice > 0 && coins !== 0 ? Math.abs(coins) * coinPrice : 0;
    const confBadge = (!tx.height || tx.height <= 0) ? '<span class="cd-tx-pending">MEMPOOL</span>' : '<span style="font-size:10px;font-weight:700;color:#0AC18E;background:rgba(10,193,142,.1);padding:2px 8px;border-radius:4px;margin-left:8px">CONFIRMED</span>';

    const row = `<div class="cd-tx-row cd-tx-recent" data-txid="${tx.txid}">
      <div class="cd-tx-left"><div class="cd-tx-icon ${dirClass}"><span>${dirIcon}</span></div><div>
        <div class="cd-tx-type">${dirLabel}${confBadge}</div>
        <div class="cd-tx-time">Just now</div>
        <div class="cd-tx-addr">${tx.txid}</div>
      </div></div>
      <div class="cd-tx-right">
        ${amtStr ? `<div class="cd-tx-amount ${dirClass}">${amtStr}</div>` : ''}
        ${usdVal > 0.01 ? `<div class="cd-tx-usd">≈ $${usdVal.toFixed(2)}</div>` : ''}
      </div>
    </div>`;

    const firstRow = txListEl.querySelector('.cd-tx-row');
    if (firstRow) firstRow.insertAdjacentHTML('beforebegin', row);
    else txListEl.insertAdjacentHTML('afterbegin', row);
  }
}

/* ── Send BCH transaction ── */
let _sending = false;
async function _doSendBch(coinId) {
  if (_sending) return;
  const c = getC(coinId);
  if (!c) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const addr = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!addr) { if (errEl) errEl.textContent = 'Recipient address required'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  const amtSats = Math.round(amt * 1e8);
  if (amtSats < 546) { if (errEl) errEl.textContent = 'Minimum 546 sats (dust limit)'; return; }

  // Get fee rate from selected option
  const activeFee = document.querySelector('.cd-fee-opt.active');
  const feeRate = activeFee ? parseFloat(activeFee.dataset.rate) || 1 : 1;

  // Get keys
  const keys = auth.getKeys();
  if (!keys) { if (errEl) errEl.textContent = 'Wallet not unlocked'; return; }

  // Get UTXOs — from HD scanner addresses or single address
  let utxos = [];
  const hdAddrs = state.get('hdAddresses') || [];
  if (hdAddrs.length > 0 && window._fvCall) {
    const { cashAddrToHash20 } = await import('../core/cashaddr.js');
    const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    for (const hd of hdAddrs) {
      try {
        const h = cashAddrToHash20(hd.addr);
        const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
        const hash = sha(script);
        const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
        const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
        for (const u of raw) utxos.push({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, height: u.height, addr: hd.addr });
      } catch {}
    }
  }
  if (!utxos.length) {
    // Fallback: single address
    try {
      const { cashAddrToHash20 } = await import('../core/cashaddr.js');
      const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
      const h = cashAddrToHash20(keys.bchAddr);
      const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
      const hash = sha(script);
      const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
      const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
      utxos = raw.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, height: u.height }));
    } catch {}
  }
  if (!utxos.length) { if (errEl) errEl.textContent = 'No UTXOs — refresh balance'; return; }

  _sending = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending...'; btn.style.opacity = '0.7'; }

  try {
    const { sendBch } = await import('../core/send-bch.js');
    const { secp256k1 } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
    const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    const { ripemd160: rip } = await import('https://esm.sh/@noble/hashes@1.7.1/ripemd160');

    // HD key getter
    let hdGetKey = null;
    try {
      const { getPrivForAddr } = await import('../services/hd-scanner.js');
      hdGetKey = getPrivForAddr;
    } catch {}

    // Change goes to HD change address or main address
    const changeAddr = state.get('hdChangeAddr');
    let changeHash160;
    if (changeAddr) {
      const { cashAddrToHash20 } = await import('../core/cashaddr.js');
      changeHash160 = cashAddrToHash20(changeAddr);
    } else {
      changeHash160 = rip(sha(secp256k1.getPublicKey(keys.privKey, true)));
    }

    const result = await sendBch({
      toAddress: addr,
      amountSats: amtSats,
      feeRate,
      utxos,
      privKey: keys.privKey,
      pubKey: secp256k1.getPublicKey(keys.privKey, true),
      changeHash160,
      hdGetKey,
    });

    // Success — save to tx history
    try {
      let hist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
      hist.unshift({ txid: result.txid, chain: 'bch', dir: 'out', amount: amtSats, height: 0, timestamp: Math.floor(Date.now() / 1000) });
      localStorage.setItem('00_tx_history', JSON.stringify(hist.slice(0, 500)));
    } catch {}

    if (btn) { btn.textContent = '✓ SENT'; btn.style.background = 'var(--dt-accent)'; }

    // Prepend the new tx to the visible list (no full reload)
    const txListEl = document.getElementById('cd-tx-list');
    if (txListEl) {
      const prices = state.get('prices') || {};
      const coinPrice = prices[pk(coinId)]?.price || 0;
      const usdVal = coinPrice > 0 ? (amtSats / 1e8) * coinPrice : 0;
      const newRow = `<div class="cd-tx-row cd-tx-recent">
        <div class="cd-tx-left"><div class="cd-tx-icon out"><span>↑</span></div><div>
          <div class="cd-tx-type">Sent<span class="cd-tx-pending">MEMPOOL</span></div>
          <div class="cd-tx-time">Just now</div>
          <div class="cd-tx-addr">${result.txid}</div>
        </div></div>
        <div class="cd-tx-right">
          <div class="cd-tx-amount out">-${(amtSats / 1e8).toFixed(8)} ${c.ticker}</div>
          ${usdVal > 0.01 ? `<div class="cd-tx-usd">≈ $${usdVal.toFixed(2)}</div>` : ''}
        </div>
      </div>`;
      // Insert after the counter/date header
      const firstRow = txListEl.querySelector('.cd-tx-row');
      if (firstRow) firstRow.insertAdjacentHTML('beforebegin', newRow);
      else txListEl.insertAdjacentHTML('afterbegin', newRow);
    }

    // Refresh balance after 2s (no tx reload — already prepended)
    setTimeout(async () => {
      try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
    }, 2000);

    // Close modal after 2s
    setTimeout(() => {
      document.getElementById('cd-send-modal')?.classList.remove('open');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; btn.style.background = ''; }
      _sending = false;
    }, 2000);

  } catch (e) {
    if (errEl) errEl.textContent = 'Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; btn.style.opacity = ''; }
    _sending = false;
  }
}

/* ── Parse TX hex → outputs [{value, script}] ── */
function _parseTxOutputs(hex) {
  try {
    const b = []; for (let i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16));
    let p = 0;
    const rB = n => { const s = b.slice(p, p+n); p+=n; return s; };
    const rLE = n => { let r = 0; for(let i=0;i<n;i++) r |= b[p+i] << (i*8); p+=n; return r >>> 0; };
    const rVI = () => { const f = b[p++]; if(f<0xfd)return f; if(f===0xfd)return rLE(2); if(f===0xfe)return rLE(4); return rLE(8); };
    const rLE8 = () => { let lo = rLE(4), hi = rLE(4); return hi * 0x100000000 + lo; };
    rLE(4); // version
    const inCount = rVI();
    for (let i=0;i<inCount;i++) { rB(32); rLE(4); rB(rVI()); rLE(4); }
    const outCount = rVI();
    const outputs = [];
    for (let i=0;i<outCount;i++) {
      const value = rLE8();
      const scriptLen = rVI();
      const script = b.slice(p, p+scriptLen).map(x => x.toString(16).padStart(2,'0')).join('');
      p += scriptLen;
      outputs.push({ value, script });
    }
    return outputs;
  } catch { return null; }
}

/* ── Load UTXOs ── */
async function _loadUtxos(coinId) {
  const el = document.getElementById('cd-utxo-list');
  if (!el) return;
  const c = getC(coinId);
  const noUtxoChains = ['eth','usdc','usdt','sbch','bnb','avax','sol','trx','xrp','xlm','usdc_bsc','usdt_bsc','usdc_avax','usdt_avax','usdc_sol','usdt_sol','usdt_trx','rlusd_xrp'];
  if (noUtxoChains.includes(coinId)) {
    el.innerHTML = `<div class="cd-tx-empty">${c?.name || coinId} does not use UTXOs</div>`;
    return;
  }

  const keys = auth.getKeys();
  if (!keys) { el.innerHTML = '<div class="cd-tx-empty">Not connected</div>'; return; }

  try {
    let utxos = [];

    // BCH: fetch from ALL HD addresses (receive + change)
    if (coinId === 'bch' && window._fvCall) {
      const hdAddrs = state.get('hdAddresses') || [];
      if (hdAddrs.length > 0) {
        // Fetch UTXOs for each HD address
        const { cashAddrToHash20 } = await import('../core/cashaddr.js');
        const { sha256 } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
        for (const hd of hdAddrs) {
          try {
            const h = cashAddrToHash20(hd.addr);
            const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
            const hash = sha256(script);
            const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
            const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
            for (const u of raw) {
              utxos.push({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, height: u.height, addr: hd.addr, branch: hd.branch, path: hd.path });
            }
          } catch {}
        }
      } else {
        // Fallback: single address
        const sh = await _addrToSH(keys.bchAddr);
        const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
        utxos = raw.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, height: u.height, branch: 'receive' }));
      }
    }
    // BTC
    else if (coinId === 'btc' && window._btcCall) {
      const { deriveAllAddresses } = await import('../core/addr-derive.js');
      const addrs = deriveAllAddresses(keys);
      if (addrs.btc) {
        try {
          const { base58Decode } = await import('../core/cashaddr.js');
          const { sha256 } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
          const decoded = base58Decode(addrs.btc);
          const script = new Uint8Array([0x76, 0xa9, 0x14, ...decoded.slice(1), 0x88, 0xac]);
          const hash = sha256(script);
          const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
          const raw = await window._btcCall('blockchain.scripthash.listunspent', [sh]) || [];
          utxos = raw.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, height: u.height, branch: 'receive' }));
        } catch {}
      }
    }

    if (!utxos.length) {
      el.innerHTML = '<div class="cd-tx-empty">No UTXOs found</div>';
      return;
    }

    // Separate receive vs change
    const receiveUtxos = utxos.filter(u => u.branch === 'receive' || !u.branch).sort((a, b) => b.value - a.value);
    const changeUtxos = utxos.filter(u => u.branch === 'change').sort((a, b) => b.value - a.value);

    const prices = state.get('prices') || {};
    const coinPrice = prices[pk(coinId)]?.price || 0;
    const explorer = coinId === 'btc' ? 'https://www.blockchain.com/explorer/transactions/btc/' : 'https://www.blockchain.com/explorer/transactions/bch/';
    const minMixSats = 3000;

    function renderSection(title, icon, color, utxoList) {
      if (!utxoList.length) return '';
      const totalSats = utxoList.reduce((s, u) => s + u.value, 0);
      const totalCoins = totalSats / Math.pow(10, c.dec);
      const totalUsd = coinPrice > 0 ? totalCoins * coinPrice : 0;

      let h = `<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid var(--dt-border);background:var(--dt-bg)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="color:${color};font-size:16px">${icon}</span>
          <span style="font-size:14px;font-weight:700;color:var(--dt-text);letter-spacing:.5px">${title}</span>
          <span style="font-size:12px;font-weight:600;color:${color};background:${color}18;padding:2px 8px;border-radius:4px">${utxoList.length}</span>
        </div>
        <div style="font-size:14px;font-weight:700;color:var(--dt-text)">${totalCoins.toFixed(8)} ${c.ticker}${totalUsd > 0.01 ? ` <span style="font-size:12px;color:var(--dt-text-secondary);font-weight:500">≈ $${totalUsd.toFixed(2)}</span>` : ''}</div>
      </div>`;

      for (const u of utxoList) {
        const val = (u.value / Math.pow(10, c.dec)).toFixed(8);
        const usd = coinPrice > 0 ? (u.value / Math.pow(10, c.dec) * coinPrice).toFixed(2) : '';
        const isMix = coinId === 'bch' && u.value >= minMixSats;
        const addrDisplay = u.addr || keys.bchAddr || '';

        h += `<div onclick="window.open('${explorer}${u.txid}','_blank')" style="padding:18px 24px;border-bottom:1px solid var(--dt-border);cursor:pointer;transition:background .12s" onmouseover="this.style.background='var(--dt-sidebar-hover)'" onmouseout="this.style.background=''">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="flex:1;min-width:0">
              <div style="font-family:'SF Mono',monospace;font-size:13px;color:var(--dt-text);margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${addrDisplay}</div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-family:'SF Mono',monospace;font-size:11px;color:var(--dt-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:500px">${u.txid}</span>
                <span style="font-size:10px;font-weight:600;color:var(--dt-text-secondary);background:var(--dt-bg);padding:1px 6px;border-radius:3px;flex-shrink:0">#${u.vout}</span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;margin-left:24px">
              <div style="font-size:15px;font-weight:700;color:var(--dt-text)">${val} ${c.ticker}</div>
              ${usd ? `<div style="font-size:12px;color:var(--dt-text-secondary)">≈ $${usd}</div>` : ''}
              ${isMix ? '<div style="font-size:10px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,.1);padding:2px 8px;border-radius:4px;margin-top:4px;display:inline-block">MIX CANDIDATE</div>' : ''}
            </div>
          </div>
        </div>`;
      }
      return h;
    }

    let html = '';
    html += renderSection('OUTPUTS', '↓', '#0AC18E', receiveUtxos);
    html += renderSection('CHANGE', '↻', '#627EEA', changeUtxos);

    if (!html) html = '<div class="cd-tx-empty">No UTXOs found</div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div class="cd-tx-empty">Error loading UTXOs</div>';
  }
}

/* ── Format timestamp (row-level: "Yesterday 02:57") ── */
function _fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = now - d;
  const hm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  const today = new Date(); today.setHours(0,0,0,0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.getTime() >= today.getTime()) return 'Today ' + hm;
  if (d.getTime() >= yest.getTime()) return 'Yesterday ' + hm;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + hm;
}

/* ── Date group label (section header: "Today", "Yesterday", "Mar 24, 2025") ── */
function _dateLabel(tsMs) {
  const today = new Date(); today.setHours(0,0,0,0);
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (tsMs >= today.getTime()) return 'Today';
  if (tsMs >= yest.getTime()) return 'Yesterday';
  return new Date(tsMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Load price chart ── */
async function _loadChart(coinId, days) {
  const lineEl = document.getElementById('cd-line');
  const fillEl = document.getElementById('cd-fill');
  if (!lineEl || !fillEl) return;
  const ticker = getC(coinId)?.ticker;
  if (!ticker || ticker === 'USDC' || ticker === 'USDT' || ticker === 'RLUSD') return;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${_cgId(coinId)}/market_chart?vs_currency=usd&days=${days}`);
    if (!r.ok) return;
    const data = await r.json();
    const pts = data.prices || [];
    if (!pts.length) return;
    const minP = Math.min(...pts.map(p => p[1]));
    const maxP = Math.max(...pts.map(p => p[1]));
    const range = maxP - minP || 1;
    const W = 800, H = 200;
    let line = '', fill = `M0,${H} `;
    pts.forEach((pt, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = H - ((pt[1] - minP) / range) * (H - 10);
      line += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      fill += 'L' + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    fill += `L${W},${H} Z`;
    lineEl.setAttribute('d', line);
    fillEl.setAttribute('d', fill);
  } catch {}
}
function _cgId(id) {
  const map = {bch:'bitcoin-cash',btc:'bitcoin',eth:'ethereum',xmr:'monero',ltc:'litecoin',bnb:'binancecoin',avax:'avalanche-2',sol:'solana',trx:'tron',xrp:'ripple',xlm:'stellar'};
  return map[id] || id;
}

/* ── Update balance in coin detail ── */
function _updateCoinDetail() {
  if (!_currentCoin) return;
  const c = getC(_currentCoin);
  if (!c) return;
  const balances = state.get('balances') || {};
  const prices = state.get('prices') || {};
  const bal = balances[_currentCoin];
  const p = prices[pk(_currentCoin)]?.price || 0;
  const n = (typeof bal === 'string' ? parseFloat(bal) : bal) || 0;
  const v = n / Math.pow(10, c.dec);
  const el = document.getElementById('cd-bal-amount');
  if (el) el.textContent = (v === 0 ? '0' : v.toFixed(c.dec > 6 ? 8 : Math.min(c.dec, 4))) + ' ' + c.ticker;
  const f = document.getElementById('cd-bal-fiat');
  if (f) f.textContent = fmtFiat(bal, c.dec, p);
  const pr = document.getElementById('cd-bal-price');
  if (pr) pr.textContent = p ? '$' + p.toLocaleString('en', {maximumFractionDigits:2}) : '';
}

/* ══════════════════════════════════════════
   LIFECYCLE
   ══════════════════════════════════════════ */
export function mount(container, subRoute) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  if (subRoute) {
    renderCoinDetail(subRoute);
    _unsubs.push(state.subscribe('balances', _updateCoinDetail));
    _unsubs.push(state.subscribe('prices', _updateCoinDetail));
    _unsubs.push(state.subscribe('newTxs', (txs) => _prependNewTxs(txs, subRoute)));
  } else {
    renderCoinList();
    _unsubs.push(state.subscribe('balances', renderCoinList));
    _unsubs.push(state.subscribe('prices', renderCoinList));
  }
}

export function onSubRoute(subPath) {
  _unsubs.forEach(fn => fn()); _unsubs = [];
  if (subPath) {
    renderCoinDetail(subPath);
    _unsubs.push(state.subscribe('balances', _updateCoinDetail));
    _unsubs.push(state.subscribe('prices', _updateCoinDetail));
    _unsubs.push(state.subscribe('txHistoryUpdated', () => _loadTransactions(subPath)));
  } else {
    _currentCoin = null;
    renderCoinList();
    _unsubs.push(state.subscribe('balances', renderCoinList));
    _unsubs.push(state.subscribe('prices', renderCoinList));
  }
}

export function unmount() {
  _unsubs.forEach(fn => fn()); _unsubs = [];
  _currentCoin = null;
  if (_container) _container.innerHTML = '';
  _container = null;
}
