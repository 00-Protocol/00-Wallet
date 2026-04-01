/* 00 Wallet — Subscriptions View (SPA v2)
   ══════════════════════════════════════════
   Full subscription logic ported from sub.html:
   - Pre-signed chain builder (nLockTime)
   - Cancel (spend change output)
   - Settlement monitor (auto-broadcast)
   - Fixed USD mode (Nostr invoices)
   - Receive subscriptions via Nostr
   ══════════════════════════════════════════ */

import * as state from '../core/state.js';
import * as auth  from '../core/auth.js';
import { navigate } from '../router.js';
import { infoBtn } from '../core/ui-helpers.js';

/* ── Core imports ── */
import { secp256k1, schnorr } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 }    from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';
import { concat, b2h, h2b, u32LE, u64LE, writeVarint, dsha256, utf8, rand, satsToBch, showToast } from '../core/utils.js';
import { cashAddrToHash20, pubHashToCashAddr } from '../core/cashaddr.js';
import { p2pkhScript, bchSighash, serializeTx, estimateTxSize, signInput, p2pkhScriptSig, txidFromRaw } from '../core/bch-tx.js';
import { bip32Child } from '../core/hd.js';
import { nostrInit, nostrSubscribe, nostrUnsubscribe, nostrPublish, nostrIsConnected } from '../core/nostr-bridge.js';

export const id    = 'sub';
export const title = '00 Subscriptions';
export const icon  = '\u21BB';

/* ══════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════ */
const NOSTR_KIND_SUB_INVOICE = 22240;
const NOSTR_KIND_SUB_CHAIN   = 22241;
const FEE_RATE = 2; // sat/byte

/* ══════════════════════════════════════════
   MODULE STATE
   ══════════════════════════════════════════ */
let _container = null, _unsubs = [], _bchPrice = 0, _subMode = 'bch';
let _subscriptions = [];
let _seenEvents = new Set();
let _nostrSubIds = [];
let _settlementInterval = null;
let _balanceInterval = null;
let _sessionPriv = null, _sessionPub = null;
let _utxos = [];
let _hdAddresses = [];

/* ══════════════════════════════════════════
   PERSISTENCE
   ══════════════════════════════════════════ */
function loadSubscriptions() {
  try { _subscriptions = JSON.parse(localStorage.getItem('00_subscriptions') || '[]'); } catch { _subscriptions = []; }
}
function saveSubscriptions() {
  localStorage.setItem('00_subscriptions', JSON.stringify(_subscriptions));
}

/* ══════════════════════════════════════════
   FULCRUM RPC HELPER
   ══════════════════════════════════════════ */
function fvCall(method, params) {
  if (window._fvCall) return window._fvCall(method, params);
  return Promise.reject(new Error('Fulcrum not connected'));
}

/* ══════════════════════════════════════════
   NOSTR NIP-01 EVENT SIGNING
   ══════════════════════════════════════════ */
async function makeEvent(privBytes, kind, content, tags = []) {
  const pub = b2h(secp256k1.getPublicKey(privBytes, true).slice(1));
  const created_at = Math.floor(Date.now() / 1000);
  const idHash = sha256(utf8(JSON.stringify([0, pub, created_at, kind, tags, content])));
  const sig = b2h(await schnorr.sign(idHash, privBytes));
  return { id: b2h(idHash), pubkey: pub, created_at, kind, tags, content, sig };
}

/* ══════════════════════════════════════════
   NIP-04 ENCRYPTION / DECRYPTION
   ══════════════════════════════════════════ */
async function nip04Encrypt(myPriv, theirPubHex, msg) {
  const shared = secp256k1.getSharedSecret(myPriv, h2b('02' + theirPubHex)).slice(1, 33);
  const iv = rand(16);
  const key = await crypto.subtle.importKey('raw', shared, { name: 'AES-CBC' }, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, utf8(msg));
  return btoa(String.fromCharCode(...new Uint8Array(ct))) + '?iv=' + btoa(String.fromCharCode(...iv));
}

async function nip04Decrypt(myPriv, senderPubHex, encContent) {
  try {
    const [ctB64, ivB64] = encContent.split('?iv=');
    const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const shared = secp256k1.getSharedSecret(myPriv, h2b('02' + senderPubHex)).slice(1, 33);
    const key = await crypto.subtle.importKey('raw', shared, { name: 'AES-CBC' }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

/* ══════════════════════════════════════════
   DERIVE SESSION KEYPAIR (deterministic)
   ══════════════════════════════════════════ */
function deriveSessionKeys(keys) {
  if (!keys.acctPriv || !keys.acctChain) return;
  const sessionChain = bip32Child(keys.acctPriv, keys.acctChain, 2, true);
  const sessionNode  = bip32Child(sessionChain.priv, sessionChain.chain, 0, false);
  _sessionPriv = sessionNode.priv;
  // Ensure even y-coordinate for schnorr compatibility
  if (secp256k1.getPublicKey(_sessionPriv, true)[0] === 0x03) {
    const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
    _sessionPriv = h2b((N - BigInt('0x' + b2h(_sessionPriv))).toString(16).padStart(64, '0'));
  }
  _sessionPub = b2h(secp256k1.getPublicKey(_sessionPriv, true).slice(1));
}

/* ══════════════════════════════════════════
   HD ADDRESSES SCAN (for UTXO signing)
   ══════════════════════════════════════════ */
function buildHdAddresses(keys) {
  _hdAddresses = [{
    priv: keys.privKey,
    pub:  keys.pubKey,
    addr: keys.bchAddr,
    path: '0/0'
  }];
  if (!keys.acctPriv || !keys.acctChain) return;
  for (const changeIdx of [0, 1]) {
    const chainNode = bip32Child(keys.acctPriv, keys.acctChain, changeIdx, false);
    for (let i = 0; i < 20; i++) {
      if (changeIdx === 0 && i === 0) continue; // skip first (already added)
      const child = bip32Child(chainNode.priv, chainNode.chain, i, false);
      const cpub  = secp256k1.getPublicKey(child.priv, true);
      const addr  = pubHashToCashAddr(ripemd160(sha256(cpub)));
      _hdAddresses.push({ priv: child.priv, pub: cpub, addr, path: changeIdx + '/' + i });
    }
  }
}

/* ══════════════════════════════════════════
   REFRESH BALANCE / UTXOS
   ══════════════════════════════════════════ */
async function refreshUtxos() {
  const keys = auth.getKeys();
  if (!keys || !window._fvCall) return;
  try {
    const allUtxos = [];
    for (const hd of _hdAddresses) {
      const h    = cashAddrToHash20(hd.addr);
      const script = p2pkhScript(h);
      const sh   = b2h(sha256(script).reverse());
      const raw  = await fvCall('blockchain.scripthash.listunspent', [sh]) || [];
      for (const u of raw) {
        allUtxos.push({ ...u, _addr: hd.addr });
      }
    }
    _utxos = allUtxos;
  } catch (e) { }
}

/* ══════════════════════════════════════════
   COMPUTE TXID from raw bytes
   ══════════════════════════════════════════ */
function computeTxid(rawBytes) {
  return b2h(dsha256(rawBytes).reverse());
}

/* ══════════════════════════════════════════
   PRE-SIGNED CHAIN BUILDER — THE CORE
   ══════════════════════════════════════════ */
async function buildSubscriptionChain(amountSats, periods, recipAddr, intervalDays, label, peerPub) {
  const keys = auth.getKeys();
  if (!keys || !keys.privKey || !window._fvCall) throw new Error('Wallet not ready');

  const recipHash = cashAddrToHash20(recipAddr);
  const myHash160 = keys.hash160;
  const myScript  = p2pkhScript(myHash160);
  const myPub33   = keys.pubKey;
  const privKey   = keys.privKey;

  // Calculate fees
  const feePerTx  = Math.ceil(estimateTxSize(1, 2) * FEE_RATE); // 1in, 2out
  const feeLastTx = Math.ceil(estimateTxSize(1, 1) * FEE_RATE); // 1in, 1out
  const totalFees = feePerTx * (periods - 1) + feeLastTx;
  const totalNeeded = amountSats * periods + totalFees;

  // Select UTXOs for funding TX
  await refreshUtxos();
  const sorted = [..._utxos].sort((a, b) => b.value - a.value);
  let selected = [], selectedTotal = 0;
  for (const u of sorted) {
    selected.push(u);
    selectedTotal += u.value;
    if (selectedTotal >= totalNeeded + Math.ceil(estimateTxSize(selected.length, 2) * FEE_RATE)) break;
  }

  const fundingFee = Math.ceil(estimateTxSize(selected.length,
    selectedTotal > totalNeeded + 546 + estimateTxSize(selected.length, 2) * FEE_RATE ? 2 : 1
  ) * FEE_RATE);
  if (selectedTotal < totalNeeded + fundingFee) throw new Error('Insufficient funds');

  const fundingChange = selectedTotal - totalNeeded - fundingFee;

  // Build funding TX outputs: locked amount → self, optional change → self
  const fundOutputs = [{ value: totalNeeded, script: myScript }];
  if (fundingChange >= 546) fundOutputs.push({ value: fundingChange, script: myScript });

  // Build funding TX inputs
  const fundInputs = selected.map(u => ({
    txidLE:    h2b(u.tx_hash).reverse(),
    vout:      u.tx_pos,
    value:     u.value,
    sequence:  0xFFFFFFFF,
    scriptSig: new Uint8Array(0)
  }));

  // Sign funding TX (version 1, locktime 0)
  for (let i = 0; i < fundInputs.length; i++) {
    let priv = privKey;
    const utxoAddr = selected[i]._addr;
    if (utxoAddr) {
      const match = _hdAddresses.find(a => a.addr === utxoAddr);
      if (match) priv = match.priv;
    }
    const pub = secp256k1.getPublicKey(priv, true);
    const hash = bchSighash(1, 0, fundInputs, fundOutputs, i, p2pkhScript(ripemd160(sha256(pub))), fundInputs[i].value);
    const sig  = secp256k1.sign(hash, priv, { lowS: true });
    const derSig = concat(sig.toDERRawBytes(), new Uint8Array([0x41]));
    fundInputs[i].scriptSig = concat(
      new Uint8Array([derSig.length]), derSig,
      new Uint8Array([pub.length]), pub
    );
  }

  const fundRaw  = serializeTx(1, 0, fundInputs, fundOutputs);
  const fundTxid = computeTxid(fundRaw);

  // Broadcast funding TX
  const broadcastResult = await fvCall('blockchain.transaction.broadcast', [b2h(fundRaw)]);

  // Build pre-signed chain of time-locked TXs
  const now = Math.floor(Date.now() / 1000);
  const chainTxs = [];

  for (let p = 1; p <= periods; p++) {
    const locktime = now + (p * intervalDays * 86400);

    // Input: previous TX's first output (the locked chain amount)
    const prevTxid   = p === 1 ? fundTxid : chainTxs[p - 2].txid;
    const prevVout   = 0;
    const inputValue = p === 1 ? totalNeeded : chainTxs[p - 2].changeValue;

    // Outputs: payment to recipient, optional change to self
    const payOutput = { value: amountSats, script: p2pkhScript(recipHash) };
    let outputs, fee, changeValue = 0;

    if (p < periods) {
      fee = feePerTx;
      changeValue = inputValue - amountSats - fee;
      outputs = [payOutput, { value: changeValue, script: myScript }];
    } else {
      fee = feeLastTx;
      outputs = [payOutput];
    }

    const input = {
      txidLE:    h2b(prevTxid).reverse(),
      vout:      prevVout,
      value:     inputValue,
      sequence:  0xFFFFFFFE, // CRITICAL: enables nLockTime
      scriptSig: new Uint8Array(0)
    };

    // Sign with version 2, locktime set
    const hash = bchSighash(2, locktime, [input], outputs, 0, myScript, inputValue);
    const sig  = secp256k1.sign(hash, privKey, { lowS: true });
    const derSig = concat(sig.toDERRawBytes(), new Uint8Array([0x41]));
    input.scriptSig = concat(
      new Uint8Array([derSig.length]), derSig,
      new Uint8Array([myPub33.length]), myPub33
    );

    const raw  = serializeTx(2, locktime, [input], outputs);
    const txid = computeTxid(raw);

    chainTxs.push({
      raw_hex:     b2h(raw),
      locktime,
      period:      p,
      txid,
      status:      'pending',
      changeValue,
      inputValue
    });
  }

  // Create subscription record
  const sub = {
    id:             'sub_' + b2h(rand(8)),
    type:           'fixed_bch',
    role:           'payer',
    amount:         amountSats,
    currency:       'BCH',
    interval_days:  intervalDays,
    total_periods:  periods,
    label:          label || 'Subscription',
    peer_addr:      recipAddr,
    peer_pub:       peerPub || '',
    funding_txid:   typeof broadcastResult === 'string' ? broadcastResult : fundTxid,
    funding_vout:   0,
    chain_txs:      chainTxs,
    periods_paid:   0,
    status:         'active',
    created_at:     now
  };

  _subscriptions.push(sub);
  saveSubscriptions();

  // Send chain to receiver via Nostr if peer pubkey provided
  if (peerPub && _sessionPriv) {
    try {
      const chainData = JSON.stringify({
        type:           'sub_chain',
        sub_id:         sub.id,
        chain_txs:      chainTxs.map(t => ({ raw_hex: t.raw_hex, locktime: t.locktime, period: t.period, txid: t.txid })),
        label:          sub.label,
        amount:         amountSats,
        interval_days:  intervalDays,
        total_periods:  periods,
        payer_addr:     keys.bchAddr,
        funding_txid:   sub.funding_txid,
        funding_vout:   0
      });
      const encrypted = await nip04Encrypt(_sessionPriv, peerPub, chainData);
      const ev = await makeEvent(_sessionPriv, NOSTR_KIND_SUB_CHAIN, encrypted, [['p', peerPub], ['t', '0penw0rld-sub']]);
      nostrPublish(ev);
    } catch (e) {
    }
  }

  return sub;
}

/* ══════════════════════════════════════════
   CANCEL SUBSCRIPTION
   ══════════════════════════════════════════ */
async function cancelSubscription(subId) {
  const sub = _subscriptions.find(s => s.id === subId);
  if (!sub || sub.type !== 'fixed_bch' || sub.role !== 'payer') {
    showToast('Cannot cancel this subscription', 'error');
    return;
  }

  const keys = auth.getKeys();
  if (!keys) { showToast('Wallet locked', 'error'); return; }

  const myHash160 = keys.hash160;
  const myScript  = p2pkhScript(myHash160);
  const myPub33   = keys.pubKey;
  const privKey   = keys.privKey;

  // Find the UTXO to spend (change output from last broadcast, or funding output)
  let spendTxid, spendVout, spendValue;
  const broadcastTxs = sub.chain_txs.filter(t => t.status === 'broadcast');

  if (broadcastTxs.length > 0) {
    const last = broadcastTxs[broadcastTxs.length - 1];
    if (!last.changeValue || last.changeValue < 546) {
      showToast('No remaining funds to reclaim', 'info');
      sub.status = 'cancelled';
      sub.chain_txs.forEach(t => { if (t.status === 'pending') t.status = 'invalidated'; });
      saveSubscriptions();
      _renderActive();
      return;
    }
    spendTxid  = last.txid;
    spendVout  = 1; // change is always output index 1
    spendValue = last.changeValue;
  } else {
    spendTxid  = sub.funding_txid;
    spendVout  = sub.funding_vout || 0;
    spendValue = sub.chain_txs[0]?.inputValue || 0;
  }

  if (!spendTxid || !spendValue || spendValue < 546) {
    showToast('Nothing to reclaim', 'error');
    return;
  }

  const fee = Math.ceil(estimateTxSize(1, 1) * FEE_RATE);
  const outputs = [{ value: spendValue - fee, script: myScript }];

  if (outputs[0].value < 546) {
    showToast('Remaining amount too small to reclaim', 'error');
    return;
  }

  const input = {
    txidLE:    h2b(spendTxid).reverse(),
    vout:      spendVout,
    value:     spendValue,
    sequence:  0xFFFFFFFF,
    scriptSig: new Uint8Array(0)
  };

  const hash = bchSighash(1, 0, [input], outputs, 0, myScript, spendValue);
  const sig  = secp256k1.sign(hash, privKey, { lowS: true });
  const derSig = concat(sig.toDERRawBytes(), new Uint8Array([0x41]));
  input.scriptSig = concat(
    new Uint8Array([derSig.length]), derSig,
    new Uint8Array([myPub33.length]), myPub33
  );

  const rawHex = b2h(serializeTx(1, 0, [input], outputs));

  try {
    await fvCall('blockchain.transaction.broadcast', [rawHex]);
    sub.status = 'cancelled';
    sub.chain_txs.forEach(t => { if (t.status === 'pending') t.status = 'invalidated'; });
    saveSubscriptions();
    _renderActive();
    _renderHistory();
    showToast('Subscription cancelled \u2014 ' + satsToBch(outputs[0].value) + ' BCH returned', 'success');
  } catch (e) {
    showToast('Cancel failed: ' + (e.message || e), 'error');
  }
}

/* ══════════════════════════════════════════
   SETTLEMENT CHECKER (auto-broadcast)
   ══════════════════════════════════════════ */
async function checkSubSettlements() {
  if (!window._fvCall) return;

  for (const sub of _subscriptions) {
    if (sub.status !== 'active') continue;

    // BCH mode, receiver role: broadcast when locktime passes
    if (sub.type === 'fixed_bch' && sub.role === 'receiver') {
      const now = Math.floor(Date.now() / 1000);
      for (const tx of sub.chain_txs) {
        if (tx.status !== 'pending') continue;
        if (now < tx.locktime) continue;

        try {
          const result = await fvCall('blockchain.transaction.broadcast', [tx.raw_hex]);
          tx.status = 'broadcast';
          tx.broadcast_txid = result;
          sub.periods_paid++;
          if (sub.periods_paid >= sub.total_periods) sub.status = 'completed';
          saveSubscriptions();
          _renderActive();
          _renderHistory();
          showToast('Subscription payment received: period ' + tx.period + '/' + sub.total_periods, 'success');
        } catch (e) {
          const msg = e.message || String(e);
          if (msg.includes('missing') || msg.includes('spent') || msg.includes('Missing inputs')) {
            tx.status = 'cancelled';
            sub.status = 'cancelled';
            saveSubscriptions();
            _renderActive();
            _renderHistory();
            showToast('Subscription cancelled by payer (input spent)', 'info');
          }
        }
        break; // only try one TX at a time per sub
      }
    }
    // USD mode is handled by the Nostr invoice handler
  }
}

function startSettlementChecker() {
  if (_settlementInterval) clearInterval(_settlementInterval);
  _settlementInterval = setInterval(checkSubSettlements, 30000);
  setTimeout(checkSubSettlements, 5000); // first check after 5s
}

function stopSettlementChecker() {
  if (_settlementInterval) { clearInterval(_settlementInterval); _settlementInterval = null; }
}

/* ══════════════════════════════════════════
   USD MODE — NOSTR INVOICE HANDLING
   ══════════════════════════════════════════ */
async function sendInvoice(subId) {
  const keys = auth.getKeys();
  const sub = _subscriptions.find(s => s.id === subId && s.role === 'receiver');
  if (!sub || !sub.peer_pub || !_sessionPriv || !keys) return;

  const invoice = {
    type:             'sub_invoice',
    sub_id:           subId,
    amount_usd_cents: sub.amount,
    period:           sub.periods_paid + 1,
    addr:             keys.bchAddr
  };

  const encrypted = await nip04Encrypt(_sessionPriv, sub.peer_pub, JSON.stringify(invoice));
  const ev = await makeEvent(_sessionPriv, NOSTR_KIND_SUB_INVOICE, encrypted, [['p', sub.peer_pub], ['t', '0penw0rld-sub']]);
  nostrPublish(ev);
  showToast('Invoice sent for period ' + invoice.period, 'success');
}

async function handleInvoiceEvent(ev) {
  try {
    const plain = await nip04Decrypt(_sessionPriv, ev.pubkey, ev.content);
    if (!plain) return;
    const invoice = JSON.parse(plain);
    if (invoice.type !== 'sub_invoice') return;

    const sub = _subscriptions.find(s => s.id === invoice.sub_id && s.type === 'fixed_usd' && s.role === 'payer' && s.status === 'active');
    if (!sub) return;
    if (sub.periods_paid >= sub.total_periods) return;

    const keys = auth.getKeys();
    if (!keys) return;

    // Fetch BCH price from Kraken
    let bchPrice = 0;
    try {
      const resp = await fetch('https://api.kraken.com/0/public/Ticker?pair=BCHUSD');
      const data = await resp.json();
      bchPrice = parseFloat(data.result?.BCHUSD?.c?.[0]) || 0;
    } catch {}
    if (!bchPrice) { // removed; return; }

    const amtSats = Math.round((invoice.amount_usd_cents / 100) / bchPrice * 1e8);
    if (amtSats < 546) return;

    // Build and broadcast payment TX
    await refreshUtxos();
    const sorted = [..._utxos].sort((a, b) => b.value - a.value);
    let selected = [], selectedTotal = 0;
    for (const u of sorted) {
      selected.push(u);
      selectedTotal += u.value;
      if (selectedTotal >= amtSats + 1000) break;
    }

    const fee = Math.ceil(estimateTxSize(selected.length, 2) * FEE_RATE);
    if (selectedTotal < amtSats + fee) { // removed; return; }

    const recipHash = cashAddrToHash20(invoice.addr);
    const myScript  = p2pkhScript(keys.hash160);
    const myPub33   = keys.pubKey;
    const privKey   = keys.privKey;
    const change    = selectedTotal - amtSats - fee;

    const outputs = [{ value: amtSats, script: p2pkhScript(recipHash) }];
    if (change >= 546) outputs.push({ value: change, script: myScript });

    const inputs = selected.map(u => ({
      txidLE:    h2b(u.tx_hash).reverse(),
      vout:      u.tx_pos,
      value:     u.value,
      sequence:  0xFFFFFFFF,
      scriptSig: new Uint8Array(0)
    }));

    for (let i = 0; i < inputs.length; i++) {
      const hash = bchSighash(1, 0, inputs, outputs, i, myScript, inputs[i].value);
      const sig  = secp256k1.sign(hash, privKey, { lowS: true });
      const derSig = concat(sig.toDERRawBytes(), new Uint8Array([0x41]));
      inputs[i].scriptSig = concat(
        new Uint8Array([derSig.length]), derSig,
        new Uint8Array([myPub33.length]), myPub33
      );
    }

    const rawHex = b2h(serializeTx(1, 0, inputs, outputs));
    await fvCall('blockchain.transaction.broadcast', [rawHex]);

    sub.periods_paid++;
    sub.last_paid_ts = Math.floor(Date.now() / 1000);
    sub.next_due_ts  = sub.last_paid_ts + sub.interval_days * 86400;
    if (sub.periods_paid >= sub.total_periods) sub.status = 'completed';
    saveSubscriptions();
    _renderActive();
    _renderHistory();
    showToast('Auto-paid $' + (invoice.amount_usd_cents / 100).toFixed(2) + ' (' + satsToBch(amtSats) + ' BCH) \u2014 period ' + invoice.period, 'success');
  } catch (e) {
  }
}

/* ══════════════════════════════════════════
   NOSTR EVENT HANDLER (incoming subs + invoices)
   ══════════════════════════════════════════ */
function handleSubNostrEvent(ev) {
  if (_seenEvents.has(ev.id)) return;
  _seenEvents.add(ev.id);
  if (_seenEvents.size > 5000) {
    const arr = [..._seenEvents];
    _seenEvents = new Set(arr.slice(-2500));
  }

  if (ev.kind === NOSTR_KIND_SUB_CHAIN) {
    (async () => {
      try {
        const plain = await nip04Decrypt(_sessionPriv, ev.pubkey, ev.content);
        if (!plain) return;
        const data = JSON.parse(plain);
        if (data.type !== 'sub_chain') return;

        // Check if we already have this subscription
        if (_subscriptions.some(s => s.id === data.sub_id)) return;

        const sub = {
          id:            data.sub_id,
          type:          'fixed_bch',
          role:          'receiver',
          amount:        data.amount,
          currency:      'BCH',
          interval_days: data.interval_days,
          total_periods: data.total_periods,
          label:         data.label || 'Incoming Subscription',
          peer_addr:     data.payer_addr || '',
          peer_pub:      ev.pubkey,
          funding_txid:  data.funding_txid,
          funding_vout:  data.funding_vout || 0,
          chain_txs:     data.chain_txs.map(t => ({ ...t, status: 'pending' })),
          periods_paid:  0,
          status:        'active',
          created_at:    Math.floor(Date.now() / 1000)
        };

        _subscriptions.push(sub);
        saveSubscriptions();
        _renderActive();
        _renderIncoming();
        _renderHistory();
        showToast('New subscription received: ' + sub.label, 'success');
      } catch (e) {
      }
    })();
  }

  if (ev.kind === NOSTR_KIND_SUB_INVOICE) {
    handleInvoiceEvent(ev);
  }
}

/* ══════════════════════════════════════════
   NOSTR SUBSCRIPTION SETUP
   ══════════════════════════════════════════ */
function startNostrListeners() {
  if (!_sessionPub) return;
  const now = Math.floor(Date.now() / 1000);

  nostrSubscribe(
    [{ kinds: [NOSTR_KIND_SUB_CHAIN], '#p': [_sessionPub], since: now - 86400 }],
    (ev) => handleSubNostrEvent(ev)
  ).then(subId => { if (subId) _nostrSubIds.push(subId); });

  nostrSubscribe(
    [{ kinds: [NOSTR_KIND_SUB_INVOICE], '#p': [_sessionPub], since: now - 86400 }],
    (ev) => handleSubNostrEvent(ev)
  ).then(subId => { if (subId) _nostrSubIds.push(subId); });
}

function stopNostrListeners() {
  for (const subId of _nostrSubIds) nostrUnsubscribe(subId);
  _nostrSubIds = [];
}

/* ══════════════════════════════════════════
   HELPER: next payment date
   ══════════════════════════════════════════ */
function getNextPaymentDate(sub) {
  if (sub.type === 'fixed_bch') {
    const nextTx = sub.chain_txs.find(t => t.status === 'pending');
    if (!nextTx) return 'done';
    const d = new Date(nextTx.locktime * 1000);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  } else {
    if (!sub.next_due_ts) return '\u2014';
    const d = new Date(sub.next_due_ts * 1000);
    return d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

/* ══════════════════════════════════════════
   TEMPLATE
   ══════════════════════════════════════════ */
function _template() {
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon"><img src="icons/sub.png" style="width:28px;height:28px"></div><div><div class="dt-page-title">Subscriptions</div><div class="dt-page-sub">BCH Recurring Payments \u00B7 Trustless</div></div></div>
      <div class="dt-page-actions"><div class="dt-oracle" id="dt-sub-oracle">BCH $\u2014</div></div>
    </div>
    <div class="dt-tabs" id="dt-sub-tabs">
      <button class="dt-tab active" data-tab="create"><span>+</span> Create</button>
      <button class="dt-tab" data-tab="active">Active</button>
      <button class="dt-tab" data-tab="receive"><span>\u2193</span> Receive</button>
      <button class="dt-tab" data-tab="history">History</button>
    </div>
    <div class="dt-pane" id="dt-sub-p-active">
      <div id="dt-sub-active-list"><div class="dt-empty"><div class="dt-empty-icon">\u21BB</div><div class="dt-empty-text">No active subscriptions</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Create one or scan for incoming</div></div></div>
    </div>
    <div class="dt-pane active" id="dt-sub-p-create">
      <div class="dt-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px"><div class="dt-card-title" style="margin:0">NEW SUBSCRIPTION</div>${infoBtn('<b>Fixed BCH</b> \u2014 Your wallet pre-signs a chain of time-locked transactions. Each payment unlocks on schedule. The receiver broadcasts them \u2014 your wallet can be closed. Cancel anytime by spending the change output.<br><br><b>Fixed USD</b> \u2014 Your wallet listens for Nostr invoices from the merchant, converts USD to BCH at current price, and auto-pays. Wallet must be open.')}</div>
        <div class="dt-form-group"><div class="dt-form-lbl">MODE</div>
          <div class="dt-toggle-group"><button class="dt-toggle-btn active" id="sub-mode-bch" data-mode="bch">Fixed BCH</button><button class="dt-toggle-btn" id="sub-mode-usd" data-mode="usd">Fixed USD</button></div>
        </div>
        <div class="dt-form-group" id="dt-sub-amt-group"><div class="dt-form-lbl" id="dt-sub-amt-lbl">AMOUNT (SATS)</div><input class="dt-form-input" id="dt-sub-sats" type="number" value="1000" min="1" placeholder="1000"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">EVERY (DAYS)</div><input class="dt-form-input" id="dt-sub-days" type="number" value="30" min="1" placeholder="30"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">NUMBER OF PERIODS</div><input class="dt-form-input" id="dt-sub-periods" type="number" value="12" min="1" max="52" placeholder="12"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">RECIPIENT ADDRESS</div><input class="dt-form-input" id="dt-sub-addr" placeholder="bitcoincash:qp..."></div>
        <div class="dt-form-group"><div class="dt-form-lbl">RECIPIENT NOSTR PUBKEY (FOR NOTIFICATIONS)</div><input class="dt-form-input" id="dt-sub-nostr" placeholder="hex pubkey (optional for BCH mode)"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">LABEL</div><input class="dt-form-input" id="dt-sub-label" placeholder="e.g. VPN monthly, Server hosting..."></div>
        <div style="background:var(--dt-bg,#f5f6f8);border-radius:10px;padding:14px 18px;margin-bottom:16px">
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--dt-text-secondary)"><span>Per period</span><span id="dt-sub-per" style="color:var(--dt-text);font-weight:600">\u2014</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:var(--dt-text-secondary)"><span>Est. fees (total)</span><span id="dt-sub-fees" style="color:var(--dt-text);font-weight:600">\u2014</span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-top:1px solid var(--dt-border);margin-top:4px"><span style="font-weight:700;color:var(--dt-text)">Total locked</span><span id="dt-sub-total" style="color:var(--dt-accent);font-weight:700">\u2014</span></div>
        </div>
        <button class="dt-action-btn" style="background:var(--dt-accent)" id="dt-sub-create-btn">Create Subscription</button>
        <div class="dt-error" id="dt-sub-err" style="margin-top:8px;font-size:12px;color:var(--dt-error,#ff4040)"></div>
      </div>
      <div class="dt-card" style="margin-top:20px">
        <div class="dt-card-title">HOW IT WORKS</div>
        <div style="font-size:13px;color:var(--dt-text-secondary);line-height:1.8">
          <p style="margin:0 0 12px"><b style="color:var(--dt-text)">Fixed BCH</b> \u2014 Your wallet pre-signs a chain of time-locked transactions. Each payment unlocks on schedule. The receiver broadcasts them \u2014 your wallet can be closed. Cancel anytime by spending the change output.</p>
          <p style="margin:0"><b style="color:var(--dt-text)">Fixed USD</b> \u2014 Your wallet listens for Nostr invoices from the merchant, converts USD to BCH at current price, and auto-pays. Wallet must be open.</p>
        </div>
      </div>
    </div>
    <div class="dt-pane" id="dt-sub-p-receive">
      <div class="dt-card">
        <div class="dt-card-title">ACCEPT RECURRING PAYMENTS</div>
        <div class="dt-form-group"><div class="dt-form-lbl">AMOUNT (SATS)</div><input class="dt-form-input" id="dt-sub-recv-amount" type="number" placeholder="1000"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">EVERY (DAYS)</div><input class="dt-form-input" id="dt-sub-recv-interval" type="number" value="30"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">NUMBER OF PERIODS</div><input class="dt-form-input" id="dt-sub-recv-periods" type="number" value="12"></div>
        <button class="dt-action-btn" id="dt-sub-gen-link" style="background:var(--dt-accent)">Generate Subscription Link</button>
        <div id="dt-sub-link-display" style="display:none;margin-top:16px;padding:12px;background:var(--dt-bg,#f5f6f8);border:1px solid var(--dt-border);border-radius:8px;word-break:break-all;font-size:11px;color:var(--dt-text-secondary)"></div>
      </div>
      <div class="dt-card" style="margin-top:16px">
        <div class="dt-card-title">INCOMING SUBSCRIPTIONS</div>
        <div id="dt-sub-incoming-list"><div class="dt-empty"><div class="dt-empty-icon">\u2193</div><div class="dt-empty-text">No incoming subscriptions yet</div></div></div>
      </div>
      <div class="dt-card" style="margin-top:16px;text-align:center;padding:24px">
        <div style="font-size:14px;font-weight:600;color:var(--dt-text);margin-bottom:8px">Your Address</div>
        <div style="font-size:13px;color:var(--dt-text-secondary);line-height:1.6;margin-bottom:12px">Share your address or Nostr pubkey to receive recurring BCH payments.</div>
        <div class="dt-addr" id="dt-sub-myaddr" style="font-size:11px;word-break:break-all;margin-bottom:12px">\u2014</div>
        <button class="dt-copy-btn" id="dt-sub-copy" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">Copy Address</button>
      </div>
    </div>
    <div class="dt-pane" id="dt-sub-p-history">
      <div id="dt-sub-history-list"><div class="dt-empty"><div class="dt-empty-icon">\uD83D\uDCCB</div><div class="dt-empty-text">No subscription history</div></div></div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════
   RENDER FUNCTIONS
   ══════════════════════════════════════════ */
function _renderActive() {
  const el = document.getElementById('dt-sub-active-list');
  if (!el) return;
  const active = _subscriptions.filter(s => s.status === 'active');

  if (!active.length) {
    el.innerHTML = '<div class="dt-empty"><div class="dt-empty-icon">\u21BB</div><div class="dt-empty-text">No active subscriptions</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Create one or scan for incoming</div></div>';
    return;
  }

  el.innerHTML = active.map(s => {
    const pct     = s.total_periods > 0 ? Math.round((s.periods_paid / s.total_periods) * 100) : 0;
    const amtStr  = s.currency === 'BCH' ? s.amount.toLocaleString() + ' sats' : '$' + (s.amount / 100).toFixed(2);
    const nextDate = getNextPaymentDate(s);
    const roleTag  = s.role === 'receiver'
      ? '<span style="background:rgba(76,175,80,.12);color:#4caf50;padding:2px 8px;border-radius:4px;font-size:10px;margin-left:8px">RECEIVING</span>'
      : '';

    return '<div class="dt-card" style="margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<div><span style="font-weight:700;color:var(--dt-text)">' + _esc(s.label || 'Subscription') + '</span>' + roleTag + '</div>'
      + '<span style="color:var(--dt-text-secondary);font-size:12px">' + amtStr + ' / ' + s.interval_days + 'd</span>'
      + '</div>'
      + '<div style="background:var(--dt-border);border-radius:4px;height:6px;margin-bottom:8px;overflow:hidden">'
      + '<div style="width:' + pct + '%;height:100%;background:var(--dt-accent);border-radius:4px;transition:width .3s"></div>'
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-size:11px;color:var(--dt-text-secondary)">' + s.periods_paid + '/' + s.total_periods + ' paid \u00B7 Next: ' + nextDate + '</span>'
      + (s.role === 'payer' && s.type === 'fixed_bch'
        ? '<button class="dt-action-btn-outline dt-sub-cancel-btn" style="width:auto;padding:4px 12px;font-size:11px;color:var(--dt-error,#ff4040);border-color:var(--dt-error,#ff4040)" data-subid="' + s.id + '">Cancel</button>'
        : '')
      + '</div>'
      + '</div>';
  }).join('');

  // Bind cancel buttons
  el.querySelectorAll('.dt-sub-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const subId = btn.dataset.subid;
      if (confirm('Cancel this subscription? Remaining funds will be returned to your wallet.')) {
        cancelSubscription(subId);
      }
    });
  });
}

function _renderIncoming() {
  const el = document.getElementById('dt-sub-incoming-list');
  if (!el) return;
  const incoming = _subscriptions.filter(s => s.role === 'receiver' && s.status === 'active');
  if (!incoming.length) {
    el.innerHTML = '<div class="dt-empty"><div class="dt-empty-icon">\u2193</div><div class="dt-empty-text">No incoming subscriptions yet</div></div>';
    return;
  }
  el.innerHTML = incoming.map(s => {
    const pct = s.total_periods > 0 ? Math.round((s.periods_paid / s.total_periods) * 100) : 0;
    return '<div style="padding:12px;background:var(--dt-bg,#f5f6f8);border:1px solid var(--dt-border);border-radius:8px;margin-bottom:8px">'
      + '<div style="font-weight:700;color:var(--dt-text);margin-bottom:4px">' + _esc(s.label || 'Subscription') + '</div>'
      + '<div style="font-size:11px;color:var(--dt-text-secondary)">' + s.amount.toLocaleString() + ' sats \u00B7 ' + s.periods_paid + '/' + s.total_periods + ' paid (' + pct + '%)</div>'
      + '</div>';
  }).join('');
}

function _renderHistory() {
  const el = document.getElementById('dt-sub-history-list');
  if (!el) return;
  const history = _subscriptions.filter(s => s.status === 'completed' || s.status === 'cancelled');
  if (!history.length) {
    el.innerHTML = '<div class="dt-empty"><div class="dt-empty-icon">\uD83D\uDCCB</div><div class="dt-empty-text">No subscription history</div></div>';
    return;
  }
  el.innerHTML = history.map(s => {
    const statusBadge = s.status === 'completed'
      ? '<span style="color:#4caf50;font-size:10px;font-weight:700">COMPLETED</span>'
      : '<span style="color:var(--dt-error,#ff4040);font-size:10px;font-weight:700">CANCELLED</span>';
    return '<div style="padding:12px;background:var(--dt-bg,#f5f6f8);border:1px solid var(--dt-border);border-radius:8px;margin-bottom:8px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<span style="font-weight:700;color:var(--dt-text)">' + _esc(s.label || 'Subscription') + '</span>'
      + statusBadge
      + '</div>'
      + '<div style="font-size:11px;color:var(--dt-text-secondary);margin-top:4px">' + s.periods_paid + '/' + s.total_periods + ' paid \u00B7 ' + s.amount.toLocaleString() + ' sats/' + s.interval_days + 'd</div>'
      + '</div>';
  }).join('');
}

/* ── HTML escape helper ── */
function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ══════════════════════════════════════════
   BIND UI EVENTS
   ══════════════════════════════════════════ */
function _bind() {
  const keys = auth.getKeys();

  // ── Tab switching ──
  document.querySelectorAll('#dt-sub-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dt-sub-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      document.getElementById('dt-sub-p-' + btn.dataset.tab)?.classList.add('active');
    });
  });

  // ── Mode toggle (BCH / USD) ──
  _subMode = 'bch';
  document.querySelectorAll('.dt-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dt-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _subMode = btn.dataset.mode;
      const lbl = document.getElementById('dt-sub-amt-lbl');
      const inp = document.getElementById('dt-sub-sats');
      if (_subMode === 'usd') {
        if (lbl) lbl.textContent = 'AMOUNT (USD CENTS)';
        if (inp) { inp.placeholder = '500'; inp.step = '1'; inp.value = '500'; inp.min = '1'; }
      } else {
        if (lbl) lbl.textContent = 'AMOUNT (SATS)';
        if (inp) { inp.placeholder = '1000'; inp.step = '1'; inp.value = '1000'; inp.min = '1'; }
      }
      calcSummary();
    });
  });

  // ── Receive: address display + copy ──
  const addrEl = document.getElementById('dt-sub-myaddr');
  if (addrEl && keys?.bchAddr) addrEl.textContent = keys.bchAddr;
  document.getElementById('dt-sub-copy')?.addEventListener('click', async () => {
    if (keys?.bchAddr) {
      await navigator.clipboard.writeText(keys.bchAddr);
      const b = document.getElementById('dt-sub-copy');
      if (b) { b.textContent = '\u2713 Copied!'; setTimeout(() => b.textContent = 'Copy Address', 1500); }
    }
  });

  // ── Summary calculation ──
  const calcSummary = () => {
    const rawAmt  = parseFloat(document.getElementById('dt-sub-sats')?.value) || 0;
    const periods = parseInt(document.getElementById('dt-sub-periods')?.value) || 0;
    const perEl   = document.getElementById('dt-sub-per');
    const feesEl  = document.getElementById('dt-sub-fees');
    const totalEl = document.getElementById('dt-sub-total');

    if (!rawAmt || !periods) {
      if (perEl)   perEl.textContent = '\u2014';
      if (feesEl)  feesEl.textContent = '\u2014';
      if (totalEl) totalEl.textContent = '\u2014';
      return;
    }

    if (_subMode === 'bch') {
      const sats      = Math.round(rawAmt);
      const feePerTx  = Math.ceil(estimateTxSize(1, 2) * FEE_RATE);
      const feeLastTx = Math.ceil(estimateTxSize(1, 1) * FEE_RATE);
      const totalFees = feePerTx * (periods - 1) + feeLastTx;
      const totalSats = sats * periods + totalFees;

      const bchPer = (sats / 1e8).toFixed(8);
      const usdPer = _bchPrice > 0 ? (sats / 1e8) * _bchPrice : 0;
      const usdStr = usdPer > 0 ? ' \u2248 $' + usdPer.toFixed(2) : '';
      const feeUsd = _bchPrice > 0 ? (totalFees / 1e8) * _bchPrice : 0;
      const totalUsd = _bchPrice > 0 ? (totalSats / 1e8) * _bchPrice : 0;

      if (perEl)   perEl.textContent = sats > 0 ? bchPer + ' BCH' + usdStr : '\u2014';
      if (feesEl)  feesEl.textContent = periods > 0 ? (totalFees / 1e8).toFixed(8) + ' BCH' + (feeUsd > 0.01 ? ' \u2248 $' + feeUsd.toFixed(2) : '') : '\u2014';
      if (totalEl) totalEl.textContent = totalSats > 0 ? (totalSats / 1e8).toFixed(8) + ' BCH' + (totalUsd > 0.01 ? ' \u2248 $' + totalUsd.toFixed(2) : '') : '\u2014';
    } else {
      // USD cents mode
      const cents = Math.round(rawAmt);
      if (perEl)   perEl.textContent = '$' + (cents / 100).toFixed(2);
      if (feesEl)  feesEl.textContent = 'per-payment (~200 sats)';
      if (totalEl) totalEl.textContent = '$' + ((cents * periods) / 100).toFixed(2) + ' total';
    }
  };
  document.getElementById('dt-sub-sats')?.addEventListener('input', calcSummary);
  document.getElementById('dt-sub-days')?.addEventListener('input', calcSummary);
  document.getElementById('dt-sub-periods')?.addEventListener('input', calcSummary);
  calcSummary();

  // ── Create button ──
  document.getElementById('dt-sub-create-btn')?.addEventListener('click', async () => {
    const btn   = document.getElementById('dt-sub-create-btn');
    const errEl = document.getElementById('dt-sub-err');
    if (errEl) errEl.textContent = '';
    if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

    try {
      const amount    = parseInt(document.getElementById('dt-sub-sats')?.value) || 0;
      const interval  = parseInt(document.getElementById('dt-sub-days')?.value) || 0;
      const periods   = parseInt(document.getElementById('dt-sub-periods')?.value) || 0;
      const recipAddr = (document.getElementById('dt-sub-addr')?.value || '').trim();
      const peerPub   = (document.getElementById('dt-sub-nostr')?.value || '').trim();
      const label     = (document.getElementById('dt-sub-label')?.value || '').trim();

      if (!amount || amount < 546) throw new Error('Amount must be >= 546 sats');
      if (!interval || interval < 1) throw new Error('Interval must be >= 1 day');
      if (!periods || periods < 1) throw new Error('Periods must be >= 1');
      if (!recipAddr || !recipAddr.startsWith('bitcoincash:')) throw new Error('Invalid recipient address');

      if (_subMode === 'bch') {
        await buildSubscriptionChain(amount, periods, recipAddr, interval, label, peerPub);
        showToast('Subscription created! ' + periods + ' payments of ' + amount + ' sats', 'success');
        // Switch to Active tab
        _switchTab('active');
        _renderActive();
      } else {
        // USD mode: store locally, listen for invoices
        const sub = {
          id:            'sub_' + b2h(rand(8)),
          type:          'fixed_usd',
          role:          'payer',
          amount:        amount, // cents
          currency:      'USD',
          interval_days: interval,
          total_periods: periods,
          label:         label || 'USD Subscription',
          peer_addr:     recipAddr,
          peer_pub:      peerPub,
          last_paid_ts:  0,
          next_due_ts:   Math.floor(Date.now() / 1000) + interval * 86400,
          auto_approve:  true,
          periods_paid:  0,
          status:        'active',
          created_at:    Math.floor(Date.now() / 1000)
        };
        _subscriptions.push(sub);
        saveSubscriptions();
        showToast('USD subscription created \u2014 listening for invoices', 'success');
        _switchTab('active');
        _renderActive();
      }
    } catch (e) {
      if (errEl) errEl.textContent = e.message || 'Failed to create subscription';
      console.error('[SUB] Create error:', e);
    }

    if (btn) { btn.disabled = false; btn.textContent = 'Create Subscription'; }
  });

  // ── Generate subscription link (for receivers) ──
  document.getElementById('dt-sub-gen-link')?.addEventListener('click', () => {
    const keys = auth.getKeys();
    const amount   = document.getElementById('dt-sub-recv-amount')?.value || '';
    const interval = document.getElementById('dt-sub-recv-interval')?.value || '30';
    const periods  = document.getElementById('dt-sub-recv-periods')?.value || '12';

    const link = window.location.origin + '/sub.html?amount=' + amount
      + '&interval=' + interval
      + '&periods=' + periods
      + '&addr=' + encodeURIComponent(keys?.bchAddr || '')
      + '&pub=' + (_sessionPub || '')
      + '&mode=bch';

    const display = document.getElementById('dt-sub-link-display');
    if (display) {
      display.style.display = 'block';
      display.innerHTML = '<div style="margin-bottom:8px;color:var(--dt-text);font-weight:700">Subscription Link:</div>'
        + '<div style="word-break:break-all;font-size:11px;color:var(--dt-text-secondary);margin-bottom:12px">' + _esc(link) + '</div>'
        + '<button class="dt-action-btn-outline" id="dt-sub-copy-link" style="width:auto;padding:6px 14px;font-size:11px">Copy Link</button>';
      document.getElementById('dt-sub-copy-link')?.addEventListener('click', async () => {
        await navigator.clipboard.writeText(link);
        const b = document.getElementById('dt-sub-copy-link');
        if (b) { b.textContent = 'Copied \u2713'; setTimeout(() => b.textContent = 'Copy Link', 2000); }
      });
    }
  });

  // Load data and render
  loadSubscriptions();
  _renderActive();
  _renderIncoming();
  _renderHistory();
}

/* ── Helper: switch tab programmatically ── */
function _switchTab(name) {
  document.querySelectorAll('#dt-sub-tabs .dt-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
  const tabs  = document.querySelectorAll('#dt-sub-tabs .dt-tab');
  const names = ['create', 'active', 'receive', 'history'];
  const idx   = names.indexOf(name);
  if (idx >= 0 && tabs[idx]) tabs[idx].classList.add('active');
  const pane = document.getElementById('dt-sub-p-' + name);
  if (pane) pane.classList.add('active');
}

/* ══════════════════════════════════════════
   MOUNT / UNMOUNT
   ══════════════════════════════════════════ */
export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }

  const keys = auth.getKeys();

  container.innerHTML = _template();
  _bind();

  // Derive session keys for Nostr
  if (keys) {
    deriveSessionKeys(keys);
    buildHdAddresses(keys);
  }

  // Price oracle
  const prices = state.get('prices') || {};
  _bchPrice = prices.bch?.price || 0;
  const oracleEl = document.getElementById('dt-sub-oracle');
  if (oracleEl && _bchPrice) oracleEl.textContent = 'BCH $' + _bchPrice.toFixed(2);
  _unsubs.push(state.subscribe('prices', p => {
    _bchPrice = p?.bch?.price || 0;
    if (oracleEl) oracleEl.textContent = 'BCH $' + (_bchPrice ? _bchPrice.toFixed(2) : '\u2014');
  }));

  // Start background services
  startNostrListeners();
  startSettlementChecker();

  // Periodic UTXO refresh
  refreshUtxos();
  _balanceInterval = setInterval(refreshUtxos, 30000);
}

export function unmount() {
  _unsubs.forEach(fn => fn());
  _unsubs = [];
  stopNostrListeners();
  stopSettlementChecker();
  if (_balanceInterval) { clearInterval(_balanceInterval); _balanceInterval = null; }
  _seenEvents.clear();
  if (_container) _container.innerHTML = '';
  _container = null;
}
