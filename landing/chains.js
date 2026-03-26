/* ══════════════════════════════════════════════════════════════
   chains.js — Unified blockchain data-fetching module
   All balance, price, history, and block-height fetchers
   for 00 Protocol wallet (0penw0rld.com)
   ══════════════════════════════════════════════════════════════ */
'use strict';

/* ── Chain Metadata Registry ── */
window.CHAINS = Object.freeze({
  bch:  { name:'Bitcoin Cash',  ticker:'BCH',  decimals:8,  color:'#0AC18E', icon:'icons/bch.png',  apiType:'electrum' },
  sbch: { name:'Stealth BCH',   ticker:'BCH',  decimals:8,  color:'#BF5AF2', icon:'icons/bch.png',  apiType:'none' },
  btc:  { name:'Bitcoin',       ticker:'BTC',  decimals:8,  color:'#F7931A', icon:'icons/btc.png',  apiType:'electrum' },
  eth:  { name:'Ethereum',      ticker:'ETH',  decimals:18, color:'#627EEA', icon:'icons/eth.png',  apiType:'evm',  rpc:'https://ethereum-rpc.publicnode.com' },
  xmr:  { name:'Monero',        ticker:'XMR',  decimals:12, color:'#FF6600', icon:'icons/xmr.png',  apiType:'xmr' },
  usdc: { name:'USD Coin',      ticker:'USDC', decimals:6,  color:'#2775CA', icon:'icons/usdc.png', apiType:'erc20', contract:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
  usdt: { name:'Tether',        ticker:'USDT', decimals:6,  color:'#26A17B', icon:'icons/usdt.png', apiType:'erc20', contract:'0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  ltc:  { name:'Litecoin',      ticker:'LTC',  decimals:8,  color:'#BFBBBB', icon:'icons/ltc.png',  apiType:'ltc',   rpc:'https://litecoinspace.org/api' },
  bnb:  { name:'BNB',           ticker:'BNB',  decimals:18, color:'#F0B90B', icon:'icons/bnb.png',  apiType:'evm',   rpc:'https://bsc-rpc.publicnode.com' },
  avax: { name:'Avalanche',     ticker:'AVAX', decimals:18, color:'#E84142', icon:'icons/avax.png', apiType:'evm',   rpc:'/avax-rpc/' },
  sol:  { name:'Solana',        ticker:'SOL',  decimals:9,  color:'#9945FF', icon:'icons/sol.png',  apiType:'sol',   rpc:'/sol-rpc/' },
  trx:  { name:'TRON',          ticker:'TRX',  decimals:6,  color:'#FF0013', icon:'icons/trx.png',  apiType:'trx',   rpc:'https://api.trongrid.io' },
  xrp:  { name:'XRP',           ticker:'XRP',  decimals:6,  color:'#0085C0', icon:'icons/xrp.png',  apiType:'xrp',   rpc:'wss://xrplcluster.com' },
  xlm:  { name:'Stellar',       ticker:'XLM',  decimals:7,  color:'#14B6E7', icon:'icons/xlm.png',  apiType:'xlm',   rpc:'https://horizon.stellar.org' },
});

/* ── Endpoint Resolution ── */
function _ep(chain) {
  // AVAX and SOL must use nginx proxy (CORS blocked on direct URLs)
  if (chain === 'avax' || chain === 'sol') return CHAINS[chain]?.rpc || '';
  const ep = window._00ep || {};
  const map = { eth:'eth_rpc', bnb:'bnb_rpc', trx:'trx_rpc', xrp:'xrp_rpc', xlm:'xlm_rpc', ltc:'ltc_rpc' };
  return (map[chain] && ep[map[chain]]) || CHAINS[chain]?.rpc || '';
}

/* ── Generic JSON-RPC helper ── */
let _rpcId = 1;
async function _jsonRpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: _rpcId++, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}

/* ══════════════════════════════════════════════════════════════
   BALANCE FETCHERS
   ══════════════════════════════════════════════════════════════ */

/* ── EVM: ETH, BNB, AVAX ── */
async function _evmBalance(chain, addr) {
  const rpc = _ep(chain);
  const hex = await _jsonRpc(rpc, 'eth_getBalance', [addr, 'latest']);
  return { balance: BigInt(hex).toString(), loaded: true };
}

/* ── ERC-20: USDC, USDT ── */
async function _erc20Balance(chain, addr) {
  const rpc = _ep('eth');
  const contract = CHAINS[chain].contract;
  const data = '0x70a08231' + addr.replace('0x','').toLowerCase().padStart(64,'0');
  const hex = await _jsonRpc(rpc, 'eth_call', [{ to: contract, data }, 'latest']);
  return { balance: parseInt(hex, 16) || 0, loaded: true };
}

/* ── Solana ── */
async function _solBalance(addr) {
  const rpc = _ep('sol');
  const res = await _jsonRpc(rpc, 'getBalance', [addr]);
  return { balance: res.value || 0, loaded: true };
}

/* ── TRON ── */
async function _trxBalance(addr) {
  const rpc = _ep('trx');
  const r = await fetch(`${rpc}/v1/accounts/${addr}`);
  const j = await r.json();
  const bal = j.data?.[0]?.balance || 0;
  return { balance: bal, loaded: true };
}

/* ── Stellar ── */
async function _xlmBalance(addr) {
  const rpc = _ep('xlm');
  const r = await fetch(`${rpc}/accounts/${addr}`);
  if (r.status === 404) return { balance: 0, loaded: true }; // Account not activated
  const j = await r.json();
  const native = j.balances?.find(b => b.asset_type === 'native');
  const bal = native ? Math.round(parseFloat(native.balance) * 1e7) : 0;
  return { balance: bal, loaded: true };
}

/* ── XRP (WSS one-shot) ── */
async function _xrpBalance(addr) {
  const rpc = _ep('xrp');
  return new Promise((resolve) => {
    const ws = new WebSocket(rpc);
    const timeout = setTimeout(() => { ws.close(); resolve({ balance: 0, loaded: false }); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ command: 'account_info', account: addr }));
    ws.onmessage = (e) => {
      clearTimeout(timeout);
      try {
        const msg = JSON.parse(e.data);
        const drops = parseInt(msg.result?.account_data?.Balance || '0', 10);
        resolve({ balance: drops, loaded: true });
      } catch { resolve({ balance: 0, loaded: false }); }
      ws.close();
    };
    ws.onerror = () => { clearTimeout(timeout); resolve({ balance: 0, loaded: false }); };
  });
}

/* ── LTC (REST — litecoinspace.org) ── */
async function _ltcBalance(addr) {
  const rpc = _ep('ltc');
  const r = await fetch(`${rpc}/address/${addr}`);
  const j = await r.json();
  const funded = j.chain_stats?.funded_txo_sum || 0;
  const spent = j.chain_stats?.spent_txo_sum || 0;
  const mFunded = j.mempool_stats?.funded_txo_sum || 0;
  const mSpent = j.mempool_stats?.spent_txo_sum || 0;
  const bal = (funded - spent) + (mFunded - mSpent);
  // Also fetch UTXOs for potential send
  let utxos = [];
  try {
    const ur = await fetch(`${rpc}/address/${addr}/utxo`);
    utxos = await ur.json();
  } catch {}
  // Fetch tip height for confirmations
  try {
    const tr = await fetch(`${rpc}/blocks/tip/height`);
    const tipH = parseInt(await tr.text());
    if (tipH > 0) window._ltcTipHeight = tipH;
  } catch {}
  return { balance: bal, loaded: true, utxos };
}

/* ── Electrum (BCH, BTC) — delegates to SharedWorker ── */
async function _electrumBalance(chain, scriptHash) {
  const caller = chain === 'bch' ? window._fvCall : window._btcCall;
  if (!caller) return { balance: 0, loaded: false };
  try {
    const utxos = await caller('blockchain.scripthash.listunspent', [scriptHash]);
    const bal = utxos.reduce((s, u) => s + (u.value || 0), 0);
    return { balance: bal, loaded: true, utxos };
  } catch { return { balance: 0, loaded: false }; }
}

/* ── XMR — reads cached scan result ── */
function _xmrBalance() {
  try {
    const raw = localStorage.getItem('00_xmr_scan');
    if (!raw) return { balance: '0', loaded: false };
    const scan = JSON.parse(raw);
    return { balance: scan.balance || '0', loaded: true };
  } catch { return { balance: '0', loaded: false }; }
}

/* ══════════════════════════════════════════════════════════════
   chainsRefreshOne(chain, addr)
   Returns: { balance, loaded, utxos? }
   ══════════════════════════════════════════════════════════════ */
window.chainsRefreshOne = async function(chain, addr) {
  if (!addr && chain !== 'xmr' && chain !== 'sbch') return { balance: 0, loaded: false };
  try {
    const meta = CHAINS[chain];
    if (!meta) return { balance: 0, loaded: false };
    switch (meta.apiType) {
      case 'evm':      return await _evmBalance(chain, addr);
      case 'erc20':    return await _erc20Balance(chain, addr);
      case 'sol':      return await _solBalance(addr);
      case 'trx':      return await _trxBalance(addr);
      case 'xlm':      return await _xlmBalance(addr);
      case 'xrp':      return await _xrpBalance(addr);
      case 'ltc':      return await _ltcBalance(addr);
      case 'electrum':  return await _electrumBalance(chain, addr);
      case 'xmr':      return _xmrBalance();
      default:         return { balance: 0, loaded: false };
    }
  } catch (e) {
    console.warn(`[chains] ${chain} balance fetch failed:`, e.message);
    return { balance: 0, loaded: false };
  }
};

/* ══════════════════════════════════════════════════════════════
   chainsRefreshAll(addresses)
   addresses = { bch: 'bitcoincash:q...', btc: '1...', eth: '0x...', ... }
   For electrum chains, pass scriptHash instead of address
   Returns: { bch: {balance, loaded}, btc: {balance, loaded}, ... }
   Also persists to localStorage['00_balances']
   ══════════════════════════════════════════════════════════════ */
window.chainsRefreshAll = async function(addresses) {
  const chains = Object.keys(addresses).filter(c => CHAINS[c]);
  const results = {};

  // Launch all fetches in parallel
  const settled = await Promise.allSettled(
    chains.map(async c => {
      const res = await window.chainsRefreshOne(c, addresses[c]);
      results[c] = res;
      return res;
    })
  );

  // Persist to localStorage (merge with existing)
  _persistBalances(results);
  return results;
};

/* ── Persist balances to localStorage ── */
function _persistBalances(results) {
  let prev = {};
  try { prev = JSON.parse(localStorage.getItem('00_balances') || '{}'); } catch {}

  const obj = { ...prev, ts: Date.now() };
  for (const [chain, res] of Object.entries(results)) {
    if (res.loaded) {
      obj[chain] = typeof res.balance === 'string' ? res.balance : res.balance;
    }
    // If not loaded, keep previous value (don't overwrite with 0)
  }
  localStorage.setItem('00_balances', JSON.stringify(obj));
}

/* ══════════════════════════════════════════════════════════════
   PRICE FETCHING
   chainsGetPrices()
   Returns: { bch: {price, change24h}, btc: {price, change24h}, ... }
   Cached 5 min in localStorage
   ══════════════════════════════════════════════════════════════ */
const _PRICE_TTL = 5 * 60 * 1000;
const _KRAKEN_PAIRS = 'BCHUSD,XBTUSD,ETHUSD,XMRUSD,USDCUSD,USDTUSD,LTCUSD,SOLUSD,XRPUSD,TRXUSD,XLMUSD';
const _KRAKEN_MAP = {
  BCHUSD:'bch', XXBTZUSD:'btc', XETHZUSD:'eth', XXMRZUSD:'xmr',
  USDCUSD:'usdc', USDTZUSD:'usdt', XLTCZUSD:'ltc', SOLUSD:'sol',
  XXRPZUSD:'xrp', TRXUSD:'trx', XXLMZUSD:'xlm'
};

window.chainsGetPrices = async function() {
  // Check cache
  const ck = '00_dash_prices_usd';
  try {
    const raw = localStorage.getItem(ck);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Date.now() - (cached._ts || 0) < _PRICE_TTL) return cached.data;
    }
  } catch {}

  const out = {};

  // Kraken (BCH, BTC, ETH, XMR, USDC, USDT, LTC, SOL, XRP, TRX, XLM)
  try {
    const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=' + _KRAKEN_PAIRS);
    if (r.ok) {
      const j = await r.json();
      const res = j.result || {};
      for (const [k, v] of Object.entries(res)) {
        const sym = _KRAKEN_MAP[k];
        if (!sym) continue;
        const price = parseFloat(v.c[0]) || 0;
        const vwap24 = parseFloat(v.p[1]) || 0;
        out[sym] = { price, change24h: vwap24 ? ((price - vwap24) / vwap24 * 100) : 0 };
      }
    }
  } catch (e) { console.warn('[chains] Kraken price fetch failed:', e.message); }

  // CryptoCompare (BNB, AVAX — not on Kraken)
  try {
    const r = await fetch('https://min-api.cryptocompare.com/data/pricemultifull?fsyms=BNB,AVAX&tsyms=USD');
    if (r.ok) {
      const j = await r.json();
      const raw = j.RAW || {};
      for (const [sym, data] of Object.entries(raw)) {
        const d = data.USD;
        out[sym.toLowerCase()] = { price: d.PRICE || 0, change24h: d.CHANGEPCT24HOUR || 0 };
      }
    }
  } catch (e) { console.warn('[chains] CryptoCompare price fetch failed:', e.message); }

  // Defaults
  if (!out.usdc) out.usdc = { price: 1, change24h: 0 };
  if (!out.usdt) out.usdt = { price: 1, change24h: 0 };

  // Cache
  try { localStorage.setItem(ck, JSON.stringify({ data: out, _ts: Date.now() })); } catch {}
  return out;
};

/* ══════════════════════════════════════════════════════════════
   TRANSACTION HISTORY
   chainsGetHistory(chain, addr, limit?)
   Returns: [{txid, chain, dir, amount, height, timestamp, confirmations}]
   ══════════════════════════════════════════════════════════════ */

/* ── TRX History ── */
async function _trxHistory(addr, limit) {
  const rpc = _ep('trx');
  const r = await fetch(`${rpc}/v1/accounts/${addr}/transactions?limit=${limit}&order_by=block_timestamp,desc`);
  const j = await r.json();
  if (!j.data) return [];
  return j.data.map(tx => {
    const contract = tx.raw_data?.contract?.[0];
    const param = contract?.parameter?.value || {};
    const ownerHex = param.owner_address || '';
    const isOut = ownerHex.toLowerCase() === addr.replace(/^T/, '41').toLowerCase() ||
                  ownerHex.toLowerCase() === addr.toLowerCase();
    return {
      txid: tx.txID,
      chain: 'trx',
      dir: isOut ? 'out' : 'in',
      amount: param.amount || 0,
      height: tx.blockNumber || 0,
      timestamp: Math.floor((tx.block_timestamp || 0) / 1000),
    };
  }).filter(tx => tx.amount > 0);
}

/* ── XLM History ── */
async function _xlmHistory(addr, limit) {
  const rpc = _ep('xlm');
  const r = await fetch(`${rpc}/accounts/${addr}/operations?order=desc&limit=${limit}`);
  if (r.status === 404) return [];
  const j = await r.json();
  const records = j._embedded?.records || [];
  return records
    .filter(op => op.type === 'payment' || op.type === 'create_account')
    .map(op => ({
      txid: op.transaction_hash,
      chain: 'xlm',
      dir: op.source_account === addr ? 'out' : 'in',
      amount: Math.round(parseFloat(op.amount || op.starting_balance || '0') * 1e7),
      height: parseInt(op.id) || 0,
      timestamp: Math.floor(Date.parse(op.created_at) / 1000),
    }));
}

/* ── LTC History ── */
async function _ltcHistory(addr, limit) {
  const rpc = _ep('ltc');
  const r = await fetch(`${rpc}/address/${addr}/txs`);
  const txs = await r.json();
  return txs.slice(0, limit).map(tx => {
    const isInput = tx.vin?.some(v => v.prevout?.scriptpubkey_address === addr);
    let amount = 0;
    if (isInput) {
      // Sent: sum of outputs NOT to our address
      amount = tx.vout?.filter(o => o.scriptpubkey_address !== addr).reduce((s, o) => s + (o.value || 0), 0) || 0;
    } else {
      // Received: sum of outputs to our address
      amount = tx.vout?.filter(o => o.scriptpubkey_address === addr).reduce((s, o) => s + (o.value || 0), 0) || 0;
    }
    return {
      txid: tx.txid,
      chain: 'ltc',
      dir: isInput ? 'out' : 'in',
      amount,
      height: tx.status?.block_height || 0,
      timestamp: tx.status?.block_time || 0,
    };
  });
}

/* ── EVM History (ETH, BNB, AVAX) ── */
async function _evmHistory(chain, addr, limit) {
  const endpoints = {
    eth: 'https://eth.blockscout.com/api',
    bnb: 'https://api.bscscan.com/api',
    avax: 'https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api',
  };
  const base = endpoints[chain];
  if (!base) return [];
  try {
    const r = await fetch(`${base}?module=account&action=txlist&address=${addr}&sort=desc&page=1&offset=${limit}`);
    const j = await r.json();
    const txs = j.result || [];
    if (!Array.isArray(txs)) return [];
    return txs.map(tx => ({
      txid: tx.hash,
      chain,
      dir: tx.from?.toLowerCase() === addr.toLowerCase() ? 'out' : 'in',
      amount: tx.value || '0',
      height: parseInt(tx.blockNumber) || 0,
      timestamp: parseInt(tx.timeStamp) || 0,
    }));
  } catch { return []; }
}

/* ── SOL History ── */
async function _solHistory(addr, limit) {
  const rpc = _ep('sol');
  try {
    const sigs = await _jsonRpc(rpc, 'getSignaturesForAddress', [addr, { limit }]);
    if (!sigs || !sigs.length) return [];
    const txs = [];
    for (const sig of sigs.slice(0, Math.min(limit, 10))) { // Limit individual fetches
      try {
        const tx = await _jsonRpc(rpc, 'getTransaction', [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
        if (!tx?.meta) continue;
        const keys = tx.transaction?.message?.accountKeys || [];
        const idx = keys.findIndex(k => (k.pubkey || k) === addr);
        if (idx === -1) continue;
        const pre = tx.meta.preBalances?.[idx] || 0;
        const post = tx.meta.postBalances?.[idx] || 0;
        const diff = post - pre;
        txs.push({
          txid: sig.signature,
          chain: 'sol',
          dir: diff < 0 ? 'out' : 'in',
          amount: Math.abs(diff),
          height: tx.slot || 0,
          timestamp: sig.blockTime || 0,
        });
      } catch {}
    }
    return txs;
  } catch { return []; }
}

/* ── XRP History ── */
async function _xrpHistory(addr, limit) {
  const rpc = _ep('xrp');
  return new Promise((resolve) => {
    const ws = new WebSocket(rpc);
    const timeout = setTimeout(() => { ws.close(); resolve([]); }, 15000);
    ws.onopen = () => ws.send(JSON.stringify({
      command: 'account_tx', account: addr, limit,
      ledger_index_min: -1, ledger_index_max: -1,
    }));
    ws.onmessage = (e) => {
      clearTimeout(timeout);
      try {
        const msg = JSON.parse(e.data);
        const transactions = msg.result?.transactions || [];
        const txs = transactions
          .filter(t => t.tx?.TransactionType === 'Payment')
          .map(t => ({
            txid: t.tx.hash,
            chain: 'xrp',
            dir: t.tx.Account === addr ? 'out' : 'in',
            amount: typeof t.tx.Amount === 'string' ? parseInt(t.tx.Amount) : 0,
            height: t.tx.ledger_index || 0,
            timestamp: (t.tx.date || 0) + 946684800, // Ripple epoch → Unix
          }));
        resolve(txs);
      } catch { resolve([]); }
      ws.close();
    };
    ws.onerror = () => { clearTimeout(timeout); resolve([]); };
  });
}

window.chainsGetHistory = async function(chain, addr, limit = 20) {
  if (!addr) return [];
  try {
    switch (chain) {
      case 'trx':  return await _trxHistory(addr, limit);
      case 'xlm':  return await _xlmHistory(addr, limit);
      case 'ltc':  return await _ltcHistory(addr, limit);
      case 'eth': case 'bnb': case 'avax': return await _evmHistory(chain, addr, limit);
      case 'sol':  return await _solHistory(addr, limit);
      case 'xrp':  return await _xrpHistory(addr, limit);
      // BCH, BTC, XMR — handled by wallet.html (complex parsing, SharedWorker)
      default: return [];
    }
  } catch (e) {
    console.warn(`[chains] ${chain} history fetch failed:`, e.message);
    return [];
  }
};

/* ── Persist TX history (merge by chain) ── */
window.chainsPersistHistory = function(chain, txs) {
  let existing = [];
  try { existing = JSON.parse(localStorage.getItem('00_tx_history') || '[]'); } catch {}
  // Remove old entries for this chain
  const filtered = existing.filter(t => t.chain !== chain);
  // Add new
  const merged = [...filtered, ...txs];
  // Sort newest first
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  // Cap at 500 entries total
  localStorage.setItem('00_tx_history', JSON.stringify(merged.slice(0, 500)));
};

/* ══════════════════════════════════════════════════════════════
   BLOCK HEIGHT (for confirmation counts)
   chainsBlockHeight(chain) → Promise<number>
   Cached 30s in memory
   ══════════════════════════════════════════════════════════════ */
const _heightCache = {};
const _HEIGHT_TTL = 30000;

window.chainsBlockHeight = async function(chain) {
  const cached = _heightCache[chain];
  if (cached && Date.now() - cached.ts < _HEIGHT_TTL) return cached.height;

  let height = 0;
  try {
    switch (CHAINS[chain]?.apiType) {
      case 'electrum': {
        const caller = chain === 'bch' ? window._fvCall : window._btcCall;
        if (caller) {
          const res = await caller('blockchain.headers.subscribe', []);
          height = res?.height || 0;
        }
        break;
      }
      case 'evm': {
        const hex = await _jsonRpc(_ep(chain), 'eth_blockNumber', []);
        height = parseInt(hex, 16);
        break;
      }
      case 'sol': {
        height = await _jsonRpc(_ep('sol'), 'getSlot', []);
        break;
      }
      case 'ltc': {
        const r = await fetch(`${_ep('ltc')}/blocks/tip/height`);
        height = parseInt(await r.text()) || 0;
        break;
      }
      case 'trx': {
        const r = await fetch(`${_ep('trx')}/wallet/getnowblock`);
        const j = await r.json();
        height = j.block_header?.raw_data?.number || 0;
        break;
      }
      case 'xlm': {
        const r = await fetch(`${_ep('xlm')}/ledgers?order=desc&limit=1`);
        const j = await r.json();
        height = j._embedded?.records?.[0]?.sequence || 0;
        break;
      }
      case 'xrp': {
        // Use same WSS as balance
        return new Promise((resolve) => {
          const ws = new WebSocket(_ep('xrp'));
          const timeout = setTimeout(() => { ws.close(); resolve(0); }, 10000);
          ws.onopen = () => ws.send(JSON.stringify({ command: 'ledger', ledger_index: 'validated' }));
          ws.onmessage = (e) => {
            clearTimeout(timeout);
            try {
              const msg = JSON.parse(e.data);
              height = msg.result?.ledger_index || 0;
            } catch {}
            _heightCache[chain] = { height, ts: Date.now() };
            ws.close();
            resolve(height);
          };
          ws.onerror = () => { clearTimeout(timeout); resolve(0); };
        });
      }
    }
  } catch {}

  if (height > 0) _heightCache[chain] = { height, ts: Date.now() };
  return height;
};

/* ══════════════════════════════════════════════════════════════
   HELPER: Format coin amount
   ══════════════════════════════════════════════════════════════ */
window.chainsFormatAmount = function(chain, rawAmount) {
  const meta = CHAINS[chain];
  if (!meta) return '0';
  const val = Number(rawAmount) / Math.pow(10, meta.decimals);
  if (val === 0) return '0 ' + meta.ticker;
  if (val >= 1) return val.toFixed(4) + ' ' + meta.ticker;
  return val.toFixed(meta.decimals).replace(/0+$/, '') + ' ' + meta.ticker;
};

console.log('[chains] Module loaded —', Object.keys(CHAINS).length, 'chains registered');
