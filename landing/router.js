/* ══════════════════════════════════════════
   00 Wallet — Hash-based SPA Router
   ══════════════════════════════════════════
   Routes: #/wallet, #/fusion, #/onion, etc.
   Views are lazy-loaded ES modules with mount/unmount.
   ══════════════════════════════════════════ */

const _routes = new Map();
let _currentView = null;
let _currentPath = '';
let _container = null;
let _onNavigate = null; // callback

/* ── Register routes ── */
export function register(path, loader) {
  _routes.set(path, loader);
}

/* ── Set the container element ── */
export function setContainer(el) {
  _container = el;
}

/* ── Set navigation callback (for sidebar active state, etc.) ── */
export function onNavigate(cb) {
  _onNavigate = cb;
}

/* ── Navigate programmatically ── */
export function navigate(path) {
  window.location.hash = '#/' + path;
}

/* ── Get current path ── */
export function currentPath() {
  return _currentPath;
}

/* ── Route handler ── */
async function handleRoute() {
  const hash = window.location.hash || '#/';
  const fullPath = hash.slice(2) || 'dashboard'; // strip '#/'

  // Support sub-routes: 'wallet/bch' → base='wallet', sub='bch'
  const parts = fullPath.split('/');
  const basePath = parts[0];
  const subPath = parts.slice(1).join('/') || null;

  const loader = _routes.get(basePath);

  if (!loader) {
    navigate('dashboard');
    return;
  }

  // Same base route with sub-path change → let the view handle it internally
  if (basePath === _currentPath && _currentView && _currentView.onSubRoute) {
    _currentView.onSubRoute(subPath);
    return;
  }

  // Same exact path → skip
  if (fullPath === _currentPath && _currentView) return;
  const path = basePath;

  // Unmount current view
  if (_currentView && _currentView.unmount) {
    try { _currentView.unmount(); } catch (e) { console.error('[router] unmount error:', e); }
  }

  // Loading state
  if (_container) _container.classList.add('loading');

  try {
    // Lazy-load the view module
    const mod = await loader();

    // Mount new view
    _currentView = mod;
    _currentPath = path;

    if (_container) {
      _container.innerHTML = '';
      _container.classList.remove('loading');
      mod.mount(_container, subPath);
    }

    // Callback (update sidebar, page title, etc.)
    if (_onNavigate) _onNavigate(path, mod);

    // Update document title
    if (mod.title) document.title = mod.title;

  } catch (e) {
    console.error('[router] failed to load view:', path, e);
    if (_container) {
      _container.classList.remove('loading');
      _container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--dt-text-secondary)">
        <div style="font-size:24px;margin-bottom:12px">⚠</div>
        <div>Failed to load ${path}</div>
        <div style="font-size:12px;margin-top:8px;opacity:.6">${e.message}</div>
      </div>`;
    }
  }
}

/* ── Initialize router ── */
export function init() {
  window.addEventListener('hashchange', handleRoute);
  // Handle initial load
  handleRoute();
}

/* ── Cleanup ── */
export function destroy() {
  window.removeEventListener('hashchange', handleRoute);
  if (_currentView && _currentView.unmount) {
    try { _currentView.unmount(); } catch (e) {}
  }
  _currentView = null;
  _currentPath = '';
}
