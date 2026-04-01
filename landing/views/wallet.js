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
let _fusionTxMap = {};  // txid → { fusion, fusionOut } tx entries

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
  { id:'matic', chain:'POLYGON',            name:'Polygon',             ticker:'POL',  dec:18, color:'#8247E5', icon:'https://assets.coingecko.com/coins/images/4713/small/polygon.png',iconType:'img', type:'chain' },
  { id:'usdc_polygon', chain:'',          name:'USDC',                ticker:'USDC', dec:6,  color:'#2775CA', icon:'icons/usdc.png', iconType:'img', type:'token' },
  { id:'usdce_polygon', chain:'',         name:'USDC.e',              ticker:'USDC.e',dec:6, color:'#2775CA', icon:'icons/usdc.png', iconType:'img', type:'token' },
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
  if (id === 'matic') return 'matic';
  if (id === 'usdce_polygon') return 'usdc';
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

  const stealthBar = (coinId === 'bch' || coinId === 'sbch') ? `
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

  const chainColor = c.color || 'var(--dt-accent,#0AC18E)';
  _container.innerHTML = `
  <style>@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
  .v2-coin-detail,.v2-coin-detail *,.cd-modal-overlay,.cd-modal-overlay *{--dt-accent:${chainColor};--dt-accent-soft:${chainColor}14;--dt-accent-border:${chainColor}55;--dt-accent-bg:${chainColor};--dt-accent-text:#fff}
  .v2-coin-detail .cd-primary{background:${chainColor}!important;border-color:${chainColor}!important}
  .v2-coin-detail .cd-copy-btn{background:${chainColor}!important;border-color:${chainColor}!important}
  </style>
  <div style="padding:24px 40px 40px" class="v2-coin-detail">
    <div class="cd-head">
      <div class="cd-head-left">
        <button onclick="window.location.hash='#/wallet'" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:var(--dt-surface,#fff);color:var(--dt-text,#1a1a2e);font-size:18px;cursor:pointer;transition:all .15s;flex-shrink:0" title="Back to wallet">‹</button>
        ${ico}<div><div class="cd-chain">${c.chain || c.name}</div><div class="cd-name">${c.name}</div></div>
      </div>
      <div class="cd-actions">
        ${coinId === 'sbch' ? '<button class="cd-action-btn" id="cd-scan-stealth-btn" style="border-color:#7c3aed;color:#7c3aed"><span>🔍</span> Scan</button>' : ''}
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
          <button onclick="this.style.animation='spin .8s ease';this.style.opacity='1';import('../services/balance-service.js').then(m=>m.refreshNow()).finally(()=>{setTimeout(()=>{this.style.animation='';this.style.opacity='.4'},1000)})" style="background:none;border:none;cursor:pointer;font-size:36px;opacity:.4;padding:8px;transition:opacity .3s" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.4'" title="Refresh balances">⟳</button>
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
          ${['bch','btc','ltc','sbch'].includes(coinId) ? '<button class="cd-tx-tab" data-tab="utxos" id="tab-utxos">UTXOs</button>' : ''}
          ${(coinId === 'bch' || coinId === 'sbch') ? '<button class="cd-tx-tab" data-tab="stealth" id="tab-stealth">Stealth</button>' : ''}
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
      ${(coinId === 'bch' || coinId === 'sbch') ? `<div id="cd-stealth-panel" style="display:none;padding:20px">
        <div style="margin-bottom:16px">
          <div style="font-size:13px;font-weight:600;color:var(--dt-text);margin-bottom:4px">🔒 Stealth Scanner</div>
          <div style="font-size:11px;color:var(--dt-text-secondary)">Scan the blockchain for stealth payments sent to your stealth address</div>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px">
          <div style="flex:1">
            <label style="font-size:10px;font-weight:600;color:var(--dt-text-secondary);text-transform:uppercase">From Block</label>
            <input id="cd-stealth-from" type="number" value="0" style="width:100%;padding:8px;border:1px solid var(--dt-border,#e2e8f0);border-radius:8px;font-size:12px;box-sizing:border-box">
          </div>
          <div style="flex:1">
            <label style="font-size:10px;font-weight:600;color:var(--dt-text-secondary);text-transform:uppercase">To Block</label>
            <input id="cd-stealth-to" type="number" placeholder="latest" style="width:100%;padding:8px;border:1px solid var(--dt-border,#e2e8f0);border-radius:8px;font-size:12px;box-sizing:border-box">
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button id="cd-stealth-scan" style="flex:1;padding:10px;border:none;border-radius:8px;background:var(--dt-accent,#0AC18E);color:#fff;font-weight:600;cursor:pointer;font-size:13px">🔍 Scan Range</button>
          <button id="cd-stealth-quick" style="flex:1;padding:10px;border:1px solid var(--dt-border,#e2e8f0);border-radius:8px;background:transparent;cursor:pointer;font-size:13px;font-weight:600;color:var(--dt-text)">⚡ Quick Scan (last 100)</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
          <input id="cd-stealth-txid" type="text" placeholder="Paste txid to check..." style="flex:1;padding:8px 10px;border:1px solid var(--dt-border,#e2e8f0);border-radius:8px;font-size:11px;font-family:'SF Mono',monospace;box-sizing:border-box">
          <button id="cd-stealth-check-tx" style="padding:10px 16px;border:none;border-radius:8px;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer;font-size:12px;white-space:nowrap">🔎 Check TX</button>
        </div>
        <div id="cd-stealth-status" style="font-size:12px;color:var(--dt-text-secondary);margin-bottom:12px"></div>
        <div id="cd-stealth-results" style="font-size:12px"></div>
      </div>` : ''}
    </div>

    <!-- Send Modal -->
    <div class="cd-modal-overlay" id="cd-send-modal" onclick="if(event.target===this)this.classList.remove('open')">
      <div class="cd-modal">
        <div class="cd-modal-header"><span>Send</span><div class="cd-modal-close" onclick="document.getElementById('cd-send-modal').classList.remove('open')">✕</div></div>
        ${(coinId === 'bch' || coinId === 'sbch') ? `<div class="cd-send-mode" id="cd-send-mode">
          <button class="cd-send-mode-btn active" data-mode="normal" id="send-mode-normal">Normal</button>
          <button class="cd-send-mode-btn" data-mode="stealth" id="send-mode-stealth">Stealth</button>
        </div>` : ''}
        <!-- Normal send -->
        <div id="cd-send-normal" style="display:flex;flex-direction:column;gap:16px">
          <div><div class="cd-form-lbl">RECIPIENT ADDRESS</div><input class="cd-form-input" id="cd-send-addr" placeholder="${['eth','matic','bnb','avax','usdc_polygon','usdce_polygon','usdc_eth','usdt_eth','usdc_bsc','usdt_bsc'].includes(coinId) ? '0x...' : coinId === 'sol' ? 'So1...' : coinId === 'xrp' ? 'r...' : coinId === 'trx' ? 'T...' : coinId === 'xlm' ? 'G...' : coinId === 'btc' ? '1... or bc1...' : coinId === 'ltc' ? 'L... or ltc1...' : 'bitcoincash:q...'}"></div>
          <div><div class="cd-form-lbl">AMOUNT (${c.ticker})</div><div class="cd-amount-wrap"><input class="cd-form-input" id="cd-send-amount" type="number" step="${c.dec <= 8 ? '0.00000001' : '0.000001'}" min="0" placeholder="${c.dec <= 8 ? '0.00000000' : '0.000000'}"><div class="cd-max-btn" id="cd-max-btn">MAX</div></div></div>
          ${coinId === 'xlm' ? '<div><div class="cd-form-lbl">MEMO <span style="opacity:.5;font-weight:400">(optional)</span></div><input class="cd-form-input" id="cd-send-memo" placeholder="Text or numeric memo"></div>' : ''}
          ${coinId === 'xrp' || coinId === 'rlusd_xrp' ? '<div><div class="cd-form-lbl">DESTINATION TAG <span style="opacity:.5;font-weight:400">(optional)</span></div><input class="cd-form-input" id="cd-send-memo" type="number" placeholder="Numeric tag (e.g. 123456)"></div>' : ''}
          ${(coinId === 'bch' || coinId === 'btc' || coinId === 'ltc') ? `<div><div class="cd-form-lbl">FEE RATE (SAT/BYTE)</div>
            <div class="cd-fee-row">
              <div class="cd-fee-opt active" data-rate="1">LOW<br><span style="opacity:.6">1 sat/B</span></div>
              <div class="cd-fee-opt" data-rate="1.5">NORMAL<br><span style="opacity:.6">1.5 sat/B</span></div>
              <div class="cd-fee-opt" data-rate="2">HIGH<br><span style="opacity:.6">2 sat/B</span></div>
            </div>
          </div>
          <div>
            <div class="cd-form-lbl" style="display:flex;justify-content:space-between;align-items:center">
              COIN CONTROL
              <label style="font-size:11px;font-weight:400;display:flex;align-items:center;gap:4px;cursor:pointer">
                <input type="checkbox" id="cd-coincontrol-toggle" style="accent-color:${chainColor}"> Select UTXOs manually
              </label>
            </div>
            <div id="cd-coincontrol-list" style="display:none;max-height:200px;overflow-y:auto;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;padding:8px;margin-top:6px">
              <div style="font-size:11px;color:var(--dt-text-secondary,#64748b);text-align:center;padding:8px">Loading UTXOs...</div>
            </div>
          </div>` : ''}
          <div class="cd-send-summary" id="cd-send-summary" style="display:none"></div>
          <div><div class="cd-form-lbl">CONFIRM PASSWORD</div><input class="cd-form-input" id="cd-send-pass" type="password" placeholder="Enter your password to confirm"></div>
          <div class="cd-send-error" id="cd-send-error"></div>
          <button class="cd-broadcast-btn" id="cd-broadcast-btn" style="background:${chainColor}">⚡ BROADCAST →</button>
        </div>
        <!-- Stealth send (BCH only) -->
        ${(coinId === 'bch' || coinId === 'sbch') ? `<div id="cd-send-stealth" style="display:none;flex-direction:column;gap:16px">
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
        <!-- Normal receive (hidden on sbch — stealth only) -->
        <div id="cd-recv-normal" ${coinId === 'sbch' ? 'style="display:none"' : ''}>
          <div class="cd-receive-label">YOUR ${c.ticker} ADDRESS</div>
          <div class="cd-qr-wrap"><canvas id="cd-qr-canvas" width="200" height="200"></canvas></div>
          <div class="cd-addr-display" id="cd-recv-addr" style="font-family:'SF Mono','Fira Code',monospace;font-size:11px;font-weight:500;letter-spacing:.3px;word-break:break-all;line-height:1.6">Loading...</div>
          <div class="cd-copy-row">
            <button class="cd-copy-btn" id="cd-copy-full" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">📋 COPY FULL</button>
            <button class="cd-copy-btn" id="cd-copy-short" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">COPY SHORT</button>
          </div>
          <div class="cd-path-info" id="cd-path-info"></div>
        </div>
        <!-- Stealth receive -->
        ${(coinId === 'bch' || coinId === 'sbch') ? `<div id="cd-recv-stealth" style="${coinId === 'sbch' ? '' : 'display:none'}">
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

  // Bind chart period buttons
  document.querySelectorAll('.cd-period').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cd-period').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = btn.dataset.days === 'max' ? 'max' : parseInt(btn.dataset.days);
      _loadChart(coinId, days);
    });
  });

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

  // Bind tab switching (Transactions / UTXOs / Stealth)
  document.querySelectorAll('.cd-tx-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cd-tx-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      const txList = document.getElementById('cd-tx-list');
      const utxoList = document.getElementById('cd-utxo-list');
      const stealthPanel = document.getElementById('cd-stealth-panel');
      const controls = document.getElementById('cd-tx-controls');
      if (txList) txList.style.display = which === 'txs' ? '' : 'none';
      if (utxoList) utxoList.style.display = which === 'utxos' ? '' : 'none';
      if (stealthPanel) stealthPanel.style.display = which === 'stealth' ? '' : 'none';
      if (controls) controls.style.display = which === 'txs' ? '' : 'none';
      if (which === 'utxos') _loadUtxos(coinId);
    });
  });

  // Bind stealth scan buttons
  document.getElementById('cd-stealth-scan')?.addEventListener('click', () => _doStealthScan(coinId, false));
  document.getElementById('cd-stealth-quick')?.addEventListener('click', () => _doStealthScan(coinId, true));

  // Bind SBCH scan button (header action)
  document.getElementById('cd-scan-stealth-btn')?.addEventListener('click', () => {
    const stealthTab = document.getElementById('tab-stealth');
    if (stealthTab) { stealthTab.click(); }
    _doStealthScan(coinId === 'sbch' ? 'sbch' : 'bch', true);
  });

  // Bind Check TX button
  document.getElementById('cd-stealth-check-tx')?.addEventListener('click', () => _doStealthCheckTx(coinId));

  // Bind CoinControl toggle
  document.getElementById('cd-coincontrol-toggle')?.addEventListener('change', (e) => {
    const list = document.getElementById('cd-coincontrol-list');
    if (!list) return;
    list.style.display = e.target.checked ? 'block' : 'none';
    if (e.target.checked) _populateCoinControl(coinId);
  });

  // Bind BROADCAST button (normal send)
  const evmChainIds = ['eth','matic','bnb','avax','usdc_polygon','usdce_polygon','usdc_eth','usdt_eth','usdc_bsc','usdt_bsc','usdt_avax','usdc_avax'];
  if (evmChainIds.includes(coinId)) {
    document.getElementById('cd-broadcast-btn')?.addEventListener('click', () => _doSendEvm(coinId));
  } else if (coinId === 'btc' || coinId === 'ltc') {
    document.getElementById('cd-broadcast-btn')?.addEventListener('click', () => _doSendLegacy(coinId));
  } else if (coinId === 'trx' || coinId === 'usdt_trx') {
    document.getElementById('cd-broadcast-btn')?.addEventListener('click', () => _doSendTrx(coinId));
  } else if (coinId === 'xlm') {
    document.getElementById('cd-broadcast-btn')?.addEventListener('click', () => _doSendXlm(coinId));
  } else if (coinId === 'xrp' || coinId === 'rlusd_xrp') {
    document.getElementById('cd-broadcast-btn')?.addEventListener('click', () => _doSendXrp(coinId));
  } else if (coinId === 'sol' || coinId === 'usdc_sol' || coinId === 'usdt_sol') {
    document.getElementById('cd-broadcast-btn')?.addEventListener('click', () => _doSendSol(coinId));
  } else {
    document.getElementById('cd-broadcast-btn')?.addEventListener('click', () => _doSendBch(coinId));
  }

  // Bind STEALTH SEND button
  document.getElementById('cd-stealth-btn')?.addEventListener('click', () => _doStealthSend(coinId));

  // Bind MAX buttons (deduct fee for send-all)
  document.getElementById('cd-max-btn')?.addEventListener('click', async () => {
    const amtEl = document.getElementById('cd-send-amount');
    if (!amtEl) return;
    const c = getC(coinId);
    const evmNative = ['eth', 'matic', 'bnb', 'avax'];
    const evmTokens = ['usdc_polygon', 'usdce_polygon', 'usdc_eth', 'usdt_eth', 'usdc_bsc', 'usdt_bsc', 'usdt_avax', 'usdc_avax'];

    if (evmTokens.includes(coinId)) {
      // Token MAX = 100% of balance (gas paid in native token)
      try {
        const polyTx = await import('../core/polygon-tx.js');
        const addrs = state.get('addresses') || {};
        const addr = addrs[coinId] || addrs.eth;
        const tokenMap = {
          usdc_polygon: polyTx.CONTRACTS.USDC,
          usdce_polygon: polyTx.CONTRACTS.USDCE,
          usdc_eth: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          usdt_eth: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          usdc_bsc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
          usdt_bsc: '0x55d398326f99059fF775485246999027B3197955',
        };
        const token = tokenMap[coinId];
        if (token && addr) {
          const bal = await polyTx.checkBalance(token, addr);
          amtEl.value = (Number(bal) / Math.pow(10, c.dec)).toFixed(c.dec <= 6 ? 2 : 6);
        }
      } catch { /* fallback to stored balance */
        const balances = state.get('balances') || {};
        amtEl.value = (Number(balances[coinId] || 0) / Math.pow(10, c.dec)).toFixed(c.dec <= 6 ? 2 : 6);
      }
    } else if (evmNative.includes(coinId)) {
      // Native MAX = balance - gas estimate (~21000 * gasPrice)
      try {
        const addrs = state.get('addresses') || {};
        const addr = addrs[coinId] || addrs.eth;
        if (addr) {
          // Use chain-specific RPC
          const rpcMap = { matic: '/polygon-rpc/', eth: 'https://ethereum-rpc.publicnode.com', bnb: 'https://bsc-rpc.publicnode.com', avax: '/avax-rpc/' };
          const rpcUrl = rpcMap[coinId] || rpcMap.matic;
          const _rpc = async (method, params = []) => {
            const r = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
            const j = await r.json(); return j.result;
          };
          const balHex = await _rpc('eth_getBalance', [addr, 'latest']);
          const bal = BigInt(balHex || '0x0');
          const gasPrice = BigInt(await _rpc('eth_gasPrice') || '0x0');
          const gasCost = gasPrice * 21000n * 2n; // 2x buffer (signAndSend applies 1.5x on gasPrice)
          const maxWei = bal > gasCost ? bal - gasCost : 0n;
          amtEl.value = (Number(maxWei) / 1e18).toFixed(6);
        }
      } catch {
        const balances = state.get('balances') || {};
        amtEl.value = (Number(balances[coinId] || 0) / 1e18).toFixed(6);
      }
    } else if (coinId === 'trx' || coinId === 'usdt_trx') {
      // TRX: balance from state (in sun, 6 decimals), reserve 1 TRX for bandwidth fees
      const balances = state.get('balances') || {};
      const bal = Number(balances[coinId] || 0);
      const reserve = coinId === 'trx' ? 1_000_000 : 0; // 1 TRX = 1,000,000 sun
      const max = Math.max(0, bal - reserve);
      amtEl.value = (max / 1e6).toFixed(6);
    } else if (coinId === 'xlm') {
      // XLM: balance from state (in stroops, 7 decimals) minus base reserve
      const balances = state.get('balances') || {};
      const bal = Number(balances[coinId] || 0);
      const reserve = 1.5 * 1e7; // 1.5 XLM base reserve
      const maxStroops = Math.max(0, bal - reserve - 100); // minus fee
      amtEl.value = (maxStroops / 1e7).toFixed(7);
    } else if (coinId === 'xrp') {
      // XRP: balance in drops (6 decimals) minus 10 XRP reserve + fee
      const balances = state.get('balances') || {};
      const bal = Number(balances[coinId] || 0);
      const reserve = 10 * 1e6; // 10 XRP base reserve
      const maxDrops = Math.max(0, bal - reserve - 12); // minus 12 drops fee
      amtEl.value = (maxDrops / 1e6).toFixed(6);
    } else if (coinId === 'sol') {
      // SOL: balance in lamports (9 decimals) minus standard fee
      const balances = state.get('balances') || {};
      const bal = Number(balances[coinId] || 0);
      const fee = 5000; // 5000 lamports standard fee
      const maxLamports = Math.max(0, bal - fee);
      amtEl.value = (maxLamports / 1e9).toFixed(9);
    } else if (coinId === 'sbch') {
      // Stealth BCH: use stealth UTXOs only
      try {
        const { loadStealthUtxos } = await import('../core/stealth.js');
        const { cashAddrToHash20 } = await import('../core/cashaddr.js');
        const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
        const saved = loadStealthUtxos();
        let totalSats = 0, nUtxos = 0;
        for (const su of saved) {
          if (!su.addr) continue;
          try {
            const h = cashAddrToHash20(su.addr);
            const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
            const hash = sha(script);
            const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
            const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
            for (const u of raw) { totalSats += u.value; nUtxos++; }
          } catch {}
        }
        const fee = Math.ceil((10 + Math.max(1, nUtxos) * 148 + 34) * 1);
        const maxSats = Math.max(0, totalSats - fee);
        amtEl.value = (maxSats / 1e8).toFixed(8);
      } catch {}
    } else {
      // UTXO chains (BCH, BTC, LTC)
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
      const activeFee = document.querySelector('.cd-fee-opt.active');
      const feeRate = activeFee ? parseFloat(activeFee.dataset.rate) || 1 : 1;
      const fee = Math.ceil((10 + nUtxos * 148 + 34) * feeRate);
      const maxSats = Math.max(0, totalSats - fee);
      amtEl.value = (maxSats / 1e8).toFixed(8);
    }
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
  if (coinId === 'sbch') {
    addr = keys.stealthCode || 'No stealth code — HD wallet required';
  } else if (coinId === 'bch') {
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

  // Stealth code (BCH + sBCH)
  if ((coinId === 'bch' || coinId === 'sbch') && keys.stealthCode) {
    const stEl = document.getElementById('cd-recv-stealth-code');
    if (stEl) stEl.textContent = keys.stealthCode;
  }

  // Generate QR
  const c = getC(coinId);
  const qrColor = c?.color || '#000000';
  if (coinId === 'sbch') {
    // sbch receive = stealth code QR only
    _generateQR('cd-qr-canvas-st', keys.stealthCode, '#BF5AF2');
  } else {
    _generateQR('cd-qr-canvas', addr, qrColor);
    if (coinId === 'bch' && keys.stealthCode) {
      _generateQR('cd-qr-canvas-st', keys.stealthCode, '#BF5AF2');
    }
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
    // EVM chains: fetch TX history from our EVM indexer
    const evmChains = ['eth', 'matic', 'bnb', 'avax'];

    if (needsScan && evmChains.includes(coinId) && !allTxs.length) {
      try {
        const stateM = await import('../core/state.js');
        const addrs = stateM.get('addresses') || {};
        const addr = addrs[coinId];
        if (addr) {
          // Register address for watching (idempotent)
          fetch('/api/evm/watch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: addr, chain: coinId }),
          }).catch(() => {});

          // Fetch indexed TXs (filter by chain)
          const r = await fetch(`/api/evm/txs?address=${addr.toLowerCase()}&chain=${coinId}&limit=50`);
          const j = await r.json();
          if (j.txs && Array.isArray(j.txs)) {
            for (const tx of j.txs) {
              allTxs.push({
                txid: tx.hash,
                chain: coinId,
                dir: tx.dir || 'in',
                amount: parseInt(tx.value || '0'),
                timestamp: tx.timestamp || 0,
                height: tx.block || 0,
                status: tx.status || 'confirmed',
                token: tx.token || null,
              });
            }
          }
          localStorage.setItem(cacheKey, Date.now().toString());
        }
      } catch (e) { console.warn('[wallet] EVM tx fetch:', e); }
    }

    // Other chains (LTC, EVM, etc.): always fetch live and merge with cache
    if (window.chainsGetHistory && !['bch','sbch'].includes(coinId)) {
      try {
        const { deriveAllAddresses } = await import('../core/addr-derive.js');
        const addrs = deriveAllAddresses(keys);
        const addr = addrs[coinId];
        if (addr) {
          const live = await window.chainsGetHistory(coinId, addr, 100) || [];
          // Merge: add any txids not already in cache
          const known = new Set(allTxs.map(t => t.txid));
          for (const tx of live) {
            if (!known.has(tx.txid)) allTxs.push(tx);
          }
        }
      } catch {}
    }

    // Enrich stealth TXs with height=0 (check if confirmed)
    if ((coinId === 'bch' || coinId === 'sbch') && window._fvCall) {
      const unconfirmed = allTxs.filter(t => t.dir === 'stealth' && (!t.height || t.height <= 0));
      let updated = false;
      for (const tx of unconfirmed.slice(0, 10)) {
        try {
          const raw = await window._fvCall('blockchain.transaction.get', [tx.txid, true]);
          if (raw && raw.height && raw.height > 0) {
            tx.height = raw.height;
            if (raw.time) tx.timestamp = raw.time;
            updated = true;
          }
        } catch {}
      }
      if (updated) {
        try {
          let hist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
          for (const tx of unconfirmed) {
            if (tx.height > 0) {
              const idx = hist.findIndex(h => h.txid === tx.txid);
              if (idx >= 0) { hist[idx].height = tx.height; if (tx.timestamp) hist[idx].timestamp = tx.timestamp; }
            }
          }
          localStorage.setItem('00_tx_history', JSON.stringify(hist));
        } catch {}
      }
    }

    // Sort newest first
    allTxs.sort((a, b) => (b.timestamp || b.ts || 0) - (a.timestamp || a.ts || 0));

    // Total before filter
    const totalCount = allTxs.length;

    // Apply direction filter
    let filtered = allTxs;
    if (_txFilter === 'in') filtered = allTxs.filter(tx => tx.dir === 'in' || tx.dir === 'stealth' || tx.dir === 'fusion');
    else if (_txFilter === 'out') filtered = allTxs.filter(tx => tx.dir === 'out' || tx.dir === 'fusion-out');

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
      // EVM chains: show explorer link even when no indexed TXs
      const addrExpMap = {matic:'https://polygonscan.com/address/',eth:'https://etherscan.io/address/',bnb:'https://bscscan.com/address/',avax:'https://snowtrace.io/address/',sol:'https://solscan.io/account/',trx:'https://tronscan.org/#/address/',xrp:'https://xrpscan.com/account/',xlm:'https://stellarchain.io/accounts/',usdc_polygon:'https://polygonscan.com/address/',usdce_polygon:'https://polygonscan.com/address/'};
      const expLabel = {matic:'Polygonscan',eth:'Etherscan',bnb:'BscScan',avax:'Snowtrace',sol:'Solscan',trx:'Tronscan',xrp:'XRPScan',xlm:'StellarChain'}[coinId] || '';
      const stAddrs = state.get('addresses') || {};
      const myA = stAddrs[coinId] || stAddrs.eth || '';
      if (addrExpMap[coinId] && myA) {
        el.innerHTML = `
          <a href="${addrExpMap[coinId]}${myA}" target="_blank" rel="noopener" style="
            display:flex;align-items:center;justify-content:center;gap:8px;
            margin:12px 16px;padding:12px 16px;
            background:linear-gradient(135deg,rgba(139,92,246,.06),rgba(10,193,142,.06));
            border:1px solid rgba(139,92,246,.15);border-radius:10px;
            color:#8B5CF6;font-size:12px;font-weight:600;text-decoration:none;
          ">
            <span style="font-size:14px">\u{1F50D}</span>
            View full transaction history on ${expLabel}
            <span style="font-size:10px">\u2197</span>
          </a>
          <div class="cd-tx-empty">New transactions will appear here automatically</div>`;
      } else {
        el.innerHTML = '<div class="cd-tx-empty">No transactions yet</div>';
      }
      return;
    }

    // Counter header
    const showing = Math.min(_txPageSize, filteredCount);
    const counterText = _txFilter === 'all'
      ? `Showing ${showing} of ${totalCount} transactions`
      : `Showing ${showing} of ${filteredCount} ${_txFilter === 'in' ? 'received' : 'sent'} (${totalCount} total)`;
    let html = `<div style="padding:8px 24px;font-size:11px;color:var(--dt-text-secondary);background:var(--dt-bg)">${counterText}</div>`;

    // Explorer URL per chain
    const explorerMap = {bch:'https://www.blockchain.com/explorer/transactions/bch/',btc:'https://www.blockchain.com/explorer/transactions/btc/',eth:'https://etherscan.io/tx/',matic:'https://polygonscan.com/tx/',xmr:'https://xmrchain.net/tx/',ltc:'https://litecoinspace.org/tx/',bnb:'https://bscscan.com/tx/',avax:'https://snowtrace.io/tx/',sol:'https://solscan.io/tx/',trx:'https://tronscan.org/#/transaction/',xrp:'https://xrpscan.com/tx/',xlm:'https://stellarchain.io/tx/',usdc_polygon:'https://polygonscan.com/tx/',usdce_polygon:'https://polygonscan.com/tx/',usdc_eth:'https://etherscan.io/tx/',usdt_eth:'https://etherscan.io/tx/',usdc_bsc:'https://bscscan.com/tx/',usdt_bsc:'https://bscscan.com/tx/'};
    const explorerBase = explorerMap[coinId] || explorerMap.bch;

    // EVM chains: show "View full history" banner with link to block explorer
    const addrExplorerMap = {matic:'https://polygonscan.com/address/',eth:'https://etherscan.io/address/',bnb:'https://bscscan.com/address/',avax:'https://snowtrace.io/address/',sol:'https://solscan.io/account/',trx:'https://tronscan.org/#/address/',xrp:'https://xrpscan.com/account/',xlm:'https://stellarchain.io/accounts/',usdc_polygon:'https://polygonscan.com/address/',usdce_polygon:'https://polygonscan.com/address/'};
    if (addrExplorerMap[coinId]) {
      const stateAddrs = state.get('addresses') || {};
      const myAddr = stateAddrs[coinId] || stateAddrs.eth || '';
      if (myAddr) {
        const explorerLabel = {matic:'Polygonscan',eth:'Etherscan',bnb:'BscScan',avax:'Snowtrace',sol:'Solscan',trx:'Tronscan',xrp:'XRPScan',xlm:'StellarChain'}[coinId] || 'Explorer';
        html += `<a href="${addrExplorerMap[coinId]}${myAddr}" target="_blank" rel="noopener" style="
          display:flex;align-items:center;justify-content:center;gap:8px;
          margin:8px 16px;padding:10px 16px;
          background:linear-gradient(135deg,rgba(139,92,246,.06),rgba(10,193,142,.06));
          border:1px solid rgba(139,92,246,.15);border-radius:10px;
          color:#8B5CF6;font-size:12px;font-weight:600;text-decoration:none;
          transition:all .15s;cursor:pointer;
        ">
          <span style="font-size:14px">\u{1F50D}</span>
          View full transaction history on ${explorerLabel}
          <span style="font-size:10px">\u2197</span>
        </a>`;
      }
    }

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

      let dir = tx.dir || 'in';
      // Stealth: detect sent vs received by amount sign
      const isStealhSent = dir === 'stealth' && tx.amount < 0;
      if (isStealhSent) dir = 'stealth-out';
      const dirIcon = dir === 'stealth-out' ? '↑' : dir === 'stealth' ? '↓' : dir === 'in' ? '↓' : dir === 'fusion' ? '⇄' : dir === 'fusion-out' ? '⇄' : '↑';
      const dirLabel = dir === 'stealth-out' ? 'Stealth Sent' : dir === 'stealth' ? 'Stealth' : dir === 'in' ? 'Received' : dir === 'fusion' ? 'CashFusion' : dir === 'fusion-out' ? 'CashFusion' : 'Sent';
      const dirClass = dir === 'stealth-out' ? 'out' : dir === 'stealth' ? 'stealth' : dir === 'in' ? 'in' : dir === 'fusion' ? 'fusion' : dir === 'fusion-out' ? 'out' : 'out';
      const sign = (dir === 'out' || dir === 'stealth-out' || dir === 'fusion-out') ? '-' : '+';
      const coins = tx.amount ? Math.abs(tx.amount) / Math.pow(10, c.dec) : 0;
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

      // Fusion rows: populate map and open detail modal on click
      const isFusionRow = dir === 'fusion' || dir === 'fusion-out';
      if (isFusionRow && tx.txid) {
        if (!_fusionTxMap[tx.txid]) _fusionTxMap[tx.txid] = {};
        if (dir === 'fusion') _fusionTxMap[tx.txid].fusion = tx;
        if (dir === 'fusion-out') _fusionTxMap[tx.txid].fusionOut = tx;
      }
      const onclickAttr = isFusionRow
        ? `window._openFusionDetail && window._openFusionDetail('${tx.txid}')`
        : `window.open('${explorerBase}${tx.txid}','_blank')`;

      html += `<div class="${rowClass}" onclick="${onclickAttr}" style="cursor:pointer">
        <div class="cd-tx-left"><div class="cd-tx-icon ${dirClass}"><span>${dirIcon}</span></div><div>
          <div class="cd-tx-type">${dirLabel}${confBadge}${isFusionRow ? '<span style="font-size:9px;opacity:.5;margin-left:6px">▸ details</span>' : ''}</div>
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
  // Full re-render with proper formatting (date groups, explorer links, etc.)
  _loadTransactions(coinId);
}

/* ── Send BCH transaction ── */
let _sending = false;

/* ── Stealth Scan ── */
async function _doStealthScan(coinId, quick) {
  if (coinId !== 'bch' && coinId !== 'sbch') return;
  const statusEl = document.getElementById('cd-stealth-status');
  const resultsEl = document.getElementById('cd-stealth-results');
  if (statusEl) statusEl.textContent = 'Scanning...';
  if (resultsEl) resultsEl.innerHTML = '';

  try {
    const keys = auth.getKeys();
    if (!keys?.stealthScanPriv || !keys?.stealthSpendPub) {
      if (statusEl) statusEl.textContent = 'Stealth keys not available (need HD wallet)';
      return;
    }

    // Get block range
    let fromBlock = 0, toBlock = 0;
    if (quick) {
      // Quick scan: last 100 blocks
      const tip = await window._fvCall('blockchain.headers.subscribe', []);
      toBlock = tip?.height || 0;
      fromBlock = Math.max(0, toBlock - 100);
    } else {
      fromBlock = parseInt(document.getElementById('cd-stealth-from')?.value) || 0;
      const toVal = document.getElementById('cd-stealth-to')?.value;
      if (toVal) {
        toBlock = parseInt(toVal);
      } else {
        const tip = await window._fvCall('blockchain.headers.subscribe', []);
        toBlock = tip?.height || 0;
      }
    }

    if (statusEl) statusEl.textContent = `Scanning blocks ${fromBlock} → ${toBlock}...`;

    // Use the pubkey indexer to get pubkeys in range
    let indexerUrl = window._00ep?.indexer || 'https://0penw0rld.com';
    if (!indexerUrl.endsWith('/api')) indexerUrl += '/api';
    const resp = await fetch(`${indexerUrl}/pubkeys?from=${fromBlock}&to=${toBlock}`);
    if (!resp.ok) throw new Error('Indexer error: ' + resp.status);
    const data = await resp.json();
    const pubkeys = data?.pubkeys || (Array.isArray(data) ? data : []);

    if (!pubkeys?.length) {
      if (statusEl) statusEl.textContent = `No pubkeys found in range ${fromBlock}-${toBlock}`;
      return;
    }

    if (statusEl) statusEl.textContent = `Found ${pubkeys.length} pubkeys, checking for stealth payments...`;

    // Check each pubkey for stealth match
    const { scanForStealthPayments } = await import('../core/stealth.js');
    const found = scanForStealthPayments ? await scanForStealthPayments(keys, pubkeys) : [];

    if (found.length > 0) {
      if (statusEl) statusEl.textContent = `✓ Found ${found.length} stealth payment(s)!`;
      if (resultsEl) {
        resultsEl.innerHTML = found.map(f => `
          <div style="padding:8px;border:1px solid var(--dt-border,#e2e8f0);border-radius:8px;margin-bottom:6px;font-family:monospace;font-size:10px">
            <div style="color:var(--dt-accent)">Block ${f.height || '?'}</div>
            <div>TX: ${f.txid?.slice(0, 32)}...</div>
            <div>Amount: <strong>${((f.value || 0) / 1e8).toFixed(8)} BCH</strong></div>
          </div>
        `).join('');
      }
    } else {
      if (statusEl) statusEl.textContent = `No stealth payments found in range ${fromBlock}-${toBlock}`;
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  }
}

/* ── Check single TX for stealth payment ── */
async function _doStealthCheckTx(coinId) {
  const statusEl = document.getElementById('cd-stealth-status');
  const resultsEl = document.getElementById('cd-stealth-results');
  const txid = document.getElementById('cd-stealth-txid')?.value.trim();
  if (!txid || txid.length < 60) { if (statusEl) statusEl.textContent = 'Enter a valid txid'; return; }

  if (statusEl) statusEl.textContent = 'Checking TX...';
  if (resultsEl) resultsEl.innerHTML = '';

  try {
    const keys = auth.getKeys();
    if (!keys?.stealthScanPriv || !keys?.stealthSpendPub) {
      if (statusEl) statusEl.textContent = 'Stealth keys not available';
      return;
    }

    // Fetch raw TX via Fulcrum
    const rawHex = await window._fvCall('blockchain.transaction.get', [txid]);
    if (!rawHex) throw new Error('TX not found');

    // Extract input pubkeys from raw TX
    const { extractInputPubkeys } = await import('../core/stealth.js');
    let pubkeys;
    if (typeof extractInputPubkeys === 'function') {
      pubkeys = extractInputPubkeys(rawHex);
    } else {
      // Manual extraction: parse scriptSigs for compressed pubkeys (33 bytes starting with 02/03)
      const txBytes = new Uint8Array(rawHex.match(/.{2}/g).map(b => parseInt(b, 16)));
      pubkeys = [];
      for (let i = 0; i < txBytes.length - 33; i++) {
        if ((txBytes[i] === 0x02 || txBytes[i] === 0x03) && i > 0 && txBytes[i-1] === 0x21) {
          const pk = Array.from(txBytes.slice(i, i + 33)).map(b => b.toString(16).padStart(2, '0')).join('');
          pubkeys.push({ pubkey: pk, txid });
        }
      }
    }

    if (!pubkeys.length) {
      if (statusEl) statusEl.textContent = 'No pubkeys found in TX inputs';
      return;
    }

    if (statusEl) statusEl.textContent = `Found ${pubkeys.length} input pubkey(s), checking ECDH...`;

    const { scanForStealthPayments } = await import('../core/stealth.js');
    const found = await scanForStealthPayments(keys, pubkeys);

    if (found.length > 0) {
      if (statusEl) statusEl.textContent = `✓ Stealth payment found!`;
      if (resultsEl) {
        resultsEl.innerHTML = found.map(f => `
          <div style="padding:10px;border:1px solid #7c3aed;border-radius:8px;margin-bottom:6px;font-family:monospace;font-size:11px;background:rgba(124,58,237,.05)">
            <div style="color:#7c3aed;font-weight:700">Stealth Payment Detected</div>
            <div>TX: ${f.txid?.slice(0, 32)}...</div>
            <div>Amount: <strong>${((f.value || 0) / 1e8).toFixed(8)} BCH</strong></div>
            <div>Stealth addr: ${f.addr || '?'}</div>
          </div>
        `).join('');
      }

      // Save to history + stealth UTXOs
      for (const f of found) {
        try {
          let hist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
          if (!hist.some(h => h.txid === f.txid)) {
            hist.unshift({ txid: f.txid, chain: 'bch', dir: 'stealth', amount: f.value, height: f.height || 0, timestamp: Math.floor(Date.now() / 1000) });
            localStorage.setItem('00_tx_history', JSON.stringify(hist.slice(0, 500)));
          }
        } catch {}
        // Save stealth UTXO
        try {
          let utxos = JSON.parse(localStorage.getItem('00stealth_utxos') || '[]');
          if (!utxos.some(u => u.txid === f.txid && u.vout === f.vout)) {
            utxos.push({ txid: f.txid, vout: f.vout || 0, value: f.value, addr: f.addr, privKey: f.privKey, height: f.height || 0 });
            localStorage.setItem('00stealth_utxos', JSON.stringify(utxos));
          }
        } catch {}
      }

      // Refresh balance + TX list + UTXOs
      setTimeout(async () => {
        try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
        _loadTransactions(coinId);
        _updateStealthBalance();
        _loadStealthUTXOs();
      }, 500);
    } else {
      if (statusEl) statusEl.textContent = 'Not a stealth payment to this wallet';
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Error: ' + e.message;
  }
}

/* ── CoinControl: populate UTXO list for manual selection ── */
async function _populateCoinControl(coinId) {
  const list = document.getElementById('cd-coincontrol-list');
  if (!list) return;
  list.innerHTML = '<div style="font-size:11px;color:var(--dt-text-secondary);text-align:center;padding:8px">Loading UTXOs...</div>';

  try {
    const c = getC(coinId);
    const utxos = await _fetchUtxos(coinId);
    if (!utxos.length) { list.innerHTML = '<div style="font-size:11px;text-align:center;padding:8px">No UTXOs found</div>'; return; }

    list.innerHTML = utxos.map((u, i) => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--dt-border,#f0f0f0);cursor:pointer;font-size:11px">
        <input type="checkbox" class="cc-utxo" data-idx="${i}" checked style="accent-color:#0AC18E">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dt-text-secondary,#64748b)">${(u.txid || u.transaction_hash || '').slice(0, 16)}...#${u.vout ?? u.index ?? u.tx_pos}</span>
        <strong>${((u.value || 0) / 1e8).toFixed(8)} ${c?.ticker || ''}</strong>
      </label>
    `).join('');

    // Store utxos on window for send to pick up
    window._ccUtxos = utxos;
  } catch { list.innerHTML = '<div style="font-size:11px;text-align:center;padding:8px;color:#ef4444">Error loading UTXOs</div>'; }
}

/* ── Fetch UTXOs for a specific chain ── */
async function _fetchUtxos(coinId) {
  const keys = auth.getKeys();
  if (!keys) return [];

  if (coinId === 'bch') {
    const hdAddrs = state.get('hdAddresses') || [];
    const utxos = [];
    const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    const { cashAddrToHash20 } = await import('../core/cashaddr.js');
    for (const hd of hdAddrs) {
      try {
        const h = cashAddrToHash20(hd.addr);
        const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
        const hash = sha(script);
        const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
        const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
        for (const u of raw) utxos.push({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, addr: hd.addr });
      } catch {}
    }
    return utxos;
  }
  // BTC: Electrum
  if (coinId === 'btc' && window._btcCall) {
    const { deriveAllAddresses } = await import('../core/addr-derive.js');
    const { base58Decode } = await import('../core/cashaddr.js');
    const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    const addrs = deriveAllAddresses(keys);
    if (!addrs.btc) return [];
    const decoded = base58Decode(addrs.btc);
    const script = new Uint8Array([0x76, 0xa9, 0x14, ...decoded.slice(1), 0x88, 0xac]);
    const hash = sha(script);
    const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
    const raw = await window._btcCall('blockchain.scripthash.listunspent', [sh]) || [];
    return raw.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, addr: addrs.btc }));
  }
  // LTC: REST API
  if (coinId === 'ltc') {
    const { deriveAllAddresses } = await import('../core/addr-derive.js');
    const addrs = deriveAllAddresses(keys);
    if (!addrs.ltc) return [];
    const r = await fetch(`/ltc-api/address/${addrs.ltc}/utxo`);
    if (!r.ok) return [];
    const raw = await r.json();
    return (raw || []).map(u => ({ txid: u.txid, vout: u.vout, value: u.value, addr: addrs.ltc }));
  }
  return [];
}

/* ── Get selected UTXOs from CoinControl (or all if not enabled) ── */
function _getSelectedUtxos() {
  const toggle = document.getElementById('cd-coincontrol-toggle');
  if (!toggle?.checked || !window._ccUtxos) return null; // null = use all (default)

  const checked = document.querySelectorAll('.cc-utxo:checked');
  const indices = new Set([...checked].map(cb => parseInt(cb.dataset.idx)));
  return window._ccUtxos.filter((_, i) => indices.has(i));
}

/* ── Password confirmation before send ── */
function _checkSendPassword() {
  const pass = document.getElementById('cd-send-pass')?.value;
  const errEl = document.getElementById('cd-send-error');
  const storedPass = auth.getPassword();
  // Skip for Ledger/WalletConnect (no password)
  const keys = auth.getKeys();
  if (keys?.ledger || keys?.walletConnect) return true;
  if (!pass) { if (errEl) errEl.textContent = 'Enter your password to confirm'; return false; }
  if (pass !== storedPass) { if (errEl) errEl.textContent = 'Wrong password'; return false; }
  return true;
}
/* ── BTC / LTC Send (Legacy P2PKH) ── */
/* ── EVM Send (Polygon, ETH, BNB, AVAX, ERC-20 tokens) ── */
async function _doSendEvm(coinId) {
  if (!_checkSendPassword()) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const to = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!to || !to.startsWith('0x') || to.length !== 42) { if (errEl) errEl.textContent = 'Enter a valid 0x address'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  try {
    const polyTx = await import('../core/polygon-tx.js');
    const { deriveEvmPrivKey } = await import('../core/addr-derive.js');
    const keys = auth.getKeys();
    const privKey = deriveEvmPrivKey(keys);
    if (!privKey) throw new Error('Cannot derive EVM key');

    const c = getC(coinId);
    let txHash;

    // Check if this is a token or native send
    const tokenContracts = {
      usdc_polygon: polyTx.CONTRACTS.USDC,
      usdce_polygon: polyTx.CONTRACTS.USDCE,
      usdc_eth: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      usdt_eth: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      usdc_bsc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      usdt_bsc: '0x55d398326f99059fF775485246999027B3197955',
    };

    const tokenAddr = tokenContracts[coinId];

    // Chain-specific RPC + chainId
    const evmConfig = {
      matic: { rpc: '/polygon-rpc/', chainId: 137 },
      eth:   { rpc: 'https://ethereum-rpc.publicnode.com', chainId: 1 },
      bnb:   { rpc: 'https://bsc-rpc.publicnode.com', chainId: 56 },
      avax:  { rpc: '/avax-rpc/', chainId: 43114 },
      // Tokens use their parent chain
      usdc_polygon: { rpc: '/polygon-rpc/', chainId: 137 },
      usdce_polygon: { rpc: '/polygon-rpc/', chainId: 137 },
      usdc_eth: { rpc: 'https://ethereum-rpc.publicnode.com', chainId: 1 },
      usdt_eth: { rpc: 'https://ethereum-rpc.publicnode.com', chainId: 1 },
      usdc_bsc: { rpc: 'https://bsc-rpc.publicnode.com', chainId: 56 },
      usdt_bsc: { rpc: 'https://bsc-rpc.publicnode.com', chainId: 56 },
    };
    const chainOpts = evmConfig[coinId] || evmConfig.matic;

    if (tokenAddr) {
      // ERC-20 token transfer: transfer(address to, uint256 amount)
      const decimals = c.dec || 6;
      const amountRaw = BigInt(Math.floor(amt * Math.pow(10, decimals)));
      const selector = 'a9059cbb'; // transfer(address,uint256)
      const data = '0x' + selector
        + to.slice(2).toLowerCase().padStart(64, '0')
        + amountRaw.toString(16).padStart(64, '0');
      txHash = await polyTx.signAndSend(privKey, tokenAddr, data, '0x0', 100000, chainOpts);
    } else {
      // Native transfer (POL, ETH, BNB, AVAX)
      const amountWei = BigInt(Math.floor(amt * 1e18));
      txHash = await polyTx.signAndSend(privKey, to, '0x', '0x' + amountWei.toString(16), 21000, chainOpts);
    }

    // Wait for confirmation
    if (btn) btn.textContent = 'Confirming...';
    const receipt = await polyTx.waitForTx(txHash, 30000, chainOpts);

    if (receipt.status === 1) {
      if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
      if (btn) { btn.textContent = '✓ Sent!'; btn.style.background = '#10B981'; }

      // Close modal after 2s
      setTimeout(() => {
        document.getElementById('cd-send-modal')?.classList.remove('open');
        if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; btn.style.background = ''; }
      }, 2000);

      // Refresh balance
      if (window.chainsRefreshOne) {
        const stateAddrs = state.get('addresses') || {};
        const addr = stateAddrs[coinId] || stateAddrs.eth;
        if (addr) window.chainsRefreshOne(coinId === 'usdc_polygon' || coinId === 'usdce_polygon' ? coinId : (coinId === 'matic' ? 'matic' : coinId), addr);
      }
    } else {
      throw new Error('Transaction reverted');
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.color = '#EF4444'; }
    if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; }
  }
}

async function _doSendLegacy(coinId) {
  if (!_checkSendPassword()) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const addr = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!addr) { if (errEl) errEl.textContent = 'Recipient address required'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  const amtSats = Math.round(amt * 1e8);
  if (amtSats < 546) { if (errEl) errEl.textContent = 'Minimum 546 sats (dust limit)'; return; }

  const activeFee = document.querySelector('.cd-fee-opt.active');
  const feeRate = activeFee ? parseFloat(activeFee.dataset.rate) || 2 : 2;

  const keys = auth.getKeys();
  if (!keys?.acctPriv || !keys?.acctChain) { if (errEl) errEl.textContent = 'HD wallet required for ' + coinId.toUpperCase(); return; }

  // Derive chain-specific key
  const { bip32Child } = await import('../core/hd.js');
  const { secp256k1: secp } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
  const chainIndex = coinId === 'btc' ? 3 : 6; // BTC=3, LTC=6 under m/44'/145'/0'
  const chainNode = bip32Child(keys.acctPriv, keys.acctChain, chainIndex);
  const addrNode = bip32Child(chainNode.priv || chainNode.pub, chainNode.chain, 0);
  const privKey = addrNode.priv;
  const pubKey = secp.getPublicKey(privKey, true);

  // Show sending state
  _sending = true;
  if (btn) { btn.textContent = '⏳ Sending...'; btn.disabled = true; }

  try {
    // Get UTXOs
    const { sendBtc, sendLtc } = await import('../core/send-legacy.js');
    let utxos = [];

    if (coinId === 'btc' && window._btcCall) {
      const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
      const { ripemd160: rip } = await import('https://esm.sh/@noble/hashes@1.7.1/ripemd160');
      const h160 = rip(sha(pubKey));
      const script = new Uint8Array([0x76, 0xa9, 0x14, ...h160, 0x88, 0xac]);
      const sh = [...sha(script)].reverse().map(b => b.toString(16).padStart(2, '0')).join('');
      const raw = await window._btcCall('blockchain.scripthash.listunspent', [sh]) || [];
      utxos = raw.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value }));
    } else if (coinId === 'ltc') {
      const { ltcAddr } = await import('../core/send-legacy.js');
      const myAddr = ltcAddr(pubKey);
      const resp = await fetch(`/ltc-api/address/${myAddr}/utxo`);
      const raw = await resp.json();
      utxos = (raw || []).map(u => ({ txid: u.txid, vout: u.vout, value: u.value }));
    }

    if (!utxos.length) throw new Error('No UTXOs found');

    // Detect "send max" — if requested amount >= total UTXOs, send all minus fees
    const totalUtxoValue = utxos.reduce((s, u) => s + u.value, 0);
    let finalAmtSats = amtSats;
    let sendMax = false;
    if (amtSats >= totalUtxoValue) {
      sendMax = true;
      // Estimate fee: ~148 bytes per input + 34 bytes output + 10 overhead, no change output
      const estimatedSize = utxos.length * 148 + 34 + 10;
      const estimatedFee = Math.ceil(estimatedSize * feeRate);
      finalAmtSats = totalUtxoValue - estimatedFee;
      if (finalAmtSats < 546) throw new Error('Balance too low to cover fees');
    }

    const sendFn = coinId === 'btc' ? sendBtc : sendLtc;
    const result = await sendFn({
      toAddress: addr,
      amountSats: finalAmtSats,
      feeRate,
      utxos,
      privKey,
      pubKey,
      sendMax,
    });

    // Success
    if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
    const c = getC(coinId);

    // Save to tx history
    try {
      let hist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
      hist.unshift({ txid: result.txid, chain: coinId, dir: 'out', amount: amtSats, height: 0, timestamp: Math.floor(Date.now() / 1000) });
      if (hist.length > 500) hist.length = 500;
      localStorage.setItem('00_tx_history', JSON.stringify(hist));
    } catch {}

    // Close modal + refresh
    document.getElementById('cd-send-modal').style.display = 'none';
    if (window.chainsRefreshOne) window.chainsRefreshOne(coinId);

    // Reload transactions list with proper formatting
    setTimeout(() => _loadTransactions(coinId), 1500);

  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.color = '#ef4444'; }
  } finally {
    _sending = false;
    if (btn) { btn.textContent = '⚡ BROADCAST →'; btn.disabled = false; }
  }
}

/* ── TRX Send ── */
async function _doSendTrx(coinId) {
  if (!_checkSendPassword()) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const to = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!to || !to.startsWith('T') || to.length !== 34) { if (errEl) errEl.textContent = 'Enter a valid T... address'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  try {
    const { deriveTrxPrivKey } = await import('../core/addr-derive.js');
    const keys = auth.getKeys();
    const privHex = deriveTrxPrivKey(keys);
    if (!privHex) throw new Error('Cannot derive TRX key');

    let result;
    if (coinId === 'usdt_trx') {
      const { sendTrc20 } = await import('../core/send-trx.js');
      const amountRaw = BigInt(Math.floor(amt * 1e6));
      result = await sendTrc20({ toAddress: to, amount: amountRaw, contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', privKeyHex: privHex, decimals: 6 });
    } else {
      const { sendTrx } = await import('../core/send-trx.js');
      const amountSun = Math.floor(amt * 1e6);
      result = await sendTrx({ toAddress: to, amountSun, privKeyHex: privHex });
    }

    if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
    if (btn) { btn.textContent = '✓ Sent!'; btn.style.background = '#10B981'; }

    // Close modal + refresh
    setTimeout(() => {
      document.getElementById('cd-send-modal')?.classList.remove('open');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; btn.style.background = ''; }
    }, 2000);
    setTimeout(() => _loadTransactions(coinId), 1500);
    try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.color = '#ef4444'; }
  } finally {
    _sending = false;
    if (btn && btn.textContent !== '✓ Sent!') { btn.textContent = '⚡ BROADCAST →'; btn.disabled = false; }
  }
}

/* ── XRP Send ── */
async function _doSendXrp(coinId) {
  if (!_checkSendPassword()) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const to = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!to || !to.startsWith('r') || to.length < 25 || to.length > 35) { if (errEl) errEl.textContent = 'Enter a valid r... XRP address'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  try {
    const { deriveXrpPrivKey } = await import('../core/addr-derive.js');
    const keys = auth.getKeys();
    const privKey32 = deriveXrpPrivKey(keys);
    if (!privKey32) throw new Error('Cannot derive XRP key');

    const { sendXrp } = await import('../core/send-xrp.js');
    const { deriveAllAddresses } = await import('../core/addr-derive.js');
    const addrs = deriveAllAddresses(keys);
    const amountDrops = Math.floor(amt * 1e6);
    const destinationTag = document.getElementById('cd-send-memo')?.value?.trim() || undefined;
    const result = await sendXrp({ toAddress: to, amountDrops, privKey32, fromAddress: addrs.xrp, destinationTag });

    if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
    if (btn) { btn.textContent = '✓ Sent!'; btn.style.background = '#10B981'; }

    setTimeout(() => {
      document.getElementById('cd-send-modal')?.classList.remove('open');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; btn.style.background = ''; }
    }, 2000);
    setTimeout(() => _loadTransactions(coinId), 1500);
    try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.color = '#ef4444'; }
  } finally {
    _sending = false;
    if (btn && btn.textContent !== '✓ Sent!') { btn.textContent = '⚡ BROADCAST →'; btn.disabled = false; }
  }
}

/* ── XLM Send ── */
async function _doSendXlm(coinId) {
  if (!_checkSendPassword()) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const to = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!to || !to.startsWith('G') || to.length !== 56) { if (errEl) errEl.textContent = 'Enter a valid G... Stellar address'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  try {
    const { deriveXlmPrivKey } = await import('../core/addr-derive.js');
    const keys = auth.getKeys();
    const privKey32 = deriveXlmPrivKey(keys);
    if (!privKey32) throw new Error('Cannot derive XLM key');

    const { sendXlm } = await import('../core/send-xlm.js');
    const amountStroops = Math.floor(amt * 1e7);
    const memo = document.getElementById('cd-send-memo')?.value?.trim() || undefined;
    const result = await sendXlm({ toAddress: to, amountStroops, privKey32, memo });

    if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
    if (btn) { btn.textContent = '✓ Sent!'; btn.style.background = '#10B981'; }

    setTimeout(() => {
      document.getElementById('cd-send-modal')?.classList.remove('open');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; btn.style.background = ''; }
    }, 2000);
    setTimeout(() => _loadTransactions(coinId), 1500);
    try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.color = '#ef4444'; }
  } finally {
    _sending = false;
    if (btn && btn.textContent !== '✓ Sent!') { btn.textContent = '⚡ BROADCAST →'; btn.disabled = false; }
  }
}

/* ── SOL Send ── */
async function _doSendSol(coinId) {
  if (!_checkSendPassword()) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const to = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!to || to.length < 32 || to.length > 44) { if (errEl) errEl.textContent = 'Enter a valid Solana address'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  try {
    const { deriveSolPrivKey } = await import('../core/addr-derive.js');
    const keys = auth.getKeys();
    const privKey32 = deriveSolPrivKey(keys);
    if (!privKey32) throw new Error('Cannot derive SOL key');

    const { sendSol } = await import('../core/send-sol.js');
    const amountLamports = Math.floor(amt * 1e9);
    const result = await sendSol({ toAddress: to, amountLamports, privKey32 });

    if (errEl) { errEl.textContent = ''; errEl.style.color = ''; }
    if (btn) { btn.textContent = '\u2713 Sent!'; btn.style.background = '#10B981'; }

    setTimeout(() => {
      document.getElementById('cd-send-modal')?.classList.remove('open');
      if (btn) { btn.disabled = false; btn.textContent = '\u26A1 BROADCAST \u2192'; btn.style.background = ''; }
    }, 2000);
    setTimeout(() => _loadTransactions(coinId), 1500);
    try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.color = '#ef4444'; }
  } finally {
    _sending = false;
    if (btn && btn.textContent !== '\u2713 Sent!') { btn.textContent = '\u26A1 BROADCAST \u2192'; btn.disabled = false; }
  }
}

/* ── XMR Send (monero-ts WASM) ── */
async function _doSendXmr() {
  if (!_checkSendPassword()) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const addr = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!addr) { if (errEl) errEl.textContent = 'Recipient address required'; return; }
  if (!addr.startsWith('4') && !addr.startsWith('8')) { if (errEl) errEl.textContent = 'Invalid XMR address (must start with 4 or 8)'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  const amtPico = BigInt(Math.round(amt * 1e12));
  _sending = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Loading WASM...'; }

  try {
    const xmrScanner = await import('../services/xmr-scanner.js');
    const txHash = await xmrScanner.sendXmr(addr, amtPico.toString(), (msg) => {
      if (btn) btn.textContent = '⏳ ' + msg;
    });

    // Success
    document.getElementById('cd-send-modal').style.display = 'none';
    if (window.chainsRefreshOne) window.chainsRefreshOne('xmr');

    // Add to visible tx list
    const txList = document.getElementById('cd-tx-list');
    if (txList) {
      const txEl = document.createElement('div');
      txEl.className = 'cd-tx-item';
      txEl.innerHTML = `<div class="cd-tx-icon" style="background:rgba(239,68,68,.1)"><span style="color:#ef4444">↑</span></div>
        <div class="cd-tx-info"><div class="cd-tx-dir">Sent</div><div class="cd-tx-id">${txHash.slice(0, 20)}...</div></div>
        <div class="cd-tx-amount" style="color:#ef4444">-${amt.toFixed(12)} XMR</div>`;
      txList.insertBefore(txEl, txList.firstChild);
    }
  } catch (e) {
    if (errEl) { errEl.textContent = 'Error: ' + e.message; errEl.style.color = '#ef4444'; }
  } finally {
    _sending = false;
    if (btn) { btn.textContent = '⚡ BROADCAST →'; btn.disabled = false; }
  }
}

async function _doSendBch(coinId) {
  if (_sending) return;
  if (!_checkSendPassword()) return;
  const c = getC(coinId);
  if (!c) return;

  // Route BTC/LTC to their own send flow
  if (coinId === 'btc' || coinId === 'ltc') return _doSendLegacy(coinId);
  // Route XMR to monero-ts send flow
  if (coinId === 'xmr') return _doSendXmr();
  // Route SBCH (stealth spend) to dedicated flow
  if (coinId === 'sbch') return _doStealthSpend();

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

    // HD key getter (software wallet only)
    let hdGetKey = null;
    if (!keys.ledger) {
      try {
        const { getPrivForAddr } = await import('../services/hd-scanner.js');
        hdGetKey = getPrivForAddr;
      } catch {}
    }

    // Change address
    const changeAddr = state.get('hdChangeAddr');
    let changeHash160;
    if (keys.ledger) {
      // Ledger: use pre-derived change hash160
      const { getLedgerChangeHash160 } = await import('../core/auth.js');
      changeHash160 = getLedgerChangeHash160();
      if (!changeHash160) {
        const { cashAddrToHash20: ca2h } = await import('../core/cashaddr.js');
        changeHash160 = ca2h(keys.bchAddr); // fallback to primary
      }
    } else if (changeAddr) {
      const { cashAddrToHash20: ca2h } = await import('../core/cashaddr.js');
      changeHash160 = ca2h(changeAddr);
    } else {
      changeHash160 = rip(sha(secp256k1.getPublicKey(keys.privKey, true)));
    }

    // Hardware/remote sign function
    let ledgerSignFn = null;
    if (keys.ledger) {
      const { ledgerSignTx } = await import('../core/auth.js');
      ledgerSignFn = (sel, outs) => ledgerSignTx(sel, outs);
    } else if (keys.walletConnect) {
      const { wcSignTx } = await import('../core/auth.js');
      const { b2h: _b2h, h2b: _h2b } = await import('../core/utils.js');
      const { p2pkhScript: _p2pkh } = await import('../core/bch-tx.js');
      ledgerSignFn = async (sel, outs) => {
        // Build unsigned TX hex for WC
        const { serializeUnsignedTx } = await import('../core/bch-tx.js');
        const unsignedHex = serializeUnsignedTx(sel, outs);
        const sourceOutputs = sel.map(u => ({
          valueSatoshis: '<bigint: ' + u.value + 'n>',
          lockingBytecode: '<Uint8Array: 0x' + _b2h(_p2pkh(keys.hash160)) + '>',
          outpointTransactionHash: '<Uint8Array: 0x' + _b2h(_h2b(u.txid || u.transaction_hash).reverse()) + '>',
          outpointIndex: u.vout ?? u.index,
          sequenceNumber: 4294967295,
          unlockingBytecode: '<Uint8Array: 0x>',
        }));
        return wcSignTx(unsignedHex, sourceOutputs, 'Send ' + (amtSats / 1e8).toFixed(8) + ' BCH');
      };
    }

    const result = await sendBch({
      toAddress: addr,
      amountSats: amtSats,
      feeRate,
      utxos,
      privKey: keys.privKey,
      pubKey: keys.pubKey,
      changeHash160,
      hdGetKey,
      ledgerSign: ledgerSignFn,
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

/* ══════════════════════════════════════════
   STEALTH SEND — send to a stealth code
   Derives a one-time address from the recipient's
   scan+spend pubkeys using an ephemeral key.
   ══════════════════════════════════════════ */

/* ── Spend stealth UTXOs (from sbch) ── */
async function _doStealthSpend() {
  if (_sending) return;
  const errEl = document.getElementById('cd-send-error');
  const btn = document.getElementById('cd-broadcast-btn');
  if (errEl) errEl.textContent = '';

  const addr = document.getElementById('cd-send-addr')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-send-amount')?.value) || 0;
  if (!addr) { if (errEl) errEl.textContent = 'Recipient address required'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  const amtSats = Math.round(amt * 1e8);
  if (amtSats < 546) { if (errEl) errEl.textContent = 'Minimum 546 sats'; return; }

  _sending = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  try {
    const { secp256k1 } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
    const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    const { ripemd160: rip } = await import('https://esm.sh/@noble/hashes@1.7.1/ripemd160');
    const { cashAddrToHash20 } = await import('../core/cashaddr.js');
    const { loadStealthUtxos } = await import('../core/stealth.js');
    const { sendBch } = await import('../core/send-bch.js');

    // Load stealth UTXOs with their private keys
    const saved = loadStealthUtxos();
    if (!saved.length) throw new Error('No stealth UTXOs available');

    let utxos = [];
    // Map addr → privKey for signing
    const stealthKeyMap = {};
    for (const su of saved) {
      if (!su.addr || !su.priv) continue;
      stealthKeyMap[su.addr] = typeof su.priv === 'string'
        ? new Uint8Array(su.priv.match(/.{2}/g).map(b => parseInt(b, 16)))
        : su.priv;
      try {
        const h = cashAddrToHash20(su.addr);
        const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
        const hash = sha(script);
        const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
        const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
        for (const u of raw) utxos.push({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, addr: su.addr });
      } catch {}
    }
    if (!utxos.length) throw new Error('No unspent stealth UTXOs');

    // hdGetKey returns the stealth private key for each address
    const stealthGetKey = (address) => stealthKeyMap[address] || null;

    // Use first UTXO's key as the main privKey (for sendBch fallback)
    const firstPriv = stealthKeyMap[utxos[0].addr];
    if (!firstPriv) throw new Error('Missing stealth private key');

    // Change goes back to main wallet (not stealth)
    const keys = auth.getKeys();
    const changeHash160 = rip(sha(secp256k1.getPublicKey(keys.privKey, true)));

    const result = await sendBch({
      toAddress: addr,
      amountSats: amtSats,
      feeRate: 1,
      utxos,
      privKey: firstPriv,
      pubKey: secp256k1.getPublicKey(firstPriv, true),
      changeHash160,
      hdGetKey: stealthGetKey,
    });

    // Mark spent UTXOs
    const spentAddrs = new Set(utxos.filter(u => u.value > 0).map(u => u.addr));
    const updatedSaved = saved.map(su => spentAddrs.has(su.addr) ? { ...su, spent: true } : su);
    localStorage.setItem('00stealth_utxos', JSON.stringify(updatedSaved));

    // Save to history
    try {
      let hist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
      hist.unshift({ txid: result.txid, chain: 'bch', dir: 'stealth', amount: -amtSats, height: 0, timestamp: Math.floor(Date.now() / 1000) });
      localStorage.setItem('00_tx_history', JSON.stringify(hist.slice(0, 500)));
    } catch {}

    if (btn) { btn.textContent = '✓ SENT'; btn.style.background = '#7c3aed'; }
    setTimeout(() => {
      document.getElementById('cd-send-modal')?.classList.remove('open');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; btn.style.background = ''; }
      _sending = false;
    }, 2000);
    setTimeout(async () => {
      try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
    }, 2000);

  } catch (e) {
    if (errEl) errEl.textContent = 'Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '⚡ BROADCAST →'; }
    _sending = false;
  }
}

async function _doStealthSend(coinId) {
  if (_sending) return;
  const errEl = document.getElementById('cd-stealth-error');
  const btn = document.getElementById('cd-stealth-btn');
  if (errEl) errEl.textContent = '';

  const code = document.getElementById('cd-stealth-code')?.value.trim();
  const amt = parseFloat(document.getElementById('cd-stealth-amount')?.value) || 0;
  if (!code) { if (errEl) errEl.textContent = 'Stealth code required'; return; }
  if (amt <= 0) { if (errEl) errEl.textContent = 'Enter a valid amount'; return; }

  const amtSats = Math.round(amt * 1e8);
  if (amtSats < 546) { if (errEl) errEl.textContent = 'Minimum 546 sats'; return; }

  // Decode stealth code → scan + spend pubkeys
  let scanPub, spendPub;
  try {
    const { decodeStealthCode } = await import('../core/stealth.js');
    const decoded = decodeStealthCode(code);
    scanPub = decoded.scanPub;
    spendPub = decoded.spendPub;
  } catch (e) {
    if (errEl) errEl.textContent = 'Invalid stealth code: ' + e.message;
    return;
  }

  _sending = true;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending...'; btn.style.opacity = '0.7'; }

  try {
    const keys = auth.getKeys();
    if (!keys) throw new Error('Wallet not unlocked');

    const { secp256k1 } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
    const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    const { ripemd160: rip } = await import('https://esm.sh/@noble/hashes@1.7.1/ripemd160');
    const { cashAddrToHash20 } = await import('../core/cashaddr.js');

    // Get UTXOs
    let utxos = [];
    const hdAddrs = state.get('hdAddresses') || [];
    for (const hd of hdAddrs) {
      try {
        const h = cashAddrToHash20(hd.addr);
        const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
        const hash = sha(script);
        const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
        const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
        for (const u of raw) utxos.push({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, addr: hd.addr });
      } catch {}
    }
    if (!utxos.length) throw new Error('No UTXOs available');

    // Get the private key of the FIRST UTXO — this is the key whose pubkey will
    // appear in the TX input and be used by the receiver's scanner for ECDH
    let hdGetKey = null;
    try { const { getPrivForAddr } = await import('../services/hd-scanner.js'); hdGetKey = getPrivForAddr; } catch {}

    // For stealth sends, sort UTXOs so the biggest one is first (will be the first input).
    // Then use that UTXO's private key for ECDH stealth derivation.
    // This ensures inputPubkey matches the key used for derivation.
    utxos.sort((a, b) => b.value - a.value);

    let firstInputPriv = keys.privKey; // fallback to main key
    if (hdGetKey && utxos[0]?.addr) {
      const hdPriv = hdGetKey(utxos[0].addr);
      if (hdPriv) firstInputPriv = hdPriv;
    }

    // Derive stealth address using the FIRST INPUT's private key
    const { deriveStealthSendAddr } = await import('../core/stealth.js');
    const { addr: stealthAddr, senderPub } = deriveStealthSendAddr(scanPub, spendPub, firstInputPriv);

    const { sendBch } = await import('../core/send-bch.js');
    const changeAddr = state.get('hdChangeAddr');
    let changeHash160;
    if (changeAddr) {
      changeHash160 = cashAddrToHash20(changeAddr);
    } else {
      changeHash160 = rip(sha(secp256k1.getPublicKey(keys.privKey, true)));
    }

    const result = await sendBch({
      toAddress: stealthAddr,
      amountSats: amtSats,
      feeRate: 1,
      utxos,
      privKey: keys.privKey,
      pubKey: secp256k1.getPublicKey(keys.privKey, true),
      changeHash160,
      hdGetKey,
    });

    // Save to history
    try {
      let hist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
      hist.unshift({ txid: result.txid, chain: 'bch', dir: 'stealth', amount: amtSats, height: 0, timestamp: Math.floor(Date.now() / 1000) });
      localStorage.setItem('00_tx_history', JSON.stringify(hist.slice(0, 500)));
    } catch {}

    if (btn) { btn.textContent = '✓ STEALTH SENT'; btn.style.background = '#BF5AF2'; }

    setTimeout(() => {
      document.getElementById('cd-send-modal')?.classList.remove('open');
      if (btn) { btn.disabled = false; btn.textContent = '⚡ STEALTH SEND →'; btn.style.background = ''; btn.style.opacity = ''; }
      _sending = false;
    }, 2000);

    setTimeout(async () => {
      try { const { refreshNow } = await import('../services/balance-service.js'); refreshNow(); } catch {}
    }, 2000);

  } catch (e) {
    if (errEl) errEl.textContent = 'Error: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '⚡ STEALTH SEND →'; btn.style.opacity = ''; }
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
  const noUtxoChains = ['eth','usdc','usdt','bnb','avax','sol','trx','xrp','xlm','matic','usdc_bsc','usdt_bsc','usdc_avax','usdt_avax','usdc_polygon','usdce_polygon','usdc_sol','usdt_sol','usdt_trx','rlusd_xrp'];
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
    // SBCH (Stealth BCH): load from saved stealth UTXOs
    else if (coinId === 'sbch' && window._fvCall) {
      try {
        const stMod = await import('../core/stealth.js');
        const caMod = await import('../core/cashaddr.js');
        const hMod = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
        const saved = stMod.loadStealthUtxos();
        for (const su of saved) {
          if (!su.addr) continue;
          try {
            const h = caMod.cashAddrToHash20(su.addr);
            const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
            const hash = hMod.sha256(script);
            const sh = Array.from(hash).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
            const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
            for (const u of raw) {
              utxos.push({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, height: u.height, addr: su.addr, branch: 'stealth' });
            }
          } catch (e2) { console.warn('[wallet] stealth UTXO fetch error:', e2); }
        }
      } catch {}
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
    // LTC: fetch UTXOs via REST API
    else if (coinId === 'ltc') {
      const { deriveAllAddresses } = await import('../core/addr-derive.js');
      const addrs = deriveAllAddresses(keys);
      if (addrs.ltc) {
        try {
          const r = await fetch(`/ltc-api/address/${addrs.ltc}/utxo`);
          if (r.ok) {
            const raw = await r.json();
            utxos = (raw || []).map(u => ({ txid: u.txid, vout: u.vout, value: u.value, height: u.status?.block_height || 0, branch: 'receive', addr: addrs.ltc }));
          }
        } catch {}
      }
    }

    if (!utxos.length) {
      el.innerHTML = '<div class="cd-tx-empty">No UTXOs found</div>';
      return;
    }

    // Separate receive vs change vs stealth
    const receiveUtxos = utxos.filter(u => u.branch === 'receive' || !u.branch).sort((a, b) => b.value - a.value);
    const changeUtxos = utxos.filter(u => u.branch === 'change').sort((a, b) => b.value - a.value);
    const stealthUtxos = utxos.filter(u => u.branch === 'stealth').sort((a, b) => b.value - a.value);

    const prices = state.get('prices') || {};
    const coinPrice = prices[pk(coinId)]?.price || 0;
    const explorer = coinId === 'btc' ? 'https://www.blockchain.com/explorer/transactions/btc/' : coinId === 'ltc' ? 'https://litecoinspace.org/tx/' : 'https://www.blockchain.com/explorer/transactions/bch/';
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
    html += renderSection('STEALTH', '🔒', '#7c3aed', stealthUtxos);

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
   FUSION DETAIL MODAL
   ══════════════════════════════════════════ */
window._openFusionDetail = async function(txid) {
  const existing = document.getElementById('_wv-fusion-modal');
  if (existing) existing.remove();

  const entry = _fusionTxMap[txid] || {};
  const fusionTx  = entry.fusion;
  const fusionOut = entry.fusionOut;

  let outputs = fusionTx?.outputs || null;
  if (!outputs && window._fvCall) {
    try {
      const raw = await Promise.race([
        window._fvCall('blockchain.transaction.get', [txid, true]),
        new Promise(r => setTimeout(() => r(null), 8000))
      ]);
      if (raw?.vout) {
        outputs = raw.vout.map(o => ({
          addr: (o.scriptPubKey?.addresses?.[0] || o.scriptPubKey?.cashaddress || '—'),
          value: Math.round(o.value * 1e8),
          all: true,
        }));
      }
    } catch {}
  }

  const receivedTotal   = fusionTx?.amount || 0;
  const contributedTotal = fusionOut?.amount || 0;
  const feeSats = contributedTotal > 0 ? contributedTotal - receivedTotal : 0;
  const peers   = fusionTx?.peers || fusionOut?.peers || '?';
  const height  = fusionTx?.height || fusionOut?.height || 0;
  const explorerUrl = `https://www.blockchain.com/explorer/transactions/bch/${txid}`;

  const shortAddr = addr => {
    if (!addr || addr === '—') return '—';
    const clean = addr.replace('bitcoincash:','');
    return clean.slice(0,10) + '…' + clean.slice(-6);
  };
  const fmtBch = sats => (sats / 1e8).toFixed(8).replace(/\.?0+$/, '') + ' BCH';
  const fmtUsd = sats => {
    const prices = (typeof state !== 'undefined' ? state.get('prices') : null) || {};
    const p = prices['bch']?.price || prices['BCH']?.price || 0;
    return p > 0 ? '≈ $' + (sats / 1e8 * p).toFixed(2) : '';
  };

  const outputRows = outputs ? outputs.map(o => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:var(--dt-accent-soft);border-radius:8px;margin-bottom:6px;border:1px solid var(--dt-accent-border)">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:var(--dt-accent);font-size:13px">↓</span>
        <a href="https://www.blockchain.com/explorer/addresses/bch/${o.addr}" target="_blank" rel="noopener"
           style="font-family:monospace;font-size:11px;color:var(--dt-text);text-decoration:none;opacity:.7;transition:opacity .15s"
           onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.7">${shortAddr(o.addr)} ↗</a>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--dt-accent)">+${fmtBch(o.value)}</div>
    </div>`).join('')
    : `<div style="font-size:12px;color:var(--dt-text-secondary);text-align:center;padding:12px">Output details not available</div>`;

  const m = document.createElement('div');
  m.id = '_wv-fusion-modal';
  m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--dt-overlay);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box';
  m.innerHTML = `
    <div style="background:var(--dt-surface);border:1px solid var(--dt-border);border-radius:18px;padding:24px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:var(--dt-shadow-lg)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--dt-accent-soft);border:1px solid var(--dt-accent-border);display:flex;align-items:center;justify-content:center;font-size:16px">⇄</div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--dt-text)">CashFusion</div>
            <div style="font-size:11px;color:var(--dt-text-secondary)">${peers} peer${peers > 1 ? 's' : ''} · ${height > 0 ? 'Block #' + height : 'Unconfirmed'}</div>
          </div>
        </div>
        <button id="_wv-fus-close" style="background:transparent;border:none;color:var(--dt-text-secondary);font-size:22px;cursor:pointer;line-height:1;padding:4px">×</button>
      </div>

      <div style="background:var(--dt-input-bg);border:1px solid var(--dt-border);border-radius:10px;padding:10px 14px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span style="font-family:monospace;font-size:10px;color:var(--dt-text-secondary);word-break:break-all;flex:1">${txid}</span>
        <a href="${explorerUrl}" target="_blank" rel="noopener"
           style="white-space:nowrap;font-size:11px;font-weight:600;color:var(--dt-accent);text-decoration:none;flex-shrink:0">Explorer ↗</a>
      </div>

      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--dt-text-secondary);margin-bottom:10px">
        OUTPUTS RECEIVED${outputs ? ' (' + outputs.length + ' UTXO' + (outputs.length > 1 ? 's' : '') + ')' : ''}
      </div>
      ${outputRows}

      <div style="margin-top:16px;border-top:1px solid var(--dt-border);padding-top:16px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--dt-text-secondary)">Total received</span>
          <span style="color:var(--dt-accent);font-weight:700">+${fmtBch(receivedTotal)} <span style="color:var(--dt-text-secondary);font-weight:400">${fmtUsd(receivedTotal)}</span></span>
        </div>
        ${contributedTotal > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--dt-text-secondary)">Contributed</span>
          <span style="color:var(--dt-danger);font-weight:700">-${fmtBch(contributedTotal)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="color:var(--dt-text-secondary)">Network fee</span>
          <span style="color:var(--dt-text)">${feeSats} sats ${fmtUsd(feeSats) ? '(' + fmtUsd(feeSats) + ')' : ''}</span>
        </div>` : ''}
      </div>
    </div>`;

  document.body.appendChild(m);
  m.querySelector('#_wv-fus-close').onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
};

/* ══════════════════════════════════════════
   EXPORT KEYS / BACKUP
   ══════════════════════════════════════════ */
const _BACKUP_KEYS = [
  '00_tx_history','00_xmr_outputs','00_xmr_scan',
  '00stealth_utxos','00_hd_paths','00_balances',
  '00_auto_stealth','00_cj_rounds',
  '00_ep_fulcrum','00_ep_btc_electrum','00_ep_relays','00_ep_eth_rpc',
  '00_fusion_history','00_cj_processed',
  '00_fusion_addr_idx',
];

function _walletPromptPassword(title = 'Enter your wallet password') {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('_wv-pass-modal');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = '_wv-pass-modal';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--dt-overlay,rgba(0,0,0,.6));display:flex;align-items:center;justify-content:center';
    el.innerHTML = `<div style="background:var(--dt-surface,#16171f);border:1px solid var(--dt-border,#232430);border-radius:16px;padding:28px 32px;min-width:320px;max-width:420px;width:90%;box-shadow:var(--dt-shadow-lg,0 4px 16px rgba(0,0,0,.3))">
      <div style="font-size:15px;font-weight:700;margin-bottom:16px;color:var(--dt-text,#e2e8f0)">${title}</div>
      <input id="_wv-pass-inp" type="password" placeholder="Password" autocomplete="current-password"
        style="width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid var(--dt-border,#232430);background:var(--dt-input-bg,#1c1d26);color:var(--dt-text,#e2e8f0);font-size:14px;outline:none;margin-bottom:14px">
      <div style="display:flex;gap:10px">
        <button id="_wv-pass-cancel" style="flex:1;padding:11px;border-radius:10px;border:1px solid var(--dt-border,#232430);background:transparent;color:var(--dt-text,#e2e8f0);cursor:pointer;font-size:14px">Cancel</button>
        <button id="_wv-pass-ok" style="flex:2;padding:11px;border-radius:10px;border:none;background:#0AC18E;color:#fff;cursor:pointer;font-size:14px;font-weight:700">Confirm</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    const inp = el.querySelector('#_wv-pass-inp');
    const cleanup = () => el.remove();
    const submit = () => { const v = inp.value; if (!v) return; cleanup(); resolve(v); };
    el.querySelector('#_wv-pass-ok').onclick = submit;
    el.querySelector('#_wv-pass-cancel').onclick = () => { cleanup(); reject(new Error('cancelled')); };
    inp.onkeydown = e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { cleanup(); reject(new Error('cancelled')); } };
    setTimeout(() => inp.focus(), 50);
  });
}

window.openExportKeys = async function() {
  try {
    const keys = auth.getKeys();
    const profile = auth.getProfile();
    if (!keys) { alert('Unlock your wallet first.'); return; }

    const pass = await _walletPromptPassword('Confirm password to view keys');
    const vault = localStorage.getItem('00wallet_vault');
    if (vault) {
      try { await auth.decryptVault(vault, pass); } catch { alert('Wrong password.'); return; }
    }

    // Derive chain-specific keys
    let btcPrivHex = '', ethPrivHex = '', xmrSpendHex = '', xmrViewHex = '';
    try {
      const { deriveEvmPrivKey } = await import('../core/addr-derive.js');
      ethPrivHex = deriveEvmPrivKey(keys) || '';
    } catch {}
    try {
      if (keys.acctPriv && keys.acctChain) {
        const { hmac } = await import('https://esm.sh/@noble/hashes@1.7.1/hmac');
        const { sha512 } = await import('https://esm.sh/@noble/hashes@1.7.1/sha512');
        const b2h = arr => Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
        const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
        function _childPriv(par, chain, idx) {
          const d = new Uint8Array(37); d[0]=0; d.set(par,1); new DataView(d.buffer).setUint32(33,idx>>>0,false);
          const h = hmac(sha512, chain, d); const l = h.slice(0,32), r = h.slice(32);
          const t = ((BigInt('0x'+b2h(l)) + BigInt('0x'+b2h(par))) % N);
          const k = new Uint8Array(32); const ts = t.toString(16).padStart(64,'0');
          for (let i=0;i<32;i++) k[i]=parseInt(ts.slice(i*2,i*2+2),16);
          return { priv: k, chain: r };
        }
        const btcNode = _childPriv(keys.acctPriv, keys.acctChain, 3);
        btcPrivHex = b2h(btcNode.priv);
      }
    } catch {}
    if (keys.xmr) {
      xmrSpendHex = keys.xmr.spendPriv ? Array.from(keys.xmr.spendPriv).map(b=>b.toString(16).padStart(2,'0')).join('') : '';
      xmrViewHex  = keys.xmr.viewPriv  ? Array.from(keys.xmr.viewPriv).map(b=>b.toString(16).padStart(2,'0')).join('') : '';
    }
    const b2h = arr => Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
    const seedHex = profile?.seed || profile?.seedHex || '';

    const rows = [
      ...(profile?.seedWords ? [{ label:'SEED PHRASE', path:'BIP39 mnemonic — write this down', val: profile.seedWords }] : []),
      { label:'SEED (HEX)', path:'Master seed — source of all keys', val: seedHex },
      { label:'BCH PRIVATE KEY', path:"m/44'/145'/0'/0/0", val: b2h(keys.privKey) },
      { label:'BCH ADDRESS', path: keys.bchAddr, val: keys.bchAddr },
      ...(btcPrivHex ? [{ label:'BTC PRIVATE KEY', path:"m/44'/145'/0'/3/0", val: btcPrivHex }] : []),
      ...(ethPrivHex ? [{ label:'ETH/EVM PRIVATE KEY', path:"m/44'/145'/0'/4/0", val: ethPrivHex }] : []),
      ...(xmrSpendHex ? [{ label:'XMR SPEND KEY', path:"m/44'/145'/0'/5/0", val: xmrSpendHex }] : []),
      ...(xmrViewHex  ? [{ label:'XMR VIEW KEY', path:'Derived from spend key', val: xmrViewHex }] : []),
      ...(keys.stealthScanPriv  ? [{ label:'STEALTH SCAN KEY', path:"m/352'/145'/0'/1'/0", val: b2h(keys.stealthScanPriv) }] : []),
      ...(keys.stealthSpendPriv ? [{ label:'STEALTH SPEND KEY', path:"m/352'/145'/0'/0'/0", val: b2h(keys.stealthSpendPriv) }] : []),
      ...(keys.stealthCode ? [{ label:'STEALTH PAYCODE', path:'stealth:scan+spend pub', val: keys.stealthCode }] : []),
    ];

    const existing2 = document.getElementById('_wv-keys-modal');
    if (existing2) existing2.remove();
    const m = document.createElement('div');
    m.id = '_wv-keys-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--dt-overlay,rgba(0,0,0,.6));display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box';
    m.innerHTML = `<div style="background:var(--dt-surface,#16171f);border:1px solid var(--dt-border,#232430);border-radius:16px;padding:24px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:var(--dt-shadow-lg,0 4px 16px rgba(0,0,0,.3))">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div style="font-size:16px;font-weight:700;color:var(--dt-text,#e2e8f0)">🔑 Export Keys</div>
        <button id="_wv-keys-close" style="background:transparent;border:none;color:var(--dt-text,#e2e8f0);font-size:20px;cursor:pointer;line-height:1">×</button>
      </div>
      <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:12px;margin-bottom:20px;font-size:12px;color:var(--dt-danger,#ef4444)">
        ⚠️ Never share these keys. Anyone with access can steal your funds.
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        ${rows.map((r, i) => `<div style="background:var(--dt-input-bg,#1c1d26);border:1px solid var(--dt-border,#232430);border-radius:10px;padding:14px">
          <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--dt-text-secondary,#94a3b8);margin-bottom:2px">${r.label}</div>
          <div style="font-size:10px;color:var(--dt-text-secondary,#94a3b8);opacity:0.7;margin-bottom:8px">${r.path}</div>
          <div id="_kv${i}" data-key="${r.val}" style="font-family:monospace;font-size:11px;word-break:break-all;color:var(--dt-text,#e2e8f0)">••••••••••••••••</div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button onclick="(function(){const el=document.getElementById('_kv${i}');const b=el.nextElementSibling?.children[1];if(el.textContent==='••••••••••••••••'){el.textContent=el.dataset.key;if(b)b.textContent='HIDE';}else{el.textContent='••••••••••••••••';if(b)b.textContent='REVEAL';}})()"
              style="font-size:10px;padding:4px 10px;border-radius:6px;border:1px solid var(--dt-border,#232430);background:transparent;color:var(--dt-text-secondary,#94a3b8);cursor:pointer">REVEAL</button>
            <button onclick="(function(){const v=document.getElementById('_kv${i}').dataset.key;navigator.clipboard.writeText(v).then(()=>{const b=event.target;b.textContent='✓ COPIED';setTimeout(()=>b.textContent='COPY',1500);});})()"
              style="font-size:10px;padding:4px 10px;border-radius:6px;border:1px solid var(--dt-border,#232430);background:transparent;color:var(--dt-text-secondary,#94a3b8);cursor:pointer">COPY</button>
          </div>
        </div>`).join('')}
      </div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#_wv-keys-close').onclick = () => m.remove();
    m.onclick = e => { if (e.target === m) m.remove(); };
  } catch (e) { if (e.message !== 'cancelled') console.warn('[wallet] openExportKeys:', e); }
};

window.exportBackup = async function() {
  try {
    const pass = await _walletPromptPassword('Enter password to encrypt backup');
    const payload = {
      format: '0pw-backup', version: 1, ts: Date.now(),
      vault: localStorage.getItem('00wallet_vault'),
      data: {},
    };
    for (const k of _BACKUP_KEYS) { const v = localStorage.getItem(k); if (v !== null) payload.data[k] = v; }
    const encrypted = await auth.encryptVault(payload, pass);
    const d = new Date();
    const fname = '00wallet-backup-' + d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '.0pw';
    const blob = new Blob([encrypted], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fname; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (window.showToast) showToast('Backup downloaded: ' + fname, 'success');
  } catch (e) { if (e.message !== 'cancelled') { console.warn('[wallet] exportBackup:', e); alert('Export failed: ' + e.message); } }
};

window.importBackup = async function(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const pass = await _walletPromptPassword('Enter backup password to restore');
    const payload = await auth.decryptVault(text, pass);
    if (!payload || payload.format !== '0pw-backup') throw new Error('Invalid backup file');
    if (payload.vault) localStorage.setItem('00wallet_vault', payload.vault);
    for (const [k, v] of Object.entries(payload.data || {})) { if (v !== null && v !== undefined) localStorage.setItem(k, v); }
    if (window.showToast) showToast('Backup restored — reloading...', 'success');
    setTimeout(() => window.location.reload(), 1200);
  } catch (e) { if (e.message !== 'cancelled') { console.warn('[wallet] importBackup:', e); alert('Import failed: ' + e.message); } }
};

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
