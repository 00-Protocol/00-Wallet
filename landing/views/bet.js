/* ==================================================
   00 Bet -- Polymarket 15-min Trading Dashboard
   ==================================================
   Replicates polymarketBoss functionality:
   - Gamma API for 15-min crypto markets + general markets
   - Binance WebSocket for real-time prices
   - Countdown timers, probability bars, spread calc
   - Event delegation for all click handlers
   ================================================== */

import { navigate } from '../router.js';

export const id    = 'bet';
export const title = '00 Bet';
export const icon  = '\u{1F3B2}';

/* ==================================================
   MODULE STATE
   ================================================== */
let _container    = null;
let _handleClick  = null;
let _binanceWs    = null;
let _countdownIv  = null;
let _refreshIv    = null;
let _activeTab    = 'markets';
let _activeCat    = 'All';
let _activeTimeframe = '15m';
let _swapReversed = false;

/* Global AbortController — aborted on unmount to free connections */
let _ac = new AbortController();

/* Live Binance prices keyed by symbol e.g. BTCUSDT */
const _prices = {};

/* Market data keyed by `${asset}-${timeframe}` e.g. "btc-15m" */
const _marketsData = {};

/* Available timeframes */
const TIMEFRAMES = [
  { id: '5m',  label: '5 min',  minutes: 5,    slug: '5m'  },
  { id: '15m', label: '15 min', minutes: 15,   slug: '15m' },
  { id: '4h',  label: '4 hours', minutes: 240, slug: '4h'  },
];

/* General Polymarket markets list */
let _allMarkets = [];

/* Live positions from Polymarket Data API */
let _positions = [];
let _positionsLoading = false;

/* Open orders fetched from CLOB */
let _openOrders = [];
let _ordersLoading = false;

/* ==================================================
   CONSTANTS
   ================================================== */
const GAMMA = '/polymarket-api';

const ASSETS = [
  { id: 'btc',  name: 'Bitcoin',  pair: 'BTC/USD',  symbol: 'BTCUSDT',  icon: 'icons/btc.png',  color: '#F7931A', prefix: '\u20BF' },
  { id: 'eth',  name: 'Ethereum', pair: 'ETH/USD',  symbol: 'ETHUSDT',  icon: 'icons/eth.png',  color: '#627EEA', prefix: '\u039E' },
  { id: 'sol',  name: 'Solana',   pair: 'SOL/USD',  symbol: 'SOLUSDT',  icon: 'icons/sol.png',  color: '#9945FF', prefix: 'S' },
  { id: 'xrp',  name: 'XRP',      pair: 'XRP/USD',  symbol: 'XRPUSDT',  icon: 'icons/xrp.png',  color: '#0085C0', prefix: 'X' },
  { id: 'bnb',  name: 'BNB',      pair: 'BNB/USD',  symbol: 'BNBUSDT',  icon: 'icons/bnb.png',  color: '#F3BA2F', prefix: 'B' },
  { id: 'doge', name: 'Dogecoin', pair: 'DOGE/USD', symbol: 'DOGEUSDT', icon: 'icons/doge.png', color: '#C3A634', prefix: 'D' },
];

const SYMBOL_TO_ASSET = {};
for (const a of ASSETS) SYMBOL_TO_ASSET[a.symbol] = a.id;

const CATEGORIES = [
  { id: 'All',          label: 'All',        icon: '\u{1F30D}' },
  { id: 'Crypto',       label: 'Crypto',     icon: '\u20BF'    },
  { id: 'Sports',       label: 'Sports',     icon: '\u26BD'    },
  { id: 'Politics',     label: 'Politics',   icon: '\u{1F3DB}' },
  { id: 'Pop-Culture',  label: 'Pop Culture',icon: '\u2B50'    },
  { id: 'Business',     label: 'Business',   icon: '\u{1F4C8}' },
  { id: 'Science',      label: 'Science',    icon: '\u{1F52C}' },
];

const DEFAULT_BET_AMOUNT = 5;

/* ==================================================
   FORMAT HELPERS
   ================================================== */
function fmtUsd(n) {
  if (n == null || isNaN(n)) return '$\u2014';
  if (n >= 10000) return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1)     return '$' + n.toFixed(2);
  return '$' + n.toFixed(4);
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '\u2014';
  return (n * 100).toFixed(1) + '%';
}

function fmtVol(n) {
  if (!n || isNaN(n)) return '$0';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function fmtCountdown(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

/* ==================================================
   TIME HELPERS (multi-timeframe)
   ================================================== */
function getPeriodStart(tf) {
  const now = new Date();
  const tfObj = TIMEFRAMES.find(t => t.id === tf) || TIMEFRAMES[1]; // default 15m
  const totalMins = tfObj.minutes;

  if (totalMins <= 60) {
    // Sub-hourly: floor minutes
    const mins = Math.floor(now.getUTCMinutes() / totalMins) * totalMins;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), mins, 0));
  } else {
    // Multi-hour: floor hours
    const hours = totalMins / 60;
    const h = Math.floor(now.getUTCHours() / hours) * hours;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, 0, 0));
  }
}

function getTimeLeftMs(tf) {
  const tfObj = TIMEFRAMES.find(t => t.id === tf) || TIMEFRAMES[1];
  const start = getPeriodStart(tf);
  const end = new Date(start.getTime() + tfObj.minutes * 60 * 1000);
  return Math.max(0, end.getTime() - Date.now());
}

function getCurrentPeriodStart() {
  return getPeriodStart(_activeTimeframe);
}

/* ==================================================
   BINANCE WEBSOCKET
   ================================================== */
/* ==================================================
   POLYGON WALLET BALANCES
   ================================================== */
const POLYGON_RPC = '/polygon-rpc/';
const USDC_ADDR   = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const USDCE_ADDR  = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
let _polyAddr = null;
let _balanceIv = null;

function _preloadBalancesFromState() {
  if (!_container) return;
  try {
    const raw = JSON.parse(localStorage.getItem('00_balances') || '{}');
    const pol = raw.matic;
    const usdc = raw.usdc_polygon;
    const usdce = raw.usdce_polygon;
    if (pol !== undefined) {
      const el = _container.querySelector('#bet-bal-pol');
      if (el) el.textContent = (Number(BigInt(pol)) / 1e18).toFixed(4) + ' POL';
    }
    if (usdc !== undefined) {
      const el = _container.querySelector('#bet-bal-usdc');
      if (el) el.textContent = '$' + (Number(usdc) / 1e6).toFixed(2);
    }
    if (usdce !== undefined) {
      const el = _container.querySelector('#bet-bal-usdce');
      if (el) el.textContent = '$' + (Number(usdce) / 1e6).toFixed(2);
    }
  } catch {}
}

async function _fetchPolygonBalances() {
  if (!_polyAddr) {
    try {
      const state = await import('../core/state.js');
      const addrs = state.get('addresses') || {};
      _polyAddr = addrs.polygon || addrs.matic || addrs.eth || null;
    } catch {}
  }
  if (!_polyAddr || !_container) return;

  const addr = _polyAddr.replace('0x', '').padStart(64, '0');

  try {
    const rpcCall = (body) => {
      return fetch(POLYGON_RPC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: _ac.signal
      }).then(r => r.json());
    };

    // Batch all 3 calls in parallel
    const [polJ, usdcJ, usdceJ] = await Promise.all([
      rpcCall({ jsonrpc: '2.0', method: 'eth_getBalance', params: [_polyAddr, 'latest'], id: 1 }),
      rpcCall({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: USDC_ADDR, data: '0x70a08231' + addr }, 'latest'], id: 2 }),
      rpcCall({ jsonrpc: '2.0', method: 'eth_call', params: [{ to: USDCE_ADDR, data: '0x70a08231' + addr }, 'latest'], id: 3 }),
    ]);

    if (!_container) return;
    const polBal = parseInt(polJ.result || '0', 16) / 1e18;
    const usdcBal = parseInt(usdcJ.result || '0', 16) / 1e6;
    const usdceBal = parseInt(usdceJ.result || '0', 16) / 1e6;

    const polEl = _container.querySelector('#bet-bal-pol');
    const usdcEl = _container.querySelector('#bet-bal-usdc');
    const usdceEl = _container.querySelector('#bet-bal-usdce');
    if (polEl) polEl.textContent = polBal.toFixed(4) + ' POL';
    if (usdcEl) usdcEl.textContent = '$' + usdcBal.toFixed(2);
    if (usdceEl) usdceEl.textContent = '$' + usdceBal.toFixed(2);
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('[bet] Polygon balance error:', e.message);
  }
}

function _connectBinance() {
  if (_binanceWs) return;
  const streams = ASSETS.map(a => a.symbol.toLowerCase() + '@trade').join('/');
  try {
    _binanceWs = new WebSocket('wss://stream.binance.com:9443/stream?streams=' + streams);
    _binanceWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const trade = msg.data;
        if (!trade || !trade.s) return;
        const price = parseFloat(trade.p);
        if (!price || isNaN(price)) return;
        const prev = _prices[trade.s];
        _prices[trade.s] = price;
        _updateLivePrice(trade.s, price, prev);
      } catch { /* ignore parse errors */ }
    };
    _binanceWs.onclose = () => {
      _binanceWs = null;
      setTimeout(_connectBinance, 5000);
    };
    _binanceWs.onerror = () => {
      if (_binanceWs) _binanceWs.close();
    };
  } catch {
    _binanceWs = null;
  }
}

function _disconnectBinance() {
  if (_binanceWs) {
    _binanceWs.onclose = null;
    _binanceWs.close();
    _binanceWs = null;
  }
}

/** Live DOM update for a single price (no full re-render) */
function _updateLivePrice(symbol, price, prev) {
  if (!_container) return;
  const assetId = SYMBOL_TO_ASSET[symbol];
  if (!assetId) return;

  /* Price bar */
  const barEl = _container.querySelector(`[data-price-bar="${assetId}"]`);
  if (barEl) {
    barEl.textContent = fmtUsd(price);
    if (prev && price !== prev) {
      barEl.style.color = price > prev ? '#10B981' : '#EF4444';
      setTimeout(() => { if (barEl) barEl.style.color = ''; }, 400);
    }
  }

  /* 15-min card price */
  const cardPrice = _container.querySelector(`[data-card-price="${assetId}"]`);
  if (cardPrice) {
    cardPrice.textContent = fmtUsd(price);
    if (prev && price !== prev) {
      cardPrice.style.color = price > prev ? '#10B981' : '#EF4444';
      setTimeout(() => { if (cardPrice) cardPrice.style.color = ''; }, 400);
    }
  }
}

/* ==================================================
   GAMMA API -- FETCH MARKET (any timeframe)
   ================================================== */
async function fetchMarket(asset, tf) {
  tf = tf || _activeTimeframe;
  const period = getPeriodStart(tf);
  const ts = Math.floor(period.getTime() / 1000);
  const slug = `${asset.id}-updown-${tf}-${ts}`;
  const key = `${asset.id}-${tf}`;
  try {
    const tmr = setTimeout(() => {}, 8000);
    const r = await fetch(`${GAMMA}/events/slug/${slug}`, { signal: _ac.signal });
    clearTimeout(tmr);
    if (!r.ok) {
      _marketsData[key] = null;
      return;
    }
    const event = await r.json();
    if (!event || !event.markets || event.markets.length === 0) {
      _marketsData[key] = null;
      return;
    }
    /* Parse market data */
    const mkt = event.markets[0];
    let outcomes = [], outPrices = [], tokenIds = [];
    try { outcomes = typeof mkt.outcomes === 'string' ? JSON.parse(mkt.outcomes) : (mkt.outcomes || []); } catch { outcomes = []; }
    try { outPrices = typeof mkt.outcomePrices === 'string' ? JSON.parse(mkt.outcomePrices) : (mkt.outcomePrices || []); } catch { outPrices = []; }
    try {
      const clob = typeof mkt.clobTokenIds === 'string' ? JSON.parse(mkt.clobTokenIds) : (mkt.clobTokenIds || []);
      tokenIds = clob;
    } catch { tokenIds = []; }

    /* Find UP and DOWN indices */
    let upIdx = outcomes.findIndex(o => /up|yes|higher/i.test(o));
    let downIdx = outcomes.findIndex(o => /down|no|lower/i.test(o));
    if (upIdx === -1) upIdx = 0;
    if (downIdx === -1) downIdx = 1;

    const upPrice   = parseFloat(outPrices[upIdx] || 0);
    const downPrice = parseFloat(outPrices[downIdx] || 0);
    const spread    = 1.0 - (upPrice + downPrice);
    const volume    = parseFloat(mkt.volume || event.volume || 0);

    _marketsData[key] = {
      slug,
      conditionId: mkt.conditionId || '',
      question: mkt.question || event.title || slug,
      upPrice,
      downPrice,
      spread,
      volume,
      upTokenId: tokenIds[upIdx] || '',
      downTokenId: tokenIds[downIdx] || '',
      negRisk: !!mkt.negRisk,
      endDate: mkt.endDate || event.endDate || '',
      active: mkt.active !== false,
    };
    /* Patch this card immediately without full re-render */
    _patchCard(asset.id);
  } catch (e) {
    console.warn('[bet] Gamma fetch error for', asset.id, e.message);
    _marketsData[key] = null;
  }
}

/** Patch a single market card's data without re-rendering all cards */
function _patchCard(assetId) {
  if (!_container || _activeTab !== 'markets') return;
  const card = _container.querySelector(`.bet-card[data-asset="${assetId}"]`);
  if (!card) return;
  const mkt = _marketsData[assetId + '-' + _activeTimeframe];
  if (!mkt) return;
  const upEl = card.querySelector('[data-up]');
  const downEl = card.querySelector('[data-down]');
  const spreadEl = card.querySelector('[data-spread]');
  const volEl = card.querySelector('[data-vol]');
  const upBar = card.querySelector('[data-up-bar]');
  const downBar = card.querySelector('[data-down-bar]');
  const loadEl = card.querySelector('.bet-loading');
  if (upEl) upEl.textContent = 'UP ' + (mkt.upPrice * 100).toFixed(1) + '%';
  if (downEl) downEl.textContent = 'DOWN ' + (mkt.downPrice * 100).toFixed(1) + '%';
  if (spreadEl) { spreadEl.textContent = 'Spread: ' + (mkt.spread * 100).toFixed(1) + '%'; spreadEl.style.color = mkt.spread > 0.001 ? '#10B981' : ''; }
  if (volEl) volEl.textContent = 'Vol: $' + (mkt.volume >= 1000 ? (mkt.volume / 1000).toFixed(0) + 'K' : mkt.volume.toFixed(0));
  if (upBar) upBar.style.flex = String(mkt.upPrice);
  if (downBar) downBar.style.flex = String(mkt.downPrice);
  if (loadEl) loadEl.style.display = 'none';
}

async function fetchAllCurrentMarkets() {
  await Promise.allSettled(ASSETS.map(a => fetchMarket(a, _activeTimeframe)));
  _renderMarketCards();
}

/* ==================================================
   GAMMA API -- ALL MARKETS (EXPLORER)
   ================================================== */
const _TAG_TO_CAT = {
  'Sports': 'Sports', 'Basketball': 'Sports', 'Soccer': 'Sports', 'Football': 'Sports',
  'Baseball': 'Sports', 'Tennis': 'Sports', 'MMA': 'Sports', 'Golf': 'Sports',
  'NCAA': 'Sports', 'NBA': 'Sports', 'NFL': 'Sports', 'MLB': 'Sports', 'NHL': 'Sports',
  'FIFA World Cup': 'Sports', 'March Madness': 'Sports', 'Games': 'Sports',
  'Politics': 'Politics', 'Elections': 'Politics', 'Congress': 'Politics',
  'Trump': 'Politics', 'Geopolitics': 'Politics',
  'Crypto': 'Crypto', 'Bitcoin': 'Crypto', 'Ethereum': 'Crypto', 'DeFi': 'Crypto',
  'Pop Culture': 'Pop-Culture', 'Entertainment': 'Pop-Culture', 'Music': 'Pop-Culture',
  'Movies': 'Pop-Culture', 'TV': 'Pop-Culture', 'Celebrities': 'Pop-Culture',
  'Business': 'Business', 'Finance': 'Business', 'Economics': 'Business', 'Tech': 'Business',
  'Science': 'Science', 'AI': 'Science', 'Space': 'Science', 'Climate': 'Science',
};

function _resolveCategory(tags) {
  if (!tags || !tags.length) return 'Other';
  for (const t of tags) {
    const label = t.label || t;
    if (_TAG_TO_CAT[label]) return _TAG_TO_CAT[label];
  }
  return 'Other';
}

async function fetchAllMarkets() {
  try {
    const r = await fetch(`${GAMMA}/events?limit=100&closed=false&order=volume24hr&ascending=false`);
    if (!r.ok) return;
    const events = await r.json();
    _allMarkets = [];
    for (const ev of events) {
      // Use the first market from the event for pricing
      const mkt = ev.markets?.[0];
      if (!mkt) continue;
      let outcomes = [], outPrices = [], tokenIds = [];
      try { outcomes = typeof mkt.outcomes === 'string' ? JSON.parse(mkt.outcomes) : (mkt.outcomes || []); } catch {}
      try { outPrices = typeof mkt.outcomePrices === 'string' ? JSON.parse(mkt.outcomePrices) : (mkt.outcomePrices || []); } catch {}
      try { tokenIds = typeof mkt.clobTokenIds === 'string' ? JSON.parse(mkt.clobTokenIds) : (mkt.clobTokenIds || []); } catch {}
      const cat = _resolveCategory(ev.tags);
      const isMulti = (ev.markets?.length || 0) > 1;
      _allMarkets.push({
        id: ev.id || mkt.conditionId || '',
        question: ev.title || mkt.question || '?',
        image: ev.image || mkt.image || '',
        category: cat,
        volume: parseFloat(ev.volume || 0),
        volume24h: parseFloat(ev.volume24hr || 0),
        endDate: ev.endDate || mkt.endDate,
        outcomes: outcomes.map((o, i) => ({ name: o, price: parseFloat(outPrices[i] || 0), tokenId: tokenIds[i] || '' })),
        slug: ev.slug || mkt.slug || '',
        conditionId: mkt.conditionId || '',
        negRisk: !!mkt.negRisk,
        isMulti,
        marketsCount: ev.markets?.length || 1,
      });
    }
    _allMarkets.sort((a, b) => b.volume - a.volume);
  } catch (e) {
    console.warn('[bet] All markets fetch:', e.message);
  }
}

/* ==================================================
   RENDER: MAIN LAYOUT
   ================================================== */
function _renderMain() {
  if (!_container) return;

  /* Price bar items */
  const priceBar = ASSETS.map(a => {
    const p = _prices[a.symbol];
    return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;white-space:nowrap">
      <span style="width:8px;height:8px;border-radius:50%;background:${a.color};display:inline-block"></span>
      ${a.id.toUpperCase()}
      <span data-price-bar="${a.id}" style="font-family:'SF Mono','Share Tech Mono',monospace;transition:color .3s">${p ? fmtUsd(p) : '$\u2014'}</span>
    </span>`;
  }).join('<span style="color:var(--dt-border);margin:0 6px">\u2502</span>');

  /* Tab buttons */
  const tabs = [
    { id: 'markets',   label: '\u23F1 Markets'        },
    { id: 'wallet',    label: '\u{1F4B0} Wallet'      },
    { id: 'positions', label: '\u{1F4CB} Positions'    },
    { id: 'all',       label: '\u{1F30D} All Markets'  },
  ];
  const tabBar = tabs.map(t =>
    `<button data-action="tab" data-tab="${t.id}"
       style="padding:8px 16px;border-radius:8px;border:1px solid ${_activeTab === t.id ? 'var(--dt-accent,#0AC18E)' : 'var(--dt-border,#e2e8f0)'};
       background:${_activeTab === t.id ? 'var(--dt-accent-soft,rgba(10,193,142,.08))' : 'var(--dt-surface,#fff)'};
       color:${_activeTab === t.id ? 'var(--dt-accent,#0AC18E)' : 'var(--dt-text-secondary,#64748b)'};
       font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,'Share Tech Mono',sans-serif;transition:all .15s;white-space:nowrap"
    >${t.label}</button>`
  ).join('');

  _container.innerHTML = `
  <div style="padding:16px 24px;width:100%">
    <!-- Header -->
    <div class="dt-page-header">
      <div class="dt-page-title-wrap">
        <div class="dt-page-icon" style="background:rgba(139,92,246,.12);color:#8B5CF6;font-size:24px">\u{1F3B2}</div>
        <div>
          <div class="dt-page-title">00 Bet</div>
          <div class="dt-page-sub">Polymarket \u00B7 Crypto Markets</div>
        </div>
      </div>
    </div>

    <!-- Wallet + Live prices -->
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <!-- Polygon wallet balances -->
      <div style="display:flex;gap:16px;padding:10px 16px;background:var(--dt-surface,#fff);border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;align-items:center;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:6px">
          <img src="icons/matic.png" style="width:16px;height:16px" onerror="this.outerHTML='<span style=\\'color:#8247E5;font-weight:700;font-size:12px\\'>POL</span>'">
          <span id="bet-bal-pol" style="font-size:12px;font-weight:600;font-family:'SF Mono',monospace">--</span>
        </div>
        <div style="width:1px;height:20px;background:var(--dt-border,#e2e8f0)"></div>
        <div style="display:flex;align-items:center;gap:6px">
          <img src="icons/usdc.png" style="width:16px;height:16px" onerror="this.outerHTML='<span style=\\'color:#2775CA;font-weight:700;font-size:12px\\'>USDC</span>'">
          <span id="bet-bal-usdc" style="font-size:12px;font-weight:600;font-family:'SF Mono',monospace">--</span>
        </div>
        <div style="width:1px;height:20px;background:var(--dt-border,#e2e8f0)"></div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="color:#2775CA;font-weight:700;font-size:10px">USDC.e</span>
          <span id="bet-bal-usdce" style="font-size:12px;font-weight:600;font-family:'SF Mono',monospace">--</span>
        </div>
      </div>
      <!-- Live crypto prices -->
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px 16px;background:var(--dt-surface,#fff);border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;flex:1;min-width:300px">
        <span style="font-size:10px;font-weight:700;color:var(--dt-text-secondary,#64748b);text-transform:uppercase;letter-spacing:.5px;margin-right:4px">LIVE</span>
        <span style="width:6px;height:6px;border-radius:50%;background:#10B981;animation:pulse-dot 2s infinite;display:inline-block"></span>
        ${priceBar}
      </div>
    </div>

    <!-- Tab bar -->
    <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">${tabBar}</div>

    <!-- Pane container -->
    <div id="bet-pane"></div>
  </div>

  <style>
    @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:.3} }
    @keyframes pulse-red { 0%,100%{opacity:1} 50%{opacity:.5} }
    .bet-prob-bar { height:8px; border-radius:4px; transition:width .5s ease; }
    .bet-card { background:var(--dt-surface,#fff); border:1px solid var(--dt-border,#e2e8f0); border-radius:14px; padding:20px; margin-bottom:16px; transition:box-shadow .15s; }
    .bet-card:hover { box-shadow:var(--dt-shadow-lg,0 4px 16px rgba(0,0,0,.08)); }
    .bet-btn { padding:6px 10px; border-radius:8px; border:none; font-size:11px; font-weight:700; cursor:pointer; font-family:Inter,'Share Tech Mono',sans-serif; transition:all .15s; white-space:nowrap; }
    .bet-btn:hover { filter:brightness(1.1); transform:translateY(-1px); }
    .bet-btn-up { background:#10B981; color:#fff; }
    .bet-btn-down { background:#EF4444; color:#fff; }
    .bet-btn-arb { background:linear-gradient(135deg,#F59E0B,#D97706); color:#fff; }
    .bet-btn-arb:disabled { opacity:.4; cursor:not-allowed; filter:none; transform:none; }
    .bet-countdown-urgent { color:#EF4444 !important; animation:pulse-red 1s infinite; }
    .bet-mkt-row { display:flex; align-items:center; gap:14px; padding:14px 16px; border:1px solid var(--dt-border,#e2e8f0); border-radius:12px; margin-bottom:10px; cursor:pointer; transition:box-shadow .15s; background:var(--dt-surface,#fff); }
    .bet-mkt-row:hover { box-shadow:0 2px 12px rgba(0,0,0,.06); }
    .bet-cat-btn { padding:6px 12px; border-radius:6px; border:1px solid var(--dt-border,#e2e8f0); background:var(--dt-surface,#fff); font-size:11px; font-weight:600; cursor:pointer; font-family:Inter,sans-serif; transition:all .15s; color:var(--dt-text-secondary,#64748b); }
    .bet-cat-btn.active { border-color:var(--dt-accent,#0AC18E); background:var(--dt-accent-soft,rgba(10,193,142,.08)); color:var(--dt-accent,#0AC18E); }
    .bet-table-head { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr; gap:4px; padding:8px 12px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:var(--dt-text-secondary,#64748b); border-bottom:1px solid var(--dt-border,#e2e8f0); }
    .bet-table-row { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr; gap:4px; padding:10px 12px; font-size:12px; color:var(--dt-text,#1a1a2e); border-bottom:1px solid var(--dt-border-subtle,#f1f5f9); align-items:center; }
  </style>`;

  _preloadBalancesFromState();
  _renderPane();
}

/* ==================================================
   RENDER: ACTIVE PANE
   ================================================== */
function _renderPane() {
  const pane = _container ? _container.querySelector('#bet-pane') : null;
  if (!pane) return;

  if (_activeTab === 'markets')   pane.innerHTML = _htmlMarkets();
  else if (_activeTab === 'wallet')    { pane.innerHTML = _htmlWallet(); _loadWalletData(); }
  else if (_activeTab === 'positions') pane.innerHTML = _htmlPositions();
  else if (_activeTab === 'all')  pane.innerHTML = _htmlAllMarkets();
}

/* ==================================================
   RENDER: 15-MIN MARKET CARDS
   ================================================== */
function _htmlMarkets() {
  const timeLeft = getTimeLeftMs(_activeTimeframe);
  const urgent = timeLeft < 120000;
  const tfObj = TIMEFRAMES.find(t => t.id === _activeTimeframe) || TIMEFRAMES[1];

  /* Timeframe selector */
  let tfBar = '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  for (const tf of TIMEFRAMES) {
    const active = tf.id === _activeTimeframe;
    tfBar += `<button data-action="timeframe" data-tf="${tf.id}" style="
      padding:8px 18px;border-radius:20px;border:1.5px solid ${active ? '#8B5CF6' : '#e2e8f0'};
      background:${active ? '#8B5CF6' : '#fff'};color:${active ? '#fff' : '#475569'};
      font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;
    ">${tf.label}</button>`;
  }
  tfBar += '</div>';

  let cards = '';
  for (const asset of ASSETS) {
    const mkt = _marketsData[asset.id + '-' + _activeTimeframe];
    const price = _prices[asset.symbol];

    const upPct   = mkt ? mkt.upPrice   : 0;
    const downPct = mkt ? mkt.downPrice : 0;
    const spread  = mkt ? mkt.spread    : 0;
    const vol     = mkt ? mkt.volume    : 0;
    const spreadClass = spread > 0.001 ? 'color:#10B981;font-weight:700' : 'color:var(--dt-text-secondary,#64748b)';
    const hasArb = spread > 0.005;

    cards += `
    <div class="bet-card" data-asset="${asset.id}">
      <!-- Top row: icon + name + price + countdown -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;border-radius:12px;background:${asset.color}15;display:flex;align-items:center;justify-content:center">
            <img src="${asset.icon}" style="width:30px;height:30px;border-radius:50%" onerror="this.style.display='none';this.parentElement.textContent='${asset.prefix}'">
          </div>
          <div>
            <div style="font-size:15px;font-weight:700;color:var(--dt-text,#1a1a2e)">${asset.pair}</div>
            <div style="font-size:11px;color:var(--dt-text-secondary,#64748b)">${asset.name}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:20px">
          <div style="text-align:right">
            <div data-card-price="${asset.id}" style="font-family:'SF Mono','Share Tech Mono',monospace;font-size:18px;font-weight:700;color:var(--dt-text,#1a1a2e);transition:color .3s">${price ? fmtUsd(price) : '$\u2014'}</div>
          </div>
          <div style="text-align:center;min-width:60px">
            <div style="font-size:10px;color:var(--dt-text-secondary,#64748b);margin-bottom:2px">\u23F1</div>
            <div data-countdown="${asset.id}" style="font-family:'SF Mono','Share Tech Mono',monospace;font-size:16px;font-weight:700;${urgent ? 'color:#EF4444' : 'color:var(--dt-text,#1a1a2e)'}" class="${urgent ? 'bet-countdown-urgent' : ''}">${fmtCountdown(timeLeft)}</div>
          </div>
        </div>
      </div>

      ${mkt ? `
      <!-- Probability bars -->
      <div style="margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <span data-up style="font-size:12px;font-weight:600;color:#10B981">UP ${fmtPct(upPct)}</span>
          <span data-down style="font-size:12px;font-weight:600;color:#EF4444">DOWN ${fmtPct(downPct)}</span>
        </div>
        <div style="display:flex;height:8px;border-radius:4px;overflow:hidden;background:var(--dt-border-subtle,#f1f5f9)">
          <div data-up-bar class="bet-prob-bar" style="flex:${upPct};background:#10B981"></div>
          <div data-down-bar class="bet-prob-bar" style="flex:${downPct};background:#EF4444"></div>
        </div>
      </div>

      <!-- Spread + Volume -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-top:8px;border-top:1px solid var(--dt-border-subtle,#f1f5f9)">
        <div style="font-size:11px">
          <span data-spread style="${spreadClass}">Spread: ${(spread * 100).toFixed(1)}%${hasArb ? ' \u2728' : ''}</span>
        </div>
        <div data-vol style="font-size:11px;color:var(--dt-text-secondary,#64748b)">
          Vol: ${fmtVol(vol)}
        </div>
      </div>

      <!-- Action buttons -->
      <div style="display:flex;gap:8px">
        <button class="bet-btn bet-btn-up" data-action="buy-up" data-market="${asset.id}" style="flex:1">
          BUY UP $${DEFAULT_BET_AMOUNT}
        </button>
        <button class="bet-btn bet-btn-down" data-action="buy-down" data-market="${asset.id}" style="flex:1">
          BUY DOWN $${DEFAULT_BET_AMOUNT}
        </button>
        <button class="bet-btn bet-btn-arb" data-action="arb" data-market="${asset.id}" ${hasArb ? '' : 'disabled'} style="flex:0 0 auto;padding:8px 14px">
          ARB
        </button>
      </div>
      ` : `
      <!-- No market data -->
      <div class="bet-loading" style="text-align:center;padding:20px 0;color:var(--dt-text-secondary,#64748b);font-size:12px">
        <div style="font-size:20px;margin-bottom:6px">\u23F3</div>
        Loading market data...
      </div>
      `}
    </div>`;
  }

  return `
    ${tfBar}
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">
      ${cards}
    </div>
    <div style="text-align:center;margin-top:12px;font-size:10px;color:var(--dt-text-secondary,#64748b)">
      Markets auto-refresh every 10s \u00B7 Prices via Binance WebSocket
    </div>`;
}

/** Update only the countdown + probability numbers without full re-render */
function _renderMarketCards() {
  if (!_container || _activeTab !== 'markets') return;
  const pane = _container.querySelector('#bet-pane');
  if (!pane) return;
  /* Full pane re-render for 15m tab (lightweight since it's just innerHTML) */
  pane.innerHTML = _htmlMarkets();
}

/** Update countdown display only (called every 1s) */
function _updateCountdowns() {
  if (!_container) return;

  /* Markets tab countdowns */
  if (_activeTab === 'markets') {
    const timeLeft = getTimeLeftMs(_activeTimeframe);
    const urgent = timeLeft < 120000;
    const text = fmtCountdown(timeLeft);

    for (const asset of ASSETS) {
      const el = _container.querySelector(`[data-countdown="${asset.id}"]`);
      if (el) {
        el.textContent = text;
        if (urgent) {
          el.classList.add('bet-countdown-urgent');
          el.style.color = '#EF4444';
        } else {
          el.classList.remove('bet-countdown-urgent');
          el.style.color = '';
        }
      }
    }

    if (timeLeft === 0) {
      setTimeout(() => { fetchAllCurrentMarkets(); }, 5000);
    }
  }

  /* Positions tab: live countdowns on orders + positions */
  if (_activeTab === 'positions') {
    const allCountdowns = _container.querySelectorAll('[data-order-countdown],[data-pos-countdown]');
    for (const el of allCountdowns) {
      const end = el.dataset.orderCountdown || el.dataset.posCountdown;
      if (!end) { el.textContent = '\u2014'; continue; }
      const endMs = Number(end) > 1e12 ? Number(end) : Number(end) > 1e9 ? Number(end) * 1000 : new Date(end).getTime();
      const ms = endMs - Date.now();
      if (ms <= 0) {
        el.textContent = 'ENDED';
        el.style.color = '#94a3b8';
        el.style.animation = '';
      } else {
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        el.textContent = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
        el.style.color = ms < 120000 ? '#EF4444' : 'var(--dt-accent,#0AC18E)';
        el.style.animation = ms < 120000 ? 'pulse-red 1s infinite' : '';
      }
    }
  }
}

/* ==================================================
   RENDER: POSITIONS TAB
   ================================================== */
function _htmlPositions() {
  /* ── Section 1: Open Orders from CLOB ── */
  let ordersHtml = '';
  if (_ordersLoading) {
    ordersHtml = `<div style="padding:32px;text-align:center;color:var(--dt-text-secondary,#64748b);font-size:12px">\u23F3 Loading open orders...</div>`;
  } else if (_openOrders.length === 0) {
    ordersHtml = `<div style="padding:24px;text-align:center;color:var(--dt-text-secondary,#64748b);font-size:12px">No open orders</div>`;
  } else {
    let orderRows = '';
    for (const o of _openOrders) {
      const oid = o.id || o.orderID || '';
      const side = (o.side || o.order_side || '').toUpperCase();
      const isBuy = side === 'BUY';
      const price = o.price ? parseFloat(o.price) : 0;
      const origSize = o.original_size ? parseFloat(o.original_size) : (o.size ? parseFloat(o.size) : 0);
      const matched = o.size_matched ? parseFloat(o.size_matched) : 0;
      const remaining = origSize - matched;
      const priceCents = (price * 100).toFixed(1);
      const cost = (remaining * price).toFixed(2);
      // Try to find matching asset name + endDate
      const { name: assetName, endDate: orderEndDate } = _resolveOrderInfo(o);

      orderRows += `
      <div class="bet-table-row" style="grid-template-columns:2.2fr 0.6fr 0.8fr 0.7fr 0.8fr 0.7fr 1fr 0.7fr">
        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_escHtml(o.asset_id || o.tokenId || '')}">${assetName}</div>
        <div style="font-weight:700;color:${isBuy ? '#10B981' : '#EF4444'}">${side}</div>
        <div style="font-family:'SF Mono',monospace;font-size:11px">${remaining.toFixed(2)}</div>
        <div style="font-weight:600">${priceCents}\u00A2</div>
        <div style="font-family:'SF Mono',monospace;font-size:11px">$${cost}</div>
        <div style="font-size:10px;color:var(--dt-text-secondary,#64748b)">${matched > 0 ? (matched / origSize * 100).toFixed(0) + '%' : '\u2014'}</div>
        <div data-order-countdown="${orderEndDate || ''}" style="font-family:'SF Mono',monospace;font-size:12px;font-weight:700;color:var(--dt-accent,#0AC18E)"></div>
        <div><button class="bet-btn" data-action="cancel-order" data-order-id="${oid}" style="background:#EF4444;color:#fff;padding:4px 10px;font-size:10px">\u2717 Cancel</button></div>
      </div>`;
    }

    ordersHtml = `
    <div style="overflow-x:auto">
      <div class="bet-table-head" style="grid-template-columns:2.2fr 0.6fr 0.8fr 0.7fr 0.8fr 0.7fr 1fr 0.7fr">
        <div>Market</div><div>Side</div><div>Size</div><div>Price</div><div>Cost</div><div>Filled</div><div>Time Left</div><div></div>
      </div>
      ${orderRows}
    </div>`;
  }

  /* ── Section 2: Live Positions from Polymarket Data API ── */
  let posHtml = '';
  if (_positionsLoading) {
    posHtml = `<div class="bet-card" style="text-align:center;padding:32px;margin-top:16px"><span style="color:var(--dt-text-secondary,#64748b);font-size:12px">\u23F3 Loading positions...</span></div>`;
  } else if (_positions.length > 0) {
    let posRows = '';
    let totalPnl = 0;
    let totalCost = 0;
    let totalValue = 0;

    for (const p of _positions) {
      const isWin = p.pnl >= 0;
      const rowBg = isWin ? 'rgba(16,185,129,.04)' : 'rgba(239,68,68,.04)';
      const rowBorder = isWin ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)';
      const pnlColor = isWin ? '#10B981' : '#EF4444';
      const pnlSign = isWin ? '+' : '';

      // Extract end timestamp from slug: slug format is "xxx-updown-{tf}-{startTs}"
      // The timestamp in the slug is the START, not the end. Add timeframe duration.
      const slugParts = (p.slug || '').split('-');
      const slugTs = parseInt(slugParts[slugParts.length - 1]) || 0;
      let tfMinutes = 0;
      for (const part of slugParts) {
        if (part === '5m') tfMinutes = 5;
        else if (part === '15m') tfMinutes = 15;
        else if (part === '4h') tfMinutes = 240;
      }
      const endTs = slugTs > 1e9 ? (slugTs + tfMinutes * 60) * 1000 : (p.endDate ? new Date(p.endDate + 'T23:59:59').getTime() : 0);
      const isLive = endTs > Date.now();

      // Status badge
      let badge = '';
      if (p.redeemable) badge = '<span style="background:#F59E0B;color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">REDEEM</span>';
      else if (p.closed) badge = '<span style="background:#64748b;color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">CLOSED</span>';
      else if (isLive) badge = '<span style="background:#3B82F6;color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">LIVE</span>';
      else badge = `<span style="background:${pnlColor};color:#fff;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700">${isWin ? 'WIN' : 'LOSS'}</span>`;

      totalPnl += p.pnl;
      totalCost += p.costBasis;
      totalValue += p.currentValue;

      // Truncate title
      const shortTitle = p.title.length > 40 ? p.title.slice(0, 38) + '\u2026' : p.title;

      posRows += `
      <div style="display:grid;grid-template-columns:0.6fr 2fr 0.6fr 0.7fr 0.6fr 0.6fr 1fr 0.8fr 1fr;gap:4px;padding:10px 12px;font-size:12px;border-bottom:1px solid ${rowBorder};background:${rowBg};align-items:center">
        <div>${badge}</div>
        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_escHtml(p.title)}">${_escHtml(shortTitle)}</div>
        <div style="font-weight:700;color:${p.outcome === 'Yes' || p.outcome === 'UP' ? '#10B981' : '#EF4444'}">${p.outcome}</div>
        <div style="font-family:'SF Mono',monospace;font-size:11px">${p.size.toFixed(2)}</div>
        <div>${(p.avgPrice * 100).toFixed(1)}\u00A2</div>
        <div style="font-weight:600">${(p.curPrice * 100).toFixed(1)}\u00A2</div>
        <div data-pos-countdown="${endTs || ''}" style="font-family:'SF Mono',monospace;font-size:12px;font-weight:700"></div>
        <div style="font-family:'SF Mono',monospace;font-size:11px">$${p.costBasis.toFixed(2)} \u2192 $${p.currentValue.toFixed(2)}</div>
        <div style="font-weight:700;color:${pnlColor};font-size:13px">${pnlSign}$${Math.abs(p.pnl).toFixed(2)} <span style="font-size:10px">(${pnlSign}${p.pnlPct.toFixed(1)}%)</span></div>
      </div>`;
    }

    const totalIsWin = totalPnl >= 0;
    const totalColor = totalIsWin ? '#10B981' : '#EF4444';
    const totalSign = totalIsWin ? '+' : '';
    const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(1) : '0';

    posHtml = `
    <div class="bet-card" style="padding:0;overflow:hidden;margin-top:16px">
      <div style="padding:14px 20px;border-bottom:1px solid var(--dt-border,#e2e8f0);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:14px;font-weight:700;color:var(--dt-text,#1a1a2e)">Positions</div>
          <span style="font-size:11px;font-weight:600;color:var(--dt-text-secondary,#64748b);background:var(--dt-surface-alt,#f1f5f9);padding:2px 8px;border-radius:10px">${_positions.length}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="text-align:right">
            <div style="font-size:14px;font-weight:700;color:${totalColor}">${totalSign}$${Math.abs(totalPnl).toFixed(2)} (${totalSign}${totalPnlPct}%)</div>
            <div style="font-size:10px;color:var(--dt-text-secondary,#64748b)">$${totalCost.toFixed(2)} \u2192 $${totalValue.toFixed(2)}</div>
          </div>
          ${_positions.some(p => p.redeemable) ? '<button class="bet-btn" data-action="redeem-all" style="background:#F59E0B;color:#fff;padding:6px 12px;font-size:11px">Redeem All</button>' : ''}
          <button class="bet-btn" data-action="refresh-positions" style="background:var(--dt-surface-alt,#f1f5f9);color:var(--dt-text-secondary,#64748b);padding:6px 12px;font-size:11px">\u{1F504}</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <div style="display:grid;grid-template-columns:0.6fr 2fr 0.6fr 0.7fr 0.6fr 0.6fr 1fr 0.8fr 1fr;gap:4px;padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--dt-text-secondary,#64748b);border-bottom:1px solid var(--dt-border,#e2e8f0)">
          <div>Status</div><div>Market</div><div>Side</div><div>Shares</div><div>Entry</div><div>Now</div><div>Time Left</div><div>Cost \u2192 Value</div><div>PnL</div>
        </div>
        ${posRows}
      </div>
    </div>`;
  }

  return `
  <div class="bet-card" style="padding:0;overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid var(--dt-border,#e2e8f0);display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:14px;font-weight:700;color:var(--dt-text,#1a1a2e)">Open Orders</div>
        <span style="font-size:11px;font-weight:600;color:var(--dt-text-secondary,#64748b);background:var(--dt-surface-alt,#f1f5f9);padding:2px 8px;border-radius:10px">${_openOrders.length}</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="bet-btn" data-action="refresh-orders" style="background:var(--dt-surface-alt,#f1f5f9);color:var(--dt-text-secondary,#64748b);padding:6px 12px;font-size:11px">\u{1F504} Refresh</button>
        ${_openOrders.length > 0 ? '<button class="bet-btn" data-action="cancel-all-orders" style="background:#EF4444;color:#fff;padding:6px 12px;font-size:11px">\u2717 Cancel All</button>' : ''}
      </div>
    </div>
    ${ordersHtml}
  </div>
  ${posHtml}`;
}

/** Resolve name + endDate for an order's token */
function _resolveOrderInfo(order) {
  const tokenId = order.asset_id || order.tokenId || order.token_id || '';
  // Check against known market token IDs
  for (const key of Object.keys(_marketsData)) {
    const m = _marketsData[key];
    if (m.upTokenId === tokenId || m.downTokenId === tokenId) {
      const dir = m.upTokenId === tokenId ? 'UP' : 'DOWN';
      const asset = ASSETS.find(a => a.id === key.split('-')[0]);
      return { name: (asset ? asset.pair : key.split('-')[0].toUpperCase()) + ' ' + dir, endDate: m.endDate || '' };
    }
  }
  // Fallback: check localStorage positions for matching tokenId
  const saved = JSON.parse(localStorage.getItem('00_bet_positions') || '[]');
  const match = saved.find(p => p.tokenId === tokenId);
  if (match) {
    const asset = ASSETS.find(a => a.id === match.asset);
    return { name: (asset ? asset.pair : match.asset) + ' ' + (match.direction || ''), endDate: '' };
  }
  return { name: tokenId ? tokenId.slice(0, 10) + '\u2026' : '\u2014', endDate: '' };
}

/* ==================================================
   RENDER: ALL MARKETS TAB (POLYMARKET EXPLORER)
   ================================================== */
function _htmlAllMarkets() {
  /* Category filter bar */
  const catBar = CATEGORIES.map(c =>
    `<button class="bet-cat-btn${_activeCat === c.id ? ' active' : ''}" data-action="category" data-cat="${c.id}">
      ${c.icon} ${c.label}
    </button>`
  ).join('');

  /* Filter markets by category */
  let filtered = _allMarkets;
  if (_activeCat !== 'All') {
    filtered = _allMarkets.filter(m => m.category === _activeCat);
  }

  let rows = '';
  if (filtered.length === 0) {
    rows = `<div style="padding:40px;text-align:center;color:var(--dt-text-secondary,#64748b);font-size:12px">
      ${_allMarkets.length === 0 ? '\u23F3 Loading Polymarket data...' : 'No markets in this category'}
    </div>`;
  } else {
    rows = filtered.slice(0, 50).map(m => {
      const yesPrice = m.outcomes[0]?.price || 0;
      const noPrice  = m.outcomes[1]?.price || 0;
      const yesColor = yesPrice > 0.5 ? '#10B981' : '#EF4444';
      const endStr = m.endDate ? new Date(m.endDate).toLocaleDateString() : '';

      return `
      <div class="bet-mkt-row" data-action="open-market" data-slug="${m.slug || m.id}">
        ${m.image
          ? `<img src="${m.image}" style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">`
          : `<div style="width:44px;height:44px;border-radius:10px;background:#8247E5;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;flex-shrink:0;font-weight:700">P</div>`
        }
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--dt-text,#1a1a2e);line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${_escHtml(m.question)}</div>
          <div style="font-size:10px;color:var(--dt-text-secondary,#64748b);margin-top:3px">
            Vol: ${fmtVol(m.volume)}${endStr ? ' \u00B7 Ends ' + endStr : ''}
          </div>
        </div>
        <div style="display:flex;gap:12px;align-items:center;flex-shrink:0">
          <div style="text-align:center">
            <div style="font-size:18px;font-weight:700;color:#10B981">${(yesPrice * 100).toFixed(0)}\u00A2</div>
            <div style="font-size:9px;font-weight:600;color:var(--dt-text-secondary,#64748b)">YES</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:18px;font-weight:700;color:#EF4444">${(noPrice * 100).toFixed(0)}\u00A2</div>
            <div style="font-size:9px;font-weight:600;color:var(--dt-text-secondary,#64748b)">NO</div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  return `
  <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">${catBar}</div>
  <div>${rows}</div>
  <div style="text-align:center;margin-top:12px;font-size:10px;color:var(--dt-text-secondary,#64748b)">
    Showing ${Math.min(filtered.length, 50)} of ${filtered.length} markets \u00B7 Data from Gamma API
  </div>`;
}

/* ==================================================
   HTML ESCAPE HELPER
   ================================================== */
function _escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ==================================================
   ACTION HANDLERS
   ================================================== */
function _switchTab(tab) {
  _activeTab = tab;
  _renderMain();

  /* Lazy-load data for the newly active tab */
  if (tab === 'markets') {
    // Re-fetch if no data for current timeframe
    const hasData = ASSETS.some(a => _marketsData[a.id + '-' + _activeTimeframe]);
    if (!hasData) fetchAllCurrentMarkets();
  }
  if (tab === 'all' && _allMarkets.length === 0) {
    fetchAllMarkets().then(() => _renderPane());
  }
  if (tab === 'positions') {
    _fetchOpenOrders();
    _fetchPositions();
  }
}

let _tfVersion = 0;
function _switchTimeframe(tf) {
  _activeTimeframe = tf;
  const myVersion = ++_tfVersion;
  /* Render immediately with whatever data we have (may show "Loading...") */
  _renderPane();
  /* Fetch in background — only render if still on same timeframe */
  Promise.allSettled(ASSETS.map(a => fetchMarket(a, tf))).then(() => {
    if (_tfVersion === myVersion) _renderMarketCards();
  });
}

function _filterCategory(cat) {
  _activeCat = cat;
  _renderPane();
}

async function _ensureClob() {
  const clob = await import('../core/polymarket-clob.js');
  // Always call initClob to ensure _privKey and _address are in memory
  // initClob is idempotent — if creds exist in localStorage it just restores state
  const { deriveEvmPrivKey } = await import('../core/addr-derive.js');
  const auth = await import('../core/auth.js');
  const keys = auth.getKeys();
  const privKey = deriveEvmPrivKey(keys);
  if (!privKey) throw new Error('Cannot derive EVM key');
  const privHex = (privKey instanceof Uint8Array || Array.isArray(privKey))
    ? Array.from(privKey).map(b => b.toString(16).padStart(2, '0')).join('')
    : typeof privKey === 'string' ? privKey.replace(/^0x/, '') : String(privKey);
  await clob.initClob(privHex);
  return clob;
}

async function _placeBet(assetId, direction) {
  const mkt = _marketsData[assetId + '-' + _activeTimeframe];
  if (!mkt) { _toast('No market data available', true); return; }
  const asset = ASSETS.find(a => a.id === assetId);
  const isUp = direction === 'up';
  const tokenId = isUp ? mkt.upTokenId : mkt.downTokenId;
  const price = isUp ? mkt.upPrice : mkt.downPrice;
  const label = isUp ? 'UP' : 'DOWN';

  // Show bet modal
  const modal = document.createElement('div');
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:16px;padding:32px;width:420px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:18px;font-weight:700;margin:0">Buy ${label} \u2014 ${asset?.pair || assetId}</h3>
          <button id="bet-modal-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:#94a3b8">&times;</button>
        </div>
        <div style="background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#64748b;font-size:12px">Direction</span>
            <span style="font-weight:700;color:${isUp ? '#10B981' : '#EF4444'}">${label}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#64748b;font-size:12px">Price</span>
            <span style="font-weight:600">${(price * 100).toFixed(1)}\u00A2</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:#64748b;font-size:12px">Potential payout</span>
            <span style="font-weight:600;color:#10B981">${(1 / price).toFixed(2)}x</span>
          </div>
        </div>
        <label style="font-size:12px;font-weight:600;color:#334155;display:block;margin-bottom:6px">AMOUNT (USDC.e)</label>
        <div style="display:flex;gap:8px;margin-bottom:16px">
          <input id="bet-modal-amt" type="number" value="5" min="5" step="1" style="flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:inherit">
          <button class="bet-quick-amt" data-amt="5" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">$5</button>
          <button class="bet-quick-amt" data-amt="10" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">$10</button>
          <button class="bet-quick-amt" data-amt="25" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">$25</button>
        </div>
        <div id="bet-modal-steps" style="margin-bottom:16px">
          <div id="bet-ms1" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <span class="bms-icon" style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;background:#f1f5f9;color:#94a3b8">1</span>
            <span style="font-size:12px">Initialize CLOB connection</span>
          </div>
          <div id="bet-ms2" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <span class="bms-icon" style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;background:#f1f5f9;color:#94a3b8">2</span>
            <span style="font-size:12px">Sign EIP-712 order</span>
          </div>
          <div id="bet-ms3" style="display:flex;align-items:center;gap:10px;padding:8px 0">
            <span class="bms-icon" style="width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;background:#f1f5f9;color:#94a3b8">3</span>
            <span style="font-size:12px">Place order via Tor</span>
          </div>
        </div>
        <button id="bet-modal-confirm" style="width:100%;padding:14px;border:none;border-radius:10px;background:${isUp ? '#10B981' : '#EF4444'};color:#fff;font-size:15px;font-weight:700;cursor:pointer">Place ${label} Bet \u2192</button>
        <div id="bet-modal-result" style="display:none;text-align:center;padding:16px;margin-top:12px"></div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Quick amount buttons
  modal.querySelectorAll('.bet-quick-amt').forEach(b => {
    b.onclick = () => { modal.querySelector('#bet-modal-amt').value = b.dataset.amt; };
  });

  // Close
  modal.querySelector('#bet-modal-close').onclick = () => modal.remove();
  modal.querySelector('div[style*="position:fixed"]').onclick = (e) => { if (e.target === e.currentTarget) modal.remove(); };

  function setBetStep(n, status) {
    const el = modal.querySelector('#bet-ms' + n);
    if (!el) return;
    const icon = el.querySelector('.bms-icon');
    const text = el.querySelector('span:last-child');
    if (status === 'active') { icon.style.background = '#FEF3C7'; icon.style.color = '#D97706'; icon.textContent = '\u23F3'; text.style.color = '#D97706'; text.style.fontWeight = '600'; }
    else if (status === 'done') { icon.style.background = '#D1FAE5'; icon.style.color = '#10B981'; icon.textContent = '\u2713'; text.style.color = '#10B981'; text.style.fontWeight = '400'; }
    else if (status === 'error') { icon.style.background = '#FEE2E2'; icon.style.color = '#EF4444'; icon.textContent = '\u2717'; text.style.color = '#EF4444'; }
  }

  // Confirm button
  modal.querySelector('#bet-modal-confirm').onclick = async () => {
    const amt = parseFloat(modal.querySelector('#bet-modal-amt').value);
    if (!amt || amt < 5) { _toast('Minimum bet is $5', true); return; }
    const confirmBtn = modal.querySelector('#bet-modal-confirm');
    confirmBtn.disabled = true; confirmBtn.textContent = 'Placing...';

    try {
      // Step 1: Init CLOB
      setBetStep(1, 'active');
      const clob = await _ensureClob();
      setBetStep(1, 'done');

      // Step 2: Sign order
      setBetStep(2, 'active');
      setBetStep(2, 'done');

      // Step 3: Place via Tor
      setBetStep(3, 'active');
      const result = await clob.placeBuyOrder(tokenId, amt, price, { negRisk: mkt.negRisk });
      setBetStep(3, 'done');

      // Success
      const resultEl = modal.querySelector('#bet-modal-result');
      resultEl.style.display = 'block';
      const oid = result?.orderID || result?.id || 'pending';
      resultEl.innerHTML = '<div style="font-size:32px;margin-bottom:8px">\u2705</div><div style="font-size:16px;font-weight:700;color:#10B981">Order Placed!</div><div style="font-size:12px;color:#64748b;margin-top:4px;word-break:break-all">Order ID: ' + (oid.length > 20 ? oid.slice(0, 10) + '...' + oid.slice(-8) : oid) + '</div>';
      confirmBtn.style.display = 'none';

      // Save to positions
      const positions = JSON.parse(localStorage.getItem('00_bet_positions') || '[]');
      positions.unshift({ asset: assetId, direction: label, amount: amt, price, tokenId, time: Date.now(), orderId: result?.orderID || result?.id, tf: _activeTimeframe });
      localStorage.setItem('00_bet_positions', JSON.stringify(positions));

    } catch (e) {
      for (let i = 1; i <= 3; i++) {
        const icon = modal.querySelector('#bet-ms' + i + ' .bms-icon');
        if (icon?.textContent === '\u23F3') {
          setBetStep(i, 'error');
          modal.querySelector('#bet-ms' + i + ' span:last-child').textContent = e.message;
          break;
        }
      }
      confirmBtn.disabled = false; confirmBtn.textContent = 'Retry \u2192';
    }
  };
}

function _buyUp(assetId) { _placeBet(assetId, 'up'); }
function _buyDown(assetId) { _placeBet(assetId, 'down'); }

function _buyArb(assetId) {
  const mkt = _marketsData[assetId + '-' + _activeTimeframe];
  if (!mkt || mkt.spread <= 0.005) { _toast('No arbitrage opportunity', true); return; }
  const asset = ASSETS.find(a => a.id === assetId);
  _toast(`ARB on ${asset ? asset.pair : assetId} \u2014 Spread: ${(mkt.spread * 100).toFixed(1)}%`);
}

function _openMarket(slug) {
  if (slug) {
    window.open(`https://polymarket.com/event/${slug}`, '_blank');
  }
}

/* ==================================================
   BET MODAL — All Markets (any event)
   ================================================== */
async function _openBetModal(slug) {
  let ev = _allMarkets.find(m => m.slug === slug);
  if (!ev) { _toast('Market not found', true); return; }

  /* For multi-market events, lazy-fetch full data */
  let allOutcomes = ev.outcomes;
  if (ev.isMulti) {
    try {
      const r = await fetch(`${GAMMA}/events/slug/${slug}`);
      if (r.ok) {
        const full = await r.json();
        if (full.markets && full.markets.length > 0) {
          allOutcomes = [];
          for (const m of full.markets) {
            let outs = [], prices = [], tids = [];
            try { outs = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || []); } catch {}
            try { prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []); } catch {}
            try { tids = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : (m.clobTokenIds || []); } catch {}
            // For multi-market, each sub-market has its own YES outcome
            const yesIdx = 0;
            const label = m.groupItemTitle || outs[yesIdx] || m.question?.replace(ev.question, '').replace(/\?$/, '').trim() || outs[yesIdx];
            allOutcomes.push({
              name: label,
              price: parseFloat(prices[yesIdx] || 0),
              tokenId: tids[yesIdx] || '',
              conditionId: m.conditionId || '',
              negRisk: !!m.negRisk,
            });
          }
          // Sort by price descending (most likely first)
          allOutcomes.sort((a, b) => b.price - a.price);
        }
      }
    } catch (e) { console.warn('[bet] lazy fetch failed:', e); }
  }

  /* Build modal */
  const modal = document.createElement('div');
  const endStr = ev.endDate ? new Date(ev.endDate).toLocaleDateString() : '';

  let outcomesHtml = '';
  for (let i = 0; i < allOutcomes.length; i++) {
    const o = allOutcomes[i];
    const priceCents = (o.price * 100).toFixed(0);
    const payout = o.price > 0 ? (1 / o.price).toFixed(2) : '\u2014';
    const barW = Math.max(5, o.price * 100);
    outcomesHtml += `
    <div class="bet-modal-outcome" data-idx="${i}" style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;transition:all .15s;background:#fff">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#1a1a2e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(o.name)}</div>
        <div style="margin-top:4px;height:4px;border-radius:2px;background:#f1f5f9"><div style="height:100%;border-radius:2px;width:${barW}%;background:${o.price > 0.5 ? '#10B981' : '#8B5CF6'}"></div></div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:18px;font-weight:700;color:#1a1a2e">${priceCents}\u00A2</div>
        <div style="font-size:10px;color:#64748b">${payout}x</div>
      </div>
    </div>`;
  }

  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:20px">
      <div style="background:#fff;border-radius:16px;padding:28px;width:480px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:16px">
          <div style="display:flex;gap:12px;align-items:center;flex:1;min-width:0">
            ${ev.image ? `<img src="${ev.image}" style="width:48px;height:48px;border-radius:10px;object-fit:cover;flex-shrink:0" onerror="this.style.display='none'">` : ''}
            <div style="min-width:0">
              <h3 style="font-size:16px;font-weight:700;margin:0;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${_escHtml(ev.question)}</h3>
              <div style="font-size:11px;color:#64748b;margin-top:2px">Vol: ${fmtVol(ev.volume)}${endStr ? ' \u00B7 Ends ' + endStr : ''}</div>
            </div>
          </div>
          <button id="bet-modal-close" style="border:none;background:none;font-size:22px;cursor:pointer;color:#94a3b8;padding:4px;margin:-4px -4px 0 8px">&times;</button>
        </div>

        <!-- Outcomes -->
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Select Outcome</div>
        <div id="bet-modal-outcomes" style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;max-height:300px;overflow-y:auto">
          ${outcomesHtml}
        </div>

        <!-- Amount -->
        <div id="bet-modal-amount-section" style="display:none">
          <label style="font-size:11px;font-weight:700;color:#334155;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Amount (USDC.e)</label>
          <div style="display:flex;gap:8px;margin-bottom:16px">
            <input id="bet-modal-amt" type="number" value="5" min="1" step="1" style="flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:inherit">
            <button class="bet-quick-amt" data-amt="5" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">$5</button>
            <button class="bet-quick-amt" data-amt="10" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">$10</button>
            <button class="bet-quick-amt" data-amt="25" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:12px;font-weight:600;cursor:pointer">$25</button>
          </div>

          <!-- Summary -->
          <div id="bet-modal-summary" style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="color:#64748b;font-size:12px">Outcome</span>
              <span id="bet-sum-outcome" style="font-weight:700;font-size:12px">\u2014</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:6px">
              <span style="color:#64748b;font-size:12px">Price</span>
              <span id="bet-sum-price" style="font-weight:600;font-size:12px">\u2014</span>
            </div>
            <div style="display:flex;justify-content:space-between">
              <span style="color:#64748b;font-size:12px">Potential Payout</span>
              <span id="bet-sum-payout" style="font-weight:600;color:#10B981;font-size:12px">\u2014</span>
            </div>
          </div>

          <!-- Steps -->
          <div id="bet-modal-steps" style="margin-bottom:16px">
            <div id="bm-s1" style="display:flex;align-items:center;gap:10px;padding:6px 0"><span class="bms-icon" style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;background:#f1f5f9;color:#94a3b8">1</span><span style="font-size:12px">Initialize CLOB</span></div>
            <div id="bm-s2" style="display:flex;align-items:center;gap:10px;padding:6px 0"><span class="bms-icon" style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;background:#f1f5f9;color:#94a3b8">2</span><span style="font-size:12px">Sign EIP-712 order</span></div>
            <div id="bm-s3" style="display:flex;align-items:center;gap:10px;padding:6px 0"><span class="bms-icon" style="width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;background:#f1f5f9;color:#94a3b8">3</span><span style="font-size:12px">Place order via Tor</span></div>
          </div>

          <button id="bet-modal-confirm" style="width:100%;padding:14px;border:none;border-radius:10px;background:#8B5CF6;color:#fff;font-size:15px;font-weight:700;cursor:pointer">Place Bet \u2192</button>
          <div id="bet-modal-result" style="display:none;text-align:center;padding:16px;margin-top:12px"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  /* State */
  let selectedIdx = -1;
  let selectedOutcome = null;

  /* Close */
  modal.querySelector('#bet-modal-close').onclick = () => modal.remove();
  modal.querySelector('div[style*="position:fixed"]').onclick = (e) => { if (e.target === e.currentTarget) modal.remove(); };

  /* Quick amount */
  modal.querySelectorAll('.bet-quick-amt').forEach(b => {
    b.onclick = () => { modal.querySelector('#bet-modal-amt').value = b.dataset.amt; };
  });

  /* Outcome selection */
  modal.querySelectorAll('.bet-modal-outcome').forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.dataset.idx);
      selectedIdx = idx;
      selectedOutcome = allOutcomes[idx];

      // Highlight selected
      modal.querySelectorAll('.bet-modal-outcome').forEach(r => {
        r.style.borderColor = '#e2e8f0';
        r.style.background = '#fff';
      });
      el.style.borderColor = '#8B5CF6';
      el.style.background = 'rgba(139,92,246,.04)';

      // Show amount section
      modal.querySelector('#bet-modal-amount-section').style.display = 'block';

      // Update summary
      modal.querySelector('#bet-sum-outcome').textContent = selectedOutcome.name;
      modal.querySelector('#bet-sum-price').textContent = (selectedOutcome.price * 100).toFixed(1) + '\u00A2';
      const payout = selectedOutcome.price > 0 ? (1 / selectedOutcome.price).toFixed(2) + 'x' : '\u2014';
      modal.querySelector('#bet-sum-payout').textContent = payout;
    };
  });

  /* Step indicator helper */
  function setStep(n, status) {
    const el = modal.querySelector('#bm-s' + n);
    if (!el) return;
    const icon = el.querySelector('.bms-icon');
    const text = el.querySelector('span:last-child');
    if (status === 'active') { icon.style.background = '#FEF3C7'; icon.style.color = '#D97706'; icon.textContent = '\u23F3'; text.style.color = '#D97706'; text.style.fontWeight = '600'; }
    else if (status === 'done') { icon.style.background = '#D1FAE5'; icon.style.color = '#10B981'; icon.textContent = '\u2713'; text.style.color = '#10B981'; }
    else if (status === 'error') { icon.style.background = '#FEE2E2'; icon.style.color = '#EF4444'; icon.textContent = '\u2717'; text.style.color = '#EF4444'; }
  }

  /* Confirm */
  modal.querySelector('#bet-modal-confirm').onclick = async () => {
    if (!selectedOutcome || !selectedOutcome.tokenId) { _toast('Select an outcome first', true); return; }
    const amt = parseFloat(modal.querySelector('#bet-modal-amt').value);
    if (!amt || amt < 1) { _toast('Minimum bet is $1', true); return; }

    const confirmBtn = modal.querySelector('#bet-modal-confirm');
    confirmBtn.disabled = true; confirmBtn.textContent = 'Placing...';

    const tokenId = selectedOutcome.tokenId;
    const price = selectedOutcome.price;
    const negRisk = selectedOutcome.negRisk !== undefined ? selectedOutcome.negRisk : ev.negRisk;

    try {
      setStep(1, 'active');
      const clob = await _ensureClob();
      setStep(1, 'done');

      setStep(2, 'active');
      setStep(2, 'done');

      setStep(3, 'active');
      const result = await clob.placeBuyOrder(tokenId, amt, price, { negRisk });
      setStep(3, 'done');

      // Success
      const resultEl = modal.querySelector('#bet-modal-result');
      resultEl.style.display = 'block';
      const oid = result?.orderID || result?.id || 'pending';
      resultEl.innerHTML = '<div style="font-size:32px;margin-bottom:8px">\u2705</div><div style="font-size:16px;font-weight:700;color:#10B981">Order Placed!</div><div style="font-size:12px;color:#64748b;margin-top:4px;word-break:break-all">Order ID: ' + (oid.length > 20 ? oid.slice(0, 10) + '...' + oid.slice(-8) : oid) + '</div>';
      confirmBtn.style.display = 'none';

      // Save to localStorage
      const positions = JSON.parse(localStorage.getItem('00_bet_positions') || '[]');
      positions.unshift({ asset: slug, direction: selectedOutcome.name, amount: amt, price, tokenId, time: Date.now(), orderId: oid, tf: 'event' });
      localStorage.setItem('00_bet_positions', JSON.stringify(positions));

    } catch (e) {
      for (let i = 1; i <= 3; i++) {
        const icon = modal.querySelector('#bm-s' + i + ' .bms-icon');
        if (icon?.textContent === '\u23F3') {
          setStep(i, 'error');
          modal.querySelector('#bm-s' + i + ' span:last-child').textContent = e.message;
          break;
        }
      }
      confirmBtn.disabled = false; confirmBtn.textContent = 'Retry \u2192';
    }
  };
}

/* ==================================================
   REDEEM — On-chain CTF redeemPositions
   ================================================== */
async function _redeemAll() {
  const redeemable = _positions.filter(p => p.redeemable && p.conditionId);
  if (redeemable.length === 0) { _toast('No redeemable positions', true); return; }

  const confirmed = await _showConfirmModal(
    'Redeem All Positions',
    `Redeem ${redeemable.length} resolved position${redeemable.length > 1 ? 's' : ''}? This sends an on-chain transaction on Polygon.`,
    'Redeem', '#F59E0B'
  );
  if (!confirmed) return;

  try {
    const polyTx = await import('../core/polygon-tx.js');
    const { deriveEvmPrivKey } = await import('../core/addr-derive.js');
    const auth = await import('../core/auth.js');
    const keys = auth.getKeys();
    const privKey = deriveEvmPrivKey(keys);
    const privHex = typeof privKey === 'string' ? privKey.replace(/^0x/, '') : Array.from(privKey).map(b => b.toString(16).padStart(2, '0')).join('');

    const CTF = polyTx.CONTRACTS.CTF;
    const USDCE = polyTx.CONTRACTS.USDCE;
    // parentCollectionId = bytes32(0)
    const parentId = '0000000000000000000000000000000000000000000000000000000000000000';
    // indexSets = [1, 2] for binary outcomes
    // redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)
    // selector = keccak256("redeemPositions(address,bytes32,bytes32,uint256[])") = 0x01290c00...
    // Actually the selector is: 0x6de3eef2 from polymarketBoss
    const selector = '01b7037c'; // redeemPositions(address,bytes32,bytes32,uint256[])

    // Deduplicate by conditionId
    const seen = new Set();
    const unique = redeemable.filter(p => {
      if (seen.has(p.conditionId)) return false;
      seen.add(p.conditionId);
      return true;
    });

    let redeemed = 0;
    for (const p of unique) {
      try {
        // ABI encode: redeemPositions(USDCE, parentCollectionId, conditionId, [1,2])
        const condId = p.conditionId.replace('0x', '').padStart(64, '0');
        // Encode: address + bytes32 + bytes32 + offset + length + [1, 2]
        const data = '0x' + selector
          + USDCE.replace('0x', '').padStart(64, '0')          // collateralToken
          + parentId                                              // parentCollectionId
          + condId                                                // conditionId
          + '0000000000000000000000000000000000000000000000000000000000000080'  // offset to array (128)
          + '0000000000000000000000000000000000000000000000000000000000000002'  // array length = 2
          + '0000000000000000000000000000000000000000000000000000000000000001'  // indexSet[0] = 1
          + '0000000000000000000000000000000000000000000000000000000000000002'; // indexSet[1] = 2

        _toast(`Redeeming ${redeemed + 1}/${unique.length}...`);
        const txHash = await polyTx.signAndSend(privHex, CTF, data, '0x0', 300000);
        await polyTx.waitForTx(txHash);
        redeemed++;
      } catch (e) {
        console.warn('[bet] redeem failed for', p.conditionId, e);
      }
    }

    _toast(`${redeemed} position${redeemed > 1 ? 's' : ''} redeemed!`);
    // Refresh positions
    setTimeout(() => _fetchPositions(), 3000);
  } catch (e) {
    _toast('Redeem failed: ' + e.message, true);
  }
}

/* ==================================================
   OPEN ORDERS — Fetch from CLOB + Cancel
   ================================================== */
async function _fetchOpenOrders() {
  _ordersLoading = true;
  _renderPane();
  try {
    const clob = await _ensureClob();
    const res = await clob.getOpenOrders();
    _openOrders = Array.isArray(res) ? res : [];
  } catch (e) {
    console.warn('[bet] failed to fetch open orders:', e);
    _openOrders = [];
  }
  _ordersLoading = false;
  _renderPane();
}

async function _cancelOrder(orderId) {
  if (!orderId) return;
  try {
    const clob = await _ensureClob();
    await clob.cancelOrder(orderId);
    _toast('Order cancelled');
    // Remove from local list immediately
    _openOrders = _openOrders.filter(o => (o.id || o.orderID) !== orderId);
    // Also remove from localStorage positions
    const saved = JSON.parse(localStorage.getItem('00_bet_positions') || '[]');
    const filtered = saved.filter(p => p.orderId !== orderId);
    localStorage.setItem('00_bet_positions', JSON.stringify(filtered));
    _renderPane();
  } catch (e) {
    _toast('Cancel failed: ' + e.message, true);
  }
}

async function _cancelAllOrders() {
  if (_openOrders.length === 0) { _toast('No open orders to cancel', true); return; }
  const confirmed = await _showConfirmModal(
    'Cancel All Orders',
    `Cancel all ${_openOrders.length} open order${_openOrders.length > 1 ? 's' : ''}? This cannot be undone.`,
    'Cancel All', '#EF4444'
  );
  if (!confirmed) return;
  let count = 0;
  for (const o of [..._openOrders]) {
    try {
      const clob = await _ensureClob();
      await clob.cancelOrder(o.id || o.orderID);
      count++;
    } catch (e) { console.warn('[bet] cancel failed for', o.id, e); }
  }
  _toast(`${count} order${count > 1 ? 's' : ''} cancelled`);
  _fetchOpenOrders();
}

/* ==================================================
   POSITIONS — Fetch from Polymarket Data API
   ================================================== */
async function _fetchPositions() {
  // Get wallet address
  let addr = _polyAddr;
  if (!addr) {
    try {
      const state = await import('../core/state.js');
      const addrs = state.get('addresses') || {};
      addr = addrs.polygon || addrs.matic || addrs.eth || null;
    } catch {}
  }
  if (!addr) return;

  _positionsLoading = true;
  _renderPane();

  try {
    const resp = await fetch(`/polymarket-data/positions?user=${addr.toLowerCase()}`);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // data is an array of position objects
    _positions = (Array.isArray(data) ? data : []).filter(p => {
      const size = parseFloat(p.size || 0);
      return size > 0.001; // filter dust
    }).map(p => {
      const size = parseFloat(p.size || 0);
      const avgPrice = parseFloat(p.avgPrice || p.avg_price || 0);
      const curPrice = parseFloat(p.curPrice || p.cur_price || p.currentPrice || 0);
      const currentValue = parseFloat(p.currentValue || p.current_value || 0) || size * curPrice;
      const costBasis = size * avgPrice;
      const pnl = costBasis > 0 ? currentValue - costBasis : 0;
      const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      return {
        title: p.title || p.market || '',
        outcome: p.outcome || '',
        size,
        avgPrice,
        curPrice,
        currentValue,
        costBasis,
        pnl,
        pnlPct,
        redeemable: !!p.redeemable,
        closed: !!p.closed,
        asset: p.asset || p.asset_id || '',
        conditionId: p.conditionId || p.condition_id || '',
        endDate: p.endDate || p.end_date || '',
        slug: p.slug || p.eventSlug || '',
        proxyWallet: p.proxyWallet || '',
      };
    });
  } catch (e) {
    console.warn('[bet] failed to fetch positions:', e);
    _positions = [];
  }
  _positionsLoading = false;
  _renderPane();
}

/* ==================================================
   WALLET TAB — Balances, Approvals, Swap
   ================================================== */
function _htmlWallet() {
  return `
  <div style="max-width:700px">
    <h3 style="font-size:16px;font-weight:700;margin-bottom:16px">Polygon Wallet</h3>

    <!-- Address -->
    <div style="padding:12px 16px;background:#f8fafc;border-radius:10px;margin-bottom:16px;font-family:'SF Mono',monospace;font-size:12px;word-break:break-all">
      <span style="color:#64748b">Address: </span>
      <span id="bet-w-addr">Loading...</span>
    </div>

    <!-- Balances -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
      <div style="padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;text-align:center">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">POL (Gas)</div>
        <div id="bet-w-pol" style="font-size:18px;font-weight:700;font-family:'SF Mono',monospace">--</div>
      </div>
      <div style="padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;text-align:center">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">USDC</div>
        <div id="bet-w-usdc" style="font-size:18px;font-weight:700;color:#2775CA;font-family:'SF Mono',monospace">--</div>
      </div>
      <div style="padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;text-align:center">
        <div style="font-size:11px;color:#64748b;margin-bottom:4px">USDC.e (Tradable)</div>
        <div id="bet-w-usdce" style="font-size:18px;font-weight:700;color:#10B981;font-family:'SF Mono',monospace">--</div>
      </div>
    </div>

    <!-- Swap -->
    <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px">
      <h4 style="font-size:14px;font-weight:700;margin-bottom:16px">\u21C4 Swap</h4>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="flex:1;text-align:center;padding:10px;background:#f8fafc;border-radius:8px">
          <div style="font-size:11px;color:#64748b;margin-bottom:2px">From</div>
          <div id="bet-w-swap-from" style="font-size:15px;font-weight:700;color:#1e293b">USDC</div>
        </div>
        <button data-action="swap-toggle" style="width:36px;height:36px;border-radius:50%;border:2px solid #e2e8f0;background:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .3s">\u21C4</button>
        <div style="flex:1;text-align:center;padding:10px;background:#f8fafc;border-radius:8px">
          <div style="font-size:11px;color:#64748b;margin-bottom:2px">To</div>
          <div id="bet-w-swap-to" style="font-size:15px;font-weight:700;color:#1e293b">USDC.e</div>
        </div>
      </div>
      <p style="font-size:12px;color:#64748b;margin-bottom:12px">Uniswap V3 \u00b7 0.01% fee \u00b7 Polygon</p>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="bet-w-swap-amt" type="number" placeholder="Amount" step="0.01" style="flex:1;padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;font-family:inherit">
        <button data-action="swap-max" style="padding:10px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-size:11px;font-weight:600;cursor:pointer">MAX</button>
        <button data-action="swap-usdc" style="padding:10px 20px;border:none;border-radius:8px;background:#8B5CF6;color:#fff;font-size:13px;font-weight:700;cursor:pointer">Swap \u2192</button>
      </div>
      <div id="bet-w-swap-status" style="margin-top:8px;font-size:12px;color:#64748b"></div>
    </div>

    <!-- Approvals -->
    <div style="padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:12px">
      <h4 style="font-size:14px;font-weight:700;margin-bottom:4px">\u{1F512} Token Approvals</h4>
      <p style="font-size:12px;color:#64748b;margin-bottom:16px">One-time approvals required for Polymarket trading. Each approval is a Polygon TX (~0.01 POL).</p>
      <div id="bet-w-approvals" style="display:flex;flex-direction:column;gap:8px">
        <div style="text-align:center;padding:20px;color:#64748b;font-size:12px">Checking approvals...</div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button data-action="approve-all" style="padding:10px 20px;border:none;border-radius:8px;background:#10B981;color:#fff;font-size:13px;font-weight:700;cursor:pointer;flex:1">Approve All Missing</button>
        <button data-action="revoke-all" style="padding:10px 20px;border:none;border-radius:8px;background:#EF4444;color:#fff;font-size:13px;font-weight:700;cursor:pointer;flex:1">Revoke All</button>
      </div>
      <div id="bet-w-approve-status" style="display:none"></div>
    </div>
  </div>`;
}

async function _loadWalletData() {
  if (!_container) return;
  let polyTx;
  try { polyTx = await import('../core/polygon-tx.js'); } catch (e) { console.warn('[bet] polygon-tx import failed:', e); return; }

  // Get EVM address
  let addr = null;
  try {
    const state = await import('../core/state.js');
    const addrs = state.get('addresses') || {};
    addr = addrs.polygon || addrs.matic || addrs.eth;
  } catch {}
  if (!addr) {
    const el = _container.querySelector('#bet-w-addr');
    if (el) el.textContent = 'No Polygon address — import a wallet first';
    return;
  }

  // Show address
  const addrEl = _container.querySelector('#bet-w-addr');
  if (addrEl) addrEl.textContent = addr;

  // Fetch balances
  try {
    const [polBal, usdcBal, usdceBal] = await Promise.all([
      polyTx.getPolBalance(addr),
      polyTx.checkBalance(polyTx.CONTRACTS.USDC, addr),
      polyTx.checkBalance(polyTx.CONTRACTS.USDCE, addr),
    ]);
    const polEl = _container.querySelector('#bet-w-pol');
    const usdcEl = _container.querySelector('#bet-w-usdc');
    const usdceEl = _container.querySelector('#bet-w-usdce');
    if (polEl) polEl.textContent = (Number(polBal) / 1e18).toFixed(4);
    if (usdcEl) usdcEl.textContent = '$' + (Number(usdcBal) / 1e6).toFixed(2);
    if (usdceEl) usdceEl.textContent = '$' + (Number(usdceBal) / 1e6).toFixed(2);

    // Also update header balances
    const hPol = _container.querySelector('#bet-bal-pol');
    const hUsdc = _container.querySelector('#bet-bal-usdc');
    const hUsdce = _container.querySelector('#bet-bal-usdce');
    if (hPol) hPol.textContent = (Number(polBal) / 1e18).toFixed(4) + ' POL';
    if (hUsdc) hUsdc.textContent = '$' + (Number(usdcBal) / 1e6).toFixed(2);
    if (hUsdce) hUsdce.textContent = '$' + (Number(usdceBal) / 1e6).toFixed(2);
  } catch (e) { console.warn('[bet] balance fetch error:', e); }

  // Check approvals
  const C = polyTx.CONTRACTS;
  const approvals = [
    { token: 'USDC',  contract: C.USDC,  spender: C.SWAP_ROUTER,       label: 'USDC \u2192 SwapRouter',        type: 'erc20' },
    { token: 'USDC.e', contract: C.USDCE, spender: C.SWAP_ROUTER,     label: 'USDC.e \u2192 SwapRouter',      type: 'erc20' },
    { token: 'USDC.e', contract: C.USDCE, spender: C.EXCHANGE,          label: 'USDC.e \u2192 Exchange',        type: 'erc20' },
    { token: 'USDC.e', contract: C.USDCE, spender: C.NEG_RISK_EXCHANGE, label: 'USDC.e \u2192 NegRiskExchange', type: 'erc20' },
    { token: 'USDC.e', contract: C.USDCE, spender: C.NEG_RISK_ADAPTER,  label: 'USDC.e \u2192 NegRiskAdapter',  type: 'erc20' },
    { token: 'CTF',   contract: C.CTF,   spender: C.EXCHANGE,          label: 'CTF \u2192 Exchange',           type: 'erc1155' },
    { token: 'CTF',   contract: C.CTF,   spender: C.NEG_RISK_EXCHANGE, label: 'CTF \u2192 NegRiskExchange',    type: 'erc1155' },
    { token: 'CTF',   contract: C.CTF,   spender: C.NEG_RISK_ADAPTER,  label: 'CTF \u2192 NegRiskAdapter',     type: 'erc1155' },
  ];

  const approvalsEl = _container.querySelector('#bet-w-approvals');
  if (!approvalsEl) return;

  let html = '';
  for (let i = 0; i < approvals.length; i++) {
    html += `<div id="bet-appr-${i}" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;transition:all .3s">
      <div>
        <span style="font-size:16px;margin-right:8px" id="bet-appr-icon-${i}">\u23F3</span>
        <span style="font-size:12px;font-weight:600">${approvals[i].label}</span>
      </div>
      <span style="font-size:11px;font-weight:600;color:#94a3b8" id="bet-appr-status-${i}">Checking...</span>
    </div>`;
  }
  approvalsEl.innerHTML = html;

  // Check each approval and update row individually
  for (let i = 0; i < approvals.length; i++) {
    const a = approvals[i];
    let approved = false;
    try {
      if (a.type === 'erc20') {
        const allowance = await polyTx.checkAllowance(a.contract, addr, a.spender);
        approved = allowance > 10n ** 12n;
      } else {
        approved = await polyTx.checkApprovalForAll(a.contract, addr, a.spender);
      }
    } catch {}
    _setApprovalRow(i, approved ? 'approved' : 'not_approved');
  }
}

function _setApprovalRow(idx, status) {
  // status: 'approved', 'not_approved', 'approving', 'revoking'
  const row = _container?.querySelector(`#bet-appr-${idx}`);
  const icon = _container?.querySelector(`#bet-appr-icon-${idx}`);
  const label = _container?.querySelector(`#bet-appr-status-${idx}`);
  if (!row) return;
  const styles = {
    approved:     { bg: '#f0fdf4', border: '#bbf7d0', icon: '\u2705', text: 'Approved',     color: '#10B981' },
    not_approved: { bg: '#fef2f2', border: '#fecaca', icon: '\u274C', text: 'Not approved',  color: '#EF4444' },
    approving:    { bg: '#fffbeb', border: '#fde68a', icon: '\u23F3', text: 'Approving...',   color: '#F59E0B' },
    revoking:     { bg: '#fff7ed', border: '#fdba74', icon: '\u23F3', text: 'Revoking...',    color: '#F97316' },
  };
  const s = styles[status] || styles.not_approved;
  row.style.background = s.bg;
  row.style.borderColor = s.border;
  if (icon) icon.textContent = s.icon;
  if (label) { label.textContent = s.text; label.style.color = s.color; }
}

async function _doSwap() {
  const amtEl = _container?.querySelector('#bet-w-swap-amt');
  if (!amtEl) return;

  const amt = parseFloat(amtEl.value);
  if (!amt || amt <= 0) {
    const s = _container?.querySelector('#bet-w-swap-status');
    if (s) { s.textContent = 'Enter an amount'; s.style.color = '#EF4444'; }
    return;
  }

  const fee = amt * 0.0001; // 0.01% Uniswap fee
  const receive = (amt - fee).toFixed(4);
  const fromToken = _swapReversed ? 'USDC.e' : 'USDC';
  const toToken = _swapReversed ? 'USDC' : 'USDC.e';

  // Show modal
  const modal = document.createElement('div');
  modal.id = 'bet-swap-modal';
  modal.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center">
      <div style="background:#fff;border-radius:16px;padding:32px;width:420px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 style="font-size:18px;font-weight:700;margin:0">Swap ${fromToken} &rarr; ${toToken}</h3>
          <button id="bet-swap-close" style="border:none;background:none;font-size:20px;cursor:pointer;color:#94a3b8">&times;</button>
        </div>
        <div style="background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#64748b;font-size:12px">Amount</span>
            <span style="font-weight:600;font-size:14px">${amt.toFixed(2)} ${fromToken}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:#64748b;font-size:12px">Fee (0.01%)</span>
            <span style="font-size:14px">${fee.toFixed(6)} ${fromToken}</span>
          </div>
          <div style="border-top:1px solid #e2e8f0;padding-top:8px;display:flex;justify-content:space-between">
            <span style="color:#64748b;font-size:12px;font-weight:600">You receive</span>
            <span style="font-weight:700;font-size:14px;color:#10B981">~${receive} ${toToken}</span>
          </div>
        </div>
        <div id="bet-swap-steps" style="margin-bottom:20px">
          <div id="bet-swap-s1" class="bet-step" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9">
            <span class="bet-step-icon" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;background:#f1f5f9;color:#94a3b8">1</span>
            <span style="font-size:13px">Check approval</span>
          </div>
          <div id="bet-swap-s2" class="bet-step" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9">
            <span class="bet-step-icon" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;background:#f1f5f9;color:#94a3b8">2</span>
            <span style="font-size:13px">Build swap transaction</span>
          </div>
          <div id="bet-swap-s3" class="bet-step" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #f1f5f9">
            <span class="bet-step-icon" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;background:#f1f5f9;color:#94a3b8">3</span>
            <span style="font-size:13px">Broadcasting...</span>
          </div>
          <div id="bet-swap-s4" class="bet-step" style="display:flex;align-items:center;gap:10px;padding:10px 0">
            <span class="bet-step-icon" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;background:#f1f5f9;color:#94a3b8">4</span>
            <span style="font-size:13px">Confirming on-chain</span>
          </div>
        </div>
        <div id="bet-swap-result" style="display:none;text-align:center;padding:16px"></div>
        <button id="bet-swap-close-btn" style="display:none;width:100%;padding:12px;border:none;border-radius:10px;background:#8B5CF6;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Close</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Close handlers
  modal.querySelector('#bet-swap-close').onclick = () => modal.remove();
  modal.querySelector('#bet-swap-close-btn').onclick = () => { modal.remove(); _loadWalletData(); };
  modal.querySelector('div[style*="position:fixed"]').onclick = (e) => { if (e.target === e.currentTarget) modal.remove(); };

  function setStep(n, status) {
    const el = modal.querySelector('#bet-swap-s' + n);
    if (!el) return;
    const icon = el.querySelector('.bet-step-icon');
    const text = el.querySelector('span:last-child');
    if (status === 'active') {
      icon.style.background = '#FEF3C7'; icon.style.color = '#D97706'; icon.textContent = '\u23F3';
      text.style.fontWeight = '600'; text.style.color = '#D97706';
    } else if (status === 'done') {
      icon.style.background = '#D1FAE5'; icon.style.color = '#10B981'; icon.textContent = '\u2713';
      text.style.fontWeight = '400'; text.style.color = '#10B981';
    } else if (status === 'error') {
      icon.style.background = '#FEE2E2'; icon.style.color = '#EF4444'; icon.textContent = '\u2717';
      text.style.fontWeight = '400'; text.style.color = '#EF4444';
    }
  }

  try {
    // Step 1: Check approval
    setStep(1, 'active');
    const polyTx = await import('../core/polygon-tx.js');
    const { deriveEvmPrivKey } = await import('../core/addr-derive.js');
    const auth = await import('../core/auth.js');
    const keys = auth.getKeys();
    const privKey = deriveEvmPrivKey(keys);
    if (!privKey) throw new Error('Cannot derive EVM key');

    const addr = polyTx.getAddress(privKey);
    const amountRaw = BigInt(Math.floor(amt * 1e6));
    const C = polyTx.CONTRACTS;

    // Direction-aware tokens
    const tokenIn = _swapReversed ? C.USDCE : C.USDC;
    const tokenOut = _swapReversed ? C.USDC : C.USDCE;

    const allowance = await polyTx.checkAllowance(tokenIn, addr, C.SWAP_ROUTER);
    if (allowance < amountRaw) {
      modal.querySelector('#bet-swap-s1 span:last-child').textContent = `Approving ${fromToken}...`;
      const approveTx = await polyTx.signAndSend(privKey, tokenIn, polyTx.encodeApprove(C.SWAP_ROUTER), '0x0', 60000);
      await polyTx.waitForTx(approveTx);
    }
    setStep(1, 'done');

    // Step 2: Build TX
    setStep(2, 'active');
    const deadline = Math.floor(Date.now() / 1000) + 300;
    const minOut = BigInt(Math.floor(Number(amountRaw) * 0.99)); // 1% slippage
    const feeTier = 100; // 0.01% stablecoin pool (both directions)
    const swapData = polyTx.encodeExactInputSingle(tokenIn, tokenOut, feeTier, addr, deadline, Number(amountRaw), Number(minOut));
    setStep(2, 'done');

    // Step 3: Broadcast
    setStep(3, 'active');
    const swapTx = await polyTx.signAndSend(privKey, C.SWAP_ROUTER, swapData, '0x0', 200000);
    setStep(3, 'done');

    // Step 4: Confirm
    setStep(4, 'active');
    const receipt = await polyTx.waitForTx(swapTx);

    if (receipt.status === 1) {
      setStep(4, 'done');
      const result = modal.querySelector('#bet-swap-result');
      result.style.display = 'block';
      result.innerHTML = `
        <div style="font-size:40px;margin-bottom:8px">\u2705</div>
        <div style="font-size:18px;font-weight:700;color:#10B981;margin-bottom:4px">Swap Complete!</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:8px">Received ~${receive} ${toToken}</div>
        <a href="https://polygonscan.com/tx/${swapTx}" target="_blank" rel="noopener" style="font-size:12px;color:#8B5CF6">View on Polygonscan \u2197</a>`;
      modal.querySelector('#bet-swap-close-btn').style.display = 'block';
      modal.querySelector('#bet-swap-steps').style.opacity = '0.5';
    } else {
      setStep(4, 'error');
      modal.querySelector('#bet-swap-s4 span:last-child').textContent = 'Transaction reverted';
      modal.querySelector('#bet-swap-close-btn').style.display = 'block';
    }
  } catch (e) {
    // Find current active step and mark as error
    for (let i = 1; i <= 4; i++) {
      const icon = modal.querySelector('#bet-swap-s' + i + ' .bet-step-icon');
      if (icon?.textContent === '\u23F3') {
        setStep(i, 'error');
        modal.querySelector('#bet-swap-s' + i + ' span:last-child').textContent = e.message;
        break;
      }
    }
    modal.querySelector('#bet-swap-close-btn').style.display = 'block';
  }
}

async function _doApproveAll() {
  const statusEl = _container?.querySelector('#bet-w-approve-status');
  if (!statusEl) return;

  try {
    const polyTx = await import('../core/polygon-tx.js');
    const { deriveEvmPrivKey } = await import('../core/addr-derive.js');
    const auth = await import('../core/auth.js');
    const keys = auth.getKeys();
    const privKey = deriveEvmPrivKey(keys);
    if (!privKey) throw new Error('Cannot derive EVM key');

    const addr = polyTx.getAddress(privKey);
    const C = polyTx.CONTRACTS;
    let count = 0;

    // ERC20 approvals (indices 0-3)
    const erc20Approvals = [
      [C.USDC, C.SWAP_ROUTER],
      [C.USDCE, C.SWAP_ROUTER],
      [C.USDCE, C.EXCHANGE],
      [C.USDCE, C.NEG_RISK_EXCHANGE],
      [C.USDCE, C.NEG_RISK_ADAPTER],
    ];
    for (let i = 0; i < erc20Approvals.length; i++) {
      const [token, spender] = erc20Approvals[i];
      const a = await polyTx.checkAllowance(token, addr, spender);
      if (a < 10n ** 12n) {
        _setApprovalRow(i, 'approving');
        count++;
        const tx = await polyTx.signAndSend(privKey, token, polyTx.encodeApprove(spender), '0x0', 100000);
        await polyTx.waitForTx(tx);
        _setApprovalRow(i, 'approved');
      }
    }

    // ERC1155 approvals — CTF (indices 4-6)
    const ctfApprovals = [C.EXCHANGE, C.NEG_RISK_EXCHANGE, C.NEG_RISK_ADAPTER];
    for (let i = 0; i < ctfApprovals.length; i++) {
      const spender = ctfApprovals[i];
      const a = await polyTx.checkApprovalForAll(C.CTF, addr, spender);
      if (!a) {
        _setApprovalRow(4 + i, 'approving');
        count++;
        const tx = await polyTx.signAndSend(privKey, C.CTF, polyTx.encodeSetApprovalForAll(spender), '0x0', 100000);
        await polyTx.waitForTx(tx);
        _setApprovalRow(4 + i, 'approved');
      }
    }

    statusEl.textContent = count > 0 ? `\u2705 ${count} approval${count > 1 ? 's' : ''} completed!` : '\u2705 All already approved!';
    statusEl.style.color = '#10B981';
  } catch (e) {
    statusEl.textContent = '\u274C ' + e.message;
    statusEl.style.color = '#EF4444';
  }
}

async function _doRevokeAll() {
  const statusEl = _container?.querySelector('#bet-w-approve-status');
  if (!statusEl) return;

  const confirmed = await _showConfirmModal(
    'Revoke All Approvals',
    'This will revoke ALL token approvals for Polymarket contracts. You will need to re-approve (8 TX) before you can trade again.',
    'Revoke All',
    '#EF4444'
  );
  if (!confirmed) return;

  try {
    const polyTx = await import('../core/polygon-tx.js');
    const { deriveEvmPrivKey } = await import('../core/addr-derive.js');
    const authM = await import('../core/auth.js');
    const keys = authM.getKeys();
    const privKey = deriveEvmPrivKey(keys);
    if (!privKey) throw new Error('Cannot derive EVM key');

    const addr = polyTx.getAddress(privKey);
    const C = polyTx.CONTRACTS;
    let count = 0;

    // Revoke ERC20 approvals (indices 0-3)
    const erc20Revokes = [
      [C.USDC, C.SWAP_ROUTER],
      [C.USDCE, C.SWAP_ROUTER],
      [C.USDCE, C.EXCHANGE],
      [C.USDCE, C.NEG_RISK_EXCHANGE],
      [C.USDCE, C.NEG_RISK_ADAPTER],
    ];
    for (let i = 0; i < erc20Revokes.length; i++) {
      const [token, spender] = erc20Revokes[i];
      const a = await polyTx.checkAllowance(token, addr, spender);
      if (a > 0n) {
        _setApprovalRow(i, 'revoking');
        count++;
        const data = polyTx.encodeApprove(spender, '0x0');
        const tx = await polyTx.signAndSend(privKey, token, data, '0x0', 60000);
        await polyTx.waitForTx(tx);
        _setApprovalRow(i, 'not_approved');
      }
    }

    // Revoke CTF approvals (indices 4-6)
    const ctfRevokes = [C.EXCHANGE, C.NEG_RISK_EXCHANGE, C.NEG_RISK_ADAPTER];
    for (let i = 0; i < ctfRevokes.length; i++) {
      const spender = ctfRevokes[i];
      const a = await polyTx.checkApprovalForAll(C.CTF, addr, spender);
      if (a) {
        _setApprovalRow(4 + i, 'revoking');
        count++;
        const tx = await polyTx.signAndSend(privKey, C.CTF, polyTx.encodeSetApprovalForAll(spender, false), '0x0', 100000);
        await polyTx.waitForTx(tx);
        _setApprovalRow(4 + i, 'not_approved');
      }
    }

    statusEl.textContent = count > 0 ? `${count} approval${count > 1 ? 's' : ''} revoked` : 'All already revoked';
    statusEl.style.color = '#64748b';
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#EF4444';
  }
}

/* ==================================================
   TOAST
   ================================================== */
/* ── Confirm modal (Promise-based) ── */
function _showConfirmModal(title, message, confirmText = 'Confirm', confirmColor = '#EF4444') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;animation:fadeIn .15s';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <h3 style="font-size:18px;font-weight:700;margin-bottom:8px;color:#1a1a2e">${title}</h3>
        <p style="font-size:13px;color:#64748b;line-height:1.5;margin-bottom:24px">${message}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="_cm_cancel" style="padding:10px 24px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;color:#64748b;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cancel</button>
          <button id="_cm_confirm" style="padding:10px 24px;border:none;border-radius:10px;background:${confirmColor};color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    overlay.querySelector('#_cm_cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.querySelector('#_cm_confirm').addEventListener('click', () => { overlay.remove(); resolve(true); });
  });
}

function _toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'app-toast' + (isError ? ' error' : '');
  el.textContent = msg;
  el.style.top = '80px';
  document.body.appendChild(el);
  setTimeout(() => { el.remove(); }, 3000);
}

/* ==================================================
   EVENT DELEGATION
   ================================================== */
function _createClickHandler() {
  return function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'tab')          _switchTab(btn.dataset.tab);
    else if (action === 'timeframe') _switchTimeframe(btn.dataset.tf);
    else if (action === 'buy-up')  _buyUp(btn.dataset.market);
    else if (action === 'buy-down') _buyDown(btn.dataset.market);
    else if (action === 'arb')     _buyArb(btn.dataset.market);
    else if (action === 'category') _filterCategory(btn.dataset.cat);
    else if (action === 'open-market') _openBetModal(btn.dataset.slug);
    else if (action === 'redeem-all') _redeemAll();
    else if (action === 'cancel-order') _cancelOrder(btn.dataset.orderId);
    else if (action === 'cancel-all-orders') _cancelAllOrders();
    else if (action === 'refresh-orders') _fetchOpenOrders();
    else if (action === 'refresh-positions') _fetchPositions();
    else if (action === 'swap-usdc') _doSwap();
    else if (action === 'swap-toggle') {
      _swapReversed = !_swapReversed;
      const fromEl = _container?.querySelector('#bet-w-swap-from');
      const toEl = _container?.querySelector('#bet-w-swap-to');
      const toggleBtn = btn;
      if (fromEl && toEl) {
        fromEl.textContent = _swapReversed ? 'USDC.e' : 'USDC';
        toEl.textContent = _swapReversed ? 'USDC' : 'USDC.e';
        toggleBtn.style.transform = _swapReversed ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    }
    else if (action === 'swap-max') {
      const amt = _container?.querySelector('#bet-w-swap-amt');
      const srcEl = _container?.querySelector(_swapReversed ? '#bet-w-usdce' : '#bet-w-usdc');
      if (srcEl && amt) { const v = srcEl.textContent.replace('$', '').trim(); if (v !== '--') amt.value = v; }
    }
    else if (action === 'approve-all') _doApproveAll();
    else if (action === 'revoke-all') _doRevokeAll();
  };
}

/* ==================================================
   MOUNT / UNMOUNT
   ================================================== */
export function mount(container) {
  _container = container;
  _activeTab = 'wallet';
  _activeCat = 'All';

  /* Render shell */
  _renderMain();

  /* Event delegation */
  _handleClick = _createClickHandler();
  container.addEventListener('click', _handleClick);

  /* 1. Connect Binance WS for live prices */
  _connectBinance();

  /* 2. Polygon wallet balances — instant from state, then RPC refresh */
  _preloadBalancesFromState();
  _fetchPolygonBalances();
  _balanceIv = setInterval(_fetchPolygonBalances, 30000);

  /* 3. Fetch all markets from Gamma */
  fetchAllCurrentMarkets();

  /* 4. Start countdown timer (updates every 1s) */
  _countdownIv = setInterval(_updateCountdowns, 1000);

  /* 5. Refresh markets + positions every 10s */
  _refreshIv = setInterval(() => {
    if (_activeTab === 'markets') fetchAllCurrentMarkets();
    if (_activeTab === 'positions') _fetchPositions();
  }, 10000);

}

export function unmount() {
  /* 0. Abort all pending fetches to free connection pool */
  _ac.abort();
  _ac = new AbortController();

  /* 1. Close Binance WS */
  _disconnectBinance();

  /* 2. Clear all intervals/timers */
  if (_countdownIv) { clearInterval(_countdownIv); _countdownIv = null; }
  if (_refreshIv)   { clearInterval(_refreshIv);   _refreshIv = null;   }
  if (_balanceIv)   { clearInterval(_balanceIv);   _balanceIv = null;   }

  /* 3. Remove event listener */
  if (_container && _handleClick) {
    _container.removeEventListener('click', _handleClick);
  }
  _handleClick = null;
  _swapReversed = false;

  /* 4. Clean up DOM */
  if (_container) _container.innerHTML = '';
  _container = null;

  /* 5. Reset state */
  Object.keys(_prices).forEach(k => delete _prices[k]);
  Object.keys(_marketsData).forEach(k => delete _marketsData[k]);
  _allMarkets = [];
  _positions = [];
  _openOrders = [];
  _ordersLoading = false;
  _positions = [];
  _positionsLoading = false;
  _activeCat = 'All';

}
