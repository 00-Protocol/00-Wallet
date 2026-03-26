/* ══════════════════════════════════════════
   00 Wallet — Dashboard View (SPA v2)
   ══════════════════════════════════════════
   Reuses exact same CSS classes from desktop.css
   as wallet.html v1 (wd-overview, wd-account, etc.)
   ══════════════════════════════════════════ */

import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';

export const id = 'dashboard';
export const title = '00 Protocol';
export const icon = '⌂';

let _container = null;
let _unsubs = [];

/* ── Chain config (same order as wallet.html v1) ── */
/* type: 'chain' = main row, 'token' = indented sub-row (stablecoin) */
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

const PRICE_CHAINS = ['bch','btc','eth','xmr','ltc','bnb','avax','sol','trx','xrp','xlm'];
const PRICE_DOTS = {bch:'#0AC18E',btc:'#F7931A',eth:'#627EEA',xmr:'#FF6600',ltc:'#345D9D',bnb:'#F3BA2F',avax:'#E84142',sol:'#9945FF',trx:'#FF0013',xrp:'#23292F',xlm:'#14B6E7'};

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

function fmtPrice(p) {
  if (!p) return '$—';
  return '$' + p.toLocaleString('en', {maximumFractionDigits:2});
}

/* ── Render ── */
function render() {
  if (!_container) return;
  const balances = state.get('balances') || {};
  const prices = state.get('prices') || {};

  // Total portfolio
  let total = 0;
  for (const c of CHAINS) {
    const bal = balances[c.id];
    let priceKey = c.id;
    if (c.id === 'sbch') priceKey = 'bch';
    else if (c.id.startsWith('usdc')) priceKey = 'usdc';
    else if (c.id.startsWith('usdt')) priceKey = 'usdt';
    else if (c.id.startsWith('rlusd')) priceKey = 'usdc';
    const p = (prices[priceKey]?.price) || 0;
    if (bal !== undefined && p) {
      const n = typeof bal === 'string' ? parseFloat(bal) : bal;
      if (!isNaN(n)) total += (n / Math.pow(10, c.dec)) * p;
    }
  }

  // Price bar
  const priceBar = PRICE_CHAINS.map(id => {
    const p = prices[id]?.price;
    return `<span class="wd-ov-price"><span class="wd-ov-dot" style="background:${PRICE_DOTS[id]}"></span>${id.toUpperCase()} <span>${fmtPrice(p)}</span></span>`;
  }).join('');

  // Account cards
  const cards = CHAINS.map(c => {
    const bal = balances[c.id];
    // Map price keys: stablecoins → usdc/usdt, stealth → bch
    let priceKey = c.id;
    if (c.id === 'sbch') priceKey = 'bch';
    else if (c.id.startsWith('usdc')) priceKey = 'usdc';
    else if (c.id.startsWith('usdt')) priceKey = 'usdt';
    else if (c.id.startsWith('rlusd')) priceKey = 'usdc'; // ~$1
    const p = prices[priceKey]?.price || 0;
    const balStr = fmtBal(bal, c.dec, c.ticker);
    const fiatStr = fmtFiat(bal, c.dec, p);

    if (c.type === 'token') {
      // Token sub-row (stablecoin) — indented with └
      return `
      <div class="wd-token" onclick="window.location.hash='#/wallet/${c.id}'" style="cursor:pointer">
        <div class="wd-acc-left">
          <span class="wd-token-indent">└</span>
          <img class="wd-acc-icon wd-token-icon" src="${c.icon}" alt="${c.ticker}">
          <div><div class="wd-acc-name">${c.name}</div></div>
        </div>
        <div class="wd-acc-right">
          <span class="wd-acc-balance">${balStr}</span>
          <span class="wd-acc-fiat">${fiatStr}</span>
        </div>
      </div>`;
    }

    // Main chain row
    const cls = c.stealth ? ' stealth' : '';
    const iconHtml = c.iconType === 'img'
      ? `<img class="wd-acc-icon" src="${c.icon}" alt="${c.ticker}">`
      : `<div class="wd-acc-icon" style="background:${c.color}"><span>${c.icon}</span></div>`;

    return `
    <div class="wd-account${cls}" onclick="window.location.hash='#/wallet/${c.id}'" style="cursor:pointer">
      <div class="wd-acc-left">
        ${iconHtml}
        <div>
          <div class="wd-acc-chain">${c.chain}</div>
          <div class="wd-acc-name">${c.name}</div>
        </div>
      </div>
      <div class="wd-acc-right">
        <span class="wd-acc-balance">${balStr}</span>
        <span class="wd-acc-fiat">${fiatStr}</span>
      </div>
    </div>`;
  }).join('');

  _container.innerHTML = `
  <div style="padding:32px 40px">
    <div class="wd-overview">
      <div class="wd-ov-top">
        <div>
          <div class="wd-ov-label">Portfolio Value</div>
          <div class="wd-ov-total">${total > 0 ? '$' + total.toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2}) : '$0.00'}</div>
        </div>
        <button class="wd-ov-refresh" onclick="import('./services/balance-service.js').then(m=>m.refreshNow())" title="Refresh balances">↻</button>
      </div>
      <div class="wd-ov-prices">${priceBar}</div>
    </div>
    <div class="wd-accounts">${cards}</div>
  </div>`;
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  render();
  _unsubs.push(state.subscribe('balances', render));
  _unsubs.push(state.subscribe('prices', render));
}

export function unmount() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  if (_container) _container.innerHTML = '';
  _container = null;
}
