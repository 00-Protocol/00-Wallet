/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   00 Wallet â€” SPA Bootstrap
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Entry point. Initializes core services,
   registers routes, boots the application.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

// Core modules imported without version params â€” nginx serves no-cache headers
// This ensures app.js and views share the SAME module instances (critical for auth state)
import * as state from './core/state.js';
import * as auth from './core/auth.js';
import * as router from './router.js';
import { nostrInit } from './core/nostr-bridge.js';
import * as balanceService from './services/balance-service.js';
import * as hdScanner from './services/hd-scanner.js';

/* â”€â”€ Route registry (all lazy-loaded) â”€â”€ */
/* Note: no ?v= suffix — file:// protocol ignores query strings, breaking ES module imports */
const ROUTES = {
  'auth':       () => import('./views/auth.js'),
  'dashboard':  () => import('./views/dashboard.js'),
  'wallet':     () => import('./views/wallet.js'),
  'pay':        () => import('./views/pay.js'),
  'swap':       () => import('./views/swap.js'),
  'dex':        () => import('./views/dex.js'),
  'loan':       () => import('./views/loan.js'),
  'sub':        () => import('./views/sub.js'),
  'chat':       () => import('./views/chat.js'),
  'onion':      () => import('./views/onion.js'),
  'vault':      () => import('./views/vault.js'),
  'fusion':     () => import('./views/fusion.js'),
  'analyse':    () => import('./views/analyse.js'),
  'id':         () => import('./views/id.js'),
  'mesh':       () => import('./views/mesh.js'),
  'config':     () => import('./views/config.js'),
  'bet':        () => import('./views/bet.js'),
  'elon':       () => import('./views/elon.js'),
};

/* â”€â”€ Boot sequence â”€â”€ */
async function boot() {

  // 1. Initialize state store (hydrate from localStorage)
  state.init();

  // 2. Register routes
  for (const [path, loader] of Object.entries(ROUTES)) {
    router.register(path, loader);
  }

  // 3. Set router container (desktop uses #view-container-desktop, mobile uses #view-container)
  const isDesktop = window.matchMedia('(min-width: 900px)').matches;
  const container = isDesktop
    ? (document.getElementById('view-container-desktop') || document.getElementById('view-container'))
    : document.getElementById('view-container');
  if (container) {
    container.style.display = 'block';
    router.setContainer(container);
  }

  // 4. Navigation callback (update sidebar active state)
  router.onNavigate((path, mod) => {
    state.set('activeView', path);
    // Update sidebar
    document.querySelectorAll('.sidebar-nav-item').forEach(el => {
      const href = el.getAttribute('href') || '';
      const itemPath = href.replace('#/', '').replace('.html', '');
      el.classList.toggle('active', itemPath === path);
    });
    // Update page title
    if (mod && mod.title) {
      document.title = mod.title + ' â€” 00 Protocol';
    }
  });

  // 5. Initialize Nostr connection pool
  const relays = (window._00ep && window._00ep.relays) ||
    ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
  if (nostrInit) {
    nostrInit(relays);
  } else {
    console.error('[00] nostrInit is undefined! Falling back to window._nostrInit');
    window._nostrInit?.(relays);
  }

  // 6. Start router early so UI is never blank while async auth/session restore runs
  router.init();

  // 7. Try auto-unlock and gate access
  let unlocked = false;
  if (auth.isConnected()) {
    try {
      unlocked = await auth.tryAutoUnlock();
      if (unlocked) {
        balanceService.start(auth.getKeys());
        hdScanner.scan(auth.getKeys()); // background — don't await
        // Start XMR scanner if keys available
        const keys = auth.getKeys();
        if (keys?.xmr) {
          import('./services/xmr-scanner.js').then(xmr => {
            xmr.init(keys.xmr);
            xmr.startAutoScan(60000); // scan every 60s
          }).catch(e => console.warn('[00] XMR scanner init failed:', e.message));
        }
      }
    } catch (e: any) {
      console.warn('[00] auto-unlock failed:', e?.message || e);
    }
  }

  // 7b. Try restore external wallet session (WalletConnect/WizardConnect)
  if (!unlocked && (localStorage.getItem('00_wc_session') || localStorage.getItem('00_wiz_session'))) {
    try {
      const restored = await Promise.race<boolean>([
        auth.restoreExternalSession(),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 6000)),
      ]);
      if (restored) {
        unlocked = true;
        balanceService.start(auth.getKeys());
      }
    } catch (e) { console.warn('[00] WC restore failed:', e.message); }
  }

  // 8. If not unlocked and not already on auth page, redirect to auth
  if (!unlocked) {
    const hash = window.location.hash || '';
    if (!hash.includes('auth')) {
      router.navigate('auth');
    }
  }

  // 8. Listen for auth changes (start/stop services)
  auth.onAuth((event, keys) => {
    if (event === 'unlock' && keys) {
      balanceService.start(keys);
      hdScanner.scan(keys);
      if (window._shellRefreshAuth) window._shellRefreshAuth();
    } else if (event === 'lock' || event === 'disconnect') {
      balanceService.stop();
      if (window._shellRefreshAuth) window._shellRefreshAuth();
      router.navigate('auth');
    }
  });

  // Also refresh sidebar now (in case shell rendered before auto-unlock)
  if (unlocked && window._shellRefreshAuth) window._shellRefreshAuth();

  // 9. Refresh session on user activity
  let _activityTimer;
  document.addEventListener('click', () => {
    clearTimeout(_activityTimer);
    _activityTimer = setTimeout(() => auth.refreshSession(), 1000);
  }, { passive: true });

}

/* â”€â”€ Start â”€â”€ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

