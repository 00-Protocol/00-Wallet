/* 00 Wallet — Config View (SPA v2) — Settings */
import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';

export const id = 'config';
export const title = '00 Settings';
export const icon = '⚙';
let _container = null, _unsubs = [];

function _ep(key, def) { return localStorage.getItem('00_ep_' + key) || def; }

function _template() {
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon">⚙</div><div><div class="dt-page-title">Settings</div><div class="dt-page-sub">Endpoints · Network · Preferences</div></div></div>
    </div>
    <div class="dt-card">
      <div class="dt-card-title">BCH Fulcrum Servers</div>
      <div class="dt-form-group"><textarea class="dt-form-input" id="cfg-fulcrum" rows="3" style="font-size:11px;font-family:monospace">${_ep('fulcrum', 'wss://bch.imaginary.cash:50004')}</textarea></div>
    </div>
    <div class="dt-card">
      <div class="dt-card-title">BTC Electrum Servers</div>
      <div class="dt-form-group"><textarea class="dt-form-input" id="cfg-btc" rows="2" style="font-size:11px;font-family:monospace">${_ep('btc_electrum', 'wss://electrum.blockstream.info:50002')}</textarea></div>
    </div>
    <div class="dt-card">
      <div class="dt-card-title">Nostr Relays</div>
      <div class="dt-form-group"><textarea class="dt-form-input" id="cfg-relays" rows="3" style="font-size:11px;font-family:monospace">${_ep('relays', 'wss://relay.damus.io\nwss://nos.lol\nwss://relay.primal.net')}</textarea></div>
    </div>
    <div class="dt-card">
      <div class="dt-card-title">Other Endpoints</div>
      <div class="dt-form-group"><div class="dt-form-lbl">ETH RPC</div><input class="dt-form-input" id="cfg-eth" value="${_ep('eth_rpc', 'https://ethereum-rpc.publicnode.com')}"></div>
      <div class="dt-form-group"><div class="dt-form-lbl">Indexer</div><input class="dt-form-input" id="cfg-indexer" value="${_ep('indexer', 'https://0penw0rld.com')}"></div>
      <div class="dt-form-group"><div class="dt-form-lbl">Meta API</div><input class="dt-form-input" id="cfg-meta" value="${_ep('meta', 'https://meta.riften.net')}"></div>
    </div>
    <div style="display:flex;gap:12px;margin-top:20px">
      <button class="dt-action-btn" id="cfg-save" style="background:var(--dt-accent);flex:1">Save Settings</button>
      <button class="dt-action-btn-outline" id="cfg-reset" style="flex:1">Reset to Defaults</button>
    </div>
    <div class="dt-card" style="margin-top:20px">
      <div class="dt-card-title">Danger Zone</div>
      <button class="dt-action-btn" id="cfg-disconnect" style="background:var(--dt-danger,#ef4444)">⏻ Disconnect Wallet</button>
      <div style="font-size:11px;color:var(--dt-text-secondary);margin-top:8px">This will clear your session. Your encrypted vault stays in localStorage.</div>
    </div>
  </div>`;
}

export function mount(container) {
  _container = container;
  container.innerHTML = _template();
  document.getElementById('cfg-save')?.addEventListener('click', () => {
    const sets = {fulcrum:'cfg-fulcrum',btc_electrum:'cfg-btc',relays:'cfg-relays',eth_rpc:'cfg-eth',indexer:'cfg-indexer',meta:'cfg-meta'};
    for (const [key, id] of Object.entries(sets)) {
      const v = document.getElementById(id)?.value?.trim();
      if (v) localStorage.setItem('00_ep_' + key, v);
    }
    alert('Settings saved. Reload to apply.');
  });
  document.getElementById('cfg-reset')?.addEventListener('click', () => {
    ['fulcrum','btc_electrum','relays','eth_rpc','indexer','meta'].forEach(k => localStorage.removeItem('00_ep_' + k));
    container.innerHTML = _template();
    mount(container);
  });
  document.getElementById('cfg-disconnect')?.addEventListener('click', () => {
    if (confirm('Disconnect wallet? Your encrypted vault will remain.')) {
      auth.lock();
      navigate('auth');
    }
  });
}
export function unmount() { _unsubs.forEach(fn => fn()); _unsubs = []; if (_container) _container.innerHTML = ''; _container = null; }
