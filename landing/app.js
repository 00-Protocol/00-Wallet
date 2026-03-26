/* ══════════════════════════════════════════
   00 Wallet — SPA Bootstrap
   ══════════════════════════════════════════
   Entry point. Initializes core services,
   registers routes, boots the application.
   ══════════════════════════════════════════ */

// Core modules imported without version params — nginx serves no-cache headers
// This ensures app.js and views share the SAME module instances (critical for auth state)
import * as state from './core/state.js';
import * as auth from './core/auth.js';
import * as router from './router.js';
import { nostrInit } from './core/nostr-bridge.js';
import * as balanceService from './services/balance-service.js';
import * as hdScanner from './services/hd-scanner.js';

/* ── Route registry (all lazy-loaded) ── */
/* Bump _V on deploy to bust browser module cache */
const _V = '?v=10';
const ROUTES = {
  'auth':       () => import('./views/auth.js' + _V),
  'dashboard':  () => import('./views/dashboard.js' + _V),
  'wallet':     () => import('./views/wallet.js' + _V),
  'pay':        () => import('./views/pay.js' + _V),
  'swap':       () => import('./views/swap.js' + _V),
  'dex':        () => import('./views/dex.js' + _V),
  'loan':       () => import('./views/loan.js' + _V),
  'sub':        () => import('./views/sub.js' + _V),
  'chat':       () => import('./views/chat.js' + _V),
  'onion':      () => import('./views/onion.js' + _V),
  'vault':      () => import('./views/vault.js' + _V),
  'fusion':     () => import('./views/fusion.js' + _V),
  'analyse':    () => import('./views/analyse.js' + _V),
  'id':         () => import('./views/id.js' + _V),
  'mesh':       () => import('./views/mesh.js' + _V),
  'config':     () => import('./views/config.js' + _V),
};

/* ── Boot sequence ── */
async function boot() {
  console.log('[00] booting SPA...');

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
      document.title = mod.title + ' — 00 Protocol';
    }
  });

  // 5. Initialize Nostr connection pool
  const relays = (window._00ep && window._00ep.relays) ||
    ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
  console.log('[00] nostrInit called with', relays.length, 'relays, fn=', typeof nostrInit);
  if (nostrInit) {
    nostrInit(relays);
  } else {
    console.error('[00] nostrInit is undefined! Falling back to window._nostrInit');
    window._nostrInit?.(relays);
  }

  // 6. Try auto-unlock and gate access
  let unlocked = false;
  if (auth.isConnected()) {
    unlocked = await auth.tryAutoUnlock();
    if (unlocked) {
      console.log('[00] auto-unlocked from session');
      balanceService.start(auth.getKeys());
      hdScanner.scan(auth.getKeys()); // background — don't await
    }
  }

  // 7. Start router (processes initial hash)
  router.init();

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
    } else if (event === 'lock' || event === 'disconnect') {
      balanceService.stop();
    }
  });

  // 9. Refresh session on user activity
  let _activityTimer;
  document.addEventListener('click', () => {
    clearTimeout(_activityTimer);
    _activityTimer = setTimeout(() => auth.refreshSession(), 1000);
  }, { passive: true });

  console.log('[00] SPA ready');
}

/* ── Start ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
