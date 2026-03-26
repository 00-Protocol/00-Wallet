/* 00 Wallet — Onion View (SPA v2) — Relay & Stealth */
import * as state from '../core/state.js';
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, infoBtn, updateBalanceChip } from '../core/ui-helpers.js';

export const id = 'onion';
export const title = '00 Onion';
export const icon = '⧉';
let _container = null, _unsubs = [];

function _template() {
  const keys = auth.getKeys();
  const addr = keys?.bchAddr || '—';
  const sc = keys?.stealthCode || '';
  return `<div class="dt-inner" style="padding:32px 40px;max-width:720px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon">🧅</div><div><div class="dt-page-title">Onion Relay</div><div class="dt-page-sub">Privacy Routing · Stealth Addresses</div></div></div>
    </div>
    <div class="dt-tabs" id="dt-on-tabs">
      <button class="dt-tab active" data-tab="send">Stealth Send</button>
      <button class="dt-tab" data-tab="relay">Run Relay</button>
    </div>

    <!-- SEND -->
    <div class="dt-pane active" id="dt-on-p-send">
      <!-- My identity card -->
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:20px;margin-bottom:20px">
        <div style="display:flex;gap:16px">
          <div style="flex:1">
            <div style="font-size:10px;font-weight:600;color:var(--dt-text-secondary);letter-spacing:.5px;margin-bottom:6px">MY BCH ADDRESS</div>
            <div style="font-family:'SF Mono',monospace;font-size:12px;color:var(--dt-text);padding:10px 14px;background:var(--dt-bg);border-radius:8px;cursor:pointer;word-break:break-all;transition:all .15s" onclick="navigator.clipboard.writeText('${addr}');this.style.borderColor='var(--dt-accent)'" onmouseout="this.style.borderColor='transparent'" style="border:1px solid transparent">${addr}</div>
          </div>
        </div>
        ${sc ? `<div style="margin-top:14px">
          <div style="font-size:10px;font-weight:600;color:#BF5AF2;letter-spacing:.5px;margin-bottom:6px">MY STEALTH CODE</div>
          <div style="font-family:'SF Mono',monospace;font-size:10px;color:#BF5AF2;padding:10px 14px;background:rgba(191,90,242,.06);border:1px solid rgba(191,90,242,.15);border-radius:8px;cursor:pointer;word-break:break-all;line-height:1.6;transition:all .15s" onclick="navigator.clipboard.writeText(this.textContent);this.style.borderColor='#BF5AF2'" onmouseout="this.style.borderColor='rgba(191,90,242,.15)'">${sc}</div>
        </div>` : ''}
      </div>

      <!-- Send form -->
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
          <span style="font-size:15px;font-weight:700;color:var(--dt-text)">Send Privately</span>
          ${infoBtn('Stealth send creates a one-time address that only the recipient can detect. The payment is routed through onion relays — no one can link sender to receiver.')}
        </div>
        <div class="dt-form-group"><div class="dt-form-lbl">RECIPIENT</div><input class="dt-form-input" id="dt-on-recipient" placeholder="stealth:02abc... or session pubkey" style="font-family:'SF Mono',monospace;font-size:12px"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">AMOUNT (BCH)</div><input class="dt-form-input" id="dt-on-amount" type="number" step="0.00000001" placeholder="0.001"></div>
        <button class="dt-action-btn" style="background:linear-gradient(135deg,#BF5AF2,#8B5CF6);border:none">🧅 Send via Onion Route →</button>
      </div>

      <!-- Known relays -->
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <span style="font-size:15px;font-weight:700;color:var(--dt-text)">Known Relays</span>
          ${infoBtn('Relays announce themselves on Nostr every 5 minutes. They forward encrypted blobs without seeing contents. More relays = better privacy.')}
        </div>
        <div id="dt-on-relays"><div style="text-align:center;padding:24px;color:var(--dt-text-secondary);font-size:13px"><div style="font-size:24px;margin-bottom:8px;opacity:.4">🧅</div>Scanning for relays...</div></div>
      </div>
    </div>

    <!-- RELAY -->
    <div class="dt-pane" id="dt-on-p-relay">
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:15px;font-weight:700;color:var(--dt-text)">Run a Relay</span>
            ${infoBtn('Your node announces itself as an onion relay on Nostr. Others route CoinJoin coordination through you. You see only encrypted blobs — never inputs, outputs, or identities.')}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:13px;font-weight:600" id="dt-relay-label" data-on="0">OFF</span>
            <div style="width:48px;height:26px;border-radius:13px;background:var(--dt-border);cursor:pointer;position:relative;transition:.3s" id="dt-relay-toggle">
              <div style="width:22px;height:22px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:.3s;box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="dt-form-group"><div class="dt-form-lbl">BASE FEE (SATS)</div><input class="dt-form-input" value="500"></div>
          <div class="dt-form-group"><div class="dt-form-lbl">MAX RELAY (SATS)</div><input class="dt-form-input" value="5000000"></div>
          <div class="dt-form-group"><div class="dt-form-lbl">CLTV DELTA (BLOCKS)</div><input class="dt-form-input" value="6"></div>
          <div class="dt-form-group"><div class="dt-form-lbl">MAX HOPS</div><input class="dt-form-input" value="1"></div>
        </div>
      </div>
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <div style="width:8px;height:8px;border-radius:50%;background:var(--dt-text-secondary);opacity:.4" id="dt-relay-dot"></div>
          <span style="font-size:13px;font-weight:600;color:var(--dt-text)">Relay Status</span>
        </div>
        <div style="font-size:13px;color:var(--dt-text-secondary);line-height:1.6" id="dt-relay-status">Relay not active. Toggle the switch above to start announcing on Nostr.</div>
      </div>
    </div>
  </div>`;
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();
  // Tabs
  document.querySelectorAll('#dt-on-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-on-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('dt-on-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });
  // Relay toggle
  document.getElementById('dt-relay-toggle')?.addEventListener('click', function() {
    const lbl = document.getElementById('dt-relay-label');
    const on = lbl.dataset.on === '1';
    lbl.dataset.on = on ? '0' : '1';
    this.style.background = on ? 'var(--dt-border)' : 'var(--dt-accent)';
    this.querySelector('div').style.left = on ? '2px' : '24px';
    lbl.textContent = on ? 'OFF' : 'ON';
    lbl.style.color = on ? 'var(--dt-text-secondary)' : 'var(--dt-accent)';
    const dot = document.getElementById('dt-relay-dot');
    if (dot) { dot.style.background = on ? 'var(--dt-text-secondary)' : 'var(--dt-accent)'; dot.style.opacity = on ? '.4' : '1'; dot.style.boxShadow = on ? 'none' : '0 0 6px var(--dt-accent)'; }
    document.getElementById('dt-relay-status').textContent = on ? 'Relay not active. Toggle the switch above to start announcing on Nostr.' : 'Relay active — announcing on Nostr relays every 60 seconds.';
    // TODO: wire to relay-service
  });
  _unsubs.push(state.subscribe('balances', () => updateBalanceChip('bch')));
}
export function unmount() { _unsubs.forEach(fn => fn()); _unsubs = []; if (_container) _container.innerHTML = ''; _container = null; }
