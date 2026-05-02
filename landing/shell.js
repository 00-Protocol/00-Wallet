(function() {
  "use strict";
  const IS_SPA = !!(document.getElementById("view-container-desktop") || window.location.pathname.endsWith("v2.html"));
  const SPA_ROUTES = {
    "index.html": "#/dashboard",
    "wallet.html": "#/wallet",
    "chat.html": "#/chat",
    "pay.html": "#/pay",
    "swap.html": "#/swap",
    "dex.html": "#/dex",
    "loan.html": "#/loan",
    "id.html": "#/id",
    "mesh.html": "#/mesh",
    "onion.html": "#/onion",
    "vault.html": "#/vault",
    "fusion.html": "#/fusion",
    "sub.html": "#/sub",
    "analyse.html": "#/analyse",
    "config.html": "#/config",
    "bet.html": "#/bet",
    "elon.html": "#/elon"
  };
  function resolveUrl(htmlUrl) {
    return IS_SPA ? SPA_ROUTES[htmlUrl] || htmlUrl : htmlUrl;
  }
  const APPS = [
    { name: "00 Dashboard", url: "index.html" },
    { name: "00 Wallet", url: "wallet.html" },
    { name: "00 Chat", url: "chat.html" },
    { name: "00 Pay", url: "pay.html" },
    { name: "00 DEX", url: "dex.html" },
    { name: "00 Loan", url: "loan.html" },
    { name: "00 ID", url: "id.html" },
    { name: "00 Mesh", url: "mesh.html" },
    { name: "00 Onion", url: "onion.html" },
    { name: "00 Swap", url: "swap.html" },
    { name: "00 Vault", url: "vault.html" },
    { name: "00 Fusion", url: "fusion.html" },
    { name: "00 Sub", url: "sub.html" },
    { name: "00 Analyse", url: "analyse.html" },
    { name: "00 Config", url: "config.html" },
    { name: "00 Bet", url: "bet.html" },
    { name: "00 Elon", url: "elon.html" }
  ];
  const APP_ICONS = {
    "index.html": "\u2302",
    "wallet.html": '<img src="icons/bch-wallet.png" style="width:18px;height:18px">',
    "chat.html": '<img src="icons/chat.png" style="width:18px;height:18px">',
    "pay.html": '<img src="icons/pay.png" style="width:18px;height:18px">',
    "swap.html": "\u21C4",
    "dex.html": '<img src="icons/dex.png" style="width:18px;height:18px">',
    "loan.html": '<img src="icons/loan.png" style="width:18px;height:18px">',
    "id.html": "\u25C9",
    "mesh.html": "\u2B21",
    "onion.html": '<img src="icons/onion.png" style="width:18px;height:18px">',
    "vault.html": '<img src="icons/vault.png" style="width:18px;height:18px">',
    "fusion.html": "\u2697",
    "sub.html": '<img src="icons/sub.png" style="width:18px;height:18px">',
    "analyse.html": "\u25CA",
    "config.html": "\u2699",
    "bet.html": "\u{1F3B2}",
    "elon.html": '<img src="https://pbs.twimg.com/profile_images/2035314704307081216/71U1ftM3_200x200.jpg" style="width:18px;height:18px;border-radius:50%;object-fit:cover">'
  };
  const APP_SECTIONS = {
    Overview: ["index.html"],
    Finance: ["wallet.html", "pay.html", "swap.html", "dex.html", "loan.html", "sub.html"],
    Privacy: ["chat.html", "onion.html", "vault.html", "fusion.html"],
    Trading: ["bet.html", "elon.html"],
    Analytics: ["analyse.html"],
    Identity: ["id.html", "mesh.html"]
  };
  const _desktopMQ = window.matchMedia("(min-width: 900px)");
  let IS_DESKTOP = _desktopMQ.matches;
  function getTheme() {
    return localStorage.getItem("00_theme") || "dark";
  }
  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("00_theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#0b0f17" : "#f5f6f8";
    const icon = document.getElementById("dt-theme-icon");
    const label = document.getElementById("dt-theme-label");
    if (icon) icon.textContent = theme === "dark" ? "\u2600" : "\u263E";
    if (label) label.textContent = theme === "dark" ? "\u2600" : "\u263E";
    if (IS_DESKTOP) {
      const r = document.documentElement.style;
      const accent = "#0AC18E";
      r.setProperty("--green", accent, "important");
      r.setProperty("--green-dim", accent, "important");
      r.setProperty("--green-dark", "rgba(10,193,142,.15)", "important");
      r.setProperty("--accent-rgb", "10,193,142", "important");
    }
  }
  setTheme(getTheme());
  const LANGS = ["EN", "FR", "ES", "CN"];
  const T = {
    EN: { disc: "DISCONNECT", apps: "APPS", confirm: "Clear all data and disconnect?", connect: "CONNECT" },
    FR: { disc: "DECONNECTER", apps: "APPS", confirm: "Effacer les donnees et deconnecter ?", connect: "CONNECTER" },
    ES: { disc: "DESCONECTAR", apps: "APPS", confirm: "Borrar datos y desconectar?", connect: "CONECTAR" },
    CN: { disc: "\u65AD\u5F00\u8FDE\u63A5", apps: "\u5E94\u7528", confirm: "\u6E05\u9664\u6570\u636E\u5E76\u65AD\u5F00\u8FDE\u63A5\uFF1F", connect: "\u8FDE\u63A5" }
  };
  function isConnected() {
    return !!(localStorage.getItem("00_wif") || localStorage.getItem("00_pub") || localStorage.getItem("00_ledger") || localStorage.getItem("00wallet_vault") || localStorage.getItem("00_wc_session") || localStorage.getItem("00_session_auth"));
  }
  const EP_DEFAULTS = {
    fulcrum: ["wss://bch.imaginary.cash:50004", "wss://electrum.imaginary.cash:50004", "wss://bch.loping.net:50004", "wss://bch.soul-dev.com:50004", "wss://electron.jochen-hoenicke.de:51004", "wss://electrumx-bch.cryptonermal.net:50004", "wss://cashnode.bch.ninja:50004", "wss://electroncash.dk:50004"],
    btc_electrum: ["wss://e2.keff.org:50004", "wss://fulcrum.grey.pw:50004", "wss://btc.electroncash.dk:50004", "wss://electrum.petrkr.net:50004", "wss://bitcoinserver.nl:50004", "wss://mempool.8333.mobi:50004"],
    relays: ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net", "wss://relay.snort.social"],
    eth_rpc: "https://ethereum-rpc.publicnode.com",
    bnb_rpc: "https://bsc-rpc.publicnode.com",
    avax_rpc: "/avax-rpc/",
    sol_rpc: "/sol-rpc/",
    trx_rpc: "https://api.trongrid.io",
    xlm_rpc: "https://horizon.stellar.org",
    xrp_rpc: "wss://xrplcluster.com",
    ltc_rpc: "https://litecoinspace.org/api",
    indexer: "https://0penw0rld.com",
    relay: "https://relay.0penw0rld.com",
    midgard: "https://midgard.ninerealms.com/v2",
    meta: "https://meta.riften.net"
  };
  function _epRead(key, fallback) {
    try {
      const v = localStorage.getItem("00_ep_" + key);
      if (!v) return fallback;
      const parsed = JSON.parse(v);
      if (Array.isArray(fallback)) return Array.isArray(parsed) && parsed.length ? parsed : fallback;
      return typeof parsed === "string" && parsed ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }
  window._00ep = {
    get fulcrum() {
      return _epRead("fulcrum", EP_DEFAULTS.fulcrum);
    },
    get btc_electrum() {
      return _epRead("btc_electrum", EP_DEFAULTS.btc_electrum);
    },
    get relays() {
      return _epRead("relays", EP_DEFAULTS.relays);
    },
    get eth_rpc() {
      return _epRead("eth_rpc", EP_DEFAULTS.eth_rpc);
    },
    get bnb_rpc() {
      return _epRead("bnb_rpc", EP_DEFAULTS.bnb_rpc);
    },
    get avax_rpc() {
      return _epRead("avax_rpc", EP_DEFAULTS.avax_rpc);
    },
    get sol_rpc() {
      return _epRead("sol_rpc", EP_DEFAULTS.sol_rpc);
    },
    get trx_rpc() {
      return _epRead("trx_rpc", EP_DEFAULTS.trx_rpc);
    },
    get xlm_rpc() {
      return _epRead("xlm_rpc", EP_DEFAULTS.xlm_rpc);
    },
    get xrp_rpc() {
      return _epRead("xrp_rpc", EP_DEFAULTS.xrp_rpc);
    },
    get ltc_rpc() {
      return _epRead("ltc_rpc", EP_DEFAULTS.ltc_rpc);
    },
    get indexer() {
      return _epRead("indexer", EP_DEFAULTS.indexer);
    },
    get relay() {
      return _epRead("relay", EP_DEFAULTS.relay);
    },
    get midgard() {
      return _epRead("midgard", EP_DEFAULTS.midgard);
    },
    get meta() {
      return _epRead("meta", EP_DEFAULTS.meta);
    },
    defaults: EP_DEFAULTS
  };
  let _lang = localStorage.getItem("00_lang") || "EN";
  function t(k) {
    return (T[_lang] || T.EN)[k] || k;
  }
  function setLang(lang) {
    _lang = lang;
    localStorage.setItem("00_lang", lang);
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll(".shell-lang-cur").forEach((el) => {
      el.textContent = lang;
    });
    document.querySelectorAll(".shell-lang-opt").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.lang === lang);
    });
    if (typeof window._onLangChange === "function") window._onLangChange(lang);
  }
  function disconnect() {
    let ov = document.getElementById("disc-confirm-overlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "disc-confirm-overlay";
      ov.className = "disc-overlay";
      ov.onclick = (e) => {
        if (e.target === ov) ov.classList.remove("open");
      };
      ov.innerHTML = `
      <div class="disc-modal">
        <div class="disc-icon">\u26A0</div>
        <div class="disc-title">${t("disc")}</div>
        <div class="disc-msg">${t("confirm")}</div>
        <div class="disc-actions">
          <button class="disc-cancel" id="disc-cancel">${_lang === "FR" ? "Annuler" : _lang === "ES" ? "Cancelar" : _lang === "CN" ? "\u53D6\u6D88" : "Cancel"}</button>
          <button class="disc-confirm" id="disc-ok">${_lang === "FR" ? "Confirmer" : _lang === "ES" ? "Confirmar" : _lang === "CN" ? "\u786E\u8BA4" : "Confirm"}</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      ov.querySelector("#disc-cancel").onclick = () => ov.classList.remove("open");
      ov.querySelector("#disc-ok").onclick = async () => {
        localStorage.clear();
        sessionStorage.clear();
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        try {
          if (window._ledgerDevice) await window._ledgerDevice.close();
        } catch (e) {
        }
        try {
          if (window.wcDisconnect) await window.wcDisconnect();
        } catch (e) {
        }
        if (IS_SPA) {
          window.location.hash = "#/auth";
          window.location.reload();
        } else {
          window.location.replace(resolveUrl("index.html"));
        }
      };
    }
    ov.classList.add("open");
  }
  window._shellSetLang = setLang;
  window._shellDisconnect = disconnect;
  function _refreshConnectBtn(btn) {
    btn = btn || document.getElementById("sidebar-connect-btn");
    if (!btn) return;
    if (isConnected()) {
      btn.className = "sidebar-bottom-item danger";
      btn.innerHTML = '<span class="sidebar-bottom-icon">\u23FB</span><span class="sidebar-label">' + t("disc") + "</span>";
      btn.onclick = disconnect;
    } else {
      btn.className = "sidebar-bottom-item";
      btn.innerHTML = '<span class="sidebar-bottom-icon">\u23FB</span><span class="sidebar-label">' + t("connect") + "</span>";
      btn.onclick = () => {
        window.location.hash = "#/auth";
      };
    }
  }
  window._shellRefreshAuth = () => _refreshConnectBtn();
  const st = document.createElement("style");
  st.textContent = `
  .shell-controls {
    display: flex; align-items: center; gap: 6px;
    font-family: 'Share Tech Mono', monospace;
  }
  .shell-drop { position: relative; }
  .shell-btn {
    background: transparent; border: 1px solid rgba(0,255,65,.18);
    color: rgba(0,255,65,.45); padding: 3px 8px;
    font-family: 'Share Tech Mono', monospace; font-size: 10px;
    letter-spacing: 1px; cursor: pointer; transition: .15s; white-space: nowrap;
    line-height: 1.4;
  }
  .shell-btn:hover { border-color: rgba(0,255,65,.5); color: #00ff41; }
  .shell-menu {
    display: none; position: absolute; top: calc(100% + 5px); right: 0;
    background: rgba(2,10,3,.97); border: 1px solid rgba(0,255,65,.2);
    box-shadow: 0 8px 28px rgba(0,0,0,.85); z-index: 9999; min-width: 148px;
  }
  .shell-menu.open { display: block; }
  .shell-menu a, .shell-menu-item {
    display: block; padding: 8px 14px; font-size: 11px; letter-spacing: 1px;
    color: rgba(0,255,65,.5); text-decoration: none; cursor: pointer;
    border-bottom: 1px solid rgba(0,255,65,.05); transition: .1s;
    font-family: 'Share Tech Mono', monospace;
  }
  .shell-menu a:last-child, .shell-menu-item:last-child { border-bottom: none; }
  .shell-menu a:hover, .shell-menu-item:hover { background: rgba(0,255,65,.05); color: #00ff41; }
  .shell-menu a.cur { color: #00ff41; border-left: 2px solid #00ff41; padding-left: 12px; }
  .shell-menu-item.active { color: #00ff41; }
  .shell-disc {
    background: transparent; border: 1px solid rgba(255,50,50,.22);
    color: rgba(255,80,80,.4); padding: 3px 8px;
    font-family: 'Share Tech Mono', monospace; font-size: 10px;
    letter-spacing: 1px; cursor: pointer; transition: .15s; white-space: nowrap;
    line-height: 1.4;
  }
  .shell-disc:hover {
    border-color: rgba(255,60,60,.6); color: rgba(255,110,110,.95);
    box-shadow: 0 0 8px rgba(255,40,40,.12);
  }
  /* \xE2\u201D\u20AC\xE2\u201D\u20AC Settings modal \xE2\u201D\u20AC\xE2\u201D\u20AC */
  .ep-overlay {
    display:none; position:fixed; inset:0; z-index:10000;
    background:rgba(0,0,0,.85); backdrop-filter:blur(6px);
    align-items:center; justify-content:center;
    font-family:'Share Tech Mono',monospace;
  }
  .ep-overlay.open { display:flex; }
  .ep-modal {
    background:#060e06; border:1px solid rgba(0,255,65,.2);
    box-shadow:0 0 40px rgba(0,255,65,.08); padding:24px 28px;
    max-width:480px; width:92vw; max-height:85vh; overflow-y:auto;
  }
  .ep-title {
    font-size:13px; letter-spacing:2px; color:#00ff41;
    margin-bottom:18px; text-transform:uppercase;
  }
  .ep-group { margin-bottom:14px; }
  .ep-label {
    font-size:9px; letter-spacing:1.5px; color:rgba(0,255,65,.4);
    margin-bottom:4px; text-transform:uppercase;
  }
  .ep-input, .ep-textarea {
    width:100%; background:rgba(0,255,65,.03);
    border:1px solid rgba(0,255,65,.12); color:#00ff41;
    font-family:'Share Tech Mono',monospace; font-size:11px;
    padding:6px 8px; outline:none; transition:.15s;
  }
  .ep-input:focus, .ep-textarea:focus { border-color:rgba(0,255,65,.4); }
  .ep-textarea { resize:vertical; min-height:60px; line-height:1.5; }
  .ep-hint {
    font-size:8px; color:rgba(0,255,65,.25); margin-top:2px;
    letter-spacing:.5px;
  }
  .ep-actions {
    display:flex; gap:8px; margin-top:18px; justify-content:flex-end;
  }
  .ep-save {
    background:rgba(0,255,65,.1); border:1px solid rgba(0,255,65,.3);
    color:#00ff41; padding:6px 16px; font-family:'Share Tech Mono',monospace;
    font-size:10px; letter-spacing:1px; cursor:pointer; transition:.15s;
  }
  .ep-save:hover { background:rgba(0,255,65,.2); }
  .ep-reset {
    background:transparent; border:1px solid rgba(255,80,80,.2);
    color:rgba(255,80,80,.5); padding:6px 16px; font-family:'Share Tech Mono',monospace;
    font-size:10px; letter-spacing:1px; cursor:pointer; transition:.15s;
  }
  .ep-reset:hover { border-color:rgba(255,80,80,.5); color:rgba(255,110,110,.9); }
  .ep-close {
    background:transparent; border:1px solid rgba(0,255,65,.15);
    color:rgba(0,255,65,.35); padding:6px 16px; font-family:'Share Tech Mono',monospace;
    font-size:10px; letter-spacing:1px; cursor:pointer; transition:.15s;
  }
  .ep-close:hover { border-color:rgba(0,255,65,.4); color:#00ff41; }
  /* \xE2\u201D\u20AC\xE2\u201D\u20AC Disconnect confirm modal \xE2\u201D\u20AC\xE2\u201D\u20AC */
  .disc-overlay {
    display:none; position:fixed; inset:0; z-index:10001;
    background:var(--dt-overlay, rgba(0,0,0,.85)); backdrop-filter:blur(8px);
    -webkit-backdrop-filter:blur(8px);
    align-items:center; justify-content:center;
  }
  .disc-overlay.open { display:flex; }
  .disc-modal {
    background:var(--dt-surface, #0c0d12); border:1px solid var(--dt-border, rgba(255,255,255,.08));
    border-radius:20px; box-shadow:var(--dt-shadow-lg, 0 0 40px rgba(0,0,0,.4));
    padding:32px; max-width:360px; width:88vw; text-align:center;
  }
  .disc-icon { font-size:36px; margin-bottom:12px; }
  .disc-title {
    font-family:'Inter',sans-serif; font-size:18px; font-weight:700;
    color:var(--dt-text, #e8e8e8); margin-bottom:8px;
  }
  .disc-msg {
    font-family:'Inter',sans-serif; font-size:14px;
    color:var(--dt-text-secondary, rgba(255,255,255,.5)); margin-bottom:24px; line-height:1.5;
  }
  .disc-actions { display:flex; gap:10px; }
  .disc-cancel {
    flex:1; padding:12px; border-radius:12px; border:1px solid var(--dt-border, rgba(255,255,255,.1));
    background:transparent; color:var(--dt-text-secondary, rgba(255,255,255,.5));
    font-family:'Inter',sans-serif; font-size:14px; font-weight:600; cursor:pointer; transition:.15s;
  }
  .disc-cancel:hover { background:var(--dt-accent-soft, rgba(255,255,255,.04)); }
  .disc-confirm {
    flex:1; padding:12px; border-radius:12px; border:none;
    background:#ef4444; color:#fff;
    font-family:'Inter',sans-serif; font-size:14px; font-weight:600; cursor:pointer; transition:.15s;
  }
  .disc-confirm:hover { background:#dc2626; }
  .ep-note {
    font-size:8px; color:rgba(0,255,65,.2); margin-top:12px;
    letter-spacing:.5px; text-align:center;
  }
  /* \xE2\u201D\u20AC\xE2\u201D\u20AC iOS Home Indicator pill \xE2\u201D\u20AC\xE2\u201D\u20AC */
  .home-indicator {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 0 10px;
    text-decoration: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .home-pill {
    width: 134px;
    height: 5px;
    border-radius: 3px;
    background: rgba(0,255,65,.35);
    transition: background .15s, box-shadow .15s;
  }
  .home-indicator:hover .home-pill {
    background: rgba(0,255,65,.6);
    box-shadow: 0 0 8px rgba(0,255,65,.2);
  }
  .home-indicator:active .home-pill {
    background: var(--green, #00ff41);
    box-shadow: 0 0 12px rgba(0,255,65,.35);
  }
`;
  document.head.appendChild(st);
  function buildSettingsModal() {
    const overlay = document.createElement("div");
    overlay.className = "ep-overlay";
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    };
    const fulcrumVal = () => (JSON.parse(localStorage.getItem("00_ep_fulcrum") || "null") || EP_DEFAULTS.fulcrum).join("\n");
    const btcElecVal = () => (JSON.parse(localStorage.getItem("00_ep_btc_electrum") || "null") || EP_DEFAULTS.btc_electrum).join("\n");
    const relaysVal = () => (JSON.parse(localStorage.getItem("00_ep_relays") || "null") || EP_DEFAULTS.relays).join("\n");
    const indexerVal = () => localStorage.getItem("00_ep_indexer") ? JSON.parse(localStorage.getItem("00_ep_indexer")) : EP_DEFAULTS.indexer;
    const midgardVal = () => localStorage.getItem("00_ep_midgard") ? JSON.parse(localStorage.getItem("00_ep_midgard")) : EP_DEFAULTS.midgard;
    const metaVal = () => localStorage.getItem("00_ep_meta") ? JSON.parse(localStorage.getItem("00_ep_meta")) : EP_DEFAULTS.meta;
    const ethRpcVal = () => localStorage.getItem("00_ep_eth_rpc") ? JSON.parse(localStorage.getItem("00_ep_eth_rpc")) : EP_DEFAULTS.eth_rpc;
    const rpcVal = (k) => localStorage.getItem("00_ep_" + k) ? JSON.parse(localStorage.getItem("00_ep_" + k)) : EP_DEFAULTS[k];
    overlay.innerHTML = `
    <div class="ep-modal">
      <div class="ep-title">// ENDPOINTS</div>

      <div class="ep-group">
        <div class="ep-label">BCH FULCRUM NODES</div>
        <textarea class="ep-textarea" id="ep-fulcrum" rows="3">${fulcrumVal()}</textarea>
        <div class="ep-hint">one wss:// URL per line</div>
      </div>

      <div class="ep-group">
        <div class="ep-label">BTC ELECTRUM NODES</div>
        <textarea class="ep-textarea" id="ep-btc-electrum" rows="3">${btcElecVal()}</textarea>
        <div class="ep-hint">one wss:// URL per line (port 50004)</div>
      </div>

      <div class="ep-group">
        <div class="ep-label">ETH RPC ENDPOINT</div>
        <input class="ep-input" id="ep-eth-rpc" value="${ethRpcVal()}">
        <div class="ep-hint">Ethereum JSON-RPC URL</div>
      </div>

      <div class="ep-group">
        <div class="ep-label">BNB RPC ENDPOINT</div>
        <input class="ep-input" id="ep-bnb-rpc" value="${rpcVal("bnb_rpc")}">
      </div>
      <div class="ep-group">
        <div class="ep-label">AVAX RPC ENDPOINT</div>
        <input class="ep-input" id="ep-avax-rpc" value="${rpcVal("avax_rpc")}">
      </div>
      <div class="ep-group">
        <div class="ep-label">SOL RPC ENDPOINT</div>
        <input class="ep-input" id="ep-sol-rpc" value="${rpcVal("sol_rpc")}">
      </div>
      <div class="ep-group">
        <div class="ep-label">TRX API ENDPOINT</div>
        <input class="ep-input" id="ep-trx-rpc" value="${rpcVal("trx_rpc")}">
      </div>
      <div class="ep-group">
        <div class="ep-label">XRP WSS ENDPOINT</div>
        <input class="ep-input" id="ep-xrp-rpc" value="${rpcVal("xrp_rpc")}">
      </div>
      <div class="ep-group">
        <div class="ep-label">XLM HORIZON ENDPOINT</div>
        <input class="ep-input" id="ep-xlm-rpc" value="${rpcVal("xlm_rpc")}">
      </div>
      <div class="ep-group">
        <div class="ep-label">LTC API ENDPOINT</div>
        <input class="ep-input" id="ep-ltc-rpc" value="${rpcVal("ltc_electrum")}">
      </div>

      <div class="ep-group">
        <div class="ep-label">NOSTR RELAYS</div>
        <textarea class="ep-textarea" id="ep-relays" rows="4">${relaysVal()}</textarea>
        <div class="ep-hint">one wss:// URL per line</div>
      </div>

      <div class="ep-group">
        <div class="ep-label">CAULDRON INDEXER</div>
        <input class="ep-input" id="ep-indexer" value="${indexerVal()}">
      </div>

      <div class="ep-group">
        <div class="ep-label">THORCHAIN MIDGARD</div>
        <input class="ep-input" id="ep-midgard" value="${midgardVal()}">
      </div>

      <div class="ep-group">
        <div class="ep-label">META / ICON SERVICE</div>
        <input class="ep-input" id="ep-meta" value="${metaVal()}">
      </div>

      ${localStorage.getItem("00wallet_vault") ? `
      <div class="ep-group" style="border-top:1px solid rgba(0,255,65,.1);padding-top:14px;margin-top:8px">
        <div class="ep-label">BACKUP</div>
        <div style="display:flex;gap:8px">
          <button class="ep-save" id="ep-btn-export" style="flex:1" type="button">EXPORT BACKUP</button>
          <button class="ep-close" id="ep-btn-import" style="flex:1" type="button">IMPORT BACKUP</button>
        </div>
        <div class="ep-hint">Encrypted .0pw file with all wallet data</div>
        <input type="file" id="ep-backup-file" accept=".0pw" style="display:none">
      </div>
      <div class="ep-group">
        <button class="ep-save" id="ep-btn-keys" style="width:100%" type="button">EXPORT PRIVATE KEYS</button>
      </div>
      ` : ""}

      <div class="ep-actions">
        <button class="ep-reset" id="ep-btn-reset">RESET</button>
        <button class="ep-close" id="ep-btn-close">CANCEL</button>
        <button class="ep-save" id="ep-btn-save">SAVE</button>
      </div>
      <div class="ep-note">changes apply on page reload</div>
    </div>`;
    overlay.querySelector("#ep-btn-close").onclick = () => overlay.classList.remove("open");
    const expBtn = overlay.querySelector("#ep-btn-export");
    if (expBtn) {
      expBtn.onclick = () => {
        if (window.exportBackup) window.exportBackup();
        else window.location.href = "wallet.html?action=exportBackup";
      };
      const impBtn = overlay.querySelector("#ep-btn-import");
      const fileIn = overlay.querySelector("#ep-backup-file");
      impBtn.onclick = () => {
        if (window.importBackup) fileIn.click();
        else window.location.href = "wallet.html?action=importBackup";
      };
      fileIn.onchange = () => {
        if (fileIn.files?.[0] && window.importBackup) window.importBackup(fileIn.files[0]);
        fileIn.value = "";
      };
      const keysBtn = overlay.querySelector("#ep-btn-keys");
      if (keysBtn) keysBtn.onclick = () => {
        overlay.classList.remove("open");
        if (window.openExportKeys) window.openExportKeys();
        else window.location.href = "wallet.html?action=exportKeys";
      };
    }
    overlay.querySelector("#ep-btn-save").onclick = () => {
      const lines = (s) => s.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("wss://"));
      const fulcrum = lines(overlay.querySelector("#ep-fulcrum").value);
      const btcElectrum = lines(overlay.querySelector("#ep-btc-electrum").value);
      const relays = lines(overlay.querySelector("#ep-relays").value);
      const ethRpc = overlay.querySelector("#ep-eth-rpc").value.trim();
      const indexer = overlay.querySelector("#ep-indexer").value.trim();
      const midgard = overlay.querySelector("#ep-midgard").value.trim();
      const meta = overlay.querySelector("#ep-meta").value.trim();
      if (fulcrum.length) localStorage.setItem("00_ep_fulcrum", JSON.stringify(fulcrum));
      else localStorage.removeItem("00_ep_fulcrum");
      if (btcElectrum.length) localStorage.setItem("00_ep_btc_electrum", JSON.stringify(btcElectrum));
      else localStorage.removeItem("00_ep_btc_electrum");
      if (window._wsUpdateServers) {
        if (fulcrum.length) window._wsUpdateServers("bch", fulcrum);
        if (btcElectrum.length) window._wsUpdateServers("btc", btcElectrum);
      }
      if (relays.length) localStorage.setItem("00_ep_relays", JSON.stringify(relays));
      else localStorage.removeItem("00_ep_relays");
      if (ethRpc) localStorage.setItem("00_ep_eth_rpc", JSON.stringify(ethRpc));
      else localStorage.removeItem("00_ep_eth_rpc");
      ["bnb_rpc", "avax_rpc", "sol_rpc", "trx_rpc", "xrp_rpc", "xlm_rpc", "ltc_rpc"].forEach((k) => {
        const el = overlay.querySelector("#ep-" + k.replace("_", "-"));
        if (el) {
          const v = el.value.trim();
          if (v) localStorage.setItem("00_ep_" + k, JSON.stringify(v));
          else localStorage.removeItem("00_ep_" + k);
        }
      });
      if (indexer) localStorage.setItem("00_ep_indexer", JSON.stringify(indexer));
      else localStorage.removeItem("00_ep_indexer");
      if (midgard) localStorage.setItem("00_ep_midgard", JSON.stringify(midgard));
      else localStorage.removeItem("00_ep_midgard");
      if (meta) localStorage.setItem("00_ep_meta", JSON.stringify(meta));
      else localStorage.removeItem("00_ep_meta");
      overlay.classList.remove("open");
    };
    overlay.querySelector("#ep-btn-reset").onclick = () => {
      ["fulcrum", "btc_electrum", "relays", "eth_rpc", "bnb_rpc", "avax_rpc", "sol_rpc", "trx_rpc", "xrp_rpc", "xlm_rpc", "ltc_rpc", "indexer", "midgard", "meta"].forEach((k) => localStorage.removeItem("00_ep_" + k));
      overlay.querySelector("#ep-fulcrum").value = EP_DEFAULTS.fulcrum.join("\n");
      overlay.querySelector("#ep-btc-electrum").value = EP_DEFAULTS.btc_electrum.join("\n");
      overlay.querySelector("#ep-relays").value = EP_DEFAULTS.relays.join("\n");
      overlay.querySelector("#ep-eth-rpc").value = EP_DEFAULTS.eth_rpc;
      overlay.querySelector("#ep-indexer").value = EP_DEFAULTS.indexer;
      overlay.querySelector("#ep-midgard").value = EP_DEFAULTS.midgard;
      overlay.querySelector("#ep-meta").value = EP_DEFAULTS.meta;
      ["bnb_rpc", "avax_rpc", "sol_rpc", "trx_rpc", "xrp_rpc", "xlm_rpc", "ltc_rpc"].forEach((k) => {
        const el = overlay.querySelector("#ep-" + k.replace("_", "-"));
        if (el) el.value = EP_DEFAULTS[k];
      });
    };
    document.body.appendChild(overlay);
    return overlay;
  }
  let _settingsOverlay = null;
  function openSettings() {
    if (!_settingsOverlay) _settingsOverlay = buildSettingsModal();
    const ov = _settingsOverlay;
    ov.querySelector("#ep-fulcrum").value = (JSON.parse(localStorage.getItem("00_ep_fulcrum") || "null") || EP_DEFAULTS.fulcrum).join("\n");
    ov.querySelector("#ep-btc-electrum").value = (JSON.parse(localStorage.getItem("00_ep_btc_electrum") || "null") || EP_DEFAULTS.btc_electrum).join("\n");
    ov.querySelector("#ep-relays").value = (JSON.parse(localStorage.getItem("00_ep_relays") || "null") || EP_DEFAULTS.relays).join("\n");
    ov.querySelector("#ep-eth-rpc").value = localStorage.getItem("00_ep_eth_rpc") ? JSON.parse(localStorage.getItem("00_ep_eth_rpc")) : EP_DEFAULTS.eth_rpc;
    ov.querySelector("#ep-indexer").value = localStorage.getItem("00_ep_indexer") ? JSON.parse(localStorage.getItem("00_ep_indexer")) : EP_DEFAULTS.indexer;
    ov.querySelector("#ep-midgard").value = localStorage.getItem("00_ep_midgard") ? JSON.parse(localStorage.getItem("00_ep_midgard")) : EP_DEFAULTS.midgard;
    ov.querySelector("#ep-meta").value = localStorage.getItem("00_ep_meta") ? JSON.parse(localStorage.getItem("00_ep_meta")) : EP_DEFAULTS.meta;
    ov.classList.add("open");
  }
  const NET_CHAINS = [
    { id: "bch", name: "BCH", proto: "Fulcrum WSS", color: "#0AC18E", ws: true },
    { id: "btc", name: "BTC", proto: "Electrum WSS", color: "#f7931a", ws: true },
    { id: "eth", name: "ETH", proto: "JSON-RPC", color: "#627eea", ws: false, rpcKey: "eth_rpc" },
    { id: "xmr", name: "XMR", proto: "Daemon RPC", color: "#ff6600", ws: false },
    { id: "ltc", name: "LTC", proto: "REST API", color: "#BFBBBB", ws: false, rpcKey: "ltc_rpc" },
    { id: "bnb", name: "BNB", proto: "JSON-RPC", color: "#F0B90B", ws: false, rpcKey: "bnb_rpc" },
    { id: "avax", name: "AVAX", proto: "JSON-RPC", color: "#E84142", ws: false, rpcKey: "avax_rpc" },
    { id: "sol", name: "SOL", proto: "JSON-RPC", color: "#9945FF", ws: false, rpcKey: "sol_rpc" },
    { id: "trx", name: "TRX", proto: "REST API", color: "#FF0013", ws: false, rpcKey: "trx_rpc" },
    { id: "xrp", name: "XRP", proto: "WSS", color: "#0085C0", ws: false, rpcKey: "xrp_rpc" },
    { id: "xlm", name: "XLM", proto: "Horizon REST", color: "#14B6E7", ws: false, rpcKey: "xlm_rpc" }
  ];
  function _netServer(chain) {
    if (chain.ws && window._wsStatus) {
      const s = window._wsStatus(chain.id);
      if (typeof s !== "string" && s.connected && s.server) {
        try {
          return { on: true, server: new URL(s.server).hostname };
        } catch {
        }
        return { on: true, server: s.server };
      }
      return { on: false, server: "\u2014" };
    }
    if (chain.rpcKey) {
      const v = _epRead(chain.rpcKey, EP_DEFAULTS[chain.rpcKey]);
      try {
        return { on: true, server: new URL(v.replace("wss://", "https://")).hostname };
      } catch {
      }
      return { on: !!v, server: v || "\u2014" };
    }
    if (chain.id === "xmr") {
      const nodes = ["node.moneroworld.com", "xmr-node.cakewallet.com", "nodes.hashvault.pro"];
      return { on: false, server: nodes[0] };
    }
    return { on: false, server: "\u2014" };
  }
  function buildNetworksModal() {
    const overlay = document.createElement("div");
    overlay.className = "net-overlay";
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    };
    const modal = document.createElement("div");
    modal.className = "net-modal";
    const title = document.createElement("div");
    title.className = "net-title";
    title.textContent = "Networks";
    modal.appendChild(title);
    const grid = document.createElement("div");
    grid.className = "net-grid";
    for (const ch of NET_CHAINS) {
      const card = document.createElement("div");
      card.className = "net-card";
      card.dataset.chain = ch.id;
      card.id = "net-card-" + ch.id;
      card.innerHTML = '<div class="net-card-head"><div class="net-card-dot"></div><span class="net-card-name">' + ch.name + '</span><span class="net-card-proto">' + ch.proto + '</span></div><div class="net-card-server" id="net-srv-' + ch.id + '">\u2014</div><div class="net-card-status" id="net-st-' + ch.id + '">\u2014</div>';
      grid.appendChild(card);
    }
    modal.appendChild(grid);
    const closeBtn = document.createElement("button");
    closeBtn.className = "net-close";
    closeBtn.textContent = "Close";
    closeBtn.onclick = () => overlay.classList.remove("open");
    modal.appendChild(closeBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    return overlay;
  }
  let _networksOverlay = null;
  function openNetworks() {
    if (!_networksOverlay) _networksOverlay = buildNetworksModal();
    for (const ch of NET_CHAINS) {
      const info = _netServer(ch);
      const card = document.getElementById("net-card-" + ch.id);
      const srv = document.getElementById("net-srv-" + ch.id);
      const st2 = document.getElementById("net-st-" + ch.id);
      if (card) card.classList.toggle("on", info.on);
      if (srv) srv.textContent = info.server;
      if (st2) {
        st2.textContent = info.on ? "CONNECTED" : ch.ws ? "DISCONNECTED" : "CONFIGURED";
        st2.className = "net-card-status " + (info.on ? "on" : ch.ws ? "off" : "");
      }
    }
    _networksOverlay.classList.add("open");
  }
  function _injectMobileNav() {
    if (document.getElementById("mob-nav")) return;
    const TABS = [
      { icon: "\u2302", label: "Home", hash: "#/dashboard" },
      { icon: "\u{1F4B3}", label: "Wallet", hash: "#/wallet" },
      { icon: "\u2697", label: "Fusion", hash: "#/fusion" },
      { icon: "\u21C4", label: "Swap", hash: "#/swap" },
      { icon: "\xB7\xB7\xB7", label: "More", hash: null }
    ];
    const DRAWER_ITEMS = [
      { icon: "\u{1F4AC}", label: "Chat", hash: "#/chat" },
      { icon: "\u{1F9C5}", label: "Onion", hash: "#/onion" },
      { icon: "\u{1F4CA}", label: "DEX", hash: "#/dex" },
      { icon: "\u{1F4B8}", label: "Pay", hash: "#/pay" },
      { icon: "\u{1F3E6}", label: "Loan", hash: "#/loan" },
      { icon: "\u{1F510}", label: "Vault", hash: "#/vault" },
      { icon: "\u{1F3B2}", label: "Bet", hash: "#/bet" },
      { icon: "\u25C9", label: "ID", hash: "#/id" },
      { icon: "\u2B21", label: "Mesh", hash: "#/mesh" },
      { icon: "\u{1F4CB}", label: "Sub", hash: "#/sub" },
      { icon: "\u2699", label: "Settings", hash: "#/config" },
      { icon: "\u{1F511}", label: "Auth", hash: "#/auth" }
    ];
    const bg = document.createElement("div");
    bg.id = "mob-drawer-bg";
    const drawer = document.createElement("div");
    drawer.id = "mob-drawer";
    const drawerGrid = document.createElement("div");
    drawerGrid.className = "mob-drawer-grid";
    const drawerTitle = document.createElement("div");
    drawerTitle.className = "mob-drawer-title";
    drawerTitle.textContent = "More";
    drawer.appendChild(drawerTitle);
    for (const item of DRAWER_ITEMS) {
      const a = document.createElement("a");
      a.className = "mob-drawer-item";
      a.href = item.hash;
      a.innerHTML = `<span class="mob-drawer-item-icon">${item.icon}</span><span>${item.label}</span>`;
      a.addEventListener("click", () => {
        drawer.classList.remove("open");
        bg.classList.remove("open");
      });
      drawerGrid.appendChild(a);
    }
    drawer.appendChild(drawerGrid);
    const nav = document.createElement("nav");
    nav.id = "mob-nav";
    for (const tab of TABS) {
      const el = tab.hash ? document.createElement("a") : document.createElement("button");
      el.className = "mob-tab";
      if (tab.hash) el.href = tab.hash;
      el.innerHTML = `<span class="mob-tab-icon">${tab.icon}</span><span>${tab.label}</span>`;
      if (!tab.hash) {
        el.addEventListener("click", () => {
          const isOpen = drawer.classList.contains("open");
          drawer.classList.toggle("open", !isOpen);
          bg.classList.toggle("open", !isOpen);
        });
      }
      nav.appendChild(el);
    }
    bg.addEventListener("click", () => {
      drawer.classList.remove("open");
      bg.classList.remove("open");
    });
    document.body.appendChild(bg);
    document.body.appendChild(drawer);
    document.body.appendChild(nav);
    function _syncActive() {
      const hash = window.location.hash;
      document.querySelectorAll("#mob-nav .mob-tab").forEach((t2) => {
        t2.classList.toggle("active", !!t2.getAttribute("href") && t2.getAttribute("href") === hash);
      });
      drawer.classList.remove("open");
      bg.classList.remove("open");
    }
    window.addEventListener("hashchange", _syncActive);
    _syncActive();
  }
  function buildControls(showApps) {
    const cur = window.location.pathname.split("/").pop() || "index.html";
    const wrap = document.createElement("div");
    wrap.className = "shell-controls";
    if (showApps) {
      const home = document.createElement("a");
      home.href = "/";
      home.className = "shell-btn";
      home.textContent = "\u2302";
      home.title = "Home";
      home.style.cssText = "font-size:14px;text-decoration:none;display:flex;align-items:center;padding:2px 6px";
      wrap.appendChild(home);
      const appsHtml = APPS.map(
        (a) => `<a href="${a.url}"${a.url === cur ? ' class="cur"' : ""}>${a.name}</a>`
      ).join("");
      const d = document.createElement("div");
      d.className = "shell-drop";
      d.innerHTML = `
      <button class="shell-btn" data-i18n="apps">${t("apps")} \xE2\u2013\xBE</button>
      <div class="shell-menu">${appsHtml}</div>`;
      d.querySelector(".shell-btn").onclick = (e) => {
        e.stopPropagation();
        d.querySelector(".shell-menu").classList.toggle("open");
      };
      wrap.appendChild(d);
    }
    const langD = document.createElement("div");
    langD.className = "shell-drop";
    langD.innerHTML = `
    <button class="shell-btn"><span class="shell-lang-cur">${_lang}</span> \xE2\u2013\xBE</button>
    <div class="shell-menu">
      ${LANGS.map(
      (l) => `<div class="shell-menu-item shell-lang-opt${l === _lang ? " active" : ""}" data-lang="${l}">${l}</div>`
    ).join("")}
    </div>`;
    langD.querySelector(".shell-btn").onclick = (e) => {
      e.stopPropagation();
      langD.querySelector(".shell-menu").classList.toggle("open");
    };
    langD.querySelectorAll(".shell-lang-opt").forEach((opt) => {
      opt.onclick = (e) => {
        e.stopPropagation();
        setLang(opt.dataset.lang);
        langD.querySelector(".shell-menu").classList.remove("open");
      };
    });
    wrap.appendChild(langD);
    const gear = document.createElement("button");
    gear.className = "shell-btn";
    gear.textContent = "\u2699";
    gear.title = "Endpoints";
    gear.onclick = (e) => {
      e.stopPropagation();
      openSettings();
    };
    wrap.appendChild(gear);
    const disc = document.createElement("button");
    if (isConnected()) {
      disc.className = "shell-disc";
      disc.dataset.i18n = "disc";
      disc.textContent = t("disc");
      disc.onclick = disconnect;
    } else {
      disc.className = "shell-btn";
      disc.dataset.i18n = "connect";
      disc.textContent = t("connect");
      disc.onclick = () => {
        window.location.href = "wallet.html";
      };
    }
    wrap.appendChild(disc);
    return wrap;
  }
  document.addEventListener("click", () => {
    document.querySelectorAll(".shell-menu").forEach((m) => m.classList.remove("open"));
  });
  function buildHomeIndicator() {
    const a = document.createElement("a");
    a.href = "/index.html";
    a.className = "home-indicator";
    a.innerHTML = '<div class="home-pill"></div>';
    return a;
  }
  function buildDesktopSidebar() {
    const cur = IS_SPA ? window.location.hash ? window.location.hash.replace("#/", "") + ".html" : "index.html" : window.location.pathname.split("/").pop() || "index.html";
    if (IS_SPA) {
      window.addEventListener("hashchange", () => {
        const path = window.location.hash.replace("#/", "") || "dashboard";
        document.querySelectorAll(".sidebar-nav-item").forEach((el) => {
          const href = el.getAttribute("href") || "";
          el.classList.toggle("active", href === "#/" + path);
        });
      });
    }
    const sb = document.createElement("nav");
    sb.className = "desktop-sidebar";
    sb.id = "desktop-sidebar";
    if (localStorage.getItem("00_sidebar_collapsed") === "1") sb.classList.add("collapsed");
    else if (window.matchMedia("(min-width:900px) and (max-width:1100px)").matches) sb.classList.add("expanded");
    const logo = document.createElement("a");
    logo.className = "sidebar-logo";
    logo.href = IS_SPA ? "#/dashboard" : "/";
    logo.innerHTML = '<span class="sidebar-logo-icon">00</span><span class="sidebar-logo-text sidebar-label">BCH Stealth Wallet</span>';
    sb.appendChild(logo);
    const nav = document.createElement("div");
    nav.className = "sidebar-nav";
    for (const [section, urls] of Object.entries(APP_SECTIONS)) {
      const lbl = document.createElement("div");
      lbl.className = "sidebar-section-label sidebar-label";
      lbl.textContent = section;
      nav.appendChild(lbl);
      for (const url of urls) {
        const app = APPS.find((a2) => a2.url === url);
        if (!app) continue;
        const a = document.createElement("a");
        const resolved = resolveUrl(url);
        const isActive = IS_SPA ? resolved === "#/" + cur.replace(".html", "") : url === cur;
        a.className = "sidebar-nav-item" + (isActive ? " active" : "");
        a.href = resolved;
        a.innerHTML = `<span class="sidebar-nav-icon">${APP_ICONS[url] || "\u25CF"}</span><span class="sidebar-label">${app.name.replace("00 ", "")}</span>`;
        nav.appendChild(a);
      }
    }
    sb.appendChild(nav);
    const bot = document.createElement("div");
    bot.className = "sidebar-bottom";
    const docBtn = document.createElement("a");
    docBtn.className = "sidebar-bottom-item";
    docBtn.href = "https://github.com/00-Protocol/BCH-Stealth-Protocol";
    docBtn.target = "_blank";
    docBtn.rel = "noopener";
    const _docIcon = document.createElement("span");
    _docIcon.className = "sidebar-bottom-icon";
    _docIcon.textContent = "\u{1F4D6}";
    const _docLabel = document.createElement("span");
    _docLabel.className = "sidebar-label";
    _docLabel.textContent = "Docs";
    docBtn.appendChild(_docIcon);
    docBtn.appendChild(_docLabel);
    bot.appendChild(docBtn);
    const theme = getTheme();
    const themeBtn = document.createElement("button");
    themeBtn.className = "sidebar-bottom-item";
    themeBtn.innerHTML = `<span class="sidebar-bottom-icon" id="dt-theme-icon">${theme === "dark" ? "\u2600" : "\u263E"}</span><span class="sidebar-label" id="dt-theme-label">${theme === "dark" ? "\u2600" : "\u263E"}</span>`;
    themeBtn.onclick = () => setTheme(getTheme() === "light" ? "dark" : "light");
    bot.appendChild(themeBtn);
    const netBtn = document.createElement("button");
    netBtn.className = "sidebar-bottom-item";
    netBtn.innerHTML = '<span class="sidebar-bottom-icon">\u{1F310}</span><span class="sidebar-label">Networks</span><span class="sidebar-net-dots" id="sb-net-dots"><span class="sb-dot" data-chain="bch"></span><span class="sb-dot" data-chain="btc"></span><span class="sb-dot" data-chain="eth"></span><span class="sb-dot" data-chain="xmr"></span></span>';
    netBtn.onclick = () => openNetworks();
    bot.appendChild(netBtn);
    const setBtn = document.createElement("button");
    setBtn.className = "sidebar-bottom-item";
    setBtn.innerHTML = '<span class="sidebar-bottom-icon">\u2699</span><span class="sidebar-label">Settings</span>';
    setBtn.onclick = () => openSettings();
    bot.appendChild(setBtn);
    if (localStorage.getItem("00wallet_vault")) {
      const keysBtn = document.createElement("button");
      keysBtn.className = "sidebar-bottom-item";
      keysBtn.innerHTML = '<span class="sidebar-bottom-icon">\u{1F511}</span><span class="sidebar-label">Export Keys</span>';
      keysBtn.onclick = () => {
        if (window.openExportKeys) window.openExportKeys();
        else window.location.href = "wallet.html?action=exportKeys";
      };
      bot.appendChild(keysBtn);
      const walletBtn = document.createElement("button");
      walletBtn.className = "sidebar-bottom-item";
      walletBtn.innerHTML = '<span class="sidebar-bottom-icon">\u{1F4BE}</span><span class="sidebar-label">Export Wallet</span>';
      walletBtn.onclick = () => {
        if (window.exportBackup) window.exportBackup();
        else window.location.href = "wallet.html?action=exportBackup";
      };
      bot.appendChild(walletBtn);
    }
    const discBtn = document.createElement("button");
    discBtn.id = "sidebar-connect-btn";
    _refreshConnectBtn(discBtn);
    bot.appendChild(discBtn);
    const colBtn = document.createElement("button");
    colBtn.className = "sidebar-bottom-item";
    colBtn.innerHTML = '<span class="sidebar-bottom-icon">\u2630</span><span class="sidebar-label">Collapse</span>';
    colBtn.onclick = () => {
      const isAutoCollapsed = window.matchMedia("(min-width:900px) and (max-width:1100px)").matches;
      if (isAutoCollapsed) {
        sb.classList.toggle("expanded");
        localStorage.setItem("00_sidebar_collapsed", sb.classList.contains("expanded") ? "0" : "1");
      } else {
        sb.classList.toggle("collapsed");
        localStorage.setItem("00_sidebar_collapsed", sb.classList.contains("collapsed") ? "1" : "0");
      }
    };
    bot.appendChild(colBtn);
    sb.appendChild(bot);
    return sb;
  }
  function inject() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    const isLanding = path === "" || path === "index.html";
    const isDocs = false;
    document.querySelectorAll(".blink").forEach((el) => el.remove());
    if (IS_DESKTOP && !isDocs) {
      document.body.prepend(buildDesktopSidebar());
      if (window._wsOnStatus) {
        window._wsOnStatus("bch", function(on) {
          var d = document.querySelector('.sb-dot[data-chain="bch"]');
          if (d) d.classList.toggle("on", on);
        });
        window._wsOnStatus("btc", function(on) {
          var d = document.querySelector('.sb-dot[data-chain="btc"]');
          if (d) d.classList.toggle("on", on);
        });
      }
      if (IS_SPA) {
        const dtVC = document.getElementById("view-container-desktop");
        if (dtVC) {
          dtVC.style.display = "block";
          dtVC.style.marginLeft = "240px";
          dtVC.style.width = "calc(100vw - 240px)";
          dtVC.style.minHeight = "100vh";
          dtVC.style.background = "var(--dt-bg, #f5f6f8)";
          dtVC.style.boxSizing = "border-box";
          dtVC.style.overflowX = "hidden";
        }
      }
    }
    if (!IS_DESKTOP && !isDocs) {
      _injectMobileNav();
    }
  }
  _desktopMQ.addEventListener("change", (e) => {
    IS_DESKTOP = e.matches;
    if (e.matches) {
      setTheme(getTheme());
      if (!document.getElementById("desktop-sidebar")) {
        const path = window.location.pathname.split("/").pop() || "index.html";
        if (path !== "docs.html") document.body.prepend(buildDesktopSidebar());
      }
    } else {
      const sb = document.getElementById("desktop-sidebar");
      if (sb) sb.remove();
      if (!document.getElementById("mob-nav")) _injectMobileNav();
    }
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
