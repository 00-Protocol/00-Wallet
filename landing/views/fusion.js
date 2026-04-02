/* ══════════════════════════════════════════
   00 Wallet — Fusion View (SPA v2) — CoinJoin Privacy Mixing
   ══════════════════════════════════════════
   Full port of fusion.html v1 Joiner protocol into v2 SPA module.
   Pool discovery (kind 22230), CoinJoin rounds via NIP-59 gift wrap,
   onion-encrypted blind outputs, multi-input/multi-output combinatorial mix,
   self-stealth addresses, blame protocol, auto-mix pipelining.
   ══════════════════════════════════════════ */
import * as state from '../core/state.js';
import * as auth  from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, statusDotsHtml, infoBtn, updateBalanceChip, setDotStatus } from '../core/ui-helpers.js';
import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';
import {
  onionPeel, onionWrap, onionUnpad,
  giftWrap, giftUnwrap,
  b2h, h2b, rand, concat
} from '../onion-crypto.js';
import { pubHashToCashAddr, cashAddrToHash20 } from '../core/cashaddr.js';
import { bip32Child } from '../core/hd.js';
import { p2pkhScript, bchSighash, serializeTx } from '../core/bch-tx.js';
import { u32LE, satsToBch, showToast } from '../core/utils.js';

export const id    = 'fusion';
export const title = '00 Fusion';
export const icon  = '\u2697';

/* ──────────────────────────────────────────
   CONSTANTS
   ────────────────────────────────────────── */
const NOSTR_KIND_POOL      = 22230;
const NOSTR_KIND_JOINER    = 22231;
const PHASE_TIMEOUT        = 60000;
const MIN_PARTICIPANTS     = 2;
const MIN_MIX_SATS         = 3000;
const POOL_WAIT_MIN        = 30000;   // 30s min wait after 2+ peers
const POOL_WAIT_MAX        = 120000;  // 120s max wait
const POOL_PEER_TTL        = 300000;  // 5 min peer freshness
const N_SECP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

/* ──────────────────────────────────────────
   MODULE STATE
   ────────────────────────────────────────── */
let _container  = null;
let _unsubs     = [];

// Nostr subscriptions
let _poolSub    = null;
let _roundSub   = null;

// P2P pool discovery
let _poolPeers     = [];  // [{ephPub, utxo_count, output_count, ts}]
let _poolTimer     = null; // random wait timer
let _poolJoined    = false;

// Ephemeral round identity
let _roundPriv = null;    // Uint8Array(32)
let _roundPub  = null;    // hex string (x-only 32 bytes)

// Mix state
let _activeMix   = null;
let _mixHistory  = [];
let _phaseTimer  = null;
let _msgBuffer   = [];

// UTXO state
let _utxos       = [];
let _balanceSats  = 0;
let _hdScannedAddrs = [];
let _hdKeyMap     = {};

// Auto-mix
let _autoMix             = false;
let _autoMixRoundsTarget = 3;
let _autoMixRoundsCompleted = 0;
let _pipelining          = false;

// Nostr event dedup
const _seenEvents = new Set();

/* ──────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function randomSplit(totalSats, n) {
  const MIN_OUT = 546;
  if (totalSats < MIN_OUT * n) return null;
  if (n === 1) return [totalSats];
  const pool = totalSats - MIN_OUT * n;
  const w = []; for (let i = 0; i < n; i++) w.push(Math.random() + 0.1);
  const wSum = w.reduce((s, v) => s + v, 0);
  const amounts = w.map(v => MIN_OUT + Math.floor(v / wSum * pool));
  const used = amounts.reduce((s, v) => s + v, 0);
  amounts[Math.floor(Math.random() * n)] += totalSats - used;
  return amounts;
}

function p2pkhAddrScript(cashAddr) {
  return p2pkhScript(cashAddrToHash20(cashAddr));
}

async function addrToScriptHash(addr) {
  const raw = cashAddrToHash20(addr);
  const script = new Uint8Array([0x76, 0xa9, 0x14, ...raw, 0x88, 0xac]);
  const hash = await crypto.subtle.digest('SHA-256', script);
  const bytes = new Uint8Array(hash);
  return b2h(bytes.reverse());
}

/* ──────────────────────────────────────────
   SELF-STEALTH ADDRESSES (fusion outputs)
   ────────────────────────────────────────── */
function _deriveSelfStealth(keys, inputPriv, inputOutpoint, outputIdx) {
  const shared = secp256k1.getSharedSecret(inputPriv, keys.stealthScanPub);
  const sharedX = shared.slice(1, 33);
  const nonce = concat(inputOutpoint, u32LE(outputIdx));
  const c = sha256(concat(sha256(sharedX), nonce));
  const cBig = BigInt('0x' + b2h(c)) % N_SECP;
  const spendPoint = secp256k1.ProjectivePoint.fromHex(keys.stealthSpendPub);
  const tweakPoint = secp256k1.ProjectivePoint.BASE.multiply(cBig);
  const stealthPoint = spendPoint.add(tweakPoint);
  const stealthPub = stealthPoint.toRawBytes(true);
  const addr = pubHashToCashAddr(ripemd160(sha256(stealthPub)));
  const bBig = BigInt('0x' + b2h(keys.stealthSpendPriv));
  const pBig = (bBig + cBig) % N_SECP;
  const spendKey = h2b(pBig.toString(16).padStart(64, '0'));
  return { addr, pub: stealthPub, priv: spendKey };
}

function _saveFusionStealthUtxo(addr, priv, pub) {
  const existing = JSON.parse(localStorage.getItem('00stealth_utxos') || '[]');
  existing.push({ addr, priv: b2h(priv), pub: b2h(pub), from: 'fusion', ts: Math.floor(Date.now() / 1000) });
  localStorage.setItem('00stealth_utxos', JSON.stringify(existing));
}

/* ──────────────────────────────────────────
   HD ADDRESS SCANNING
   ────────────────────────────────────────── */
async function _scanHdAddrs(keys) {
  _hdScannedAddrs = [keys.bchAddr];
  _hdKeyMap = {};
  _hdKeyMap[keys.bchAddr] = keys.privKey;

  if (!keys.acctPriv || !keys.acctChain) return;

  for (const changeIdx of [0, 1]) {
    const chainNode = bip32Child(keys.acctPriv, keys.acctChain, changeIdx, false);
    let gap = 0;
    for (let batch = 0; batch < 50 && gap < 20; batch += 10) {
      const chunk = [];
      for (let i = batch; i < batch + 10 && i < 50; i++) {
        if (changeIdx === 0 && i === 0) continue;
        const child = bip32Child(chainNode.priv, chainNode.chain, i, false);
        const pub = secp256k1.getPublicKey(child.priv, true);
        const addr = pubHashToCashAddr(ripemd160(sha256(pub)));
        chunk.push({ priv: child.priv, addr });
      }
      if (!chunk.length) continue;
      const results = await Promise.all(chunk.map(async d => {
        const sh = await addrToScriptHash(d.addr);
        const hist = await window._fvCall('blockchain.scripthash.get_history', [sh]);
        return { ...d, hasActivity: hist && hist.length > 0 };
      }));
      for (const r of results) {
        if (r.hasActivity) {
          _hdScannedAddrs.push(r.addr);
          _hdKeyMap[r.addr] = r.priv;
          gap = 0;
        } else { gap++; }
      }
    }
  }

  // Include stealth addresses from wallet
  try {
    const stealthUtxos = JSON.parse(localStorage.getItem('00stealth_utxos') || '[]');
    for (const su of stealthUtxos) {
      if (!su.addr || !su.priv) continue;
      if (_hdScannedAddrs.includes(su.addr)) continue;
      _hdScannedAddrs.push(su.addr);
      _hdKeyMap[su.addr] = h2b(su.priv);
    }
  } catch {}
}

/* ──────────────────────────────────────────
   BALANCE / UTXO REFRESH
   ────────────────────────────────────────── */
let _refreshing = false;

async function _refreshBalance() {
  if (_refreshing || !window._fvCall) return;
  _refreshing = true;
  try {
    const keys = auth.getKeys();
    if (!keys?.bchAddr) return;

    const addrs = _hdScannedAddrs.length > 0 ? _hdScannedAddrs : [keys.bchAddr];
    // Parallel queries with individual timeouts
    const results = await Promise.all(addrs.map(async addr => {
      try {
        const sh = await addrToScriptHash(addr);
        const us = await Promise.race([
          window._fvCall('blockchain.scripthash.listunspent', [sh]),
          new Promise(r => setTimeout(() => r(null), 10000)),
        ]);
        return { addr, utxos: us || [] };
      } catch { return { addr, utxos: [] }; }
    }));

    _utxos = [];
    for (const { addr, utxos } of results) {
      utxos.forEach(u => u._addr = addr);
      _utxos.push(...utxos);
    }
    _balanceSats = _utxos.reduce((s, u) => s + u.value, 0);

    // Fallback: if Fulcrum returned nothing, read from state (set by balance-service)
    if (_balanceSats === 0) {
      const stBal = state.get()?.balances?.bch;
      if (stBal > 0) {
        _balanceSats = stBal;
      }
    }
    state.merge('balances', { bch: _balanceSats });
  } catch (e) {
    console.error('[FUSION] balance error:', e);
    const stBal = state.get()?.balances?.bch;
    if (stBal > 0) _balanceSats = stBal;
  } finally { _refreshing = false; }
}

/* ──────────────────────────────────────────
   EPHEMERAL ROUND IDENTITY
   ────────────────────────────────────────── */
function _generateRoundIdentity() {
  _roundPriv = rand(32);
  _roundPub = b2h(secp256k1.getPublicKey(_roundPriv, true).slice(1));
  _subscribeRound();
}

function _destroyRoundIdentity() {
  if (_roundPriv) { for (let i = 0; i < _roundPriv.length; i++) _roundPriv[i] = 0; }
  _roundPriv = null;
  _roundPub = null;
  _unsubscribeRound();
}

/* ──────────────────────────────────────────
   NOSTR — RELAY DISCOVERY + ROUND SUBS
   ────────────────────────────────────────── */
async function _subscribePool() {
  if (!window._nostrSubscribe) return;
  if (_poolSub) return;
  const now = Math.floor(Date.now() / 1000);
  _poolSub = await window._nostrSubscribe(
    [{ kinds: [NOSTR_KIND_POOL], '#t': ['0penw0rld-joiner-pool'], since: now - 300 }],
    (ev) => _handlePoolEvent(ev)
  );
}

async function _subscribeRound() {
  if (!window._nostrSubscribe || !_roundPub) return;
  _unsubscribeRound();
  const now = Math.floor(Date.now() / 1000);
  _roundSub = await window._nostrSubscribe(
    [{ kinds: [1059], '#p': [_roundPub], since: now - 172800 - 300 }],
    (ev) => _handleGiftWrap(ev)
  );
}

function _unsubscribeRound() {
  if (_roundSub && window._nostrUnsubscribe) {
    window._nostrUnsubscribe(_roundSub);
    _roundSub = null;
  }
}

function _nostrPublish(event) {
  if (window._nostrPublish) {
    try { window._nostrPublish(event); } catch {}
  }
}

/* ──────────────────────────────────────────
   NOSTR EVENT HANDLING
   ────────────────────────────────────────── */
function _handlePoolEvent(ev) {
  if (ev.kind !== NOSTR_KIND_POOL) return;
  if (_seenEvents.has(ev.id)) return;
  _seenEvents.add(ev.id);
  if (_seenEvents.size > 5000) {
    const arr = [..._seenEvents]; _seenEvents.clear();
    for (let i = arr.length - 2500; i < arr.length; i++) _seenEvents.add(arr[i]);
  }
  try {
    const data = JSON.parse(ev.content);
    if (data.type !== 'ready') return;
    const ephPub = data.ephPub;
    if (!ephPub) return;
    // Ignore own event
    if (ephPub === _roundPub) return;
    // Dedup by ephPub
    const existing = _poolPeers.find(p => p.ephPub === ephPub);
    if (existing) { existing.ts = Date.now(); return; }
    _poolPeers.push({ ephPub, utxo_count: data.utxo_count || 0, output_count: data.output_count || 0, ts: Date.now() });
    _renderPool();
    _checkPoolThreshold();
  } catch {}
}

function _checkPoolThreshold() {
  // Need at least MIN_PARTICIPANTS total (including self)
  const total = _poolPeers.length + (_poolJoined ? 1 : 0);
  if (total < MIN_PARTICIPANTS) return;
  // Start random timer if not already running
  if (_poolTimer) return;
  const waitMs = POOL_WAIT_MIN + Math.floor(Math.random() * (POOL_WAIT_MAX - POOL_WAIT_MIN));
  const statusEl = document.getElementById('dt-mix-status');
  if (statusEl) statusEl.textContent = 'STARTING IN ' + Math.round(waitMs / 1000) + 's...';
  _poolTimer = setTimeout(() => _coordinateRoundStart(), waitMs);
}

async function _coordinateRoundStart() {
  _poolTimer = null;
  // If round already started (from coordinator's round_start), don't restart
  if (_activeMix && _activeMix.phase > 1) {
    return;
  }
  // Prune stale peers
  const now = Date.now();
  _poolPeers = _poolPeers.filter(p => now - p.ts < POOL_PEER_TTL);
  if (_poolPeers.length < MIN_PARTICIPANTS - 1) {
    const statusEl = document.getElementById('dt-mix-status');
    if (statusEl) statusEl.textContent = 'WAITING FOR PEERS...';
    return;
  }

  // All participants (self + peers)
  const allPubs = [_roundPub, ..._poolPeers.map(p => p.ephPub)].sort();
  const coordinator = allPubs[0]; // lowest pubkey = coordinator

  if (coordinator !== _roundPub) {
    // Not coordinator — wait for round_start from coordinator
    return;
  }

  // I am coordinator — start the round
  const roundId = b2h(crypto.getRandomValues(new Uint8Array(16)));

  // Shuffle mix order (Fisher-Yates)
  const mixOrder = [...allPubs];
  for (let i = mixOrder.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [mixOrder[i], mixOrder[j]] = [mixOrder[j], mixOrder[i]];
  }

  // Send round_start to each peer via gift wrap
  const payload = JSON.stringify({ type: 'round_start', round_id: roundId, participants: allPubs, mix_order: mixOrder });
  for (const peerPub of _poolPeers.map(p => p.ephPub)) {
    const ev = await giftWrap(_roundPriv, peerPub, NOSTR_KIND_JOINER, payload);
    _nostrPublish(ev);
  }

  // Also handle locally
  _handleRoundStart({ round_id: roundId, participants: allPubs, mix_order: mixOrder });
}

async function _handleGiftWrap(ev) {
  if (ev.kind !== 1059) return;
  if (_seenEvents.has(ev.id)) return;
  _seenEvents.add(ev.id);
  if (!_roundPriv) return;
  try {
    const unwrapped = await giftUnwrap(_roundPriv, ev);
    if (!unwrapped) return;
    const { rumor, sealPubkey } = unwrapped;
    if (rumor.kind !== NOSTR_KIND_JOINER) return;
    const data = JSON.parse(rumor.content);
    _dispatchJoinerMsg(sealPubkey, data);
  } catch (e) { console.warn('[FUSION] unwrap error:', e); }
}

/* ──────────────────────────────────────────
   MESSAGE DISPATCH
   ────────────────────────────────────────── */
function _dispatchJoinerMsg(senderPub, data) {
  const type = data.type || data.step;
  const phase = _activeMix ? _activeMix.phase : 0;

  if (type === 'round_start') { _handleRoundStart(data); return; }
  if (!_activeMix) return;

  // Buffer messages for future phases
  const typePhase = { inputs: 2, onion: 3 };
  const needed = typePhase[type] || 0;
  if (needed > 0 && phase < needed) {
    _msgBuffer.push({ pubkey: senderPub, data });
    return;
  }

  if (type === 'inputs')       _handleInputsMsg(senderPub, data);
  else if (type === 'onion')   _handleOnionMsg(senderPub, data);
  else if (type === 'outputs') _handleOutputsMsg(senderPub, data);
  else if (type === 'tx')      _handleTxMsg(senderPub, data);
  else if (type === 'sign')    _handleSignMsg(senderPub, data);
}

/* ──────────────────────────────────────────
   P2P MESSAGING (gift-wrapped)
   ────────────────────────────────────────── */
async function _broadcastToPeers(payload) {
  if (!_activeMix || !_roundPriv) return;
  const msg = JSON.stringify(payload);
  for (const pub of _activeMix.peers) {
    if (pub === _roundPub) continue; // skip self
    const ev = await giftWrap(_roundPriv, pub, NOSTR_KIND_JOINER, msg);
    _nostrPublish(ev);
  }
}

async function _sendToTarget(payload, targetPub) {
  if (!_roundPriv) return;
  const msg = JSON.stringify(payload);
  const ev = await giftWrap(_roundPriv, targetPub, NOSTR_KIND_JOINER, msg);
  _nostrPublish(ev);
}

/* ──────────────────────────────────────────
   SIGNAL READY — start a join
   ────────────────────────────────────────── */
async function _signalReady() {
  _generateRoundIdentity();
  _poolJoined = true;

  // Create activeMix early so state persists across tab switches
  _activeMix = { phase: 1, roundId: null, peers: [], mixOrder: [], myInputs: [], myOutputs: [], peerInputs: {}, collectedOnions: null, expectedOnions: 0, blindOutputs: null, allInputs: null, allOutputs: null, unsignedTxHex: null, signatures: {} };

  // Publish pool ready event (public, not gift wrapped)
  const { schnorr } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
  const content = JSON.stringify({
    type: 'ready',
    ephPub: _roundPub,
    utxo_count: _utxos.filter(u => u.value >= 546).length,
    output_count: Math.min(4, Math.max(2, Math.floor(_balanceSats / 600))),
  });
  const created_at = Math.floor(Date.now() / 1000);
  const tags = [['t', '0penw0rld-joiner-pool']];
  const idHash = sha256(new TextEncoder().encode(JSON.stringify([0, _roundPub, created_at, NOSTR_KIND_POOL, tags, content])));
  const id = b2h(idHash);
  const sig = b2h(await schnorr.sign(idHash, _roundPriv));
  const ev = { id, pubkey: _roundPub, created_at, kind: NOSTR_KIND_POOL, tags, content, sig };
  _nostrPublish(ev);

  _setPhase(1);
  _checkPoolThreshold();
}

/* ──────────────────────────────────────────
   START JOIN — UI entry point
   ────────────────────────────────────────── */
async function _startJoin() {
  // If Fulcrum balance not loaded yet, try state as immediate fallback
  if (_balanceSats === 0) {
    const stBal = state.get()?.balances?.bch;
    if (stBal > 0) { _balanceSats = stBal; }
  }
  if (_balanceSats < MIN_MIX_SATS) {
    showToast('Insufficient balance (need at least ' + satsToBch(MIN_MIX_SATS) + ' BCH)', 'error');
    return;
  }
  _switchTab('mix');

  const idle = document.getElementById('dt-mix-idle');
  const active = document.getElementById('dt-mix-active');
  const result = document.getElementById('dt-mix-result');
  if (idle) idle.style.display = 'none';
  if (active) active.style.display = '';
  if (result) result.style.display = 'none';
  const statusEl = document.getElementById('dt-mix-status');
  if (statusEl) statusEl.textContent = 'WAITING FOR PEERS...';
  const ioEl = document.getElementById('dt-mix-io-info');
  if (ioEl) ioEl.textContent = '';

  await _signalReady();
}

/* ──────────────────────────────────────────
   HANDLE round_start FROM RELAY
   ────────────────────────────────────────── */
function _handleRoundStart(data) {
  const { round_id, participants, mix_order } = data;

  _activeMix = {
    roundId: round_id,
    peers: participants,
    mixOrder: mix_order,
    phase: 2,
    myInputs: [],
    myOutputs: [],
    peerInputs: {},
    collectedOnions: null,
    expectedOnions: 0,
    blindOutputs: null,
    allInputs: null,
    allOutputs: null,
    unsignedTxHex: null,
    signatures: {},
  };

  _setPhase(2);
  _startInputRegistration();
}

/* ──────────────────────────────────────────
   PHASE MACHINE
   ────────────────────────────────────────── */
function _setPhase(n) {
  if (n > 1 && !_activeMix) return;
  if (_activeMix) _activeMix.phase = n;

  // Replay buffered messages for this phase
  const pending = _msgBuffer.splice(0);
  for (const msg of pending) _dispatchJoinerMsg(msg.pubkey, msg.data);

  // Update phase indicators in DOM
  document.querySelectorAll('#dt-mix-phases .dt-phase-item').forEach(el => {
    const p = parseInt(el.dataset.phase);
    el.classList.remove('active', 'done', 'error');
    if (p < n) el.classList.add('done');
    else if (p === n) el.classList.add('active');
  });

  // Update active phase status text
  const phaseTexts = {
    1: 'Waiting for peers to join pool...',
    2: 'Registering inputs...',
    3: 'Onion-encrypting outputs...',
    4: 'Assembling CoinJoin TX...',
    5: 'Verifying & signing...',
    6: 'Broadcasting...',
  };
  const activeEl = document.querySelector(`#dt-mix-phases .dt-phase-item[data-phase="${n}"]`);
  if (activeEl) {
    const sub = activeEl.querySelector('.dt-phase-sub');
    if (sub) sub.textContent = phaseTexts[n] || '';
  }

  // Phase timeout for response-dependent phases
  if ([2, 3, 5].includes(n)) _startPhaseTimeout(n);
  else _clearPhaseTimeout();

  _updateMixUI();
}

function _updateMixUI() {
  if (!_activeMix) return;
  const peersEl = document.getElementById('dt-mix-peers');
  if (peersEl) peersEl.textContent = _activeMix.peers.length + ' PARTICIPANTS';
  const statusEl = document.getElementById('dt-mix-status');
  if (statusEl) {
    const labels = { 1: 'WAITING FOR PEERS...', 2: 'INPUT REGISTRATION', 3: 'BLIND OUTPUT', 4: 'TX ASSEMBLY', 5: 'VERIFY & SIGN', 6: 'BROADCASTING' };
    statusEl.textContent = labels[_activeMix.phase] || 'MIXING...';
  }
}

/* ──────────────────────────────────────────
   PHASE 2 — INPUT REGISTRATION
   ────────────────────────────────────────── */
async function _startInputRegistration() {
  const m = _activeMix;
  const keys = auth.getKeys();
  if (!keys) return;

  m.mixOrder = [...m.peers].sort();

  // Random UTXO selection (1-5 inputs)
  const usable = _utxos.filter(u => u.value >= 546);
  if (usable.length === 0) { showToast('No spendable UTXOs', 'error'); _resetMix(); return; }
  const maxIn = Math.min(5, usable.length);
  const nInputs = 1 + Math.floor(Math.random() * maxIn);
  const shuffled = [...usable].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, nInputs);
  const total = selected.reduce((s, u) => s + u.value, 0);
  m.myInputs = selected;

  // Output decomposition (2-4 random stealth outputs)
  const maxOut = Math.min(4, Math.floor(total / 600));
  const nOutputs = Math.max(2, 2 + Math.floor(Math.random() * Math.min(3, maxOut - 1)));
  const myFee = nInputs * 148 + nOutputs * 34 + Math.ceil(10 / m.peers.length);
  const outputTotal = total - myFee;
  if (outputTotal < 546 * nOutputs) { showToast('Balance too low for mix', 'error'); _resetMix(); return; }

  const amounts = randomSplit(outputTotal, nOutputs);
  if (!amounts) { showToast('Cannot split balance', 'error'); _resetMix(); return; }

  // Derive stealth address for each output
  const _refInput = selected[0];
  const _refAddr = _refInput._addr || keys.bchAddr;
  const _refPriv = (_hdKeyMap[_refAddr]) || keys.privKey;
  const _refOutpoint = concat(h2b(_refInput.tx_hash).reverse(), u32LE(_refInput.tx_pos));

  m.myOutputs = [];
  for (let _oi = 0; _oi < amounts.length; _oi++) {
    const amt = amounts[_oi];
    if (false && keys.stealthSpendPub) { // TODO: re-enable stealth outputs later
      const st = _deriveSelfStealth(keys, _refPriv, _refOutpoint, _oi);
      m.myOutputs.push({ addr: st.addr, value: amt, stealth: st });
    } else if (keys.acctPriv && keys.acctChain) {
      let idx = parseInt(localStorage.getItem('00_fusion_addr_idx') || '1');
      const chainNode = bip32Child(keys.acctPriv, keys.acctChain, 0, false);
      const child = bip32Child(chainNode.priv, chainNode.chain, idx, false);
      const pub = secp256k1.getPublicKey(child.priv, true);
      const addr = pubHashToCashAddr(ripemd160(sha256(pub)));
      // Track output address so _refreshBalance can find it
      if (!_hdScannedAddrs.includes(addr)) _hdScannedAddrs.push(addr);
      _hdKeyMap[addr] = child.priv;
      idx++;
      localStorage.setItem('00_fusion_addr_idx', String(idx));
      m.myOutputs.push({ addr, value: amt, stealth: null });
    } else {
      m.myOutputs.push({ addr: keys.bchAddr, value: amt, stealth: null });
    }
  }


  const ioEl = document.getElementById('dt-mix-io-info');
  if (ioEl) ioEl.textContent = nInputs + ' inputs -> ' + nOutputs + ' stealth outputs';

  // Broadcast inputs + output_count to all peers (P2P)
  await _broadcastToPeers({
    round_id: m.roundId, step: 'inputs',
    inputs: selected.map(u => ({ txid: u.tx_hash, vout: u.tx_pos, value: u.value })),
    output_count: nOutputs,
  });
}

function _handleInputsMsg(pubkey, data) {
  if (!_activeMix || _activeMix.phase !== 2) return;
  _activeMix.peerInputs[pubkey] = data;

  const have = Object.keys(_activeMix.peerInputs).length + 1;
  if (have >= _activeMix.peers.length) {
    const m = _activeMix;
    m.expectedOnions = m.myOutputs.length
      + Object.values(m.peerInputs).reduce((s, d) => s + (d.output_count || 1), 0);
    _setPhase(3);
    _startBlindOutput();
  }
}

/* ──────────────────────────────────────────
   PHASE 3 — BLIND OUTPUT (ONION MIX-NET)
   ────────────────────────────────────────── */
async function _startBlindOutput() {
  const m = _activeMix;
  const peelers = m.mixOrder;

  const myOnions = [];
  for (const out of m.myOutputs) {
    const payload = out.addr + '|' + out.value;
    const onion = await onionWrap(payload, peelers);
    myOnions.push(btoa(String.fromCharCode(...onion)));
  }

  const firstPeeler = peelers[0];
  if (firstPeeler === _roundPub) {
    m.collectedOnions = [...myOnions];
    _checkOnionsReady();
  } else {
    for (const onionB64 of myOnions) {
      await _sendToTarget({
        round_id: m.roundId, step: 'onion', onion: onionB64,
      }, firstPeeler);
    }
  }
}

function _handleOnionMsg(pubkey, data) {
  if (!_activeMix || _activeMix.phase !== 3) return;
  if (!_activeMix.collectedOnions) _activeMix.collectedOnions = [];
  _activeMix.collectedOnions.push(data.onion);
  _checkOnionsReady();
}

function _checkOnionsReady() {
  const m = _activeMix;
  if (!m || !m.collectedOnions) return;
  if (m.collectedOnions.length < m.expectedOnions) return;
  _processOnions();
}

async function _processOnions() {
  const m = _activeMix;
  const myIndex = m.mixOrder.indexOf(_roundPub);

  // Peel our layer from each onion
  const peeled = [];
  for (const onionB64 of m.collectedOnions) {
    const blob = Uint8Array.from(atob(onionB64), c => c.charCodeAt(0));
    try {
      const inner = await onionPeel(blob, _roundPriv);
      peeled.push(inner);
    } catch (e) {
      console.error('[FUSION] onion peel failed:', e);
      return;
    }
  }

  // Fisher-Yates shuffle
  for (let i = peeled.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [peeled[i], peeled[j]] = [peeled[j], peeled[i]];
  }

  const nextIndex = myIndex + 1;

  if (nextIndex >= m.mixOrder.length) {
    // LAST PEELER — plaintext outputs revealed
    m.blindOutputs = peeled.map(p => onionUnpad(p));

    await _broadcastToPeers({
      round_id: m.roundId, step: 'outputs', outputs: m.blindOutputs,
    });

    _setPhase(4);
    _startTxAssembly();
  } else {
    // Forward to next peeler
    const nextPeeler = m.mixOrder[nextIndex];
    m.collectedOnions = [];
    for (const inner of peeled) {
      const innerB64 = btoa(String.fromCharCode(...inner));
      await _sendToTarget({
        round_id: m.roundId, step: 'onion', onion: innerB64,
      }, nextPeeler);
    }
  }
}

function _handleOutputsMsg(pubkey, data) {
  if (!_activeMix) return;
  _activeMix.blindOutputs = data.outputs;
  if (_activeMix.phase === 3) {
    _setPhase(4);
    _startTxAssembly();
  }
}

/* ──────────────────────────────────────────
   PHASE 4 — TX ASSEMBLY
   ────────────────────────────────────────── */
async function _startTxAssembly() {
  const m = _activeMix;
  const lastPeeler = m.mixOrder[m.mixOrder.length - 1];

  if (_roundPub !== lastPeeler) {
    return;
  }

  try {
    // Collect ALL inputs
    const allInputs = [];
    for (const u of m.myInputs) {
      allInputs.push({
        txidLE: h2b(u.tx_hash).reverse(), txid: u.tx_hash,
        vout: u.tx_pos, value: u.value, sequence: 0xffffffff, owner: _roundPub,
        _addr: u._addr,
      });
    }
    for (const [pub, data] of Object.entries(m.peerInputs)) {
      for (const inp of data.inputs) {
        allInputs.push({
          txidLE: h2b(inp.txid).reverse(), txid: inp.txid,
          vout: inp.vout, value: inp.value, sequence: 0xffffffff, owner: pub,
        });
      }
    }

    // All outputs from blind output reveal
    const allOutputs = m.blindOutputs
      .filter(o => o.value >= 546)
      .map(o => ({ value: o.value, script: p2pkhAddrScript(o.addr) }));

    // Verify fee
    const totalIn  = allInputs.reduce((s, i) => s + i.value, 0);
    const totalOut = allOutputs.reduce((s, o) => s + o.value, 0);
    const fee = totalIn - totalOut;
    const minFee = Math.max(10 + allInputs.length * 148 + allOutputs.length * 34, 300);

    if (fee < Math.floor(minFee * 0.3)) {
      console.error('[FUSION] FEE TOO LOW:', fee);
      _phaseError(4, 'Fee too low - mix aborted');
      return;
    }
    if (fee > minFee * 10) {
      console.error('[FUSION] FEE SUSPICIOUSLY HIGH:', fee);
      _phaseError(4, 'Excessive fee - mix aborted');
      return;
    }

    m.allInputs = allInputs;
    m.allOutputs = allOutputs;

    const unsignedInputs = allInputs.map(inp => ({ ...inp, scriptSig: new Uint8Array(0) }));
    m.unsignedTxHex = b2h(serializeTx(1, 0, unsignedInputs, allOutputs));


    await _broadcastToPeers({
      round_id: m.roundId, step: 'tx', tx_hex: m.unsignedTxHex,
      inputs: allInputs.map(i => ({ txid: i.txid, vout: i.vout, value: i.value, owner: i.owner })),
      outputs: allOutputs.map(o => ({ value: o.value, script: b2h(o.script) })),
    });

    _setPhase(5);
    _startVerifySign();
  } catch (e) {
    console.error('[FUSION] TX ASSEMBLY ERROR:', e);
    _phaseError(4, 'ERROR: ' + e.message);
  }
}

function _handleTxMsg(pubkey, data) {
  if (!_activeMix) return;
  const m = _activeMix;

  m.allInputs = data.inputs.map(i => ({
    txidLE: h2b(i.txid).reverse(), txid: i.txid,
    vout: i.vout, value: i.value, sequence: 0xffffffff, owner: i.owner,
  }));
  m.allOutputs = data.outputs.map(o => ({ value: o.value, script: h2b(o.script) }));
  m.unsignedTxHex = data.tx_hex;

  if (m.phase <= 4) {
    _setPhase(5);
    _startVerifySign();
  }
}

/* ──────────────────────────────────────────
   PHASE 5 — VERIFY & SIGN
   ────────────────────────────────────────── */
async function _startVerifySign() {
  const m = _activeMix;
  const keys = auth.getKeys();
  if (!m.allInputs || !m.allOutputs || !keys) return;

  // Verify ALL our outputs exist in the TX
  for (const out of m.myOutputs) {
    const outScript = b2h(p2pkhAddrScript(out.addr));
    const found = m.allOutputs.some(o => o.value === out.value && b2h(o.script) === outScript);
    if (!found) {
      console.error('[FUSION] OUTPUT MISSING:', out.addr.slice(12, 24), out.value, 'sats');
      _handlePhaseTimeout(5);
      return;
    }
  }

  // Verify no inflation
  const totalIn  = m.allInputs.reduce((s, i) => s + i.value, 0);
  const totalOut = m.allOutputs.reduce((s, o) => s + o.value, 0);
  if (totalOut > totalIn) {
    console.error('[FUSION] INFLATION DETECTED - ABORTING');
    return;
  }

  // Verify fees are reasonable
  const fees = totalIn - totalOut;
  const estTxBytes = 10 + m.allInputs.length * 148 + m.allOutputs.length * 34;
  if (fees > estTxBytes * 5) {
    console.error('[FUSION] EXCESSIVE FEES - ABORTING:', fees);
    return;
  }

  // Build txid:vout -> addr lookup for our inputs
  const myUtxoMap = {};
  for (const u of m.myInputs) {
    if (u._addr) myUtxoMap[u.tx_hash + ':' + u.tx_pos] = u._addr;
  }

  // Sign our inputs
  const sigs = [];
  for (let i = 0; i < m.allInputs.length; i++) {
    if (m.allInputs[i].owner !== _roundPub) continue;
    const inp = m.allInputs[i];
    const inputAddr = inp._addr || myUtxoMap[inp.txid + ':' + inp.vout];
    const priv = (inputAddr && _hdKeyMap[inputAddr]) ? _hdKeyMap[inputAddr] : keys.privKey;
    const pub = secp256k1.getPublicKey(priv, true);
    const script = p2pkhScript(ripemd160(sha256(pub)));
    const sighash = bchSighash(1, 0, m.allInputs, m.allOutputs, i, script, inp.value);
    const sig = secp256k1.sign(sighash, priv, { lowS: true });
    const derSig = concat(sig.toDERRawBytes(), new Uint8Array([0x41]));
    const scriptSig = concat(new Uint8Array([derSig.length]), derSig, new Uint8Array([pub.length]), pub);
    sigs.push({ index: i, scriptSig: b2h(scriptSig) });
  }


  await _broadcastToPeers({
    round_id: m.roundId, step: 'sign', signatures: sigs,
  });

  m.signatures[_roundPub] = sigs;
  _checkSignaturesReady();
}

function _handleSignMsg(pubkey, data) {
  if (!_activeMix) return;
  _activeMix.signatures[pubkey] = data.signatures;
  _checkSignaturesReady();
}

function _checkSignaturesReady() {
  const m = _activeMix;
  if (!m || Object.keys(m.signatures).length < m.peers.length) return;
  _setPhase(6);
  _startBroadcast();
}

/* ──────────────────────────────────────────
   PHASE 6 — BROADCAST
   ────────────────────────────────────────── */
async function _startBroadcast() {
  const m = _activeMix;

  // Assemble fully-signed TX
  const signedInputs = m.allInputs.map((inp, i) => {
    for (const sigs of Object.values(m.signatures)) {
      const s = sigs.find(s => s.index === i);
      if (s) return { ...inp, scriptSig: h2b(s.scriptSig) };
    }
    console.error('[FUSION] missing signature for input', i);
    return { ...inp, scriptSig: new Uint8Array(0) };
  });

  const txHex = b2h(serializeTx(1, 0, signedInputs, m.allOutputs));
  _clearPhaseTimeout();

  try {
    if (!window._fvCall) throw new Error('Fulcrum not connected');
    const txid = await window._fvCall('blockchain.transaction.broadcast', [txHex]);

    // Success UI
    const resultEl = document.getElementById('dt-mix-result');
    const txidEl = document.getElementById('dt-mix-txid');
    if (resultEl) resultEl.style.display = '';
    if (txidEl) txidEl.textContent = txid;

    const p6 = document.querySelector('#dt-mix-phases .dt-phase-item[data-phase="6"]');
    if (p6) { p6.classList.remove('active'); p6.classList.add('done'); }

    // Save history
    const myTotal = m.myOutputs.reduce((s, o) => s + o.value, 0);
    _mixHistory.unshift({
      txid, amount: satsToBch(myTotal), peers: m.peers.length,
      outputs: m.myOutputs.length, time: Date.now(), status: 'ok'
    });
    localStorage.setItem('00_fusion_history', JSON.stringify(_mixHistory.slice(0, 50)));

    // Save to wallet tx history so it appears in wallet.js transaction list
    // Two entries: fusion-out (inputs contributed) + fusion (outputs received)
    try {
      const walletHist = JSON.parse(localStorage.getItem('00_tx_history') || '[]');
      const alreadySaved = walletHist.some(t => t.txid === txid && t.dir === 'fusion');
      if (!alreadySaved) {
        const myInputsTotal = m.myInputs ? m.myInputs.reduce((s, i) => s + (i.value || 0), 0) : 0;
        const ts = Math.floor(Date.now() / 1000);
        // fusion-out: BCH contributed as inputs (shows as negative/sent)
        if (myInputsTotal > 0) {
          walletHist.unshift({ txid, chain: 'bch', dir: 'fusion-out', amount: myInputsTotal, timestamp: ts, height: 0, peers: m.peers.length });
        }
        // fusion: BCH received at new output addresses (shows as positive/received)
        walletHist.unshift({ txid, chain: 'bch', dir: 'fusion', amount: myTotal, timestamp: ts, height: 0, peers: m.peers.length, outputs: m.myOutputs.map(o => ({ addr: o.addr, value: o.value })) });
        localStorage.setItem('00_tx_history', JSON.stringify(walletHist.slice(0, 500)));
        // Bust the wallet scan cooldown so it re-renders immediately
        localStorage.removeItem('00_tx_scan_ts_bch');
      }
    } catch (e) { console.warn('[FUSION] could not save to tx_history:', e); }

    // Save stealth UTXOs for wallet
    for (const out of m.myOutputs) {
      if (out.stealth) {
        _saveFusionStealthUtxo(out.stealth.addr, out.stealth.priv, out.stealth.pub);
        if (!_hdScannedAddrs.includes(out.stealth.addr)) {
          _hdScannedAddrs.push(out.stealth.addr);
          _hdKeyMap[out.stealth.addr] = out.stealth.priv;
        }
      }
    }

    _renderHistory();
    showToast('CoinJoin mix complete!', 'success');

    // Optimistically update UTXOs: remove spent inputs, add new outputs
    _utxos = _utxos.filter(u => !m.myInputs.some(mi => mi.tx_hash === u.tx_hash && mi.tx_pos === u.tx_pos));
    for (let oi = 0; oi < m.myOutputs.length; oi++) {
      const out = m.myOutputs[oi];
      const vout = m.allOutputs ? m.allOutputs.findIndex(o => o.value === out.value && b2h(o.script) === b2h(p2pkhAddrScript(out.addr))) : -1;
      if (vout >= 0) {
        _utxos.push({ tx_hash: txid, tx_pos: vout, value: out.value, _addr: out.addr, height: 0 });
      }
    }
    _balanceSats = _utxos.reduce((s, u) => s + u.value, 0);
    state.merge('balances', { bch: _balanceSats });
    setTimeout(_refreshBalance, 5000); // full rescan after 5s

    // Auto-mix: pipeline next round or stop
    _autoMixRoundsCompleted++;
    if (_autoMix && _autoMixRoundsCompleted < _autoMixRoundsTarget) {
      _autoMixStatus('Round ' + _autoMixRoundsCompleted + '/' + _autoMixRoundsTarget + ' - pipelining...');
      _resetMix();
      _signalReady();
    } else {
      if (_autoMix) _autoMixStatus('Mixed - ' + _autoMixRoundsCompleted + ' rounds complete');
      _destroyRoundIdentity();
    }

  } catch (e) {
    console.error('[FUSION] broadcast failed:', e);
    const p6 = document.querySelector('#dt-mix-phases .dt-phase-item[data-phase="6"]');
    if (p6) { p6.classList.add('error'); }
    const sub6 = p6?.querySelector('.dt-phase-sub');
    if (sub6) sub6.textContent = 'FAILED: ' + (e.message || e);

    _mixHistory.unshift({
      txid: 'FAILED', amount: '0', peers: m.peers.length,
      outputs: 0, time: Date.now(), status: 'fail'
    });
    localStorage.setItem('00_fusion_history', JSON.stringify(_mixHistory.slice(0, 50)));
    _renderHistory();
    showToast('Broadcast failed: ' + (e.message || e), 'error');
    _destroyRoundIdentity();

    if (_autoMix) { _resetMix(); _autoMixScheduleRetry(); }
  }
}

/* ──────────────────────────────────────────
   BLAME PROTOCOL — PHASE TIMEOUT
   ────────────────────────────────────────── */
function _startPhaseTimeout(phase) {
  _clearPhaseTimeout();
  _phaseTimer = setTimeout(() => _handlePhaseTimeout(phase), PHASE_TIMEOUT);
}

function _clearPhaseTimeout() {
  if (_phaseTimer) { clearTimeout(_phaseTimer); _phaseTimer = null; }
}

async function _handlePhaseTimeout(phase) {
  if (!_activeMix || _activeMix.phase !== phase) return;
  const m = _activeMix;
  console.warn('[FUSION] TIMEOUT in phase', phase);

  // Identify non-responders
  let blamed = [];
  if (phase === 2) {
    const responded = new Set(Object.keys(m.peerInputs));
    blamed = m.peers.filter(p => p !== _roundPub && !responded.has(p));
  } else if (phase === 5) {
    const signed = new Set(Object.keys(m.signatures));
    blamed = m.peers.filter(p => !signed.has(p));
  }

  if (blamed.length > 0) {
    console.warn('[FUSION] non-responders:', blamed.map(p => p.slice(0, 12)).join(', '));
  }

  _phaseError(phase,
    blamed.length > 0
      ? 'Timeout - ' + blamed.length + ' peer(s) dropped'
      : 'Timeout - round aborted'
  );

  _mixHistory.unshift({
    txid: 'TIMEOUT', amount: '0', peers: m.peers.length,
    outputs: 0, time: Date.now(), status: 'fail',
  });
  localStorage.setItem('00_fusion_history', JSON.stringify(_mixHistory.slice(0, 50)));
  _renderHistory();
  _destroyRoundIdentity();

  if (_autoMix) { _resetMix(); _autoMixScheduleRetry(); }
}

function _phaseError(phase, msg) {
  const el = document.querySelector(`#dt-mix-phases .dt-phase-item[data-phase="${phase}"]`);
  if (el) {
    el.classList.add('error');
    const sub = el.querySelector('.dt-phase-sub');
    if (sub) sub.textContent = msg;
  }
}

/* ──────────────────────────────────────────
   MIX RESET
   ────────────────────────────────────────── */
function _resetMix() {
  _clearPhaseTimeout();
  _activeMix = null;
  // Clear pool state so stale peers don't pollute next round
  _poolPeers = [];
  _poolJoined = false;
  if (_poolTimer) { clearTimeout(_poolTimer); _poolTimer = null; }
  _destroyRoundIdentity();
  const idle = document.getElementById('dt-mix-idle');
  const active = document.getElementById('dt-mix-active');
  if (idle) idle.style.display = '';
  if (active) active.style.display = 'none';
  document.querySelectorAll('#dt-mix-phases .dt-phase-item').forEach(el =>
    el.classList.remove('active', 'done', 'error')
  );
  // Reset sub-labels
  const defaultSubs = { 1: 'Waiting for participants...', 2: 'Declare UTXOs', 3: 'Onion-encrypted output registration', 4: 'Building CoinJoin transaction', 5: 'Verify outputs, sign inputs', 6: 'Submit to network' };
  for (const [p, text] of Object.entries(defaultSubs)) {
    const sub = document.querySelector(`#dt-mix-phases .dt-phase-item[data-phase="${p}"] .dt-phase-sub`);
    if (sub) sub.textContent = text;
  }
}

/* ──────────────────────────────────────────
   AUTO-MIX
   ────────────────────────────────────────── */
function _toggleAutoMix() {
  _autoMix = !_autoMix;
  const btn = document.getElementById('dt-fus-auto');
  const statusEl = document.getElementById('dt-fus-auto-status');
  if (btn) btn.textContent = 'Auto-Mix: ' + (_autoMix ? 'ON' : 'OFF');
  if (_autoMix) {
    _autoMixRoundsCompleted = 0;
    _pipelining = true;
    if (statusEl) { statusEl.style.display = ''; statusEl.textContent = 'Starting...'; }
    _autoMixNext();
  } else {
    _pipelining = false;
    if (statusEl) statusEl.style.display = 'none';
  }
}

function _autoMixStatus(msg) {
  const el = document.getElementById('dt-fus-auto-status');
  if (el) { el.style.display = ''; el.textContent = msg; }
}

async function _autoMixNext() {
  if (!_autoMix) return;
  if (_activeMix) { _autoMixStatus('Waiting for current round...'); return; }
  if (_balanceSats < MIN_MIX_SATS) {
    _autoMixStatus('Done - balance too low');
    _autoMix = false;
    const btn = document.getElementById('dt-fus-auto');
    if (btn) btn.textContent = 'Auto-Mix: OFF';
    return;
  }
  _autoMixStatus('Round ' + (_autoMixRoundsCompleted + 1) + '/' + _autoMixRoundsTarget + ' - joining pool...');
  await _startJoin();
}

function _autoMixScheduleRetry() {
  if (!_autoMix) return;
  const delay = 3000 + Math.floor(Math.random() * 5000);
  _autoMixStatus('Retrying in ' + Math.round(delay / 1000) + 's...');
  setTimeout(_autoMixNext, delay);
}

/* ──────────────────────────────────────────
   RELAY LIST RENDERING
   ────────────────────────────────────────── */
function _renderPool() {
  const el = document.getElementById('dt-fus-relays');
  if (!el) return;
  const total = _poolPeers.length + (_poolJoined ? 1 : 0);
  if (total === 0) {
    el.innerHTML = `<div class="dt-empty">
      <div class="dt-empty-icon">\u2697</div>
      <div class="dt-empty-text">No peers in pool</div>
      <div style="font-size:11px;color:var(--dt-text-secondary);margin-top:4px">Click "Join Round" to enter the mixing pool</div>
    </div>`;
    return;
  }
  const peers = _poolJoined ? [{ ephPub: _roundPub, isSelf: true }, ..._poolPeers] : [..._poolPeers];
  el.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--dt-text-secondary);margin-bottom:8px">${total} peer${total > 1 ? 's' : ''} in pool${_poolTimer ? ' \u2014 round starting soon...' : ''}</div>` +
    peers.map(p => `
    <div class="dt-row">
      <div class="dt-row-left">
        <div class="dt-row-icon in" style="background:${p.isSelf ? 'linear-gradient(135deg,#8B5CF6,#7C3AED)' : 'linear-gradient(135deg,#0AC18E,#0AD18E)'}"><span>${p.isSelf ? '\u{1F464}' : '\u26A1'}</span></div>
        <div>
          <div class="dt-row-title">${p.isSelf ? 'You' : 'Peer'}</div>
          <div class="dt-row-sub" style="font-family:monospace">${(p.ephPub || '').slice(0, 12)}...</div>
        </div>
      </div>
    </div>
  `).join('');

  // Wire join buttons
  el.querySelectorAll('[data-join-pub]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _startJoin(btn.dataset.joinPub);
    });
  });
}

/* ──────────────────────────────────────────
   HISTORY RENDERING
   ────────────────────────────────────────── */
function _renderHistory() {
  const el = document.getElementById('dt-fus-history');
  if (!el) return;
  if (!_mixHistory.length) {
    el.innerHTML = '<div class="dt-empty"><div class="dt-empty-icon">\uD83D\uDCCB</div><div class="dt-empty-text">No mix history yet</div></div>';
    return;
  }
  el.innerHTML = _mixHistory.slice(0, 20).map(h => {
    const amt = h.amount || '?';
    const outs = h.outputs ? ' \u00B7 ' + h.outputs + ' outputs' : '';
    const isOk = h.status === 'ok';
    const badge = isOk
      ? '<span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:6px;border:1px solid var(--dt-accent-border,#0AC18E);color:var(--dt-accent,#0AC18E)">Mixed</span>'
      : '<span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:6px;border:1px solid var(--dt-danger-border,#E53935);color:var(--dt-danger,#E53935)">Failed</span>';
    return `<div class="dt-row" style="cursor:default">
      <div class="dt-row-left">
        <div class="dt-row-icon ${isOk ? 'in' : 'out'}"><span>\u2697</span></div>
        <div>
          <div class="dt-row-title">CoinJoin Round</div>
          <div class="dt-row-sub">${h.txid?.slice(0, 16) || '\u2014'}... \u00B7 ${h.peers || '?'} participants${outs}</div>
        </div>
      </div>
      <div class="dt-row-right">
        ${badge}
        <div style="font-size:10px;color:var(--dt-text-secondary);margin-top:4px">${new Date(h.time).toLocaleString()}</div>
      </div>
    </div>`;
  }).join('');
}

/* ──────────────────────────────────────────
   TAB SWITCHING
   ────────────────────────────────────────── */
function _switchTab(name) {
  document.querySelectorAll('#dt-fus-tabs .dt-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('[id^="dt-fus-p-"]').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`#dt-fus-tabs .dt-tab[data-tab="${name}"]`);
  const pane = document.getElementById('dt-fus-p-' + name);
  if (btn) btn.classList.add('active');
  if (pane) pane.classList.add('active');
}

/* ──────────────────────────────────────────
   TEMPLATE
   ────────────────────────────────────────── */
function _template() {
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap">
        <div class="dt-page-icon">\u2697</div>
        <div>
          <div class="dt-page-title">Fusion</div>
          <div class="dt-page-sub">Silent Joiner \u00B7 Privacy Mixing</div>
        </div>
      </div>
      <div class="dt-page-actions">${statusDotsHtml(['fulcrum', 'nostr'])}</div>
    </div>

    <div class="dt-tabs" id="dt-fus-tabs">
      <button class="dt-tab active" data-tab="pool">Pool</button>
      <button class="dt-tab" data-tab="mix">Mix</button>
      <button class="dt-tab" data-tab="history">History</button>
    </div>

    <!-- ═══ POOL PANE ═══ -->
    <div class="dt-pane active" id="dt-fus-p-pool">
      ${balanceChipHtml(['bch'])}
      <div class="dt-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="dt-card-title" style="margin:0">Joiner</div>
            ${infoBtn('The Silent Joiner creates CoinJoin transactions peer-to-peer via Nostr. Your inputs and outputs are mixed with other participants \u2014 nobody can link them. Each round uses ephemeral keys — no relay coordinator needed.')}
          </div>
          <div style="display:flex;gap:8px">
            <button class="dt-action-btn" id="dt-fus-join" style="width:auto;padding:8px 20px;background:var(--dt-accent)">\u2697 Join Round</button>
            <button class="dt-action-btn-outline" id="dt-fus-auto" style="width:auto;padding:8px 16px;font-size:11px">Auto-Mix: OFF</button>
          </div>
        </div>
        <div id="dt-fus-auto-status" style="font-size:12px;color:var(--dt-text-secondary);margin-bottom:12px;display:none"></div>
        <div id="dt-fus-relays">
          <div class="dt-empty">
            <div class="dt-empty-icon">\u2697</div>
            <div class="dt-empty-text">No peers in pool</div>
            <div style="font-size:11px;color:var(--dt-text-secondary);margin-top:4px">Click "Join Round" to enter the mixing pool</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ MIX PANE ═══ -->
    <div class="dt-pane" id="dt-fus-p-mix">
      <div class="dt-card" id="dt-mix-idle">
        <div class="dt-empty">
          <div class="dt-empty-icon">\u2697</div>
          <div class="dt-empty-text">No active mix</div>
          <div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Join a round from the Pool tab to start mixing</div>
        </div>
      </div>
      <div id="dt-mix-active" style="display:none">
        <div class="dt-card" style="text-align:center;margin-bottom:16px">
          <div style="font-size:16px;font-weight:700;color:var(--dt-text)">COMBINATORIAL MIX</div>
          <div style="font-size:14px;font-weight:600;color:var(--dt-accent);margin-top:6px" id="dt-mix-status">SIGNALING READY...</div>
          <div style="font-size:13px;color:var(--dt-text-secondary);margin-top:4px" id="dt-mix-peers">0 PARTICIPANTS</div>
          <div style="font-size:11px;color:var(--dt-text-secondary);margin-top:2px" id="dt-mix-io-info"></div>
        </div>
        <div class="dt-card">
          <div id="dt-mix-phases">
            ${[['1','Discovery','Waiting for participants...'],
               ['2','Input Registration','Declare UTXOs'],
               ['3','Blind Output','Onion-encrypted output registration'],
               ['4','TX Assembly','Building CoinJoin transaction'],
               ['5','Verify & Sign','Verify outputs, sign inputs'],
               ['6','Broadcast','Submit to network']
            ].map(([n, label, sub]) =>
              `<div class="dt-phase-item" data-phase="${n}" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--dt-border)">
                <div style="width:28px;height:28px;border-radius:50%;border:2px solid var(--dt-border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--dt-text-secondary);transition:all .3s" class="dt-phase-num">${n}</div>
                <div style="flex:1">
                  <span style="font-size:13px;font-weight:600;color:var(--dt-text)">${label}</span>
                  <div class="dt-phase-sub" style="font-size:11px;color:var(--dt-text-secondary);margin-top:2px">${sub}</div>
                </div>
              </div>`
            ).join('')}
          </div>
        </div>
        <div id="dt-mix-result" style="display:none;margin-top:16px">
          <div class="dt-card" style="text-align:center;border-color:var(--dt-accent-border,#0AC18E)">
            <div style="font-size:16px;font-weight:700;color:var(--dt-accent,#0AC18E);margin-bottom:8px">Mix Complete</div>
            <div id="dt-mix-txid" style="font-size:11px;color:var(--dt-text-secondary);font-family:monospace;word-break:break-all;margin-bottom:12px"></div>
            <button class="dt-action-btn-outline" id="dt-mix-newround">New Mix</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ HISTORY PANE ═══ -->
    <div class="dt-pane" id="dt-fus-p-history">
      <div id="dt-fus-history">
        <div class="dt-empty"><div class="dt-empty-icon">\uD83D\uDCCB</div><div class="dt-empty-text">No mix history yet</div></div>
      </div>
    </div>
  </div>

  <style>
    #dt-mix-phases .dt-phase-item.active .dt-phase-num {
      border-color: var(--dt-accent, #0AC18E);
      color: var(--dt-accent, #0AC18E);
      box-shadow: 0 0 8px rgba(10,193,142,.25);
    }
    #dt-mix-phases .dt-phase-item.done .dt-phase-num {
      background: var(--dt-accent, #0AC18E);
      border-color: var(--dt-accent, #0AC18E);
      color: #fff;
    }
    #dt-mix-phases .dt-phase-item.error .dt-phase-num {
      border-color: var(--dt-danger, #E53935);
      color: var(--dt-danger, #E53935);
    }
    #dt-mix-phases .dt-phase-item.active .dt-phase-sub::before {
      content: '';
      display: inline-block;
      width: 10px; height: 10px;
      border: 2px solid var(--dt-accent, #0AC18E);
      border-top-color: transparent;
      border-radius: 50%;
      animation: dt-fus-spin .7s linear infinite;
      margin-right: 6px;
      vertical-align: middle;
    }
    @keyframes dt-fus-spin { to { transform: rotate(360deg); } }
  </style>`;
}

/* ──────────────────────────────────────────
   MOUNT / UNMOUNT
   ────────────────────────────────────────── */
export async function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }

  container.innerHTML = _template();

  // Load history
  try { _mixHistory = JSON.parse(localStorage.getItem('00_fusion_history') || '[]'); } catch { _mixHistory = []; }
  _renderHistory();

  // Wire tabs
  document.querySelectorAll('#dt-fus-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
  });

  // Wire buttons
  const joinBtn = document.getElementById('dt-fus-join');
  if (joinBtn) joinBtn.addEventListener('click', () => _startJoin());

  const autoBtn = document.getElementById('dt-fus-auto');
  if (autoBtn) autoBtn.addEventListener('click', _toggleAutoMix);

  const newRoundBtn = document.getElementById('dt-mix-newround');
  if (newRoundBtn) newRoundBtn.addEventListener('click', _resetMix);

  // Set dot statuses
  setDotStatus('fulcrum', !!window._fvCall);
  const nostrSt = window._nostrStatus ? window._nostrStatus() : null;
  setDotStatus('nostr', nostrSt?.connected || nostrSt?.relayCount > 0);

  // Balance subscription
  _unsubs.push(state.subscribe('balances', () => updateBalanceChip('bch')));

  // HD scan + balance
  const keys = await auth.getKeys();
  if (keys && window._fvCall) {
    if (keys.acctPriv && keys.acctChain && _hdScannedAddrs.length === 0) {
      await _scanHdAddrs(keys);
    }
    await _refreshBalance();
  }

  // Subscribe to peer pool events (skip if already subscribed from previous mount)
  if (!_poolSub) await _subscribePool();
  _renderPool();

  // If a round is active, restore UI after everything else settles
  if (_activeMix && _activeMix.phase > 0 && _activeMix.phase < 7) {
    const phase = _activeMix.phase;
    const peers = _activeMix.peers;
    // Use setTimeout to ensure all async rendering is done
    setTimeout(() => {
      _switchTab('mix');
      const idle = document.getElementById('dt-mix-idle');
      const active = document.getElementById('dt-mix-active');
      if (idle) idle.style.display = 'none';
      if (active) active.style.display = '';
      const statusEl = document.getElementById('dt-mix-status');
      if (statusEl) {
        const texts = { 1: 'WAITING FOR PEERS...', 2: 'REGISTERING INPUTS...', 3: 'ONION OUTPUTS...', 4: 'ASSEMBLING TX...', 5: 'SIGNING...', 6: 'BROADCASTING...' };
        statusEl.textContent = texts[phase] || 'ROUND IN PROGRESS...';
      }
      const ioEl = document.getElementById('dt-mix-io-info');
      if (ioEl && peers?.length) ioEl.textContent = peers.length + ' participants';
      _setPhase(phase);
    }, 500);
  }

  // Prune stale peers every 60s
  const pruneTimer = setInterval(() => {
    const now = Date.now();
    _poolPeers = _poolPeers.filter(p => now - p.ts < POOL_PEER_TTL);
    _renderPool();
  }, 60000);
  _unsubs.push(() => clearInterval(pruneTimer));

  // Nostr status polling
  const statusTimer = setInterval(() => {
    const st = window._nostrStatus ? window._nostrStatus() : null;
    setDotStatus('nostr', st?.connected || st?.relayCount > 0);
    setDotStatus('fulcrum', !!window._fvCall);
  }, 5000);
  _unsubs.push(() => clearInterval(statusTimer));
}

export function unmount() {
  // Clean up UI subscriptions (balance chip, status polling, prune timer)
  _unsubs.forEach(fn => { if (typeof fn === 'function') fn(); });
  _unsubs = [];

  // If a round is in progress, keep everything alive (Nostr subs, round identity, phase timers)
  const roundActive = _activeMix && _activeMix.phase > 0 && _activeMix.phase < 6;
  if (!roundActive) {
    _clearPhaseTimeout();
    _destroyRoundIdentity();
    if (_poolTimer) { clearTimeout(_poolTimer); _poolTimer = null; }
    _poolJoined = false;
    _poolPeers = [];
    if (_poolSub && window._nostrUnsubscribe) {
      window._nostrUnsubscribe(_poolSub);
      _poolSub = null;
    }
  } else {
  }

  if (_container) _container.innerHTML = '';
  _container = null;
}
