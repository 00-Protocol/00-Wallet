import * as auth from "../core/auth.js";
import { generateMnemonic, mnemonicToSeed, deriveBchPriv } from "../core/hd.js";
import { b2h, h2b, rand } from "../core/utils.js";
import { navigate } from "../router.js";
const id = "auth";
const title = "BCH Stealth Wallet \u2014 Connect";
const icon = "\u{1F510}";
let _container = null;
function hasVault() {
  return !!localStorage.getItem("00wallet_vault");
}
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
      <button id="auth-import-btn" style="width:100%;padding:14px;border:none;border-radius:10px;background:var(--dt-accent,#0AC18E);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px;font-family:Inter,sans-serif">Import Wallet \u2192</button>
      <button id="auth-gen-btn" style="width:100%;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:transparent;color:var(--dt-text,#1a1a2e);font-size:13px;font-weight:600;cursor:pointer;margin-top:10px;font-family:Inter,sans-serif">Generate New Wallet</button>
      <div style="display:flex;align-items:center;gap:12px;margin:18px 0 14px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">OR</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="auth-ledger-btn" style="flex:1;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:var(--dt-bg,#f5f6f8);color:var(--dt-text,#1a1a2e);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s">Ledger</button>
        <button id="auth-trezor-btn" style="flex:1;padding:12px;border:1px solid var(--dt-border,#e2e8f0);border-radius:10px;background:var(--dt-bg,#f5f6f8);color:var(--dt-text,#1a1a2e);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;transition:all .15s">Trezor</button>
      </div>
      <div id="auth-hw-error" style="font-size:12px;color:#ef4444;margin-top:8px;min-height:16px"></div>
      <div style="display:flex;align-items:center;gap:12px;margin:16px 0 12px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">RESTORE</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <button id="auth-restore-btn" style="width:100%;padding:11px;border:1px dashed var(--dt-border,#e2e8f0);border-radius:10px;background:transparent;color:var(--dt-text-secondary,#64748b);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">\u{1F4E6} Restore from backup file (.0pw)</button>
      <input id="auth-restore-file" type="file" accept=".0pw,.json" style="display:none">
      <div style="display:flex;align-items:center;gap:12px;margin:16px 0 12px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">EXTERNAL WALLET</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="auth-wc-btn" style="flex:1;padding:12px;border:1px solid #3b82f655;border-radius:10px;background:transparent;color:#2563eb;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">WalletConnect</button>
        <button id="auth-wiz-btn" style="flex:1;padding:12px;border:1px solid #7c3aed55;border-radius:10px;background:transparent;color:#7c3aed;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">WizardConnect</button>
      </div>
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
      <button id="auth-unlock-btn" style="width:100%;padding:14px;border:none;border-radius:10px;background:var(--dt-accent,#0AC18E);color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px;font-family:Inter,sans-serif">Unlock \u2192</button>
      <button id="auth-switch-import" style="width:100%;padding:10px;border:none;background:transparent;color:var(--dt-text-secondary,#64748b);font-size:12px;cursor:pointer;margin-top:10px;font-family:Inter,sans-serif">\u2190 Import Different Key</button>
      <div style="display:flex;align-items:center;gap:12px;margin:14px 0 12px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">RESTORE</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <button id="auth-restore-btn" style="width:100%;padding:11px;border:1px dashed var(--dt-border,#e2e8f0);border-radius:10px;background:transparent;color:var(--dt-text-secondary,#64748b);font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">\u{1F4E6} Restore from backup file (.0pw)</button>
      <input id="auth-restore-file" type="file" accept=".0pw,.json" style="display:none">
      <div style="display:flex;align-items:center;gap:12px;margin:16px 0 12px">
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
        <span style="font-size:11px;color:var(--dt-text-secondary,#64748b);font-weight:500">EXTERNAL WALLET</span>
        <div style="flex:1;height:1px;background:var(--dt-border,#e2e8f0)"></div>
      </div>
      <div style="display:flex;gap:10px">
        <button id="auth-wc-btn" style="flex:1;padding:12px;border:1px solid #3b82f655;border-radius:10px;background:transparent;color:#2563eb;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">WalletConnect</button>
        <button id="auth-wiz-btn" style="flex:1;padding:12px;border:1px solid #7c3aed55;border-radius:10px;background:transparent;color:#7c3aed;font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif">WizardConnect</button>
      </div>
      <div id="auth-hw-error" style="font-size:12px;color:#ef4444;margin-top:8px;min-height:16px"></div>
    </div>
  </div>
</div>
`;
async function doImport() {
  const seed = document.getElementById("auth-seed").value.trim();
  const pass = document.getElementById("auth-pass").value;
  const pass2 = document.getElementById("auth-pass2").value;
  const err = document.getElementById("auth-error");
  if (!seed) {
    err.textContent = "Seed phrase or hex key required";
    return;
  }
  if (pass.length < 8) {
    err.textContent = "Password must be at least 8 characters";
    return;
  }
  if (pass !== pass2) {
    err.textContent = "Passwords don't match";
    return;
  }
  err.textContent = "Deriving keys...";
  err.style.color = "var(--dt-text-secondary,#64748b)";
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
      acctChainHex: b2h(derived.acctChain)
    };
    await auth.createVault(profile, pass);
    navigate("dashboard");
  } catch (e) {
    err.style.color = "#ef4444";
    err.textContent = "Error: " + e.message;
  }
}
async function doGenerate() {
  const btn = document.getElementById("auth-gen-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "\u26A1 Generating...";
  }
  try {
    const mnemonic = await generateMnemonic(128);
    document.getElementById("auth-seed").value = mnemonic;
  } catch (e) {
    document.getElementById("auth-seed").value = b2h(rand(32));
  }
  if (btn) {
    btn.disabled = false;
    btn.textContent = "\u26A1 Generate New Wallet";
  }
}
async function doUnlock() {
  const pass = document.getElementById("auth-unlock-pass").value;
  const err = document.getElementById("auth-unlock-error");
  try {
    await auth.unlock(pass);
    navigate("dashboard");
  } catch {
    err.textContent = "Wrong password";
  }
}
function switchToImport() {
  if (_container) {
    _container.innerHTML = IMPORT_TEMPLATE;
    bindImportEvents();
  }
}
async function doWalletConnect() {
  const btn = document.getElementById("auth-wc-btn");
  const resetText = "WalletConnect";
  const errEl = document.getElementById("auth-hw-error");
  if (errEl) errEl.textContent = "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "\u26D3 Loading SDK...";
  }
  let modal = document.getElementById("wc-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "wc-modal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:9999";
    modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px;max-width:420px;width:90%;font-family:Inter,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:18px;font-weight:700">\u26D3 WalletConnect</h3>
        <button id="wc-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b">\u2715</button>
      </div>
      <!-- QR + URI Panel -->
      <div id="wc-scan-panel">
        <p style="font-size:12px;color:#64748b;margin:0 0 12px">Open your wallet app and scan this QR code, or copy URI.</p>
        <div style="text-align:center"><canvas id="wc-qr-canvas" style="max-width:240px"></canvas></div>
        <div id="wc-qr-uri" style="font-size:10px;color:#64748b;word-break:break-all;margin:12px 0;background:#f5f6f8;padding:8px;border-radius:8px;max-height:60px;overflow:auto"></div>
        <div style="display:flex;gap:8px">
          <button id="wc-copy-btn" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:transparent;cursor:pointer;font-size:12px;font-family:Inter,sans-serif">Copy URI</button>
          <button id="wc-scan-cancel" style="flex:1;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:transparent;cursor:pointer;font-size:12px;font-family:Inter,sans-serif">Cancel</button>
        </div>
        <div id="wc-scan-status" style="font-size:12px;margin-top:10px;text-align:center;min-height:20px"></div>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }
  document.getElementById("wc-close").onclick = () => {
    modal.style.display = "none";
    if (btn) {
      btn.disabled = false;
      btn.textContent = resetText;
    }
  };
  document.getElementById("wc-scan-cancel").onclick = () => {
    modal.style.display = "none";
    if (btn) {
      btn.disabled = false;
      btn.textContent = resetText;
    }
  };
  document.getElementById("wc-copy-btn")?.addEventListener("click", async () => {
    const uri = (document.getElementById("wc-qr-uri")?.textContent || "").trim();
    if (!uri) return;
    try {
      await navigator.clipboard.writeText(uri);
      const cbtn = document.getElementById("wc-copy-btn");
      const prev = cbtn.textContent;
      cbtn.textContent = "Copied \u2713";
      setTimeout(() => {
        cbtn.textContent = prev || "Copy URI";
      }, 1200);
    } catch {
    }
  });
  try {
    const { connectWalletConnect } = await import("../core/auth.js");
    await connectWalletConnect(
      async (uri) => {
        modal.style.display = "flex";
        const uriEl = document.getElementById("wc-qr-uri");
        if (uriEl) uriEl.textContent = uri;
        if (btn) btn.textContent = "\u26D3 Scanning...";
        try {
          const QRCode = (await import("../lib/qrcode.js")).default;
          await QRCode.toCanvas(document.getElementById("wc-qr-canvas"), uri, { width: 240, margin: 2 });
        } catch {
        }
      },
      (msg) => {
        if (errEl) errEl.textContent = msg;
      }
    );
    modal.style.display = "none";
    try {
      const bs = await import("../services/balance-service.js");
      bs.start(auth.getKeys());
    } catch {
    }
    navigate("dashboard");
  } catch (e) {
    modal.style.display = "none";
    if (errEl) {
      errEl.textContent = e.message;
      errEl.style.color = "#ef4444";
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = resetText;
    }
  }
}
async function doWizardConnect() {
  const WC = window.WizardConnect;
  if (!WC) {
    alert("WizardConnect module not loaded");
    return;
  }
  let modal = document.getElementById("wiz-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "wiz-modal";
    modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999";
    modal.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:28px;max-width:420px;width:90%;font-family:Inter,sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0;font-size:18px;font-weight:700">\u{1F52E} WizardConnect</h3>
        <button id="wiz-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b">\u2715</button>
      </div>
      <!-- Wallet panel: Show QR for dapp to scan -->
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
    </div>`;
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }
  let wizWalletMgr = null;
  document.getElementById("wiz-close").onclick = () => {
    modal.style.display = "none";
  };
  async function _generateWalletQR() {
    try {
      if (!wizWalletMgr) wizWalletMgr = new WC.WalletManager();
      const _wk = auth.getKeys();
      if (_wk?.stealthSpendXpub && _wk?.stealthScanXpub) {
        wizWalletMgr.setStealthXpubs(_wk.stealthSpendXpub, _wk.stealthScanXpub);
      }
      const conn = await wizWalletMgr.generateConnection();
      document.getElementById("wiz-uri-display").textContent = conn.uri;
      const QRCode = (await import("../lib/qrcode.js")).default;
      await QRCode.toCanvas(document.getElementById("wiz-qr-canvas"), conn.qrUri, { width: 240, margin: 2 });
      wizWalletMgr.startListening();
      wizWalletMgr.onConnect((meta) => {
        const dappName = (typeof meta === "string" ? meta : meta?.name) || "Dapp";
        const wcAddr = (typeof meta === "object" ? meta?.bchAddr || "" : "") || "";
        document.getElementById("wiz-wallet-status").innerHTML = '<span style="color:#0AC18E">\u2713 Connected to ' + dappName + "</span>";
        try {
          const wk = auth.getKeys();
          auth.connectWizardSession({ label: dappName || "WizardConnect", bchAddr: wcAddr || wk?.bchAddr || "" });
        } catch {
        }
        try {
          import("../services/balance-service.js").then((bs) => bs.start(auth.getKeys())).catch(() => {
          });
        } catch {
        }
        modal.style.display = "none";
        navigate("dashboard");
      });
      wizWalletMgr.onSignRequest((req) => {
        _showSignModal(req);
      });
      wizWalletMgr.onDisconnect(() => {
        document.getElementById("wiz-wallet-status").textContent = "Disconnected";
      });
    } catch (e) {
      document.getElementById("wiz-wallet-status").textContent = "Error: " + e.message;
    }
  }
  document.getElementById("wiz-copy-uri").onclick = () => {
    const uri = document.getElementById("wiz-uri-display").textContent;
    navigator.clipboard.writeText(uri).then(() => {
      const btn = document.getElementById("wiz-copy-uri");
      btn.textContent = "Copied \u2713";
      setTimeout(() => {
        btn.textContent = "Copy URI";
      }, 2e3);
    });
  };
  document.getElementById("wiz-refresh-qr").onclick = () => _generateWalletQR();
  function _showSignModal(req) {
    let signModal = document.getElementById("wiz-sign-modal");
    if (!signModal) {
      signModal = document.createElement("div");
      signModal.id = "wiz-sign-modal";
      signModal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10000";
      signModal.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:28px;max-width:400px;width:90%;font-family:Inter,sans-serif">
        <h3 style="margin:0 0 4px;font-size:16px;font-weight:700">\u{1F510} Sign Transaction?</h3>
        <p id="wiz-sign-from" style="font-size:12px;color:#64748b;margin:4px 0 16px"></p>
        <div style="background:#f5f6f8;border-radius:10px;padding:12px;font-size:11px;color:#475569;margin-bottom:16px">
          <div>Sequence: <strong id="wiz-sign-seq"></strong></div>
          <div>Inputs: <strong id="wiz-sign-inputs"></strong></div>
          <div style="margin-top:8px;max-height:100px;overflow:auto;word-break:break-all" id="wiz-sign-rawtx"></div>
        </div>
        <p style="font-size:11px;color:#ef4444;margin:0 0 12px">Expires in <span id="wiz-sign-countdown">300</span>s</p>
        <div style="display:flex;gap:10px">
          <button id="wiz-sign-reject" style="flex:1;padding:10px;border:1px solid #ef4444;border-radius:10px;background:transparent;color:#ef4444;font-weight:600;cursor:pointer;font-size:13px">Reject</button>
          <button id="wiz-sign-approve" style="flex:1;padding:10px;border:none;border-radius:10px;background:#0AC18E;color:#fff;font-weight:600;cursor:pointer;font-size:13px">Approve \u2713</button>
        </div>
      </div>`;
      document.body.appendChild(signModal);
    }
    signModal.style.display = "flex";
    document.getElementById("wiz-sign-from").textContent = "From: " + (wizWalletMgr?.getDappName?.() || "Unknown Dapp");
    document.getElementById("wiz-sign-seq").textContent = "#" + req.sequence;
    document.getElementById("wiz-sign-inputs").textContent = req.inputPaths ? req.inputPaths.length + " inputs" : "\u2014";
    document.getElementById("wiz-sign-rawtx").textContent = JSON.stringify(req.transaction || {}).slice(0, 500);
    let countdown = 300;
    const cdEl = document.getElementById("wiz-sign-countdown");
    const cdTimer = setInterval(() => {
      countdown--;
      cdEl.textContent = countdown;
      if (countdown <= 0) {
        clearInterval(cdTimer);
        _reject();
      }
    }, 1e3);
    const _close = () => {
      signModal.style.display = "none";
      clearInterval(cdTimer);
    };
    const _reject = () => {
      if (wizWalletMgr) wizWalletMgr.rejectSign(req.sequence, "User rejected");
      _close();
    };
    const _approve = () => {
      if (!wizWalletMgr) {
        _close();
        return;
      }
      const signedTx = req.signedTx || req.signedTransaction || req.tx || (typeof req.transaction === "string" ? req.transaction : "");
      if (!signedTx) {
        wizWalletMgr.rejectSign(req.sequence, "No signed transaction payload provided");
        _close();
        return;
      }
      wizWalletMgr.approveSign(req.sequence, signedTx);
      _close();
    };
    document.getElementById("wiz-sign-reject").onclick = _reject;
    document.getElementById("wiz-sign-approve").onclick = _approve;
  }
  _generateWalletQR();
}
async function doImportBackup(file) {
  if (!file) return;
  const errEl = document.getElementById("auth-error") || document.getElementById("auth-unlock-error") || document.getElementById("auth-hw-error");
  try {
    const text = await file.text();
    const pass = prompt("Enter backup password:");
    if (pass === null) return;
    if (errEl) {
      errEl.style.color = "var(--dt-text-secondary,#64748b)";
      errEl.textContent = "Restoring backup...";
    }
    const { decryptVault } = await import("../core/auth.js");
    const payload = await decryptVault(text, pass);
    if (!payload || payload.format !== "0pw-backup") throw new Error("Invalid backup file format");
    if (payload.vault) localStorage.setItem("00wallet_vault", payload.vault);
    for (const [k, v] of Object.entries(payload.data || {})) {
      if (v !== null && v !== void 0) localStorage.setItem(k, v);
    }
    if (errEl) {
      errEl.style.color = "#0AC18E";
      errEl.textContent = "\u2713 Backup restored \u2014 reloading...";
    }
    setTimeout(() => window.location.reload(), 1e3);
  } catch (e) {
    if (errEl) {
      errEl.style.color = "#ef4444";
      errEl.textContent = "Restore failed: " + e.message;
    }
  }
}
async function doLedger() {
  const btn = document.getElementById("auth-ledger-btn");
  const errEl = document.getElementById("auth-hw-error");
  if (errEl) errEl.textContent = "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "\u{1F511} Connecting...";
  }
  try {
    const { connectLedger } = await import("../core/auth.js");
    const result = await connectLedger((msg) => {
      if (errEl) errEl.textContent = msg;
      if (btn) btn.textContent = "\u{1F511} " + msg;
    });
    try {
      const bs = await import("../services/balance-service.js");
      bs.start(auth.getKeys());
    } catch {
    }
    navigate("dashboard");
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message;
      errEl.style.color = "#ff4444";
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "\u{1F511} Ledger";
    }
  }
}
async function doTrezor() {
  const btn = document.getElementById("auth-trezor-btn");
  const errEl = document.getElementById("auth-hw-error");
  if (errEl) errEl.textContent = "";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "\u{1F6E1} Connecting...";
  }
  try {
    const { connectTrezor } = await import("../core/auth.js");
    await connectTrezor((msg) => {
      if (errEl) errEl.textContent = msg;
      if (btn) btn.textContent = "\u{1F6E1} " + msg;
    });
    try {
      const bs = await import("../services/balance-service.js");
      bs.start(auth.getKeys());
    } catch {
    }
    navigate("dashboard");
  } catch (e) {
    if (errEl) {
      errEl.textContent = e.message;
      errEl.style.color = "#ff4444";
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "\u{1F6E1} Trezor";
    }
  }
}
function _bindRestoreBtn() {
  const btn = document.getElementById("auth-restore-btn");
  const fileIn = document.getElementById("auth-restore-file");
  if (btn && fileIn) {
    btn.addEventListener("click", () => fileIn.click());
    fileIn.addEventListener("change", function() {
      if (this.files[0]) doImportBackup(this.files[0]);
      this.value = "";
    });
  }
}
function bindImportEvents() {
  document.getElementById("auth-import-btn")?.addEventListener("click", doImport);
  document.getElementById("auth-gen-btn")?.addEventListener("click", doGenerate);
  document.getElementById("auth-pass2")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doImport();
  });
  document.getElementById("auth-ledger-btn")?.addEventListener("click", doLedger);
  document.getElementById("auth-trezor-btn")?.addEventListener("click", doTrezor);
  document.getElementById("auth-wc-btn")?.addEventListener("click", doWalletConnect);
  document.getElementById("auth-wiz-btn")?.addEventListener("click", doWizardConnect);
  _bindRestoreBtn();
}
function bindUnlockEvents() {
  document.getElementById("auth-unlock-btn")?.addEventListener("click", doUnlock);
  document.getElementById("auth-unlock-pass")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doUnlock();
  });
  document.getElementById("auth-switch-import")?.addEventListener("click", switchToImport);
  document.getElementById("auth-wc-btn")?.addEventListener("click", doWalletConnect);
  document.getElementById("auth-wiz-btn")?.addEventListener("click", doWizardConnect);
  _bindRestoreBtn();
}
function mount(container) {
  _container = container;
  if (auth.isUnlocked()) {
    navigate("dashboard");
    return;
  }
  if (hasVault()) {
    container.innerHTML = UNLOCK_TEMPLATE;
    bindUnlockEvents();
    setTimeout(() => document.getElementById("auth-unlock-pass")?.focus(), 100);
  } else {
    container.innerHTML = IMPORT_TEMPLATE;
    bindImportEvents();
  }
}
function unmount() {
  if (_container) _container.innerHTML = "";
  _container = null;
}
export {
  icon,
  id,
  mount,
  title,
  unmount
};
