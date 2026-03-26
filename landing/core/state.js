/* ══════════════════════════════════════════
   00 Wallet — Global Reactive State Store
   ══════════════════════════════════════════
   Simple observable state. Services write, views subscribe.
   No framework needed.

   Usage:
     import * as state from './core/state.js';
     state.set('balances', { bch: 100000 });
     const unsub = state.subscribe('balances', val => updateUI(val));
     unsub(); // cleanup
   ══════════════════════════════════════════ */

const _state = {};
const _listeners = {};   // key -> Set<callback>
const _globalListeners = new Set(); // listen to ALL changes

/* ── Read ── */
export function get(key) {
  return _state[key];
}

export function getAll() {
  return { ..._state };
}

/* ── Write ── */
export function set(key, value) {
  const prev = _state[key];
  _state[key] = value;
  // Notify key-specific listeners
  if (_listeners[key]) {
    for (const cb of _listeners[key]) {
      try { cb(value, prev, key); } catch (e) { console.error('[state]', key, e); }
    }
  }
  // Notify global listeners
  for (const cb of _globalListeners) {
    try { cb(key, value, prev); } catch (e) { console.error('[state:global]', e); }
  }
}

/* ── Merge (for nested objects like balances) ── */
export function merge(key, partial) {
  const current = _state[key] || {};
  set(key, { ...current, ...partial });
}

/* ── Subscribe to a specific key ── */
export function subscribe(key, callback) {
  if (!_listeners[key]) _listeners[key] = new Set();
  _listeners[key].add(callback);
  // Return unsubscribe function
  return () => _listeners[key].delete(callback);
}

/* ── Subscribe to ALL state changes ── */
export function subscribeAll(callback) {
  _globalListeners.add(callback);
  return () => _globalListeners.delete(callback);
}

/* ── Hydrate from localStorage ── */
export function hydrate(key, localStorageKey, parser = JSON.parse) {
  try {
    const raw = localStorage.getItem(localStorageKey);
    if (raw !== null) {
      _state[key] = parser(raw);
    }
  } catch { /* ignore parse errors */ }
}

/* ── Persist to localStorage on change ── */
export function persist(key, localStorageKey, serializer = JSON.stringify) {
  subscribe(key, (val) => {
    try {
      if (val === undefined || val === null) localStorage.removeItem(localStorageKey);
      else localStorage.setItem(localStorageKey, serializer(val));
    } catch { /* quota exceeded etc */ }
  });
}

/* ── Initialize default state ── */
export function init() {
  // Hydrate from localStorage (keeps backward compat with existing keys)
  hydrate('balances', '00_balances');
  hydrate('prices', '00_dash_prices');
  hydrate('stealthUtxos', '00stealth_utxos');
  hydrate('fusionHistory', '00_fusion_history');
  hydrate('theme', '00_theme', v => v);  // raw string
  hydrate('lang', '00_lang', v => v);
  hydrate('autoStealth', '00_auto_stealth', v => v === '1' || v === 'true');
  hydrate('relayMode', '00_onion_relay_mode', v => v === '1' || v === 'true');
  hydrate('sidebarCollapsed', '00_sidebar_collapsed', v => v === '1');

  // Set defaults for non-persisted state
  if (!_state.balances) _state.balances = {};
  if (!_state.prices) _state.prices = {};
  if (!_state.stealthUtxos) _state.stealthUtxos = [];
  if (!_state.fusionHistory) _state.fusionHistory = [];
  _state.activeMix = null;
  _state.activeView = 'dashboard';
  _state.nostrConnected = false;
  _state.fulcrumConnected = { bch: false, btc: false };
  _state.joinerRelays = [];
  _state.utxos = [];

  // Auto-persist on change
  persist('balances', '00_balances');
  persist('prices', '00_dash_prices');
  persist('stealthUtxos', '00stealth_utxos');
  persist('fusionHistory', '00_fusion_history');
  persist('theme', '00_theme', v => v);
  persist('lang', '00_lang', v => v);
  persist('autoStealth', '00_auto_stealth', v => v ? '1' : '0');
  persist('relayMode', '00_onion_relay_mode', v => v ? '1' : '0');
  persist('sidebarCollapsed', '00_sidebar_collapsed', v => v ? '1' : '0');
}
