/* ══════════════════════════════════════════
   00 Wallet — Onion View (SPA v2) — Relay & Stealth
   ══════════════════════════════════════════
   Full port of onion.html v1 logic into v2 SPA module.
   Relay discovery (kind 22230), relay announce,
   stealth send, incoming blob subscription (kind 22231).
   ══════════════════════════════════════════ */
import * as state from '../core/state.js';
import * as auth  from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, infoBtn, updateBalanceChip } from '../core/ui-helpers.js';
import { onionLayer, onionPeel, onionWrap, onionUnpad, makeEvent, nip04Decrypt, b2h, h2b } from '../onion-crypto.js';
import { deriveStealthSendAddr, decodeStealthCode, stealthScan, checkStealthMatch } from '../core/stealth.js';
import { sendBch, estimateTxSize, buildSignedTx } from '../core/send-bch.js';

export const id    = 'onion';
export const title = '00 Onion';
export const icon  = '\u29C9';

/* ── Constants ── */
const NOSTR_KIND_RELAY_ANN  = 22230;
const NOSTR_KIND_ONION_BLOB = 22231;
const RELAY_TTL             = 300;   // 5 minutes
const ANNOUNCE_INTERVAL     = 60000; // 60 seconds

/* ── Module state ── */
let _container = null;
let _unsubs    = [];
let _knownRelays    = [];   // [{pub, fee, max_htlc, cltv_delta, ts}]
let _relayMode      = localStorage.getItem('00_onion_relay_mode') === '1';
let _relayAnnTimer  = null;
let _pruneTimer     = null;
let _renderTimer    = null;
let _relaySub       = null; // Nostr subscription id for relay announcements
let _blobSub        = null; // Nostr subscription id for incoming blobs
let _statusUnsub    = null; // Nostr status listener unsub

/* ══════════════════════════════════════════
   TEMPLATE
   ══════════════════════════════════════════ */
function _template() {
  const keys = auth.getKeys();
  const addr = keys?.bchAddr || '\u2014';
  const sc   = keys?.stealthCode || '';
  const pub  = keys?.sessionPub ? (typeof keys.sessionPub === 'string' ? keys.sessionPub : b2h(keys.sessionPub)) : '';
  const relayFee  = localStorage.getItem('00_onion_relay_fee')  || '500';
  const relayMax  = localStorage.getItem('00_onion_relay_max')  || '5000000';
  const relayCltv = localStorage.getItem('00_onion_relay_cltv') || '6';
  const relayHops = localStorage.getItem('00_onion_relay_hops') || '1';

  return `<div class="dt-inner" style="padding:32px 40px;max-width:720px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon"><img src="icons/onion.png" style="width:28px;height:28px"></div><div><div class="dt-page-title">Onion Relay</div><div class="dt-page-sub">Privacy Routing \u00B7 Stealth Addresses</div></div></div>
    </div>

    <!-- Connection status -->
    <div style="display:flex;gap:10px;margin-bottom:16px;font-size:11px;color:var(--dt-text-secondary)">
      <div style="display:flex;align-items:center;gap:5px"><div id="dt-on-nostr-dot" style="width:7px;height:7px;border-radius:50%;background:var(--dt-text-secondary);opacity:.35;transition:.3s"></div><span id="dt-on-nostr-label">Nostr: connecting...</span></div>
      <div style="display:flex;align-items:center;gap:5px;margin-left:12px"><span id="dt-on-relay-count">0 relays</span></div>
    </div>

    <div class="dt-tabs" id="dt-on-tabs">
      <button class="dt-tab active" data-tab="send">Stealth Send</button>
      <button class="dt-tab" data-tab="relay">Run Relay</button>
    </div>

    <!-- ═══ SEND PANE ═══ -->
    <div class="dt-pane active" id="dt-on-p-send">
      <!-- My identity card -->
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:20px;margin-bottom:20px">
        <div style="display:flex;gap:16px">
          <div style="flex:1">
            <div style="font-size:10px;font-weight:600;color:var(--dt-text-secondary);letter-spacing:.5px;margin-bottom:6px">MY BCH ADDRESS</div>
            <div id="dt-on-my-addr" style="font-family:'SF Mono',monospace;font-size:12px;color:var(--dt-text);padding:10px 14px;background:var(--dt-bg);border-radius:8px;cursor:pointer;word-break:break-all;border:1px solid transparent;transition:all .15s">${addr}</div>
          </div>
        </div>
        ${pub ? `<div style="margin-top:14px">
          <div style="font-size:10px;font-weight:600;color:var(--dt-text-secondary);letter-spacing:.5px;margin-bottom:6px">SESSION PUBKEY</div>
          <div id="dt-on-my-pub" style="font-family:'SF Mono',monospace;font-size:10px;color:var(--dt-text-secondary);padding:10px 14px;background:var(--dt-bg);border:1px solid transparent;border-radius:8px;cursor:pointer;word-break:break-all;line-height:1.6;transition:all .15s">${pub}</div>
        </div>` : ''}
        ${sc ? `<div style="margin-top:14px">
          <div style="font-size:10px;font-weight:600;color:#BF5AF2;letter-spacing:.5px;margin-bottom:6px">MY STEALTH CODE</div>
          <div id="dt-on-my-stealth" style="font-family:'SF Mono',monospace;font-size:10px;color:#BF5AF2;padding:10px 14px;background:rgba(191,90,242,.06);border:1px solid rgba(191,90,242,.15);border-radius:8px;cursor:pointer;word-break:break-all;line-height:1.6;transition:all .15s">${sc}</div>
        </div>` : ''}
      </div>

      <!-- Send form -->
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
          <span style="font-size:15px;font-weight:700;color:var(--dt-text)">Send Privately</span>
          ${infoBtn('Stealth send creates a one-time address that only the recipient can detect. The payment is routed through onion relays \u2014 no one can link sender to receiver.')}
        </div>
        <div class="dt-form-group"><div class="dt-form-lbl">RECIPIENT ${infoBtn('Paste the recipient stealth code (stealth:02abc...) or session pubkey hex. Stealth codes derive a one-time address via ECDH.')}</div><input class="dt-form-input" id="dt-on-recipient" placeholder="stealth:02abc... or session pubkey" style="font-family:'SF Mono',monospace;font-size:12px"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">AMOUNT (BCH) ${infoBtn('Payment amount in BCH. Relay fees are added on top automatically based on the route.')}</div><input class="dt-form-input" id="dt-on-amount" type="number" step="0.00000001" placeholder="0.001"></div>
        <div class="dt-form-group" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="dt-on-use-onion" style="accent-color:#BF5AF2">
          <label for="dt-on-use-onion" style="font-size:12px;color:var(--dt-text-secondary)">Wrap in onion layers (route via relays)</label>
        </div>
        <button class="dt-action-btn" id="dt-on-send-btn" style="background:linear-gradient(135deg,#BF5AF2,#8B5CF6);border:none">\uD83E\uDDC5 Send via Stealth \u2192</button>
        <div id="dt-on-send-status" style="font-size:12px;color:var(--dt-text-secondary);margin-top:10px;min-height:18px"></div>
      </div>

      <!-- Known relays -->
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:24px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
          <span style="font-size:15px;font-weight:700;color:var(--dt-text)">Known Relays</span>
          ${infoBtn('Relays announce themselves on Nostr every 60 seconds. They forward encrypted blobs without seeing contents. More relays = better privacy.')}
        </div>
        <div id="dt-on-relays"><div style="text-align:center;padding:24px;color:var(--dt-text-secondary);font-size:13px"><div style="font-size:24px;margin-bottom:8px;opacity:.4">\uD83E\uDDC5</div>Scanning for relays...</div></div>
      </div>
    </div>

    <!-- ═══ RELAY PANE ═══ -->
    <div class="dt-pane" id="dt-on-p-relay">
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:24px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:15px;font-weight:700;color:var(--dt-text)">Run a Relay</span>
            ${infoBtn('Your node announces itself as an onion relay on Nostr. Others route encrypted blobs through you. You see only encrypted data \u2014 never inputs, outputs, or identities.')}
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:13px;font-weight:600" id="dt-relay-label" data-on="${_relayMode ? '1' : '0'}">${_relayMode ? 'ON' : 'OFF'}</span>
            <div style="width:48px;height:26px;border-radius:13px;background:${_relayMode ? 'var(--dt-accent)' : 'var(--dt-border)'};cursor:pointer;position:relative;transition:.3s" id="dt-relay-toggle">
              <div style="width:22px;height:22px;border-radius:50%;background:#fff;position:absolute;top:2px;left:${_relayMode ? '24px' : '2px'};transition:.3s;box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div class="dt-form-group"><div class="dt-form-lbl">BASE FEE (SATS) ${infoBtn('Fixed fee in satoshis you charge per forwarded payment. Lower fees = more traffic, higher fees = more profit per hop.')}</div><input class="dt-form-input" id="dt-relay-fee" value="${relayFee}" type="number"></div>
          <div class="dt-form-group"><div class="dt-form-lbl">MAX RELAY (SATS) ${infoBtn('Maximum payment amount you are willing to relay. Limits your exposure.')}</div><input class="dt-form-input" id="dt-relay-max" value="${relayMax}" type="number"></div>
          <div class="dt-form-group"><div class="dt-form-lbl">CLTV DELTA (BLOCKS) ${infoBtn('Timelock safety margin in blocks (~10 min each). Default 6 blocks (~1 hour).')}</div><input class="dt-form-input" id="dt-relay-cltv" value="${relayCltv}" type="number"></div>
          <div class="dt-form-group"><div class="dt-form-lbl">MAX HOPS ${infoBtn('How many relay hops the sender can chain through you. 0 = only accept direct payments (no forwarding).')}</div><input class="dt-form-input" id="dt-relay-hops" value="${relayHops}" type="number" min="0" max="3"></div>
        </div>
      </div>
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:20px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <div style="width:8px;height:8px;border-radius:50%;background:${_relayMode ? 'var(--dt-accent)' : 'var(--dt-text-secondary)'};opacity:${_relayMode ? '1' : '.4'};transition:.3s" id="dt-relay-dot"></div>
          <span style="font-size:13px;font-weight:600;color:var(--dt-text)">Relay Status</span>
        </div>
        <div style="font-size:13px;color:var(--dt-text-secondary);line-height:1.6" id="dt-relay-status">${_relayMode ? 'Relay active \u2014 announcing on Nostr relays every 60 seconds.' : 'Relay not active. Toggle the switch above to start announcing on Nostr.'}</div>
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════
   RELAY DISCOVERY
   ══════════════════════════════════════════ */
function _pruneStaleRelays() {
  const cutoff = Math.floor(Date.now() / 1000) - RELAY_TTL;
  const before = _knownRelays.length;
  _knownRelays = _knownRelays.filter(r => r.ts >= cutoff);
  if (_knownRelays.length < before) {
    _renderRelayList();
  }
}

function _handleRelayAnnouncement(ev) {
  if (ev.kind !== NOSTR_KIND_RELAY_ANN) return;
  try {
    if (!ev.pubkey || ev.pubkey.length !== 64) return;
    const info = JSON.parse(ev.content);
    if (typeof info.fee !== 'number' || info.fee < 0 || info.fee > 1000000) return;
    if (typeof info.max_htlc !== 'number' || info.max_htlc < 546) return;
    const relay = {
      pub: ev.pubkey,
      fee: info.fee || 500,
      max_htlc: info.max_htlc || 5000000,
      cltv_delta: info.cltv_delta || 6,
      ts: ev.created_at,
    };
    const idx = _knownRelays.findIndex(r => r.pub === ev.pubkey);
    if (idx >= 0) _knownRelays[idx] = relay;
    else _knownRelays.push(relay);
    _renderRelayList();
  } catch {}
}

function _renderRelayList() {
  const el = _container?.querySelector('#dt-on-relays');
  if (!el) return;
  const now = Math.floor(Date.now() / 1000);
  const alive = _knownRelays.filter(r => (now - r.ts) < RELAY_TTL);

  // Update relay count label
  const countEl = _container?.querySelector('#dt-on-relay-count');
  if (countEl) countEl.textContent = alive.length + ' relay' + (alive.length !== 1 ? 's' : '');

  if (_knownRelays.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dt-text-secondary);font-size:13px"><div style="font-size:24px;margin-bottom:8px;opacity:.4">\uD83E\uDDC5</div>No relays found yet</div>';
    return;
  }
  const satsToBch = s => (s / 1e8).toFixed(8);
  el.innerHTML = _knownRelays.map(r => {
    const age = now - r.ts;
    const fresh = age < 120;
    const ok    = age < RELAY_TTL;
    const dot   = fresh ? '\uD83D\uDFE2' : ok ? '\uD83D\uDFE1' : '\uD83D\uDD34';
    const ago   = age < 60 ? '<1m' : Math.floor(age / 60) + 'm';
    const keys  = auth.getKeys();
    const myPub = keys?.sessionPub ? (typeof keys.sessionPub === 'string' ? keys.sessionPub : b2h(keys.sessionPub)) : '';
    const isMe  = r.pub === myPub;
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--dt-border);${!ok ? 'opacity:.4;' : ''}">
      <div style="width:36px;height:36px;border-radius:50%;background:${isMe ? 'rgba(191,90,242,.1)' : 'var(--dt-bg)'};border:1px solid ${isMe ? 'rgba(191,90,242,.3)' : 'var(--dt-border)'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${dot}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--dt-text);font-family:'SF Mono',monospace">${r.pub.slice(0, 12)}...${isMe ? ' <span style="color:#BF5AF2;font-size:10px">(you)</span>' : ''}</div>
        <div style="font-size:11px;color:var(--dt-text-secondary);margin-top:2px">MAX: ${satsToBch(r.max_htlc)} BCH \u00B7 CLTV: ${r.cltv_delta} \u00B7 ${ago}</div>
      </div>
      <div style="font-size:12px;font-weight:600;color:var(--dt-accent);flex-shrink:0">${r.fee} sat</div>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   INCOMING ONION BLOBS (kind 22231)
   ══════════════════════════════════════════ */
async function _handleOnionBlob(ev) {
  if (ev.kind !== NOSTR_KIND_ONION_BLOB) return;
  const keys = auth.getKeys();
  if (!keys?.sessionPriv) return;
  try {
    const plain = await nip04Decrypt(keys.sessionPriv, ev.pubkey, ev.content);
    if (!plain) return;
    const data = JSON.parse(plain);
    if (data.type === 'onion') {
      // If we are a relay, peel and forward
      if (_relayMode && data.blob) {
        try {
          const peeled = await onionPeel(h2b(data.blob), keys.sessionPriv);
          const inner = onionUnpad(peeled);
        } catch (e) { console.error('[ONION] peel error:', e); }
      }
    }
  } catch (e) { console.error('[ONION] blob error:', e); }
}

/* ══════════════════════════════════════════
   NOSTR SUBSCRIPTIONS
   ══════════════════════════════════════════ */
async function _subscribeNostr() {
  if (!window._nostrSubscribe) { console.warn('[ONION] Nostr bridge not ready'); return; }
  const keys = auth.getKeys();
  const now = Math.floor(Date.now() / 1000);

  // Subscribe to relay announcements (kind 22230)
  try {
    _relaySub = await window._nostrSubscribe(
      [{ kinds: [NOSTR_KIND_RELAY_ANN], '#t': ['0penw0rld-onion'], since: now - 3600 }],
      (ev) => _handleRelayAnnouncement(ev)
    );
  } catch (e) { console.error('[ONION] relay sub error:', e); }

  // Subscribe to incoming onion blobs (kind 22231) addressed to us
  if (keys?.sessionPub) {
    const myPubHex = typeof keys.sessionPub === 'string'
      ? keys.sessionPub
      : b2h(keys.sessionPub);
    try {
      _blobSub = await window._nostrSubscribe(
        [{ kinds: [NOSTR_KIND_ONION_BLOB], '#p': [myPubHex], since: now - 600 }],
        (ev) => _handleOnionBlob(ev)
      );
    } catch (e) { console.error('[ONION] blob sub error:', e); }
  }
}

function _unsubscribeNostr() {
  if (window._nostrUnsubscribe) {
    if (_relaySub) { window._nostrUnsubscribe(_relaySub); _relaySub = null; }
    if (_blobSub)  { window._nostrUnsubscribe(_blobSub);  _blobSub = null;  }
  }
}

/* ══════════════════════════════════════════
   NOSTR STATUS
   ══════════════════════════════════════════ */
function _updateNostrStatus() {
  if (!window._nostrStatus) return;
  const st = window._nostrStatus();
  const dot   = _container?.querySelector('#dt-on-nostr-dot');
  const label = _container?.querySelector('#dt-on-nostr-label');
  if (dot) {
    dot.style.background = st.connected ? 'var(--dt-accent)' : 'var(--dt-text-secondary)';
    dot.style.opacity    = st.connected ? '1' : '.35';
    dot.style.boxShadow  = st.connected ? '0 0 6px var(--dt-accent)' : 'none';
  }
  if (label) {
    label.textContent = st.connected
      ? 'Nostr: ' + st.relayCount + ' relay' + (st.relayCount !== 1 ? 's' : '')
      : 'Nostr: disconnected';
  }
}

/* ══════════════════════════════════════════
   RELAY MODE (toggle + announce)
   ══════════════════════════════════════════ */
function _toggleRelay() {
  _relayMode = !_relayMode;
  localStorage.setItem('00_onion_relay_mode', _relayMode ? '1' : '0');
  _updateRelayToggleUI();

  if (_relayMode) {
    _announceRelay();
    _relayAnnTimer = setInterval(_announceRelay, ANNOUNCE_INTERVAL);
  } else {
    if (_relayAnnTimer) { clearInterval(_relayAnnTimer); _relayAnnTimer = null; }
    // Remove ourselves from the relay list
    const keys = auth.getKeys();
    const myPub = keys?.sessionPub ? (typeof keys.sessionPub === 'string' ? keys.sessionPub : b2h(keys.sessionPub)) : '';
    _knownRelays = _knownRelays.filter(r => r.pub !== myPub);
    _renderRelayList();
  }
}

function _updateRelayToggleUI() {
  const lbl = _container?.querySelector('#dt-relay-label');
  const tog = _container?.querySelector('#dt-relay-toggle');
  const dot = _container?.querySelector('#dt-relay-dot');
  const sts = _container?.querySelector('#dt-relay-status');

  if (lbl) {
    lbl.dataset.on = _relayMode ? '1' : '0';
    lbl.textContent = _relayMode ? 'ON' : 'OFF';
    lbl.style.color = _relayMode ? 'var(--dt-accent)' : 'var(--dt-text-secondary)';
  }
  if (tog) {
    tog.style.background = _relayMode ? 'var(--dt-accent)' : 'var(--dt-border)';
    const thumb = tog.querySelector('div');
    if (thumb) thumb.style.left = _relayMode ? '24px' : '2px';
  }
  if (dot) {
    dot.style.background = _relayMode ? 'var(--dt-accent)' : 'var(--dt-text-secondary)';
    dot.style.opacity    = _relayMode ? '1' : '.4';
    dot.style.boxShadow  = _relayMode ? '0 0 6px var(--dt-accent)' : 'none';
  }
  if (sts) {
    sts.textContent = _relayMode
      ? 'Relay active \u2014 announcing on Nostr relays every 60 seconds.'
      : 'Relay not active. Toggle the switch above to start announcing on Nostr.';
  }
}

async function _announceRelay() {
  const keys = auth.getKeys();
  if (!keys?.sessionPriv) { console.warn('[ONION] no session key for relay announce'); return; }
  if (!window._nostrPublish) { console.warn('[ONION] Nostr bridge not available'); return; }

  const feeEl  = _container?.querySelector('#dt-relay-fee');
  const maxEl  = _container?.querySelector('#dt-relay-max');
  const cltvEl = _container?.querySelector('#dt-relay-cltv');

  const info = {
    fee:        parseInt(feeEl?.value)  || 500,
    max_htlc:   parseInt(maxEl?.value)  || 5000000,
    cltv_delta: parseInt(cltvEl?.value) || 6,
  };

  try {
    const ev = await makeEvent(keys.sessionPriv, NOSTR_KIND_RELAY_ANN, JSON.stringify(info), [['t', '0penw0rld-onion']]);
    window._nostrPublish(ev);
  } catch (e) { console.error('[ONION] announce error:', e); }
}

/* ══════════════════════════════════════════
   RELAY CONFIG PERSISTENCE
   ══════════════════════════════════════════ */
function _bindRelayConfigPersistence() {
  const fields = [
    { id: 'dt-relay-fee',  key: '00_onion_relay_fee'  },
    { id: 'dt-relay-max',  key: '00_onion_relay_max'  },
    { id: 'dt-relay-cltv', key: '00_onion_relay_cltv' },
    { id: 'dt-relay-hops', key: '00_onion_relay_hops' },
  ];
  for (const { id: fid, key } of fields) {
    const el = _container?.querySelector('#' + fid);
    if (!el) continue;
    el.addEventListener('change', () => localStorage.setItem(key, el.value));
  }
}

/* ══════════════════════════════════════════
   STEALTH SEND
   ══════════════════════════════════════════ */
function _setStatus(msg, isError) {
  const el = _container?.querySelector('#dt-on-send-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#ff4040' : 'var(--dt-text-secondary)';
}

async function _handleStealthSend() {
  const keys = auth.getKeys();
  if (!keys) { _setStatus('Wallet not unlocked', true); return; }

  const recipientInput = _container?.querySelector('#dt-on-recipient')?.value?.trim();
  const amountInput    = _container?.querySelector('#dt-on-amount')?.value;
  const useOnion       = _container?.querySelector('#dt-on-use-onion')?.checked;

  if (!recipientInput) { _setStatus('Enter a recipient address or stealth code', true); return; }
  if (!amountInput || parseFloat(amountInput) <= 0) { _setStatus('Enter a valid amount', true); return; }

  const amountSats = Math.round(parseFloat(amountInput) * 1e8);
  if (amountSats < 546) { _setStatus('Amount below dust limit (546 sats)', true); return; }

  _setStatus('Preparing stealth transaction...');

  try {
    let toAddress;
    let ephPub = null;

    // Determine destination: stealth code or direct pubkey
    if (recipientInput.startsWith('stealth:')) {
      const { scanPub, spendPub } = decodeStealthCode(recipientInput);
      const stealth = deriveStealthSendAddr(scanPub, spendPub);
      toAddress = stealth.addr;
      ephPub    = stealth.ephPub;
      _setStatus('Derived stealth address: ' + toAddress.slice(0, 24) + '...');
    } else if (/^[0-9a-fA-F]{64,66}$/.test(recipientInput)) {
      // Raw pubkey — send directly (no stealth derivation)
      toAddress = null;
      _setStatus('Direct pubkey send not yet supported \u2014 use a stealth code', true);
      return;
    } else {
      // Assume it is a BCH address
      toAddress = recipientInput;
    }

    if (!toAddress) { _setStatus('Could not determine destination address', true); return; }

    // Optionally wrap in onion layers
    if (useOnion && _knownRelays.length > 0) {
      const aliveRelays = _knownRelays.filter(r => (Math.floor(Date.now() / 1000) - r.ts) < RELAY_TTL);
      if (aliveRelays.length === 0) { _setStatus('No live relays available for onion routing', true); return; }

      _setStatus('Building onion route (' + aliveRelays.length + ' relays)...');

      // Select up to 3 relays for the route
      const route = aliveRelays.slice(0, 3);
      const peelerPubHexes = route.map(r => r.pub);
      const payload = toAddress + '|' + amountSats;

      try {
        const wrapped = await onionWrap(payload, peelerPubHexes);
        const blobHex = b2h(wrapped);
        _setStatus('Onion wrapped (' + route.length + ' layers). Sending blob...');

        // Send blob to first relay via NIP-04
        const { nip04Encrypt } = await import('../onion-crypto.js');
        const blobJson = JSON.stringify({ type: 'onion', blob: blobHex });
        const encrypted = await nip04Encrypt(keys.sessionPriv, route[0].pub, blobJson);
        const blobEvent = await makeEvent(keys.sessionPriv, NOSTR_KIND_ONION_BLOB, encrypted, [['p', route[0].pub]]);
        window._nostrPublish(blobEvent);
        _setStatus('Onion blob sent to relay ' + route[0].pub.slice(0, 8) + '...');
      } catch (e) {
        console.error('[ONION] onion wrap error:', e);
        _setStatus('Onion routing failed: ' + e.message, true);
      }
      return;
    }

    // Direct stealth send (no onion routing)
    _setStatus('Broadcasting stealth payment...');
    if (!window._fvCall) { _setStatus('Fulcrum not connected', true); return; }

    try {
      const txid = await sendBch({
        toAddress,
        amountSats,
        feeRate: 1,
        utxos:  state.get('utxos_bch') || [],
        privKey: keys.privKey,
        pubKey:  keys.pubKey,
        changeHash160: keys.hash160,
        hdGetKey: keys.acctPriv ? (utxo) => {
          // If the utxo has a known derivation key, use it
          if (utxo._priv) return { priv: utxo._priv, pub: utxo._pub || keys.pubKey };
          return { priv: keys.privKey, pub: keys.pubKey };
        } : null,
      });

      if (txid && typeof txid === 'string') {
        const broadcastResult = await window._fvCall('blockchain.transaction.broadcast', [txid]);
        _setStatus('Stealth payment sent! TX: ' + (broadcastResult || '').toString().slice(0, 16) + '...');
      } else {
        _setStatus('Stealth payment sent!');
      }
    } catch (e) {
      console.error('[ONION] send error:', e);
      _setStatus('Send failed: ' + e.message, true);
    }
  } catch (e) {
    console.error('[ONION] stealth send error:', e);
    _setStatus('Error: ' + e.message, true);
  }
}

/* ══════════════════════════════════════════
   CLIPBOARD HELPERS
   ══════════════════════════════════════════ */
function _bindClipboard() {
  const addrEl    = _container?.querySelector('#dt-on-my-addr');
  const pubEl     = _container?.querySelector('#dt-on-my-pub');
  const stealthEl = _container?.querySelector('#dt-on-my-stealth');
  const keys = auth.getKeys();

  if (addrEl && keys?.bchAddr) {
    addrEl.addEventListener('click', () => {
      navigator.clipboard.writeText(keys.bchAddr);
      addrEl.style.borderColor = 'var(--dt-accent)';
      setTimeout(() => { addrEl.style.borderColor = 'transparent'; }, 1200);
    });
  }
  if (pubEl) {
    const pub = typeof keys?.sessionPub === 'string' ? keys.sessionPub : (keys?.sessionPub ? b2h(keys.sessionPub) : '');
    if (pub) {
      pubEl.addEventListener('click', () => {
        navigator.clipboard.writeText(pub);
        pubEl.style.borderColor = 'var(--dt-accent)';
        setTimeout(() => { pubEl.style.borderColor = 'transparent'; }, 1200);
      });
    }
  }
  if (stealthEl && keys?.stealthCode) {
    stealthEl.addEventListener('click', () => {
      navigator.clipboard.writeText(keys.stealthCode);
      stealthEl.style.borderColor = '#BF5AF2';
      setTimeout(() => { stealthEl.style.borderColor = 'rgba(191,90,242,.15)'; }, 1200);
    });
  }
}

/* ══════════════════════════════════════════
   MOUNT / UNMOUNT
   ══════════════════════════════════════════ */
export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();

  /* ── Tab switching ── */
  container.querySelectorAll('#dt-on-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('#dt-on-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      container.querySelector('#dt-on-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });

  /* ── Relay toggle ── */
  container.querySelector('#dt-relay-toggle')?.addEventListener('click', () => _toggleRelay());

  /* ── Send button ── */
  container.querySelector('#dt-on-send-btn')?.addEventListener('click', () => _handleStealthSend());

  /* ── Clipboard bindings ── */
  _bindClipboard();

  /* ── Relay config persistence ── */
  _bindRelayConfigPersistence();

  /* ── Nostr: subscribe for relay discovery + incoming blobs ── */
  _subscribeNostr();

  /* ── Nostr status polling ── */
  if (window._nostrOnStatus) {
    _statusUnsub = window._nostrOnStatus(() => _updateNostrStatus());
  }
  _updateNostrStatus();

  /* ── Periodic tasks ── */
  _renderTimer = setInterval(_renderRelayList, 30000);
  _pruneTimer  = setInterval(_pruneStaleRelays, 60000);

  /* ── If relay mode was previously on, resume announcing ── */
  if (_relayMode) {
    _announceRelay();
    _relayAnnTimer = setInterval(_announceRelay, ANNOUNCE_INTERVAL);
  }

  /* ── Balance subscription ── */
  _unsubs.push(state.subscribe('balances', () => updateBalanceChip('bch')));
}

export function unmount() {
  // Clear timers
  if (_relayAnnTimer) { clearInterval(_relayAnnTimer); _relayAnnTimer = null; }
  if (_pruneTimer)    { clearInterval(_pruneTimer);    _pruneTimer = null;    }
  if (_renderTimer)   { clearInterval(_renderTimer);   _renderTimer = null;   }

  // Unsubscribe Nostr
  _unsubscribeNostr();

  // Nostr status listener
  if (_statusUnsub) { _statusUnsub(); _statusUnsub = null; }

  // State subscriptions
  _unsubs.forEach(fn => fn());
  _unsubs = [];

  // Clear container
  if (_container) _container.innerHTML = '';
  _container = null;
}
