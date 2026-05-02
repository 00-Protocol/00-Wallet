import * as state from "./core/state.js";
import * as auth from "./core/auth.js";
import * as router from "./router.js";
import { nostrInit } from "./core/nostr-bridge.js";
import * as balanceService from "./services/balance-service.js";
import * as hdScanner from "./services/hd-scanner.js";
const ROUTES = {
  "auth": () => import("./views/auth.js"),
  "dashboard": () => import("./views/dashboard.js"),
  "wallet": () => import("./views/wallet.js"),
  "pay": () => import("./views/pay.js"),
  "swap": () => import("./views/swap.js"),
  "dex": () => import("./views/dex.js"),
  "loan": () => import("./views/loan.js"),
  "sub": () => import("./views/sub.js"),
  "chat": () => import("./views/chat.js"),
  "onion": () => import("./views/onion.js"),
  "vault": () => import("./views/vault.js"),
  "fusion": () => import("./views/fusion.js"),
  "analyse": () => import("./views/analyse.js"),
  "id": () => import("./views/id.js"),
  "mesh": () => import("./views/mesh.js"),
  "config": () => import("./views/config.js"),
  "bet": () => import("./views/bet.js"),
  "elon": () => import("./views/elon.js")
};
async function boot() {
  state.init();
  for (const [path, loader] of Object.entries(ROUTES)) {
    router.register(path, loader);
  }
  const isDesktop = window.matchMedia("(min-width: 900px)").matches;
  const container = isDesktop ? document.getElementById("view-container-desktop") || document.getElementById("view-container") : document.getElementById("view-container");
  if (container) {
    container.style.display = "block";
    router.setContainer(container);
  }
  router.onNavigate((path, mod) => {
    state.set("activeView", path);
    document.querySelectorAll(".sidebar-nav-item").forEach((el) => {
      const href = el.getAttribute("href") || "";
      const itemPath = href.replace("#/", "").replace(".html", "");
      el.classList.toggle("active", itemPath === path);
    });
    if (mod && mod.title) {
      document.title = mod.title + " \xE2\u20AC\u201D 00 Protocol";
    }
  });
  const relays = window._00ep && window._00ep.relays || ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.primal.net"];
  if (nostrInit) {
    nostrInit(relays);
  } else {
    console.error("[00] nostrInit is undefined! Falling back to window._nostrInit");
    window._nostrInit?.(relays);
  }
  router.init();
  let unlocked = false;
  if (auth.isConnected()) {
    try {
      unlocked = await auth.tryAutoUnlock();
      if (unlocked) {
        balanceService.start(auth.getKeys());
        hdScanner.scan(auth.getKeys());
        const keys = auth.getKeys();
        if (keys?.xmr) {
          import("./services/xmr-scanner.js").then((xmr) => {
            xmr.init(keys.xmr);
            xmr.startAutoScan(6e4);
          }).catch((e) => console.warn("[00] XMR scanner init failed:", e.message));
        }
      }
    } catch (e) {
      console.warn("[00] auto-unlock failed:", e?.message || e);
    }
  }
  if (!unlocked && (localStorage.getItem("00_wc_session") || localStorage.getItem("00_wiz_session"))) {
    try {
      const restored = await Promise.race([
        auth.restoreExternalSession(),
        new Promise((resolve) => setTimeout(() => resolve(false), 6e3))
      ]);
      if (restored) {
        unlocked = true;
        balanceService.start(auth.getKeys());
      }
    } catch (e) {
      console.warn("[00] WC restore failed:", e.message);
    }
  }
  if (!unlocked) {
    const hash = window.location.hash || "";
    if (!hash.includes("auth")) {
      router.navigate("auth");
    }
  }
  auth.onAuth((event, keys) => {
    if (event === "unlock" && keys) {
      balanceService.start(keys);
      hdScanner.scan(keys);
      if (window._shellRefreshAuth) window._shellRefreshAuth();
    } else if (event === "lock" || event === "disconnect") {
      balanceService.stop();
      if (window._shellRefreshAuth) window._shellRefreshAuth();
      router.navigate("auth");
    }
  });
  if (unlocked && window._shellRefreshAuth) window._shellRefreshAuth();
  window.wizDisconnect = () => auth.wizDisconnect?.();
  let _activityTimer;
  document.addEventListener("click", () => {
    clearTimeout(_activityTimer);
    _activityTimer = setTimeout(() => auth.refreshSession(), 1e3);
  }, { passive: true });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
