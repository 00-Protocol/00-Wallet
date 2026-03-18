// 0penw0rld Service Worker
const CACHE = '0penw0rld-v400';

const APP_SHELL = [
  '/',
  '/index.html',
  '/docs.html',
  '/shell.js',
  '/ws-shared.js',
  '/ws-bridge.js',
  '/desktop.css',
  '/chat.html',
  '/mesh.html',
  '/wallet.html',
  '/fusion.html',
  '/id.html',
  '/pay.html',
  '/dex.html',
  '/loan.html',
  '/swap.html',
  '/onion.html',
  '/vault.html',
  '/config.html',
  '/xmr-swap-crypto.js',
  '/xmr-rpc.js',
  '/swap-xmr.html',
  '/ledger.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/bch.png',
  '/icons/btc.png',
  '/icons/eth.png',
  '/icons/xmr.png',
  '/icons/usdc.png',
  '/icons/usdt.png',
];

// External APIs — always network-first
const NETWORK_FIRST = [
  'midgard.ninerealms.com',
  'thornode.ninerealms.com',
  'fulcrum.cash',
  'bchd.fountainhead.cash',
  'cauldron.quest',
  'oracle.cauldron.quest',
  'api.kraken.com',
  'delphi.cash',
  'relay.damus.io',
  'nos.lol',
  'relay.snort.social',
  'node.moneroworld.com',
  'xmr-node.cakewallet.com',
  'nodes.hashvault.pro',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── Install ──────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(
        APP_SHELL.map(url =>
          fetch(url, { cache: 'no-store' }).then(r => c.put(url, r))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// ── Activate — purge old caches ──────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Pages that need cross-origin isolation (SharedArrayBuffer for WASM)
const COI_PAGES = ['/swap-xmr.html', '/swap.html'];

function addCoiHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// ── Fetch ────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Skip non-GET, chrome-extension, and WebSocket
  if (e.request.method !== 'GET') return;
  if (url.startsWith('chrome-extension')) return;
  if (url.startsWith('ws://') || url.startsWith('wss://')) return;

  // Check if this page needs cross-origin isolation
  const needsCoi = COI_PAGES.some(p => new URL(url).pathname.endsWith(p));

  const isNetworkFirst = NETWORK_FIRST.some(h => url.includes(h));

  if (isNetworkFirst) {
    // Network first — live data (prices, pools, relays)
    e.respondWith(
      fetch(e.request)
        .then(r => needsCoi ? addCoiHeaders(r) : r)
        .catch(() =>
          caches.match(e.request, { ignoreSearch: true })
            .then(c => c || new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } }))
        )
    );
  } else {
    // Cache first — app shell (HTML, icons, manifest)
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then(cached => {
        if (cached) return needsCoi ? addCoiHeaders(cached) : cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, clone));
          return needsCoi ? addCoiHeaders(res) : res;
        });
      })
    );
  }
});

// ── Push notifications (future) ──────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  const { title = '0penw0rld', body = '', url = '/' } = e.data.json();
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});
