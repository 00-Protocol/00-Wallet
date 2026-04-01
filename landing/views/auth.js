/* ══════════════════════════════════════════
   00 Wallet — Auth View (SPA v2)
   ══════════════════════════════════════════
   Import seed / unlock / generate key / Ledger / WalletConnect
   Desktop-first design, clean UI.
   ══════════════════════════════════════════ */

import * as auth from '../core/auth.js';
import * as state from '../core/state.js';
import { generateMnemonic, mnemonicToSeed, deriveBchPriv } from '../core/hd.js';
import { b2h, h2b, rand } from '../core/utils.js';
import { navigate } from '../router.js';

export const id = 'auth';
export const title = '00 Wallet — Connect';
export const icon = '🔐';

let _container = null;

/* ── Detect which screen to show ── */
function hasVault() {
  return !!localStorage.getItem('00wallet_vault');
}

/* ── Templates ── */
const IMPORT_TEMPLATE = `
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--dt-bg,#f5f6f8);padding:24px">
  <div style="width:100%;max-width:460px">
    <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border,#e2e8f0);border-radius:16px;padding:28px">
      <div style="text-align:center;margin-bottom:24px">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:var(--dt-accent,#0AC18E);margin-bottom:16px">
          <span style="font-family:'SF Mono',monospace;font-size:18px;font-weight:800;color:#fff">00</span>
        </div>
        <h1 style="font-size:24px;font-weight:700;color:var(--dt-text,#1a1a2e);margin:0 0 4px;font-family:Inter,sans-serif">Set up your wallet</h1>
        <p style="font-size:13px;color:var(--dt-text-secondary,#64748b);margin:0">Import a seed phrase, hex key, or generate a new one</p>
      </div>
      <label style="font-size:11px;font-weight:600;color:var(--dt-text-secondary,#64748b);letter-spacing:.5px;display:block;margin-bottom:6px">SEED PHRASE OR HEX KEY</label>
      <textarea id="auth-seed" rows="3" placeholder="12 words or 64-char hex..." style="width:100%;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;font-family:'SF Mono',monospace;font-size:13px;resize:none;background:var(--dt-input-bg,#f8fafc);color:var(--dt-text,#1a1a2e);outline:none;box-sizing:border-box;line-height:1.6"></textarea>
      <div style="display:flex;gap:12px;margin-top:16px">
        <div style="flex:1">
          <label style="font-size:11px;font-weight:600;color:var(--dt-text-secondary,#64748b);letter-spacing:.5px;display:block;margin-bottom:6px">PASSWORD</label>
          <input id="auth-pass" type="password" placeholder="min 8 chars..." style="width:100%;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;font-size:13px;background:var(--dt-input-bg,#f8fafc);color:var(--dt-text,#1a1a2e);outline:none;box-sizing:border-box">
        </div>
        <div style="flex:1">
          <label style="font-size:11px;font-weight:600;color:var(--dt-text-secondary,#64748b);letter-spacing:.5px;display:block;margin-bottom:6px">CONFIRM</label>
          <input id="auth-pass2" type="password" placeholder="confirm..." style="width:100%;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;font-size:13px;background:var(--dt-input-bg,#f8fafc);color:var(--dt-text,#1a1a2e);outline:none;box-sizing:border-box">
        </div>
      </div>
      <div id="auth-error" style="font-size:12px;color:#ef4444;margin-top:10px;min-height:18px"></div>
      <button id="auth-import-btn" style="width:100%;padding:14px;border:none;border-radius:10px;background:var(--dt-accent,#0AC18E);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px;font-family:Inter,sans-serif">Import Wallet →</button>
      <button id="auth-gen-btn" style="width:100%;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:transparent;color:var(--dt-text,#1a1a2e);font-size:13px;font-weight:600;cursor:pointer;margin-top:10px;font-family:Inter,sans-serif">Generate New Wallet</button>
      <div style="display:flex;align-items:center;gap:12px;margin:18px 0 14px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">OR</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="auth-ledger-btn" style="flex:1;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:var(--dt-bg,#f5f6f8);color:var(--dt-text,#1a1a2e);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s">Ledger</button>
        <button id="auth-wc-btn" style="flex:1;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:var(--dt-bg,#f5f6f8);color:var(--dt-text,#1a1a2e);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s">WalletConnect</button>
        <button id="auth-wiz-btn" style="flex:1;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:var(--dt-bg,#f5f6f8);color:var(--dt-text,#1a1a2e);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s">WizardConnect</button>
      </div>
      <div id="auth-hw-error" style="font-size:12px;color:#ef4444;margin-top:8px;min-height:16px"></div>
      <div style="display:flex;align-items:center;gap:12px;margin:16px 0 12px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">RESTORE</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <button id="auth-restore-btn" style="width:100%;padding:11px;border:1px dashed var(--dt-border,#e2e8f0);border-radius:10px;background:transparent;color:var(--dt-text-secondary,#64748b);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">📦 Restore from backup file (.0pw)</button>
      <input id="auth-restore-file" type="file" accept=".0pw,.json" style="display:none">
    </div>
  </div>
</div>
`;

const UNLOCK_TEMPLATE = `
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--dt-bg,#f5f6f8);padding:24px">
  <div style="width:100%;max-width:440px">
    <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border,#e2e8f0);border-radius:16px;padding:36px 28px 28px;text-align:center">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:var(--dt-accent,#0AC18E);margin-bottom:16px">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="28" height="28"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h1 style="font-size:24px;font-weight:700;color:var(--dt-text,#1a1a2e);margin:0 0 4px;font-family:Inter,sans-serif">Welcome back</h1>
      <p style="font-size:13px;color:var(--dt-text-secondary,#64748b);margin:0 0 24px">Enter your password to unlock</p>
      <input id="auth-unlock-pass" type="password" placeholder="Password..." autofocus style="width:100%;padding:14px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;font-size:14px;background:var(--dt-input-bg,#f8fafc);color:var(--dt-text,#1a1a2e);outline:none;box-sizing:border-box">
      <div id="auth-unlock-error" style="font-size:12px;color:#ef4444;margin-top:8px;min-height:18px"></div>
      <button id="auth-unlock-btn" style="width:100%;padding:14px;border:none;border-radius:10px;background:var(--dt-accent,#0AC18E);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px;font-family:Inter,sans-serif">Unlock →</button>
      <button id="auth-switch-import" style="width:100%;padding:10px;border:none;background:transparent;color:var(--dt-text-secondary,#64748b);font-size:12px;cursor:pointer;margin-top:10px;font-family:Inter,sans-serif">← Import Different Key</button>
      <div style="display:flex;align-items:center;gap:12px;margin:14px 0 12px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">OR</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="auth-unlock-ledger" style="flex:1;padding:10px;border:1px solid rgba(0,212,255,.3);border-radius:10px;background:transparent;color:#00d4ff;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">🔑 Ledger</button>
        <button id="auth-unlock-wc" style="flex:1;padding:10px;border:1px solid rgba(59,130,246,.3);border-radius:10px;background:transparent;color:#3b82f6;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">⛓ WalletConnect</button>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin:14px 0 12px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">RESTORE</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <button id="auth-restore-btn" style="width:100%;padding:11px;border:1px dashed var(--dt-border,#e2e8f0);border-radius:10px;background:transparent;color:var(--dt-text-secondary,#64748b);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">📦 Restore from backup file (.0pw)</button>
      <input id="auth-restore-file" type="file" accept=".0pw,.json" style="display:none">
    </div>
  </div>
</div>
`;

/* ── Actions ── */
async function doImport() {
  const seed = document.getElementById('auth-seed').value.trim();
  const pass = document.getElementById('auth-pass').value;
  const pass2 = document.getElementById('auth-pass2').value;
  const err = document.getElementById('auth-error');

  if (!seed) { err.textContent = 'Seed phrase or hex key required'; return; }
  if (pass.length < 8) { err.textContent = 'Password must be at least 8 characters'; return; }
  if (pass !== pass2) { err.textContent = 'Passwords don\'t match'; return; }

  err.textContent = 'Deriving keys...';
  err.style.color = 'var(--dt-text-secondary,#64748b)';

  try {
    let seed64, seedWords = null;
    if (/^[0-9a-f]{128}$/i.test(seed)) {
      seed64 = h2b(seed);
    } else {
      seed64 = await mnemonicToSeed(seed);
      seedWords = seed;
    }

    const derived = deriveBchPriv(seed64);
    const profile = {
      seed: b2h(seed64),
      seedWords,
      bchPrivHex: b2h(derived.priv),
      acctPrivHex: b2h(derived.acctPriv),
      acctChainHex: b2h(derived.acctChain),
    };

    await auth.createVault(profile, pass);
    navigate('dashboard');

  } catch (e) {
    err.style.color = '#ef4444';
    err.textContent = 'Error: ' + e.message;
  }
}

async function doGenerate() {
  const btn = document.getElementById('auth-gen-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⚡ Generating...'; }
  try {
    const mnemonic = await generateMnemonic(128);
    document.getElementById('auth-seed').value = mnemonic;
  } catch (e) {
    // Fallback: raw hex
    document.getElementById('auth-seed').value = b2h(rand(32));
  }
  if (btn) { btn.disabled = false; btn.textContent = '⚡ Generate New Wallet'; }
}

async function doUnlock() {
  const pass = document.getElementById('auth-unlock-pass').value;
  const err = document.getElementById('auth-unlock-error');

  try {
    await auth.unlock(pass);
    navigate('dashboard');
  } catch {
    err.textContent = 'Wrong password';
  }
}

function switchToImport() {
  if (_container) {
    _container.innerHTML = IMPORT_TEMPLATE;
    bindImportEvents();
  }
}

async function doWalletConnect() {
  const btn = document.getElementById('auth-wc-btn') || document.getElementById('auth-unlock-wc');
  const errEl = document.getElementById('auth-hw-error') || document.getElementById('auth-unlock-error');
  if (errEl) errEl.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = '⛓ Loading SDK...'; }

  // Create QR overlay
  let overlay = document.getElementById('wc-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wc-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `<div style="background:#fff;border-radius:20px;padding:32px;text-align:center;max-width:320px">
      <h3 style="margin:0 0 8px;font-size:18px;font-family:Inter,sans-serif">Scan with your wallet</h3>
      <p style="margin:0 0 16px;font-size:13px;color:#64748b;font-family:Inter,sans-serif">Open your BCH wallet app and scan this QR code</p>
      <canvas id="wc-qr" style="max-width:240px;margin:0 auto"></canvas>
      <button id="wc-cancel" style="margin-top:16px;padding:8px 24px;border:1px solid #e2e8f0;border-radius:8px;background:transparent;cursor:pointer;font-family:Inter,sans-serif">Cancel</button>
    </div>`;
    document.body.appendChild(overlay);
    document.getElementById('wc-cancel')?.addEventListener('click', () => {
      overlay.style.display = 'none';
      if (btn) { btn.disabled = false; btn.textContent = '⛓ WalletConnect'; }
    });
  }

  try {
    const { connectWalletConnect } = await import('../core/auth.js');
    await connectWalletConnect(
      async (uri) => {
        // Show QR
        overlay.style.display = 'flex';
        if (btn) btn.textContent = '⛓ Scan QR...';
        try {
          const QRCode = (await import('https://esm.sh/qrcode@1.5.4')).default;
          await QRCode.toCanvas(document.getElementById('wc-qr'), uri, { width: 240, margin: 2 });
        } catch { /* QR lib failed, show URI text */ }
      },
      (msg) => { if (errEl) errEl.textContent = msg; }
    );

    overlay.style.display = 'none';

    // Start balance service
    try { const bs = await import('../services/balance-service.js'); bs.start(); } catch {}

    navigate('dashboard');
  } catch (e) {
    overlay.style.display = 'none';
    if (errEl) { errEl.textContent = e.message; errEl.style.color = '#ef4444'; }
    if (btn) { btn.disabled = false; btn.textContent = '⛓ WalletConnect'; }
  }
}

async function doWizardConnect() {
  const WC = window.WizardConnect;
  if (!WC) { alert('WizardConnect module not loaded'); return; }

  // Create modal
  let modal = document.getElementById('wiz-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'wiz-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999';
    modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px;max-width:420px;width:90%;font-family:Inter,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:18px;font-weight:700">🔮 WizardConnect</h3>
        <button id="wiz-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b">✕</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button id="wiz-tab-wallet" style="flex:1;padding:8px;border-radius:8px;border:none;background:#0AC18E;color:#fff;font-size:12px;font-weight:600;cursor:pointer">Wallet Mode</button>
        <button id="wiz-tab-dapp" style="flex:1;padding:8px;border-radius:8px;border:1px solid #7c3aed;background:rgba(124,58,237,.1);color:#7c3aed;font-size:12px;font-weight:600;cursor:pointer">Dapp Mode</button>
      </div>
      <!-- Wallet Panel: Show QR for dapp to scan -->
      <div id="wiz-wallet-panel">
        <p style="font-size:12px;color:#64748b;margin:0 0 12px">Show this QR to a dapp to connect your wallet</p>
        <div style="text-align:center"><canvas id="wiz-qr-canvas" style="max-width:240px"></canvas></div>
        <div id="wiz-uri-display" style="font-size:10px;color:#64748b;word-break:break-all;margin:12px 0;background:#f5f6f8;padding:8px;border-radius:8px;max-height:60px;overflow:auto"></div>
        <div style="display:flex;gap:8px">
          <button id="wiz-copy-uri" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:transparent;cursor:pointer;font-size:12px;font-family:Inter,sans-serif">Copy URI</button>
          <button id="wiz-refresh-qr" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:transparent;cursor:pointer;font-size:12px;font-family:Inter,sans-serif">Refresh</button>
        </div>
        <div id="wiz-wallet-status" style="font-size:12px;margin-top:10px;text-align:center;min-height:20px"></div>
      </div>
      <!-- Dapp Panel: Paste URI to connect to external wallet -->
      <div id="wiz-dapp-panel" style="display:none">
        <p style="font-size:12px;color:#64748b;margin:0 0 12px">Paste the wiz:// URI from an external wallet</p>
        <input id="wiz-dapp-uri" placeholder="wiz://?p=...&s=..." style="width:100%;padding:10px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;font-family:monospace;margin-bottom:12px;box-sizing:border-box">
        <button id="wiz-dapp-connect" style="width:100%;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-weight:600;cursor:pointer;font-size:13px">Connect →</button>
        <div id="wiz-dapp-status" style="font-size:12px;margin-top:10px;text-align:center;min-height:20px"></div>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
  }

  let wizWalletMgr = null;
  let wizDappMgr = null;

  // Close
  document.getElementById('wiz-close').onclick = () => { modal.style.display = 'none'; };

  // Tab switching
  document.getElementById('wiz-tab-wallet').onclick = () => {
    document.getElementById('wiz-wallet-panel').style.display = 'block';
    document.getElementById('wiz-dapp-panel').style.display = 'none';
    document.getElementById('wiz-tab-wallet').style.cssText = 'flex:1;padding:8px;border-radius:8px;border:none;background:#0AC18E;color:#fff;font-size:12px;font-weight:600;cursor:pointer';
    document.getElementById('wiz-tab-dapp').style.cssText = 'flex:1;padding:8px;border-radius:8px;border:1px solid #7c3aed;background:rgba(124,58,237,.1);color:#7c3aed;font-size:12px;font-weight:600;cursor:pointer';
    _generateWalletQR();
  };
  document.getElementById('wiz-tab-dapp').onclick = () => {
    document.getElementById('wiz-wallet-panel').style.display = 'none';
    document.getElementById('wiz-dapp-panel').style.display = 'block';
    document.getElementById('wiz-tab-dapp').style.cssText = 'flex:1;padding:8px;border-radius:8px;border:none;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-size:12px;font-weight:600;cursor:pointer';
    document.getElementById('wiz-tab-wallet').style.cssText = 'flex:1;padding:8px;border-radius:8px;border:1px solid #0AC18E;background:rgba(10,193,142,.1);color:#0AC18E;font-size:12px;font-weight:600;cursor:pointer';
  };

  // Wallet mode: Generate QR
  async function _generateWalletQR() {
    try {
      if (!wizWalletMgr) wizWalletMgr = new WC.WalletManager();
      const conn = wizWalletMgr.generateConnection();
      document.getElementById('wiz-uri-display').textContent = conn.uri;

      const QRCode = (await import('https://esm.sh/qrcode@1.5.4')).default;
      await QRCode.toCanvas(document.getElementById('wiz-qr-canvas'), conn.qrUri, { width: 240, margin: 2 });

      wizWalletMgr.startListening();
      wizWalletMgr.onConnect((dappName) => {
        document.getElementById('wiz-wallet-status').innerHTML = '<span style="color:#0AC18E">✓ Connected to ' + (dappName || 'Dapp') + '</span>';
      });
      wizWalletMgr.onSignRequest((req) => { _showSignModal(req); });
      wizWalletMgr.onDisconnect(() => {
        document.getElementById('wiz-wallet-status').textContent = 'Disconnected';
      });
    } catch (e) {
      document.getElementById('wiz-wallet-status').textContent = 'Error: ' + e.message;
    }
  }

  // Copy URI
  document.getElementById('wiz-copy-uri').onclick = () => {
    const uri = document.getElementById('wiz-uri-display').textContent;
    navigator.clipboard.writeText(uri).then(() => {
      const btn = document.getElementById('wiz-copy-uri');
      btn.textContent = 'Copied ✓';
      setTimeout(() => { btn.textContent = 'Copy URI'; }, 2000);
    });
  };
  document.getElementById('wiz-refresh-qr').onclick = () => _generateWalletQR();

  // Dapp mode: Connect
  document.getElementById('wiz-dapp-connect').onclick = () => {
    const uri = document.getElementById('wiz-dapp-uri').value.trim();
    const statusEl = document.getElementById('wiz-dapp-status');
    if (!uri) { statusEl.textContent = 'Paste a wiz:// URI'; return; }
    try {
      wizDappMgr = new WC.DappManager('00 Protocol', 'https://0penw0rld.com/icons/00.png');
      wizDappMgr.onConnect((walletName, walletIcon, paths) => {
        statusEl.innerHTML = '<span style="color:#0AC18E">✓ Connected to ' + walletName + ' — ' + paths.length + ' paths</span>';
        // Store paths for use
        localStorage.setItem('00_wiz_paths', JSON.stringify(paths));
      });
      wizDappMgr.onDisconnect((reason) => { statusEl.textContent = 'Disconnected: ' + reason; });
      wizDappMgr.connect(uri);
      statusEl.textContent = 'Connecting...';
    } catch (e) { statusEl.textContent = 'Error: ' + e.message; }
  };

  // Sign approval modal
  function _showSignModal(req) {
    let signModal = document.getElementById('wiz-sign-modal');
    if (!signModal) {
      signModal = document.createElement('div');
      signModal.id = 'wiz-sign-modal';
      signModal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10000';
      signModal.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:28px;max-width:400px;width:90%;font-family:Inter,sans-serif">
        <h3 style="margin:0 0 4px;font-size:16px;font-weight:700">🔐 Sign Transaction?</h3>
        <p id="wiz-sign-from" style="font-size:12px;color:#64748b;margin:4px 0 16px"></p>
        <div style="background:#f5f6f8;border-radius:10px;padding:12px;font-size:11px;color:#475569;margin-bottom:16px">
          <div>Sequence: <strong id="wiz-sign-seq"></strong></div>
          <div>Inputs: <strong id="wiz-sign-inputs"></strong></div>
          <div style="margin-top:8px;max-height:100px;overflow:auto;word-break:break-all" id="wiz-sign-rawtx"></div>
        </div>
        <p style="font-size:11px;color:#ef4444;margin:0 0 12px">Expires in <span id="wiz-sign-countdown">300</span>s</p>
        <div style="display:flex;gap:10px">
          <button id="wiz-sign-reject" style="flex:1;padding:10px;border:1px solid #ef4444;border-radius:10px;background:transparent;color:#ef4444;font-weight:600;cursor:pointer;font-size:13px">Reject</button>
          <button id="wiz-sign-approve" style="flex:1;padding:10px;border:none;border-radius:10px;background:#0AC18E;color:#fff;font-weight:600;cursor:pointer;font-size:13px">Approve ✓</button>
        </div>
      </div>`;
      document.body.appendChild(signModal);
    }
    signModal.style.display = 'flex';
    document.getElementById('wiz-sign-from').textContent = 'From: ' + (wizWalletMgr?.getDappName?.() || 'Unknown Dapp');
    document.getElementById('wiz-sign-seq').textContent = '#' + req.sequence;
    document.getElementById('wiz-sign-inputs').textContent = req.inputPaths ? req.inputPaths.length + ' inputs' : '—';
    document.getElementById('wiz-sign-rawtx').textContent = JSON.stringify(req.transaction || {}).slice(0, 500);

    let countdown = 300;
    const cdEl = document.getElementById('wiz-sign-countdown');
    const cdTimer = setInterval(() => { countdown--; cdEl.textContent = countdown; if (countdown <= 0) { clearInterval(cdTimer); _reject(); } }, 1000);

    const _close = () => { signModal.style.display = 'none'; clearInterval(cdTimer); };
    const _reject = () => { if (wizWalletMgr) wizWalletMgr.rejectSign(req.sequence, 'User rejected'); _close(); };
    const _approve = () => { if (wizWalletMgr) wizWalletMgr.approveSign(req.sequence, ''); _close(); };

    document.getElementById('wiz-sign-reject').onclick = _reject;
    document.getElementById('wiz-sign-approve').onclick = _approve;
  }

  // Generate QR immediately (wallet mode default)
  _generateWalletQR();
}

async function doImportBackup(file) {
  if (!file) return;
  const errEl = document.getElementById('auth-error') || document.getElementById('auth-unlock-error') || document.getElementById('auth-hw-error');
  try {
    const text = await file.text();
    const pass = prompt('Enter backup password:');
    if (pass === null) return; // cancelled
    if (errEl) { errEl.style.color = 'var(--dt-text-secondary,#64748b)'; errEl.textContent = 'Restoring backup...'; }
    const { decryptVault } = await import('../core/auth.js');
    const payload = await decryptVault(text, pass);
    if (!payload || payload.format !== '0pw-backup') throw new Error('Invalid backup file format');
    if (payload.vault) localStorage.setItem('00wallet_vault', payload.vault);
    for (const [k, v] of Object.entries(payload.data || {})) {
      if (v !== null && v !== undefined) localStorage.setItem(k, v);
    }
    if (errEl) { errEl.style.color = '#0AC18E'; errEl.textContent = '✓ Backup restored — reloading...'; }
    setTimeout(() => window.location.reload(), 1000);
  } catch (e) {
    if (errEl) { errEl.style.color = '#ef4444'; errEl.textContent = 'Restore failed: ' + e.message; }
  }
}

async function doLedger() {
  // Find whichever Ledger button was clicked
  const btn = document.getElementById('auth-ledger-btn') || document.getElementById('auth-unlock-ledger');
  const errEl = document.getElementById('auth-import-error') || document.getElementById('auth-unlock-error');
  if (errEl) errEl.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = '🔑 Connecting...'; }

  try {
    const { connectLedger } = await import('../core/auth.js');
    const result = await connectLedger((msg) => {
      if (errEl) errEl.textContent = msg;
      if (btn) btn.textContent = '🔑 ' + msg;
    });

    // Start balance service
    try {
      const bs = await import('../services/balance-service.js');
      bs.start();
    } catch {}

    navigate('dashboard');
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.color = '#ff4444'; }
    if (btn) { btn.disabled = false; btn.textContent = '🔑 Ledger'; }
  }
}

/* ── Event binding ── */
function _bindRestoreBtn() {
  const btn = document.getElementById('auth-restore-btn');
  const fileIn = document.getElementById('auth-restore-file');
  if (btn && fileIn) {
    btn.addEventListener('click', () => fileIn.click());
    fileIn.addEventListener('change', function() { if (this.files[0]) doImportBackup(this.files[0]); this.value = ''; });
  }
}

function bindImportEvents() {
  document.getElementById('auth-import-btn')?.addEventListener('click', doImport);
  document.getElementById('auth-gen-btn')?.addEventListener('click', doGenerate);
  document.getElementById('auth-pass2')?.addEventListener('keydown', e => { if (e.key === 'Enter') doImport(); });
  document.getElementById('auth-ledger-btn')?.addEventListener('click', doLedger);
  document.getElementById('auth-wc-btn')?.addEventListener('click', doWalletConnect);
  document.getElementById('auth-wiz-btn')?.addEventListener('click', doWizardConnect);
  _bindRestoreBtn();
}

function bindUnlockEvents() {
  document.getElementById('auth-unlock-btn')?.addEventListener('click', doUnlock);
  document.getElementById('auth-unlock-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
  document.getElementById('auth-switch-import')?.addEventListener('click', switchToImport);
  document.getElementById('auth-unlock-ledger')?.addEventListener('click', doLedger);
  document.getElementById('auth-unlock-wc')?.addEventListener('click', doWalletConnect);
  _bindRestoreBtn();
}

/* ── Lifecycle ── */
export function mount(container) {
  _container = container;

  // Already unlocked? Go to dashboard
  if (auth.isUnlocked()) {
    navigate('dashboard');
    return;
  }

  // Show unlock or import
  if (hasVault()) {
    container.innerHTML = UNLOCK_TEMPLATE;
    bindUnlockEvents();
    // Focus password input
    setTimeout(() => document.getElementById('auth-unlock-pass')?.focus(), 100);
  } else {
    container.innerHTML = IMPORT_TEMPLATE;
    bindImportEvents();
  }
}

export function unmount() {
  if (_container) _container.innerHTML = '';
  _container = null;
}
