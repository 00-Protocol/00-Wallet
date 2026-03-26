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
    <div style="text-align:center;margin-bottom:32px">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:16px;background:var(--dt-accent,#0AC18E);margin-bottom:16px">
        <span style="font-family:'SF Mono',monospace;font-size:18px;font-weight:800;color:#fff">00</span>
      </div>
      <h1 style="font-size:24px;font-weight:700;color:var(--dt-text,#1a1a2e);margin:0 0 4px;font-family:Inter,sans-serif">Set up your wallet</h1>
      <p style="font-size:13px;color:var(--dt-text-secondary,#64748b);margin:0">Import a seed phrase, hex key, or generate a new one</p>
    </div>
    <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border,#e2e8f0);border-radius:16px;padding:28px">
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
      <button id="auth-gen-btn" style="width:100%;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:transparent;color:var(--dt-text,#1a1a2e);font-size:13px;font-weight:600;cursor:pointer;margin-top:10px;font-family:Inter,sans-serif">⚡ Generate New Wallet</button>
      <div style="display:flex;align-items:center;gap:12px;margin:18px 0 14px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">OR</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="auth-ledger-btn" style="flex:1;padding:12px;border:1px solid rgba(0,212,255,.3);border-radius:10px;background:transparent;color:#00d4ff;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">🔑 Ledger</button>
        <button id="auth-wc-btn" style="flex:1;padding:12px;border:1px solid rgba(59,130,246,.3);border-radius:10px;background:transparent;color:#3b82f6;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">⛓ WalletConnect</button>
        <button id="auth-wiz-btn" style="flex:1;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">🔮 WizardConnect</button>
      </div>
      <div id="auth-hw-error" style="font-size:12px;color:#ef4444;margin-top:8px;min-height:16px"></div>
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

/* ── Event binding ── */
function bindImportEvents() {
  document.getElementById('auth-import-btn')?.addEventListener('click', doImport);
  document.getElementById('auth-gen-btn')?.addEventListener('click', doGenerate);
  document.getElementById('auth-pass2')?.addEventListener('keydown', e => { if (e.key === 'Enter') doImport(); });
  // TODO: Ledger, WalletConnect, WizardConnect handlers
}

function bindUnlockEvents() {
  document.getElementById('auth-unlock-btn')?.addEventListener('click', doUnlock);
  document.getElementById('auth-unlock-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doUnlock(); });
  document.getElementById('auth-switch-import')?.addEventListener('click', switchToImport);
  // TODO: Ledger, WalletConnect handlers
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
