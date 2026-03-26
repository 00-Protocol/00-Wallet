/* 00 Wallet — Vault View (SPA v2) — Stealth Multisig MuSig2 */
import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { statusDotsHtml, infoBtn, setDotStatus } from '../core/ui-helpers.js';

export const id = 'vault';
export const title = '00 Vault';
export const icon = '⊡';
let _container = null, _unsubs = [];

function _template() {
  const keys = auth.getKeys();
  const pubHex = keys?.pubKey ? Array.from(keys.pubKey, b => b.toString(16).padStart(2, '0')).join('') : '—';
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon">🔐</div><div><div class="dt-page-title">Vault</div><div class="dt-page-sub">Stealth Multisig · MuSig2</div></div></div>
      <div class="dt-page-actions">${statusDotsHtml(['nostr'])}</div>
    </div>
    <div class="dt-tabs" id="dt-vault-tabs">
      <button class="dt-tab active" data-tab="vaults">My Vaults</button>
      <button class="dt-tab" data-tab="create">Create</button>
      <button class="dt-tab" data-tab="pending">Pending</button>
    </div>
    <div class="dt-pane active" id="dt-vault-p-vaults">
      <div id="dt-vault-list"><div class="dt-empty"><div class="dt-empty-icon">🔐</div><div class="dt-empty-text">No vaults yet</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Create a multisig vault from the Create tab</div></div></div>
      <button class="dt-action-btn-outline" style="margin-top:16px" id="dt-vault-sync">⟳ Sync from Nostr</button>
    </div>
    <div class="dt-pane" id="dt-vault-p-create">
      <div class="dt-card">
        <div style="display:flex;align-items:center;gap:8px"><div class="dt-card-title" style="margin:0">Create Vault</div>${infoBtn('MuSig2 aggregates multiple public keys into a single key. The resulting address looks like a normal P2PKH address — no one can tell it is a multisig. All cosigners must sign to spend.')}</div>
        <div style="padding:16px;background:var(--dt-bg);border-radius:10px;margin:16px 0">
          <div class="dt-form-lbl" style="margin-bottom:4px">YOUR PUBKEY</div>
          <div style="font-family:monospace;font-size:10px;color:var(--dt-text);word-break:break-all;cursor:pointer" onclick="navigator.clipboard.writeText(this.textContent)">${pubHex}</div>
        </div>
        <div class="dt-form-group"><div class="dt-form-lbl">VAULT NAME</div><input class="dt-form-input" id="dt-vault-name" placeholder="My Vault"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">ADD COSIGNER PUBKEY</div>
          <div style="display:flex;gap:8px"><input class="dt-form-input" id="dt-vault-cosigner" placeholder="02abc..." style="flex:1"><button class="dt-action-btn" style="width:auto;padding:10px 16px;background:var(--dt-accent)" id="dt-vault-add-cos">Add</button></div>
        </div>
        <div id="dt-vault-cosigners" style="margin-bottom:16px"></div>
        <button class="dt-action-btn" style="background:linear-gradient(135deg,#0AC18E,#0AD18E)" id="dt-vault-create-btn">Create Vault</button>
      </div>
    </div>
    <div class="dt-pane" id="dt-vault-p-pending">
      <div id="dt-vault-pending"><div class="dt-empty"><div class="dt-empty-icon">⏳</div><div class="dt-empty-text">No pending transactions</div></div></div>
      <button class="dt-action-btn-outline" style="margin-top:16px" id="dt-vault-sync-pending">⟳ Sync Pending</button>
    </div>
  </div>`;
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();
  setDotStatus('nostr', true);
  document.querySelectorAll('#dt-vault-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-vault-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('dt-vault-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });
  // TODO: cosigner management, vault creation, Nostr sync
}
export function unmount() { _unsubs.forEach(fn => fn()); _unsubs = []; if (_container) _container.innerHTML = ''; _container = null; }
