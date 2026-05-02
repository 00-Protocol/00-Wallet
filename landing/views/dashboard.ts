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

let _container: HTMLElement | null = null;
let _unsubs: Array<() => void> = [];

// Persistent WizardConnect wallet-mode session
let _wizWalletMgr: any = null;
let _wizConnectedDapp: string | null = null;

function _reqSeq(req: any): number | string | null {
  if (!req) return null;
  return req.sequence ?? req.seq ?? null;
}

function _extractSignedTx(req: any): string {
  if (!req) return '';
  return req.signedTx || req.signedTransaction || req.tx || '';
}

async function _connectWalletConnectFromDashboard() {
  const statusEl = document.getElementById('dash-ext-status');
  const showStatus = (m: string) => { if (statusEl) statusEl.textContent = m; };
  try {
    showStatus('WalletConnect: scan QR or paste URI');

    let modal = document.getElementById('dash-wc-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dash-wc-modal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
      modal.innerHTML = `<div style="background:#fff;border-radius:16px;padding:20px;max-width:420px;width:92%;text-align:center">
        <h3 style="margin:0 0 8px">WalletConnect</h3>
        <p style="margin:0 0 10px;font-size:12px;color:#64748b">Inside wallet mode only accepts scanned or pasted wc: URI.</p>
        <input id="dash-wc-uri-input" placeholder="Paste wc: URI" style="width:100%;margin-top:10px;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;font-family:monospace;box-sizing:border-box" />
        <div style="display:flex;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap">
          <button id="dash-wc-scan" style="padding:8px 14px;border:none;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer">Scan QR</button>
          <button id="dash-wc-connect-uri" style="padding:8px 14px;border:none;border-radius:8px;background:#0AC18E;color:#fff;cursor:pointer">Connect URI</button>
          <button id="dash-wc-close" style="padding:8px 14px;border:1px solid #e2e8f0;border-radius:8px;background:transparent;cursor:pointer">Close</button>
        </div>
      </div>`;
      document.body.appendChild(modal);
      document.getElementById('dash-wc-close')?.addEventListener('click', () => { modal!.style.display = 'none'; });
    } else {
      modal.style.display = 'flex';
    }

    const { connectWalletConnectWithUri } = await import('../core/auth.js');
    const finishConnected = async () => {
      try { const bs = await import('../services/balance-service.js'); bs.start(auth.getKeys()); } catch {}
      showStatus('WalletConnect connected');
      _updateWcStatus();
      const m = document.getElementById('dash-wc-modal');
      if (m) m.style.display = 'none';
    };

    document.getElementById('dash-wc-scan')!.onclick = async () => {
      try {
        const maybeUri = await _scanQrUri();
        if (!maybeUri) {
          showStatus('QR scan cancelled');
          return;
        }
        const input = document.getElementById('dash-wc-uri-input') as HTMLInputElement | null;
        if (input) input.value = maybeUri;
        showStatus('WalletConnect URI scanned');
      } catch (e: any) {
        showStatus('WalletConnect scan error: ' + (e?.message || 'unknown'));
      }
    };

    document.getElementById('dash-wc-connect-uri')!.onclick = async () => {
      const input = document.getElementById('dash-wc-uri-input') as HTMLInputElement | null;
      const uri = input?.value?.trim() || '';
      if (!uri) {
        showStatus('Paste a wc: URI first');
        return;
      }
      try {
        showStatus('Connecting with URI...');
        await connectWalletConnectWithUri(uri, (msg: string) => showStatus(msg));
        await finishConnected();
      } catch (e: any) {
        showStatus('WalletConnect URI error: ' + (e?.message || 'unknown'));
      }
    };
  } catch (e: any) {
    showStatus('WalletConnect error: ' + (e?.message || 'unknown'));
  }
}

function _updateWizStatus() {
  const nameEl = document.getElementById('wiz-status-name');
  const dotEl = document.getElementById('wiz-status-dot');
  const secEl = document.getElementById('wiz-status-section');
  if (!secEl) return;
  const wizMetaRaw = localStorage.getItem('00_wiz_session') || '';
  let wizLabel = _wizConnectedDapp || '';
  try { wizLabel = wizLabel || (JSON.parse(wizMetaRaw || '{}')?.label || ''); } catch {}
  const connected = !!wizLabel || !!auth.isWizardConnect?.();
  if (connected) {
    if (dotEl) { dotEl.style.background = '#0AC18E'; dotEl.title = 'Connected'; }
    if (nameEl) nameEl.textContent = wizLabel || 'Session connected';
    secEl.style.borderColor = '#0AC18E44';
  } else {
    if (dotEl) { dotEl.style.background = '#94a3b8'; dotEl.title = 'Disconnected'; }
    if (nameEl) nameEl.textContent = 'No dapp connected';
    secEl.style.borderColor = 'var(--dt-border,#e2e8f0)';
  }
}

function _updateWcStatus() {
  const dotEl = document.getElementById('wc-status-dot');
  const nameEl = document.getElementById('wc-status-name');
  if (!dotEl) return;
  const connected = !!auth.isWalletConnect?.();
  dotEl.style.background = connected ? '#0AC18E' : '#94a3b8';
  dotEl.title = connected ? 'Connected' : 'Disconnected';
  if (nameEl) nameEl.textContent = connected ? 'Session connected' : 'No session';
}

function _showWizSignModal(req: any, mgr: any) {
  document.getElementById('wiz-sign-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'wiz-sign-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10000';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:24px;max-width:460px;width:92%';

  const title = document.createElement('div');
  title.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:4px';
  title.textContent = 'Sign Request';

  const from = document.createElement('div');
  from.style.cssText = 'font-size:12px;color:#64748b;margin-bottom:12px';
  from.textContent = 'From: ' + (_wizConnectedDapp || 'Dapp');

  const pre = document.createElement('pre');
  pre.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-size:11px;overflow:auto;max-height:200px;white-space:pre-wrap;word-break:break-all;margin:0 0 8px';
  pre.textContent = JSON.stringify(req, null, 2);

  const timer = document.createElement('div');
  timer.style.cssText = 'font-size:12px;color:#94a3b8;margin-bottom:12px';
  let countdown = 300;
  timer.textContent = 'Auto-rejects in 300s';
  const seq = _reqSeq(req);
  const interval = setInterval(() => {
    countdown--;
    timer.textContent = 'Auto-rejects in ' + countdown + 's';
    if (countdown <= 0) {
      clearInterval(interval);
      if (seq !== null) mgr.rejectSign(seq, 'Timeout');
      overlay.remove();
    }
  }, 1000);

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

  const rejectBtn = document.createElement('button');
  rejectBtn.style.cssText = 'padding:8px 16px;border:1px solid #ef4444;border-radius:8px;background:transparent;color:#ef4444;cursor:pointer;font-weight:600';
  rejectBtn.textContent = 'Reject';
  rejectBtn.onclick = () => {
    clearInterval(interval);
    if (seq !== null) mgr.rejectSign(seq, 'Rejected by user');
    overlay.remove();
  };

  const approveBtn = document.createElement('button');
  approveBtn.style.cssText = 'padding:8px 16px;border:none;border-radius:8px;background:#0AC18E;color:#fff;cursor:pointer;font-weight:600';
  approveBtn.textContent = 'Approve';
  approveBtn.onclick = () => {
    clearInterval(interval);
    const signedTx = _extractSignedTx(req);
    if (seq === null) {
      overlay.remove();
      return;
    }
    if (!signedTx) {
      mgr.rejectSign(seq, 'No signed transaction payload provided');
      overlay.remove();
      return;
    }
    mgr.approveSign(seq, signedTx);
    overlay.remove();
  };

  btns.appendChild(rejectBtn);
  btns.appendChild(approveBtn);
  [title, from, pre, timer, btns].forEach(el => box.appendChild(el));
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

async function _openWizardDappMode() {
  const WC = (window as any).WizardConnect;
  if (!WC) {
    const s = document.getElementById('dash-ext-status');
    if (s) s.textContent = 'WizardConnect module not loaded';
    return;
  }

  const existing = document.getElementById('dash-wiz-modal');
  if (existing) { existing.style.display = 'flex'; return; }

  const modal = document.createElement('div');
  modal.id = 'dash-wiz-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';

  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:20px;max-width:460px;width:92%';

  const h3 = document.createElement('h3');
  h3.style.cssText = 'margin:0 0 12px';
  h3.textContent = 'WizardConnect';

  // Inside wallet: scan or paste only (no shown QR).
  const dappPanel = document.createElement('div');

  const dappDesc = document.createElement('p');
  dappDesc.style.cssText = 'font-size:12px;color:#64748b;margin:0 0 10px';
  dappDesc.textContent = 'Inside wallet mode only accepts scanned or pasted wiz:// URI.';

  const dappInput = document.createElement('input') as HTMLInputElement;
  dappInput.placeholder = 'wiz://?p=...&s=...';
  dappInput.style.cssText = 'width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;font-family:monospace;box-sizing:border-box;margin-bottom:8px';

  const dappStatus = document.createElement('div');
  dappStatus.style.cssText = 'font-size:12px;color:#334155;min-height:18px;margin-bottom:8px';

  const scanBtn = document.createElement('button');
  scanBtn.style.cssText = 'padding:8px 14px;border:none;border-radius:8px;background:#2563eb;color:#fff;cursor:pointer;font-weight:600;width:100%;margin-bottom:8px';
  scanBtn.textContent = 'Scan QR';
  scanBtn.onclick = async () => {
    try {
      const uri = await _scanQrUri();
      if (!uri) {
        dappStatus.textContent = 'QR scan cancelled';
        return;
      }
      dappInput.value = uri;
      dappStatus.textContent = 'WizardConnect URI scanned';
    } catch (e: any) {
      dappStatus.textContent = 'Scan error: ' + (e?.message || 'unknown');
    }
  };

  const dappConnectBtn = document.createElement('button');
  dappConnectBtn.style.cssText = 'padding:8px 14px;border:none;border-radius:8px;background:#0AC18E;color:#fff;cursor:pointer;font-weight:600;width:100%';
  dappConnectBtn.textContent = 'Connect';
  dappConnectBtn.onclick = () => {
    const uri = dappInput.value.trim();
    if (!uri) { dappStatus.textContent = 'Paste a wiz:// URI first'; return; }
    try {
      const dapp = new WC.DappManager('00 Wallet', '');
      dapp.onConnect((name: string, icon: string, paths: any[]) => {
        _wizConnectedDapp = name || 'External wallet';
        _updateWizStatus();
        dappStatus.textContent = 'Connected to ' + (name || 'wallet') + ' (' + (paths?.length || 0) + ' paths)';
        localStorage.setItem('00_wiz_paths', JSON.stringify(paths || []));
      });
      dapp.onDisconnect((reason: string) => {
        _wizConnectedDapp = null;
        _updateWizStatus();
        dappStatus.textContent = 'Disconnected: ' + reason;
      });
      dapp.connect(uri);
      dappStatus.textContent = 'Connecting...';
    } catch (e: any) {
      dappStatus.textContent = 'Error: ' + (e?.message || 'unknown');
    }
  };

  [dappDesc, scanBtn, dappInput, dappStatus, dappConnectBtn].forEach(el => dappPanel.appendChild(el));

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;justify-content:flex-end;margin-top:16px';
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'padding:8px 14px;border:1px solid #e2e8f0;border-radius:8px;background:transparent;cursor:pointer';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = () => { modal.style.display = 'none'; };
  footer.appendChild(closeBtn);

  [h3, dappPanel, footer].forEach(el => box.appendChild(el));
  modal.appendChild(box);
  document.body.appendChild(modal);
}

async function _scanQrUri(): Promise<string | null> {
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || !(window as any).BarcodeDetector) {
    return await _pasteUriModal();
  }

  return await new Promise((resolve, reject) => {
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;z-index:10001';
    overlay.innerHTML = `<div style="background:#fff;border-radius:14px;padding:12px;max-width:420px;width:92%">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong style="font-size:14px">Scan QR Code</strong>
        <button id="scan-close" style="border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:4px 10px;cursor:pointer">Close</button>
      </div>
      <video id="scan-video" autoplay playsinline style="width:100%;border-radius:10px;background:#000"></video>
      <div id="scan-status" style="font-size:12px;color:#64748b;margin-top:6px">Point camera at a WalletConnect/WizardConnect QR</div>
    </div>`;
    document.body.appendChild(overlay);

    const cleanup = () => {
      if (timer) window.clearInterval(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
      overlay.remove();
    };

    (overlay.querySelector('#scan-close') as HTMLButtonElement).onclick = () => {
      cleanup();
      resolve(null);
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s;
      const video = overlay.querySelector('#scan-video') as HTMLVideoElement;
      video.srcObject = stream;
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      timer = window.setInterval(async () => {
        try {
          const barcodes = await detector.detect(video);
          const raw = barcodes?.[0]?.rawValue || '';
          if (raw) {
            cleanup();
            resolve(String(raw).trim());
          }
        } catch {}
      }, 350);
    }).catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

async function _pasteUriModal(): Promise<string | null> {
  return await new Promise((resolve) => {
    document.getElementById('scan-paste-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'scan-paste-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;z-index:10002';
    overlay.innerHTML = `<div style="background:#fff;border-radius:14px;padding:16px;max-width:420px;width:92%">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px">Paste Connection URI</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:10px">Camera QR scan is unavailable here. Paste a wc: or wiz:// URI.</div>
      <input id="scan-paste-input" placeholder="wc:... or wiz://..." style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;font-family:monospace;box-sizing:border-box" />
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
        <button id="scan-paste-cancel" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer">Cancel</button>
        <button id="scan-paste-ok" style="padding:8px 12px;border:none;border-radius:8px;background:#0AC18E;color:#fff;cursor:pointer">Use URI</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();
    const input = overlay.querySelector('#scan-paste-input') as HTMLInputElement;
    input?.focus();

    (overlay.querySelector('#scan-paste-cancel') as HTMLButtonElement).onclick = () => {
      cleanup();
      resolve(null);
    };
    (overlay.querySelector('#scan-paste-ok') as HTMLButtonElement).onclick = () => {
      const uri = (input?.value || '').trim();
      cleanup();
      resolve(uri || null);
    };
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const uri = (input?.value || '').trim();
        cleanup();
        resolve(uri || null);
      }
    });
  });
}

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

const PRICE_CHAINS = ['bch','btc','eth','xmr','ltc','bnb','matic','avax','sol','trx','xrp','xlm'];
const PRICE_DOTS: Record<string, string> = {bch:'#0AC18E',btc:'#F7931A',eth:'#627EEA',xmr:'#FF6600',ltc:'#345D9D',bnb:'#F3BA2F',matic:'#8247E5',avax:'#E84142',sol:'#9945FF',trx:'#FF0013',xrp:'#23292F',xlm:'#14B6E7'};

function fmtBal(raw: number | string | undefined | null, dec: number, ticker: string): string {
  if (raw === undefined || raw === null) return '0 ' + ticker;
  const n = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (isNaN(n)) return '0 ' + ticker;
  const val = n / Math.pow(10, dec);
  if (val === 0) return '0 ' + ticker;
  return val.toFixed(dec > 6 ? 8 : Math.min(dec, 4)) + ' ' + ticker;
}

function fmtFiat(raw: number | string | undefined | null, dec: number, price: number | undefined | null): string {
  if (!price || raw === undefined || raw === null) return '$0.00';
  const n = typeof raw === 'string' ? parseFloat(raw) : raw;
  if (isNaN(n)) return '$0.00';
  const v = (n / Math.pow(10, dec)) * price;
  return '$' + v.toLocaleString('en', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function fmtPrice(p: number | undefined | null): string {
  if (!p) return '$—';
  return '$' + p.toLocaleString('en', {maximumFractionDigits:2});
}

/* ── Render ── */
function render() {
  if (!_container) return;
  const keysNow = auth.getKeys() as any;
  const hasLocalControl = !!keysNow?.privKey; // seed/hex local wallet
  const balances = (state.get('balances') || {}) as Record<string, unknown>;
  const prices = (state.get('prices') || {}) as Record<string, { price?: number }>;

  // Total portfolio
  let total = 0;
  for (const c of CHAINS) {
    const bal = balances[c.id];
    let priceKey = c.id;
    if (c.id === 'sbch') priceKey = 'bch';
    else if (c.id === 'usdce_polygon') priceKey = 'usdc';
    else if (c.id.startsWith('usdc')) priceKey = 'usdc';
    else if (c.id.startsWith('usdt')) priceKey = 'usdt';
    else if (c.id.startsWith('rlusd')) priceKey = 'usdc';
    const p = (prices[priceKey]?.price) || 0;
    if (bal !== undefined && p) {
      const n = typeof bal === 'string' ? parseFloat(bal as string) : (bal as number);
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
    else if (c.id === 'usdce_polygon') priceKey = 'usdc';
    else if (c.id.startsWith('usdc')) priceKey = 'usdc';
    else if (c.id.startsWith('usdt')) priceKey = 'usdt';
    else if (c.id.startsWith('rlusd')) priceKey = 'usdc'; // ~$1
    const p = prices[priceKey]?.price || 0;
    const balTyped = bal as number | string | undefined | null;
    const balStr = fmtBal(balTyped, c.dec, c.ticker);
    const fiatStr = fmtFiat(balTyped, c.dec, p);

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
    <div id="wiz-status-section" style="margin-top:12px;background:var(--dt-surface,#fff);border:1px solid var(--dt-border,#e2e8f0);border-radius:14px;padding:14px;transition:border-color .3s">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-size:12px;color:var(--dt-text-secondary,#64748b);margin-bottom:6px">Connections</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;font-weight:600;color:var(--dt-text-secondary,#64748b)">WalletConnect</span>
              <span id="wc-status-dot" style="width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block" title="Disconnected"></span>
              <span id="wc-status-name" style="font-size:11px;color:var(--dt-text-secondary,#64748b)">No session</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;font-weight:600;color:var(--dt-text-secondary,#64748b)">WizardConnect</span>
              <span id="wiz-status-dot" style="width:8px;height:8px;border-radius:50%;background:#94a3b8;display:inline-block" title="Disconnected"></span>
              <span id="wiz-status-name" style="font-size:11px;color:var(--dt-text-secondary,#64748b)">No dapp connected</span>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${hasLocalControl ? `
            <button id="dash-connect-wc" style="padding:8px 12px;border:1px solid #3b82f633;border-radius:8px;background:transparent;color:#2563eb;cursor:pointer;font-weight:600;font-size:13px">WalletConnect</button>
            <button id="dash-connect-wiz" style="padding:8px 12px;border:1px solid #7c3aed33;border-radius:8px;background:transparent;color:#7c3aed;cursor:pointer;font-weight:600;font-size:13px">WizardConnect</button>
          ` : `<span style="font-size:11px;color:var(--dt-text-secondary,#64748b);padding:8px 0">View-only mode</span>`}
          <button id="dash-open-chat" onclick="window.location.hash='#/chat'" style="padding:8px 12px;border:1px solid #0AC18E33;border-radius:8px;background:transparent;color:#0AC18E;cursor:pointer;font-weight:600;font-size:13px">Chat</button>
        </div>
      </div>
      <div id="dash-ext-status" style="margin-top:8px;font-size:12px;color:var(--dt-text-secondary,#64748b)"></div>
    </div>
    <div class="wd-accounts">${cards}</div>
  </div>`;

  document.getElementById('dash-connect-wc')?.addEventListener('click', _connectWalletConnectFromDashboard);
  document.getElementById('dash-connect-wiz')?.addEventListener('click', _openWizardDappMode);
  _updateWizStatus();
  _updateWcStatus();
}

export function mount(container: HTMLElement) {
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
