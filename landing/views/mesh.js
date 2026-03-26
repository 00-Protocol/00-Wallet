/* 00 Wallet — Mesh View (SPA v2) — Full Nostr Social Network */
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { nostrSubscribe, nostrUnsubscribe, nostrPublish, nostrOnStatus } from '../core/nostr-bridge.js';

export const id = 'mesh';
export const title = '00 Mesh';
export const icon = '⬡';
let _container = null, _unsubs = [], _subIds = [], _feed = [], _global = [], _contacts = [], _globalTag = 'bitcoincash', _seenIds = new Set(), _activeDm = null, _globalSubId = null, _globalSubId2 = null;

const RELAYS = JSON.parse(localStorage.getItem('00_ep_relays') || 'null') || ['wss://nos.lol','wss://relay.damus.io','wss://relay.primal.net'];
let _schnorr, _sha256S, _b2h, _h2b, _utf8, _myPubHex = '', _myPrivHex = '';

async function _lc(){if(_schnorr)return;const[c,h]=await Promise.all([import('https://esm.sh/@noble/curves@1.8.1/secp256k1'),import('https://esm.sh/@noble/hashes@1.7.1/sha256')]);_schnorr=c.schnorr;_sha256S=h.sha256;_b2h=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');_h2b=h=>new Uint8Array(h.match(/.{2}/g).map(x=>parseInt(x,16)));_utf8=s=>new TextEncoder().encode(s);}
async function _makeEv(kind,content,tags=[]){await _lc();const p=_h2b(_myPrivHex),pub=_b2h(_schnorr.getPublicKey(p)),ca=Math.floor(Date.now()/1000),pre=JSON.stringify([0,pub,ca,kind,tags,content]),eid=_b2h(_sha256S(_utf8(pre))),sig=_b2h(_schnorr.sign(eid,p));return{id:eid,pubkey:pub,created_at:ca,kind,tags,content,sig};}

/* ── NIP-04 ── */
async function _nip04Enc(pubHex, msg) {
  await _lc();
  const { secp256k1 } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
  const shared = secp256k1.getSharedSecret(_h2b(_myPrivHex), _h2b('02' + pubHex)).slice(1, 33);
  const key = await crypto.subtle.importKey('raw', shared, { name: 'AES-CBC' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, _utf8(msg)));
  return btoa(String.fromCharCode(...ct)) + '?iv=' + btoa(String.fromCharCode(...iv));
}
async function _nip04Dec(pubHex, enc) {
  await _lc();
  const [ctB64, ivB64] = enc.split('?iv=');
  const { secp256k1 } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
  const shared = secp256k1.getSharedSecret(_h2b(_myPrivHex), _h2b('02' + pubHex)).slice(1, 33);
  const key = await crypto.subtle.importKey('raw', shared, { name: 'AES-CBC' }, false, ['decrypt']);
  const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/* ── Nostr via shared bridge (no direct WebSockets) ── */
function _pub(ev) { nostrPublish(ev); }

async function _startSubscriptions() {
  // Clean previous subs
  for (const sid of _subIds) nostrUnsubscribe(sid);
  _subIds = [];

  const since = Math.floor(Date.now() / 1000) - 86400;
  const authors = [_myPubHex, ..._contacts.map(c => c.pubHex)].filter(Boolean);

  try {
    // Feed: kind 1 from self + contacts (or recent global if no contacts)
    const feedFilter = authors.length > 1
      ? { kinds: [1], authors, since, limit: 50 }
      : { kinds: [1], since, limit: 20 }; // Show recent global when no contacts
    const sid = await nostrSubscribe([feedFilter], ev => {
      if (_seenIds.has(ev.id)) return; _seenIds.add(ev.id);
      if (ev.kind === 1) { _feed.push(ev); _feed.sort((a, b) => b.created_at - a.created_at); if (_feed.length > 100) _feed.length = 100; _renderFeed(); }
    });
    if (sid) _subIds.push(sid);

    // DMs (only if we have a pubkey)
    if (_myPubHex) {
      const dmInSid = await nostrSubscribe([{ kinds: [4], '#p': [_myPubHex], since, limit: 50 }], ev => {
        if (_seenIds.has(ev.id)) return; _seenIds.add(ev.id);
        if (ev.kind === 4) _handleDm(ev);
      });
      if (dmInSid) _subIds.push(dmInSid);

      const dmOutSid = await nostrSubscribe([{ kinds: [4], authors: [_myPubHex], since, limit: 50 }], ev => {
        if (_seenIds.has(ev.id)) return; _seenIds.add(ev.id);
        if (ev.kind === 4) _handleDm(ev);
      });
      if (dmOutSid) _subIds.push(dmOutSid);
    }
  } catch (e) { console.warn('[mesh] feed/dm sub error:', e); }

  // Global tag (always subscribe, even if feed fails)
  await _subscribeGlobal();
  console.log('[mesh] subscriptions started:', _subIds.length, 'subs, pubHex:', _myPubHex?.slice(0, 12));
}

async function _subscribeGlobal() {
  // Unsubscribe old global subs
  if (_globalSubId) { nostrUnsubscribe(_globalSubId); _globalSubId = null; }
  if (_globalSubId2) { nostrUnsubscribe(_globalSubId2); _globalSubId2 = null; }

  const since = Math.floor(Date.now() / 1000) - 86400;
  const tag = _globalTag.toLowerCase();

  const _onGlobalEvent = ev => {
    if (_seenIds.has(ev.id)) return; _seenIds.add(ev.id);
    if (ev.kind !== 1) return;
    // Check tags array OR content for #hashtag
    const hasTTag = (ev.tags || []).some(t => t[0] === 't' && t[1]?.toLowerCase() === tag);
    const hasInContent = ev.content?.toLowerCase().includes('#' + tag);
    if (!hasTTag && !hasInContent) return;
    _global.push(ev);
    _global.sort((a, b) => b.created_at - a.created_at);
    if (_global.length > 200) _global.length = 200;
    _renderGlobal();
  };

  // Strategy 1: Use relay-side #t filter (best results when relay supports it)
  const since7d = Math.floor(Date.now() / 1000) - 7 * 86400;
  _globalSubId = await nostrSubscribe([{ kinds: [1], '#t': [tag], limit: 200, since: since7d }], _onGlobalEvent);
  if (_globalSubId) _subIds.push(_globalSubId);

  // Strategy 2: Also subscribe to broad recent events and filter client-side
  _globalSubId2 = await nostrSubscribe([{ kinds: [1], limit: 200, since }], _onGlobalEvent);
  if (_globalSubId2) _subIds.push(_globalSubId2);

  // After 8 seconds, if still no posts, show "no posts" instead of "loading"
  setTimeout(() => {
    if (_global.length === 0) _renderGlobal();
  }, 8000);
}

async function _handleDm(ev) {
  const isIncoming = ev.pubkey !== _myPubHex;
  const peerPub = isIncoming ? ev.pubkey : (ev.tags.find(t => t[0] === 'p')?.[1] || '');
  if (!peerPub) return;
  let contact = _contacts.find(c => c.pubHex === peerPub);
  if (!contact) { contact = { name: peerPub.slice(0, 8) + '…', pubHex: peerPub, msgs: [], unread: 0 }; _contacts.push(contact); }
  let text = '';
  try { text = await _nip04Dec(peerPub, ev.content); } catch { text = '[encrypted]'; }
  contact.msgs.push({ text, from: ev.pubkey, ts: ev.created_at });
  contact.msgs.sort((a, b) => a.ts - b.ts);
  if (isIncoming && _activeDm !== peerPub) contact.unread = (contact.unread || 0) + 1;
  _saveContacts();
  _renderDmList();
  if (_activeDm === peerPub) _renderDmConv();
}

/* ── Contacts ── */
function _loadContacts() { try { _contacts = JSON.parse(localStorage.getItem('00mesh_contacts') || '[]'); } catch { _contacts = []; } }
function _saveContacts() { localStorage.setItem('00mesh_contacts', JSON.stringify(_contacts.map(c => ({ name: c.name, pubHex: c.pubHex, msgs: (c.msgs || []).slice(-100), unread: c.unread || 0 })))); }

/* ── Time ago ── */
function _ago(ts) { const d = Math.floor(Date.now() / 1000) - ts; if (d < 60) return 'now'; if (d < 3600) return Math.floor(d / 60) + 'm'; if (d < 86400) return Math.floor(d / 3600) + 'h'; return Math.floor(d / 86400) + 'd'; }
function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

/* ── Avatar color from pubkey ── */
function _pubColor(pub) {
  if (!pub) return '#64748b';
  const h = parseInt(pub.slice(0, 6), 16);
  const colors = ['#0AC18E','#627EEA','#F7931A','#BF5AF2','#FF6600','#E84142','#9945FF','#14B6E7','#f0a500','#FF0013'];
  return colors[h % colors.length];
}

function _renderPost(ev, accent) {
  const col = accent || _pubColor(ev.pubkey);
  const name = _contacts.find(c => c.pubHex === ev.pubkey)?.name || ev.pubkey?.slice(0, 10) + '…';
  const isMine = ev.pubkey === _myPubHex;
  const content = _esc(ev.content)
    .replace(/#(\w+)/g, '<span style="color:var(--dt-accent);font-weight:600">#$1</span>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" style="color:var(--dt-accent);text-decoration:none">$1</a>');
  const truncated = content.length > 400 ? content.slice(0, 400) + '…' : content;

  return `<div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:18px 20px;margin-bottom:12px;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 12px rgba(0,0,0,.06)'" onmouseout="this.style.boxShadow='none'">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <div style="width:40px;height:40px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;flex-shrink:0">${(ev.pubkey || '??').slice(0, 2).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;color:var(--dt-text)">${_esc(isMine ? 'You' : name)}</div>
        <div style="font-size:11px;color:var(--dt-text-secondary);font-family:monospace">${ev.pubkey?.slice(0, 16)}…</div>
      </div>
      <div style="font-size:12px;color:var(--dt-text-secondary);font-weight:500;flex-shrink:0">${_ago(ev.created_at)}</div>
    </div>
    <div style="font-size:14px;color:var(--dt-text);line-height:1.7;word-break:break-word">${truncated}</div>
    <div style="display:flex;gap:16px;margin-top:12px;padding-top:10px;border-top:1px solid var(--dt-border)">
      <button style="background:none;border:none;font-size:12px;color:var(--dt-text-secondary);cursor:pointer;padding:0;display:flex;align-items:center;gap:4px" onclick="navigator.clipboard.writeText('${ev.id || ''}')">📋 Copy ID</button>
      ${!isMine ? `<button style="background:none;border:none;font-size:12px;color:var(--dt-text-secondary);cursor:pointer;padding:0;display:flex;align-items:center;gap:4px" data-dmpub="${ev.pubkey}">💬 DM</button>` : ''}
    </div>
  </div>`;
}

/* ── Renderers ── */
function _renderFeed() {
  const el = document.getElementById('dt-mesh-feed'); if (!el) return;
  if (!_feed.length) { el.innerHTML = '<div class="dt-empty" style="padding:40px 0"><div class="dt-empty-icon" style="font-size:32px">◈</div><div class="dt-empty-text">No posts yet</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Follow people or post something!</div></div>'; return; }
  el.innerHTML = _feed.slice(0, 50).map(ev => _renderPost(ev)).join('');
  // Bind DM buttons
  el.querySelectorAll('[data-dmpub]').forEach(b => b.addEventListener('click', () => {
    const pub = b.dataset.dmpub;
    if (!_contacts.some(c => c.pubHex === pub)) { _contacts.push({ name: pub.slice(0, 10) + '…', pubHex: pub, msgs: [], unread: 0 }); _saveContacts(); }
    _openDm(pub);
    // Switch to DMs tab
    document.querySelectorAll('#dt-mesh-tabs .dt-tab').forEach(x => x.classList.remove('active'));
    document.querySelector('#dt-mesh-tabs .dt-tab[data-tab="dms"]')?.classList.add('active');
    document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('dt-mesh-p-dms')?.classList.add('active');
  }));
}

function _renderGlobal() {
  const el = document.getElementById('dt-mesh-global'); if (!el) return;
  if (!_global.length) { el.innerHTML = '<div class="dt-empty" style="padding:40px 0"><div class="dt-empty-icon" style="font-size:32px">🌐</div><div class="dt-empty-text">No posts for #' + _globalTag + '</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Try another tag or wait for new posts</div></div>'; return; }
  el.innerHTML = _global.slice(0, 50).map(ev => _renderPost(ev, '#627EEA')).join('');
  el.querySelectorAll('[data-dmpub]').forEach(b => b.addEventListener('click', () => {
    const pub = b.dataset.dmpub;
    if (!_contacts.some(c => c.pubHex === pub)) { _contacts.push({ name: pub.slice(0, 10) + '…', pubHex: pub, msgs: [], unread: 0 }); _saveContacts(); }
    _openDm(pub);
    document.querySelectorAll('#dt-mesh-tabs .dt-tab').forEach(x => x.classList.remove('active'));
    document.querySelector('#dt-mesh-tabs .dt-tab[data-tab="dms"]')?.classList.add('active');
    document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('dt-mesh-p-dms')?.classList.add('active');
  }));
}

function _renderDmList() {
  const el = document.getElementById('dt-mesh-dm-list'); if (!el) return;
  if (!_contacts.length) { el.innerHTML = '<div class="dt-empty"><div class="dt-empty-text" style="font-size:12px">No conversations</div></div>'; return; }
  el.innerHTML = _contacts.filter(c => c.msgs?.length).map(c => {
    const last = c.msgs[c.msgs.length - 1];
    const unread = c.unread ? `<span style="background:var(--dt-accent);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;margin-left:auto">${c.unread}</span>` : '';
    return `<div class="dt-row" style="cursor:pointer;padding:10px 0" data-pub="${c.pubHex}">
      <div class="dt-row-left"><div class="dt-row-icon" style="background:rgba(10,193,142,.1)"><span style="color:var(--dt-accent)">${c.name?.slice(0, 2).toUpperCase() || '?'}</span></div>
      <div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span class="dt-row-title">${_esc(c.name || c.pubHex.slice(0, 12))}</span>${unread}</div><div class="dt-row-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${last ? _esc(last.text).slice(0, 40) : ''}</div></div></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.dt-row').forEach(row => row.addEventListener('click', () => { _openDm(row.dataset.pub); }));
}

function _openDm(pubHex) {
  _activeDm = pubHex;
  const contact = _contacts.find(c => c.pubHex === pubHex);
  if (contact) { contact.unread = 0; _saveContacts(); }
  document.getElementById('dt-mesh-dm-header').style.display = '';
  document.getElementById('dt-mesh-dm-input-wrap').style.display = 'flex';
  document.getElementById('dt-mesh-dm-name').textContent = contact?.name || pubHex.slice(0, 12) + '…';
  _renderDmConv();
  _renderDmList();
}

function _renderDmConv() {
  const el = document.getElementById('dt-mesh-dm-messages'); if (!el || !_activeDm) return;
  const contact = _contacts.find(c => c.pubHex === _activeDm);
  if (!contact?.msgs?.length) { el.innerHTML = '<div style="text-align:center;color:var(--dt-text-secondary);padding:40px">No messages yet</div>'; return; }
  el.innerHTML = contact.msgs.map(m => {
    const isMine = m.from === _myPubHex;
    return `<div style="display:flex;justify-content:${isMine ? 'flex-end' : 'flex-start'};margin-bottom:8px">
      <div style="max-width:70%;padding:10px 14px;border-radius:${isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px'};background:${isMine ? 'var(--dt-accent)' : 'var(--dt-bg)'};color:${isMine ? '#fff' : 'var(--dt-text)'};font-size:13px;line-height:1.5">${_esc(m.text)}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function _updateRelayUI(status) {
  const el = document.getElementById('dt-mesh-relays'); if (!el) return;
  const st = status || { relays: RELAYS.map(url => ({ url, connected: false })) };
  el.innerHTML = st.relays.map(r => {
    return `<div class="dt-row"><div class="dt-row-left"><div class="dt-row-icon" style="background:${r.connected ? 'rgba(10,193,142,.1)' : 'rgba(239,68,68,.1)'}"><span style="color:${r.connected ? 'var(--dt-accent)' : 'var(--dt-danger)'}">●</span></div><div><div class="dt-row-title">${r.url}</div><div class="dt-row-sub">${r.connected ? 'Connected' : 'Disconnected'}</div></div></div></div>`;
  }).join('');
}

function _setGlobalTag(tag) {
  _globalTag = tag;
  _global = [];
  _seenIds = new Set(); // Reset dedup so new tag sub receives all events fresh
  document.querySelectorAll('.dt-tag-btn').forEach(b => b.classList.toggle('active', b.dataset.tag === tag));
  _subscribeGlobal();
  _renderGlobal();
}

/* ── Template ── */
function _template() {
  const tags = ['bitcoincash','bch','privacy','cypherpunk','nostr','freedom'];
  return `<div style="padding:32px 40px">
    <div class="dt-page-header"><div class="dt-page-title-wrap"><div class="dt-page-icon">◈</div><div><div class="dt-page-title">Mesh</div><div class="dt-page-sub">Nostr Social Network</div></div></div>
      <div class="dt-page-actions"><button class="dt-action-btn-outline" style="width:auto;padding:6px 14px;font-size:11px" id="dt-mesh-id">◈ Identity</button><button class="dt-action-btn-outline" style="width:auto;padding:6px 14px;font-size:11px" id="dt-mesh-add">+ Contact</button></div></div>
    <div class="dt-tabs" id="dt-mesh-tabs"><button class="dt-tab active" data-tab="feed">Feed</button><button class="dt-tab" data-tab="dms">DMs</button><button class="dt-tab" data-tab="global">Global</button><button class="dt-tab" data-tab="relays">Relays</button></div>

    <div class="dt-pane active" id="dt-mesh-p-feed">
      <div style="background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:14px;padding:18px 20px;margin-bottom:20px">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--dt-accent);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;flex-shrink:0">Y</div>
          <div style="flex:1">
            <textarea class="dt-form-input" id="dt-mesh-compose" rows="3" placeholder="What's on your mind?" style="border:none;padding:0;resize:none;font-size:14px;line-height:1.6;background:transparent"></textarea>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--dt-border)">
              <span style="font-size:11px;color:var(--dt-text-secondary)"><span id="dt-mesh-chars">0</span>/280</span>
              <button class="dt-action-btn" style="width:auto;padding:8px 24px;background:var(--dt-accent);font-size:13px;border-radius:20px" id="dt-mesh-post">Post →</button>
            </div>
          </div>
        </div>
      </div>
      <div id="dt-mesh-feed"><div class="dt-empty"><div class="dt-empty-icon">◈</div><div class="dt-empty-text">Loading feed...</div></div></div>
    </div>

    <div class="dt-pane" id="dt-mesh-p-dms">
      <div style="display:flex;gap:20px;min-height:400px">
        <div style="width:280px;flex-shrink:0"><div class="dt-card" style="height:100%"><div class="dt-card-title">Conversations</div><div id="dt-mesh-dm-list"><div class="dt-empty"><div class="dt-empty-text" style="font-size:12px">No conversations</div></div></div></div></div>
        <div style="flex:1"><div class="dt-card" style="height:100%;display:flex;flex-direction:column">
          <div id="dt-mesh-dm-header" style="display:none;padding-bottom:12px;border-bottom:1px solid var(--dt-border);margin-bottom:12px"><div style="font-size:14px;font-weight:600;color:var(--dt-text)" id="dt-mesh-dm-name">—</div></div>
          <div id="dt-mesh-dm-messages" style="flex:1;overflow-y:auto;min-height:300px;display:flex;align-items:center;justify-content:center"><div style="color:var(--dt-text-secondary)">Select a conversation</div></div>
          <div id="dt-mesh-dm-input-wrap" style="display:none;padding-top:12px;border-top:1px solid var(--dt-border);gap:8px"><input class="dt-form-input" id="dt-mesh-dm-input" placeholder="Type a message..." style="flex:1"><button class="dt-action-btn" style="width:auto;padding:10px 20px;background:var(--dt-accent)" id="dt-mesh-dm-send">Send</button></div>
        </div></div>
      </div>
    </div>

    <div class="dt-pane" id="dt-mesh-p-global">
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
        ${tags.map(t => `<button class="dt-toggle-btn dt-tag-btn${t === _globalTag ? ' active' : ''}" data-tag="${t}" style="font-size:11px;padding:6px 12px">#${t}</button>`).join('')}
        <div style="display:flex;gap:8px;flex:1;min-width:200px"><input class="dt-form-input" id="dt-mesh-custom-tag" placeholder="Custom tag..." style="flex:1;font-size:11px"><button class="dt-action-btn" id="dt-mesh-search-tag" style="width:auto;padding:6px 14px;font-size:11px;background:var(--dt-accent)">Search</button></div>
      </div>
      <div id="dt-mesh-global"><div class="dt-empty"><div class="dt-empty-text">Loading #${_globalTag}...</div></div></div>
    </div>

    <div class="dt-pane" id="dt-mesh-p-relays"><div class="dt-card"><div class="dt-card-title">Connected Relays</div><div id="dt-mesh-relays"><div class="dt-empty"><div class="dt-empty-text">Connecting...</div></div></div></div></div>

    <!-- Add Contact overlay -->
    <div id="dt-mesh-add-overlay" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.4);align-items:center;justify-content:center">
      <div class="dt-card" style="width:400px;padding:28px"><div style="display:flex;justify-content:space-between;margin-bottom:16px"><span style="font-size:15px;font-weight:700;color:var(--dt-text)">Add Contact</span><button id="dt-mesh-add-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--dt-text-secondary)">×</button></div>
        <div class="dt-form-group"><div class="dt-form-lbl">NPUB OR HEX PUBKEY</div><input class="dt-form-input" id="dt-mesh-add-pub" placeholder="npub1... or hex..."></div>
        <div class="dt-form-group"><div class="dt-form-lbl">NAME (OPTIONAL)</div><input class="dt-form-input" id="dt-mesh-add-name" placeholder="Display name"></div>
        <div id="dt-mesh-add-err" style="font-size:12px;color:var(--dt-danger);min-height:16px;margin-bottom:8px"></div>
        <button class="dt-action-btn" id="dt-mesh-add-save" style="background:var(--dt-accent)">+ Add Contact</button>
      </div>
    </div>
  </div>`;
}

function _bind() {
  // Tabs
  document.querySelectorAll('#dt-mesh-tabs .dt-tab').forEach(b => { b.addEventListener('click', () => { document.querySelectorAll('#dt-mesh-tabs .dt-tab').forEach(x => x.classList.remove('active')); b.classList.add('active'); document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active')); document.getElementById('dt-mesh-p-' + b.dataset.tab)?.classList.add('active'); }); });
  // Char counter
  document.getElementById('dt-mesh-compose')?.addEventListener('input', e => { document.getElementById('dt-mesh-chars').textContent = e.target.value.length; });
  // Post
  document.getElementById('dt-mesh-post')?.addEventListener('click', async () => {
    const txt = document.getElementById('dt-mesh-compose')?.value.trim();
    if (!txt || txt.length > 280) return;
    const tags = [...txt.matchAll(/#(\w+)/g)].map(m => ['t', m[1].toLowerCase()]);
    const ev = await _makeEv(1, txt, tags);
    _pub(ev);
    _feed.unshift(ev); _renderFeed();
    document.getElementById('dt-mesh-compose').value = '';
    document.getElementById('dt-mesh-chars').textContent = '0';
  });
  // Global tags
  document.querySelectorAll('.dt-tag-btn').forEach(b => b.addEventListener('click', () => _setGlobalTag(b.dataset.tag)));
  document.getElementById('dt-mesh-search-tag')?.addEventListener('click', () => { const v = document.getElementById('dt-mesh-custom-tag')?.value.trim().replace('#', ''); if (v) _setGlobalTag(v); });
  // DM send
  document.getElementById('dt-mesh-dm-send')?.addEventListener('click', async () => {
    const input = document.getElementById('dt-mesh-dm-input');
    const txt = input?.value.trim();
    if (!txt || !_activeDm) return;
    const enc = await _nip04Enc(_activeDm, txt);
    const ev = await _makeEv(4, enc, [['p', _activeDm]]);
    _pub(ev);
    const contact = _contacts.find(c => c.pubHex === _activeDm);
    if (contact) { contact.msgs.push({ text: txt, from: _myPubHex, ts: Math.floor(Date.now() / 1000) }); _saveContacts(); }
    _renderDmConv();
    input.value = '';
  });
  document.getElementById('dt-mesh-dm-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('dt-mesh-dm-send')?.click(); });
  // Identity + Add
  document.getElementById('dt-mesh-id')?.addEventListener('click', () => navigate('id'));
  document.getElementById('dt-mesh-add')?.addEventListener('click', () => { document.getElementById('dt-mesh-add-overlay').style.display = 'flex'; });
  document.getElementById('dt-mesh-add-close')?.addEventListener('click', () => { document.getElementById('dt-mesh-add-overlay').style.display = 'none'; });
  document.getElementById('dt-mesh-add-save')?.addEventListener('click', () => {
    let pub = document.getElementById('dt-mesh-add-pub')?.value.trim();
    const name = document.getElementById('dt-mesh-add-name')?.value.trim();
    const err = document.getElementById('dt-mesh-add-err');
    if (!pub) { err.textContent = 'Pubkey required'; return; }
    if (pub.startsWith('npub1')) { try { const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'; const d5 = []; for (const c of pub.slice(5)) d5.push(CH.indexOf(c)); const d8 = []; let ac = 0, bi = 0; for (const v of d5.slice(0, -6)) { ac = (ac << 5) | v; bi += 5; while (bi >= 8) { bi -= 8; d8.push((ac >> bi) & 0xff); } } pub = d8.map(b => b.toString(16).padStart(2, '0')).join(''); } catch { err.textContent = 'Invalid npub'; return; } }
    if (pub.length !== 64) { err.textContent = 'Invalid pubkey (64 hex chars)'; return; }
    if (_contacts.some(c => c.pubHex === pub)) { err.textContent = 'Already added'; return; }
    _contacts.push({ name: name || pub.slice(0, 12) + '…', pubHex: pub, msgs: [], unread: 0 });
    _saveContacts();
    document.getElementById('dt-mesh-add-overlay').style.display = 'none';
    // Resubscribe to include new contact
    _startSubscriptions();
    _renderDmList();
  });
}

export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  const keys = auth.getKeys();
  // Nostr uses x-only pubkeys (32 bytes = 64 hex), strip the 02/03 prefix
  const rawPub = keys?.sessionPub || '';
  _myPubHex = rawPub.length === 66 ? rawPub.slice(2) : rawPub;
  _myPrivHex = keys?.sessionPriv ? _b2h_sync(keys.sessionPriv) : '';
  _loadContacts();
  container.innerHTML = _template();
  _bind();
  // Subscribe to Nostr events via shared bridge
  _startSubscriptions();
  // Listen to relay status
  const unsubStatus = nostrOnStatus(_updateRelayUI);
  _unsubs.push(unsubStatus);
  _renderDmList();
}

function _b2h_sync(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }

export function unmount() {
  // Unsubscribe from Nostr (connections stay alive in the bridge)
  for (const sid of _subIds) nostrUnsubscribe(sid);
  _subIds = []; _feed = []; _global = []; _seenIds = new Set(); _activeDm = null;
  _unsubs.forEach(fn => fn()); _unsubs = [];
  if (_container) _container.innerHTML = ''; _container = null;
}
