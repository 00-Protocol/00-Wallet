/* ══════════════════════════════════════════
   00 Wallet — Chat View (SPA v2)
   ══════════════════════════════════════════
   Complete port of the v1 chat.html protocol.
   Split-Knowledge E2E messaging over BCH + Nostr.

   CCSH v1: single-channel (OP_RETURN only)
   CCSH v2: dual-channel (BCH OP_RETURN + Nostr relay)
   XOR One-Time Pad + AES-256-GCM + X25519 ECDH
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { x25519 } from 'https://esm.sh/@noble/curves@1.8.1/ed25519';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import QRCode from 'https://esm.sh/qrcode@1.5.4';

import {
  h2b, b2h, concat, u32LE, u64LE, writeVarint, dsha256,
  CCSH_MAGIC, ccshEncryptMsg, ccshDecryptPacket, unpackPacket,
  CCSH_V2, MSG_SPLIT_CHAIN, MSG_SPLIT_RELAY, FLAG_SPLIT, NOSTR_KIND_CCSH,
  splitEncrypt, splitDecrypt, packV2, unpackAny,
  _deriveNostrPriv, _makeNostrEvent,
  cashAddrToHash20, privToBchAddr, _addrSH,
  p2pkhScript, p2pkhAddrScript, opReturnScript, bchSighash, serializeTx,
  parseTxOpReturns, extractSenderBchAddr,
  encryptVault, decryptVault,
  bip39Generate, bip39Seed, deriveProfileFromSeed,
} from '../core/ccsh-crypto.js';

import * as auth from '../core/auth.js';
import { pubHashToCashAddr } from '../core/cashaddr.js';
import { navigate } from '../router.js';

/* ── Module exports ── */
export const id = 'chat';
export const title = '00 Chat';
export const icon = '💬';

/* ── State ── */
let _container = null;
let _profile = null;
let _contacts = [];
let _activeIdx = -1;
let _sessionPass = null;
let _scanTimer = null;
let _nostrSubId = null;
let _balanceTimer = null;
let _pendingChainParts = new Map();
let _pendingRelayParts = new Map();
let _seenTxids = new Set();
let _attempts = 0;
const MAX_ATTEMPTS = 3;

/* Nostr direct WebSocket publishing */
const _PUBLISH_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social'];

/* ══════════════════════════════════════════
   FULCRUM HELPERS
   ══════════════════════════════════════════ */

async function _fvCall(method, params) {
  if (window._fvCall) return window._fvCall(method, params);
  throw new Error('Fulcrum not connected');
}

async function _bcGetAddr(addr) {
  const sh = _addrSH(addr);
  const [hist, utxos] = await Promise.all([
    _fvCall('blockchain.scripthash.get_history', [sh]),
    _fvCall('blockchain.scripthash.listunspent', [sh]),
  ]);
  const utxoMapped = (utxos || []).map(u => ({
    transaction_hash: u.tx_hash, index: u.tx_pos, value: u.value,
    block_id: u.height === 0 ? -1 : u.height,
  }));
  const balance = utxoMapped.reduce((s, u) => s + u.value, 0);
  const txids = [...new Set((hist || []).map(h => h.tx_hash))].reverse();
  return { address: { balance }, utxo: utxoMapped, transactions: txids };
}

async function _bcGetTx(txid) {
  try { return await _fvCall('blockchain.transaction.get', [txid]); }
  catch { return null; }
}

async function _bcBroadcast(hexTx) {
  return await _fvCall('blockchain.transaction.broadcast', [hexTx]);
}

/* ══════════════════════════════════════════
   CONTACTS PERSISTENCE
   ══════════════════════════════════════════ */

function _loadContacts() {
  try { _contacts = JSON.parse(localStorage.getItem('00chat_contacts') || '[]'); } catch { _contacts = []; }
  _contacts.forEach(c => {
    if (!c.msgs?.length) return;
    const seenTxid = new Set(), seenContent = new Set();
    c.msgs = c.msgs.filter(m => {
      if (m.txid) { if (seenTxid.has(m.txid)) return false; seenTxid.add(m.txid); }
      else { const k = `${m.from}|${m.text}`; if (seenContent.has(k)) return false; seenContent.add(k); }
      return true;
    });
  });
  _saveContacts();
}

function _saveContacts() { localStorage.setItem('00chat_contacts', JSON.stringify(_contacts)); }
function _findContactByPub(pubHex) { return _contacts.find(c => c.pub_hex === pubHex); }

function _loadSeen() {
  try { _seenTxids = new Set(JSON.parse(localStorage.getItem('00chat_seen') || '[]')); } catch { _seenTxids = new Set(); }
}
function _persistSeen() {
  const arr = [..._seenTxids];
  if (arr.length > 500) _seenTxids = new Set(arr.slice(-500));
  localStorage.setItem('00chat_seen', JSON.stringify([..._seenTxids]));
}

/* ══════════════════════════════════════════
   NOSTR RELAY (direct WS for publishing)
   ══════════════════════════════════════════ */

function _nostrPublish(event) {
  for (const url of _PUBLISH_RELAYS) {
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => { ws.send(JSON.stringify(['EVENT', event])); setTimeout(() => ws.close(), 3000); };
      ws.onerror = () => {};
    } catch {}
  }
}

function _startNostrSub() {
  if (!_profile || _nostrSubId) return;
  const nostrSubscribe = window._nostrSubscribe;
  if (!nostrSubscribe) { console.warn('[chat] nostr bridge not available'); return; }
  const now = Math.floor(Date.now() / 1000);
  nostrSubscribe([{
    kinds: [NOSTR_KIND_CCSH],
    '#p': [_profile.x25519_pub_hex],
    since: now - 3600,
  }], _handleNostrEvent).then(subId => { _nostrSubId = subId; });
}

function _stopNostrSub() {
  if (_nostrSubId && window._nostrUnsubscribe) {
    window._nostrUnsubscribe(_nostrSubId);
  }
  _nostrSubId = null;
}

let _seenNostrEvents = new Set();

function _handleNostrEvent(ev) {
  if (ev.kind !== NOSTR_KIND_CCSH) return;
  if (_seenNostrEvents.has(ev.id)) return;
  _seenNostrEvents.add(ev.id);
  if (_seenNostrEvents.size > 5000) {
    const arr = [..._seenNostrEvents]; _seenNostrEvents = new Set(arr.slice(-2500));
  }
  try {
    const ccshTag = ev.tags.find(t => t[0] === 'ccsh');
    if (!ccshTag) return;
    const msgIdHex = ccshTag[1];
    const payload = h2b(ev.content);
    const packets = [];
    let pos = 0;
    while (pos < payload.length) {
      if (pos + 2 > payload.length) break;
      const pktLen = (payload[pos] << 8) | payload[pos + 1]; pos += 2;
      if (pos + pktLen > payload.length) break;
      packets.push(payload.slice(pos, pos + pktLen)); pos += pktLen;
    }
    if (!_pendingRelayParts.has(msgIdHex)) {
      _pendingRelayParts.set(msgIdHex, { chunks: [], ts: Date.now() });
    }
    const entry = _pendingRelayParts.get(msgIdHex);
    for (const pktBytes of packets) {
      try {
        const p = unpackAny(pktBytes);
        if (p.msg_type === MSG_SPLIT_RELAY) {
          entry.chunks.push({ idx: p.chunk_index, total: p.chunk_total, data: p.ciphertext_chunk });
        }
      } catch {}
    }
    entry.ts = Date.now();
    _tryDecryptV2(msgIdHex);
    const now = Date.now();
    for (const [k, v] of _pendingRelayParts) { if (now - v.ts > 3600_000) _pendingRelayParts.delete(k); }
  } catch (e) { console.debug('[chat/nostr] bad CCSH event:', e.message); }
}

/* ══════════════════════════════════════════
   V2 DECRYPT ATTEMPT (chain + relay merge)
   ══════════════════════════════════════════ */

async function _tryDecryptV2(msgIdHex) {
  const chain = _pendingChainParts.get(msgIdHex);
  const relay = _pendingRelayParts.get(msgIdHex);
  if (!chain || !relay) return;
  if (!chain.chunks.length || !relay.chunks.length) return;
  if (chain.chunks.length !== chain.chunks[0].total) return;
  if (relay.chunks.length !== relay.chunks[0].total) return;
  const chainSorted = [...chain.chunks].sort((a, b) => a.idx - b.idx);
  const relaySorted = [...relay.chunks].sort((a, b) => a.idx - b.idx);
  const chainData = chainSorted.length === 1 ? chainSorted[0].data : concat(...chainSorted.map(c => c.data));
  const relayData = relaySorted.length === 1 ? relaySorted[0].data : concat(...relaySorted.map(c => c.data));
  if (chainData.length < 32) return;
  const ephPub = chainData.slice(0, 32);
  const chainBlob = chainData.slice(32);
  const myPriv32 = h2b(_profile.x25519_priv_hex);
  try {
    const text = await splitDecrypt(chainBlob, relayData, ephPub, myPriv32);
    const senderPubHex = b2h(chain.sender_pub);
    let contact = _findContactByPub(senderPubHex);
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    if (!contact) {
      contact = { name: 'Unknown ' + senderPubHex.slice(0, 8), pub_hex: senderPubHex,
        bch_address: chain.senderBchAddr || '', avatar: '??', msgs: [], pending: true };
      _contacts.push(contact);
      _saveContacts();
    }
    contact.msgs = contact.msgs || [];
    if (contact.msgs.some(m => m.txid === chain.txid)) { _pendingChainParts.delete(msgIdHex); _pendingRelayParts.delete(msgIdHex); return; }
    const msg = { from: 'them', text, time, txid: chain.txid, v2: true };
    contact.msgs.push(msg);
    _saveContacts();
    _renderContacts();
    const ci = _contacts.indexOf(contact);
    if (_activeIdx >= 0 && _activeIdx === ci) _appendMsg(msg);
    _pendingChainParts.delete(msgIdHex);
    _pendingRelayParts.delete(msgIdHex);
  } catch (e) { console.debug('[chat/v2] decrypt failed:', e.message); }
}

/* ══════════════════════════════════════════
   INBOX SCANNER
   ══════════════════════════════════════════ */

async function _scanInbox() {
  if (!_profile) return;
  try {
    const addrData = await _bcGetAddr(_profile.bch_address);
    const confirmedTxids = addrData?.transactions || [];
    const unconfirmedTxids = (addrData?.utxo || [])
      .filter(u => u.block_id === -1 && u.transaction_hash)
      .map(u => u.transaction_hash);
    const txids = [...new Set([...unconfirmedTxids, ...confirmedTxids])];
    const myPriv32 = h2b(_profile.x25519_priv_hex);

    for (const txid of txids.slice(0, 20)) {
      if (_seenTxids.has(txid)) continue;
      _seenTxids.add(txid); _persistSeen();
      const rawHex = await _bcGetTx(txid);
      if (!rawHex) { _seenTxids.delete(txid); continue; }

      for (const payload of parseTxOpReturns(rawHex)) {
        if (payload[0] !== 0x43 || payload[1] !== 0x43 || payload[2] !== 0x53 || payload[3] !== 0x48) continue;
        const pktVersion = payload[4];

        /* v2 SPLIT_CHAIN */
        if (pktVersion === CCSH_V2) {
          try {
            const pkt = unpackAny(payload);
            if (pkt.msg_type !== MSG_SPLIT_CHAIN) continue;
            const msgIdHex = b2h(pkt.msg_id);
            if (!_pendingChainParts.has(msgIdHex)) {
              _pendingChainParts.set(msgIdHex, {
                chunks: [], sender_pub: pkt.sender_pub, txid,
                senderBchAddr: extractSenderBchAddr(rawHex) || '', ts: Date.now()
              });
            }
            const entry = _pendingChainParts.get(msgIdHex);
            entry.chunks.push({ idx: pkt.chunk_index, total: pkt.chunk_total, data: pkt.ciphertext_chunk });
            await _tryDecryptV2(msgIdHex);
          } catch (e) { console.debug('[chat/v2] chain parse error:', e.message); }
          continue;
        }

        /* v1 handling */
        try {
          const { text, senderPubHex, msgType } = await ccshDecryptPacket(payload, myPriv32);
          let contact = _findContactByPub(senderPubHex);
          const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

          if (msgType === 0x01) {
            if (!contact) {
              contact = {
                name: 'Unknown ' + senderPubHex.slice(0, 8),
                pub_hex: senderPubHex, bch_address: extractSenderBchAddr(rawHex) || '',
                avatar: '??', msgs: [], pending: true,
              };
              _contacts.push(contact);
              _saveContacts(); _renderContacts();
            }
            contact.msgs = contact.msgs || [];
            if (contact.msgs.some(m => m.txid === txid)) continue;
            const untagged = contact.msgs.find(m => !m.txid && m.from === 'them' && m.text === text);
            if (untagged) { untagged.txid = txid; _saveContacts(); continue; }
            const msg = { from: 'them', text, time, txid };
            contact.msgs.push(msg);
            _saveContacts(); _renderContacts();
            const ci = _contacts.indexOf(contact);
            if (_activeIdx >= 0 && _activeIdx === ci) _appendMsg(msg);
          } else if (msgType === 0x02) {
            /* ADDR_CHANGE */
            try {
              let newAddr, newPubHex;
              if (text.includes('|') && !text.startsWith('{')) {
                const [rawAddr, b64] = text.split('|');
                newAddr = 'bitcoincash:' + rawAddr;
                const pad = b64.length % 4 ? '='.repeat(4 - b64.length % 4) : '';
                newPubHex = b2h(Uint8Array.from(atob(b64 + pad), c => c.charCodeAt(0)));
              } else {
                const data = JSON.parse(text);
                newAddr = data.new_bch_address || (data.a ? 'bitcoincash:' + data.a : null);
                newPubHex = data.new_pub_hex || (data.p ? b2h(Uint8Array.from(atob(data.p), c => c.charCodeAt(0))) : null);
              }
              if (contact && newAddr) {
                contact.bch_address = newAddr;
                if (newPubHex) contact.pub_hex = newPubHex;
                _saveContacts();
              }
            } catch (e) { console.debug('[chat] ADDR_CHANGE parse error:', e.message); }
          }
        } catch (e) {
          console.debug('[chat] not for us or bad packet in', txid.slice(0, 8), e.message);
        }
      }
    }
    const now = Date.now();
    for (const [k, v] of _pendingChainParts) { if (now - v.ts > 3600_000) _pendingChainParts.delete(k); }
  } catch (e) { console.warn('[chat] scan error:', e); }
}

function _startScanner() {
  _scanInbox();
  _scanTimer = setInterval(_scanInbox, 10_000);
}

function _stopScanner() {
  if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
}

/* ══════════════════════════════════════════
   SEND MESSAGE (v2 split-knowledge)
   ══════════════════════════════════════════ */

async function _sendCcshMsgV2(contact, text) {
  const prof = _profile;
  const myPriv32 = h2b(prof.x25519_priv_hex);
  const myPub32 = h2b(prof.x25519_pub_hex);

  /* 1. Split encrypt */
  const { chainBlob, relayBlob, ephPub } = await splitEncrypt(text, contact.pub_hex);

  /* 2. Chain packet */
  const chainData = concat(ephPub, chainBlob);
  const msgId = crypto.getRandomValues(new Uint8Array(16));
  const chainPkt = packV2({
    msg_id: msgId, sender_pub: myPub32,
    chunk_index: 0, chunk_total: 1,
    ciphertext_chunk: chainData,
    msg_type: MSG_SPLIT_CHAIN, flags: FLAG_SPLIT
  });

  /* 3. Build BCH TX */
  let spendPrivHex = prof.bch_priv_hex;
  let spendAddr = prof.bch_address;
  let addrData = await _bcGetAddr(spendAddr);
  let usingPrev = false;
  if (!addrData?.utxo?.length && prof.bch_priv_hex_prev) {
    spendPrivHex = prof.bch_priv_hex_prev;
    spendAddr = prof.bch_address_prev;
    addrData = await _bcGetAddr(spendAddr);
    usingPrev = true;
  }
  if (!addrData?.utxo?.length) throw new Error('No UTXOs — fund: ' + prof.bch_address);

  const myHash160 = ripemd160(sha256(secp256k1.getPublicKey(h2b(spendPrivHex), true)));
  const myScript = p2pkhScript(myHash160);
  const changeScript = usingPrev ? p2pkhAddrScript(prof.bch_address) : myScript;

  const estSize = 180 + chainPkt.length;
  const FEE = BigInt(Math.max(1500, Math.ceil(estSize * 1.5)));
  const DUST = 546n;
  let total = 0n;
  const chosenUtxos = [];
  for (const u of addrData.utxo) {
    total += BigInt(u.value); chosenUtxos.push(u);
    if (total >= DUST + FEE) break;
  }
  if (total < DUST + FEE) throw new Error('Insufficient funds (' + total + ' sats)');

  const change = total - DUST - FEE;
  const outputs = [
    { value: Number(DUST), script: p2pkhAddrScript(contact.bch_address) },
    { value: 0, script: opReturnScript(chainPkt) },
  ];
  if (change >= DUST) outputs.push({ value: Number(change), script: changeScript });

  const inputs = chosenUtxos.map(u => ({
    txidLE: h2b(u.transaction_hash).reverse(),
    vout: u.index, sequence: 0xffffffff, value: u.value,
  }));

  /* Sign */
  const bchPriv32 = h2b(spendPrivHex);
  const bchPub33 = secp256k1.getPublicKey(bchPriv32, true);
  const signedInputs = [];
  for (let i = 0; i < inputs.length; i++) {
    const sighash = bchSighash(1, 0, inputs, outputs, i, myScript, inputs[i].value);
    const sig = secp256k1.sign(sighash, bchPriv32, { lowS: true });
    const derSig = concat(sig.toDERRawBytes(), new Uint8Array([0x41]));
    const scriptSig = concat(new Uint8Array([derSig.length]), derSig, new Uint8Array([bchPub33.length]), bchPub33);
    signedInputs.push({ ...inputs[i], scriptSig });
  }

  /* Broadcast chain TX */
  const txid = await _bcBroadcast(b2h(serializeTx(1, 0, signedInputs, outputs)));

  /* 4. Relay half to Nostr */
  const relayPkt = packV2({
    msg_id: msgId, sender_pub: myPub32,
    chunk_index: 0, chunk_total: 1,
    ciphertext_chunk: relayBlob,
    msg_type: MSG_SPLIT_RELAY, flags: FLAG_SPLIT,
  });
  const payloadBuf = concat(
    new Uint8Array([(relayPkt.length >> 8) & 0xff, relayPkt.length & 0xff]),
    relayPkt
  );
  const nostrPriv = _deriveNostrPriv(prof.x25519_priv_hex);
  const nostrEvent = await _makeNostrEvent(nostrPriv, NOSTR_KIND_CCSH, b2h(payloadBuf), [
    ['p', contact.pub_hex],
    ['ccsh', b2h(msgId)],
    ['expiration', String(Math.floor(Date.now() / 1000) + 3600)],
  ]);
  _nostrPublish(nostrEvent);
  /* Also publish via the bridge if available */
  if (window._nostrPublish) {
    try { window._nostrPublish(nostrEvent); } catch {}
  }
  return txid;
}

/* Send v1 message (for Change Identity ADDR_CHANGE) */
async function _sendCcshMsgV1(contact, text, msgType) {
  const prof = _profile;
  const myPriv32 = h2b(prof.x25519_priv_hex);
  const myPub32 = h2b(prof.x25519_pub_hex);
  const pkt = await ccshEncryptMsg(text, contact.pub_hex, myPriv32, myPub32, msgType);
  if (pkt.length > 220) throw new Error('Message too long');

  let spendPrivHex = prof.bch_priv_hex;
  let spendAddr = prof.bch_address;
  let addrData = await _bcGetAddr(spendAddr);
  let usingPrev = false;
  if (!addrData?.utxo?.length && prof.bch_priv_hex_prev) {
    spendPrivHex = prof.bch_priv_hex_prev;
    spendAddr = prof.bch_address_prev;
    addrData = await _bcGetAddr(spendAddr);
    usingPrev = true;
  }
  if (!addrData?.utxo?.length) throw new Error('No UTXOs — fund: ' + spendAddr);

  const myHash160 = ripemd160(sha256(secp256k1.getPublicKey(h2b(spendPrivHex), true)));
  const myScript = p2pkhScript(myHash160);
  const changeScript = usingPrev ? p2pkhAddrScript(prof.bch_address) : myScript;
  const FEE = 1500n, DUST = 546n;
  let total = 0n;
  const chosenUtxos = [];
  for (const u of addrData.utxo) {
    total += BigInt(u.value); chosenUtxos.push(u);
    if (total >= DUST + FEE) break;
  }
  if (total < DUST + FEE) throw new Error('Insufficient funds');
  const change = total - DUST - FEE;
  const outputs = [
    { value: Number(DUST), script: p2pkhAddrScript(contact.bch_address) },
    { value: 0, script: opReturnScript(pkt) },
  ];
  if (change >= DUST) outputs.push({ value: Number(change), script: changeScript });
  const inputs = chosenUtxos.map(u => ({
    txidLE: h2b(u.transaction_hash).reverse(),
    vout: u.index, sequence: 0xffffffff, value: u.value,
  }));
  const bchPriv32 = h2b(spendPrivHex);
  const bchPub33 = secp256k1.getPublicKey(bchPriv32, true);
  const signedInputs = [];
  for (let i = 0; i < inputs.length; i++) {
    const sighash = bchSighash(1, 0, inputs, outputs, i, myScript, inputs[i].value);
    const sig = secp256k1.sign(sighash, bchPriv32, { lowS: true });
    const derSig = concat(sig.toDERRawBytes(), new Uint8Array([0x41]));
    const scriptSig = concat(new Uint8Array([derSig.length]), derSig, new Uint8Array([bchPub33.length]), bchPub33);
    signedInputs.push({ ...inputs[i], scriptSig });
  }
  return _bcBroadcast(b2h(serializeTx(1, 0, signedInputs, outputs)));
}

/* Self-transfer BCH from old addr to new (post-CI) */
async function _selfTransfer(fromPrivHex, fromAddr, toAddr) {
  const priv32 = h2b(fromPrivHex);
  const pub33 = secp256k1.getPublicKey(priv32, true);
  const hash160 = ripemd160(sha256(pub33));
  const fromScript = p2pkhScript(hash160);
  const addrData = await _bcGetAddr(fromAddr);
  if (!addrData?.utxo?.length) return null;
  let total = 0n;
  const utxos = addrData.utxo;
  for (const u of utxos) total += BigInt(u.value);
  const FEE = 1500n;
  if (total <= FEE + 546n) return null;
  const inputs = utxos.map(u => ({
    txidLE: h2b(u.transaction_hash).reverse(),
    vout: u.index, sequence: 0xffffffff, value: u.value,
  }));
  const outputs = [{ value: Number(total - FEE), script: p2pkhAddrScript(toAddr) }];
  const signedInputs = [];
  for (let i = 0; i < inputs.length; i++) {
    const sighash = bchSighash(1, 0, inputs, outputs, i, fromScript, inputs[i].value);
    const sig = secp256k1.sign(sighash, priv32, { lowS: true });
    const derSig = concat(sig.toDERRawBytes(), new Uint8Array([0x41]));
    const scriptSig = concat(new Uint8Array([derSig.length]), derSig, new Uint8Array([pub33.length]), pub33);
    signedInputs.push({ ...inputs[i], scriptSig });
  }
  return _bcBroadcast(b2h(serializeTx(1, 0, signedInputs, outputs)));
}

/* ══════════════════════════════════════════
   BALANCE
   ══════════════════════════════════════════ */

async function _refreshBalance() {
  if (!_profile?.bch_address) return;
  const el = document.getElementById('chat-balance');
  if (!el) return;
  try {
    const data = await _bcGetAddr(_profile.bch_address);
    let sats = data?.address?.balance ?? 0;
    if (_profile.bch_address_prev) {
      const prev = await _bcGetAddr(_profile.bch_address_prev);
      sats += prev?.address?.balance ?? 0;
    }
    const bch = (sats / 1e8).toFixed(8).replace(/\.?0+$/, v => v === '.' ? '.00' : v);
    el.textContent = bch + ' BCH';
    el.style.opacity = '1';
  } catch {
    el.textContent = '?? BCH';
  }
}

function _startBalance() {
  _refreshBalance();
  _balanceTimer = setInterval(_refreshBalance, 30_000);
}

/* ══════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════ */

function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function _timeStr() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/* ══════════════════════════════════════════
   AUTH: UNLOCK / IMPORT
   ══════════════════════════════════════════ */

function _showAuth() {
  const vault = localStorage.getItem('00chat_vault');
  const area = document.getElementById('chat-auth-area');
  if (!area) return;

  if (vault) {
    /* Vault exists — show unlock */
    _attempts = parseInt(localStorage.getItem('00chat_attempts') || '0');
    area.innerHTML = `
      <div style="max-width:400px;margin:0 auto;text-align:center;padding:40px 24px">
        <div style="font-size:48px;font-weight:900;color:var(--dt-accent,#0AC18E);margin-bottom:4px">00</div>
        <div style="font-size:11px;color:var(--dt-text-secondary);letter-spacing:2px;margin-bottom:28px">CHAT · UNLOCK</div>
        <div style="display:flex;justify-content:center;gap:6px;margin-bottom:16px" id="chat-dots">
          ${[0,1,2].map(i => `<div style="width:10px;height:10px;border-radius:50%;border:1px solid var(--dt-border);${i < _attempts ? 'background:#ef4444;border-color:#ef4444' : ''}"></div>`).join('')}
        </div>
        <div id="chat-unlock-err" style="font-size:12px;color:#ef4444;min-height:18px;margin-bottom:10px"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">PASSWORD</div>
          <input class="dt-form-input" type="password" id="chat-unlock-pass" placeholder="Enter password..." style="text-align:center">
        </div>
        <button class="dt-action-btn" id="chat-unlock-btn" style="background:var(--dt-accent);width:100%;margin-top:8px">Unlock</button>
        <button class="dt-action-btn-outline" id="chat-import-switch" style="width:100%;margin-top:8px;font-size:11px">Use different key</button>
      </div>`;
    document.getElementById('chat-unlock-btn')?.addEventListener('click', _tryUnlock);
    document.getElementById('chat-unlock-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') _tryUnlock(); });
    document.getElementById('chat-import-switch')?.addEventListener('click', () => _showImport(area));
    setTimeout(() => document.getElementById('chat-unlock-pass')?.focus(), 100);
  } else {
    _showImport(area);
  }
}

function _showImport(area) {
  if (!area) area = document.getElementById('chat-auth-area');
  if (!area) return;
  area.innerHTML = `
    <div style="max-width:440px;margin:0 auto;padding:40px 24px">
      <div style="text-align:center">
        <div style="font-size:48px;font-weight:900;color:var(--dt-accent,#0AC18E);margin-bottom:4px">00</div>
        <div style="font-size:11px;color:var(--dt-text-secondary);letter-spacing:2px;margin-bottom:28px">CHAT · SETUP</div>
      </div>
      <button class="dt-action-btn-outline" id="chat-gen-btn" style="width:100%;margin-bottom:16px;font-size:12px">Generate New Key</button>
      <div class="dt-form-group"><div class="dt-form-lbl">KEY — 12 WORDS OR HEX</div>
        <textarea class="dt-form-input" id="chat-import-key" placeholder="word1 word2 ... word12   or   64 hex chars" rows="3" style="resize:none"></textarea>
      </div>
      <div class="dt-form-group"><div class="dt-form-lbl">SET PASSWORD</div>
        <input class="dt-form-input" type="password" id="chat-import-pass" placeholder="Min 8 characters...">
      </div>
      <div class="dt-form-group"><div class="dt-form-lbl">CONFIRM PASSWORD</div>
        <input class="dt-form-input" type="password" id="chat-import-pass2" placeholder="Confirm...">
      </div>
      <div id="chat-import-err" style="font-size:12px;color:#ef4444;min-height:18px;margin-bottom:8px"></div>
      <button class="dt-action-btn" id="chat-import-btn" style="background:var(--dt-accent);width:100%">Import Key</button>
      <div style="font-size:10px;color:var(--dt-text-secondary);text-align:center;margin-top:12px;line-height:1.6">Key never leaves your device. Stored encrypted with your password.</div>
    </div>`;
  document.getElementById('chat-gen-btn')?.addEventListener('click', _generateKey);
  document.getElementById('chat-import-btn')?.addEventListener('click', _importKey);
  document.getElementById('chat-import-pass2')?.addEventListener('keydown', e => { if (e.key === 'Enter') _importKey(); });
}

async function _generateKey() {
  const btn = document.getElementById('chat-gen-btn');
  if (btn) { btn.textContent = 'Generating...'; btn.disabled = true; }
  try {
    const words = await bip39Generate();
    const keyInput = document.getElementById('chat-import-key');
    if (keyInput) keyInput.value = words.join(' ');
    if (btn) { btn.textContent = 'Generated — set a password below'; }
    document.getElementById('chat-import-pass')?.focus();
  } catch (e) {
    if (btn) { btn.textContent = 'Generate New Key'; btn.disabled = false; }
    const err = document.getElementById('chat-import-err');
    if (err) err.textContent = 'Generation failed: ' + e.message;
  }
}

async function _importKey() {
  const raw = document.getElementById('chat-import-key')?.value.trim();
  const pass = document.getElementById('chat-import-pass')?.value;
  const pass2 = document.getElementById('chat-import-pass2')?.value;
  const errEl = document.getElementById('chat-import-err');
  if (errEl) errEl.textContent = '';
  if (!raw) { if (errEl) errEl.textContent = 'Key required'; return; }
  const words = raw.split(/\s+/);
  const isMnemonic = words.length >= 12;
  if (!isMnemonic && raw.replace(/^0x/i, '').length < 64) { if (errEl) errEl.textContent = '12 BIP39 words or 64 hex chars required'; return; }
  if (!pass || pass.length < 8) { if (errEl) errEl.textContent = 'Password must be at least 8 characters'; return; }
  if (pass !== pass2) { if (errEl) errEl.textContent = 'Passwords do not match'; return; }
  try {
    let seed64;
    if (isMnemonic) {
      seed64 = await bip39Seed(raw);
    } else {
      const k = h2b(raw.replace(/^0x/i, ''));
      seed64 = concat(k, new Uint8Array(32));
    }
    _profile = deriveProfileFromSeed(seed64);
    _sessionPass = pass;
    localStorage.setItem('00chat_vault', await encryptVault(_profile, pass));
    localStorage.setItem('00chat_attempts', '0');
    /* Shared session for auto-unlock */
    localStorage.setItem('00_session_auth', JSON.stringify({ p: btoa(pass), ts: Date.now() }));
    _attempts = 0;
    _bootIntoChat();
  } catch (e) { if (errEl) errEl.textContent = 'Error: ' + e.message; }
}

async function _tryUnlock() {
  const pass = document.getElementById('chat-unlock-pass')?.value;
  const errEl = document.getElementById('chat-unlock-err');
  const stored = localStorage.getItem('00chat_vault');
  if (!stored) { _showImport(null); return; }
  try {
    _profile = await decryptVault(stored, pass);
    _sessionPass = pass;
    localStorage.setItem('00_session_auth', JSON.stringify({ p: btoa(pass), ts: Date.now() }));
    _attempts = 0;
    localStorage.setItem('00chat_attempts', '0');
    _bootIntoChat();
  } catch {
    _attempts++;
    localStorage.setItem('00chat_attempts', String(_attempts));
    if (errEl) errEl.textContent = 'Wrong password — ' + (MAX_ATTEMPTS - _attempts) + ' attempt(s) remaining';
    const passInput = document.getElementById('chat-unlock-pass');
    if (passInput) passInput.value = '';
    /* Update dots */
    const dots = document.getElementById('chat-dots');
    if (dots) {
      dots.innerHTML = [0,1,2].map(i => `<div style="width:10px;height:10px;border-radius:50%;border:1px solid var(--dt-border);${i < _attempts ? 'background:#ef4444;border-color:#ef4444' : ''}"></div>`).join('');
    }
    if (_attempts >= MAX_ATTEMPTS) {
      localStorage.removeItem('00chat_vault');
      localStorage.removeItem('00chat_attempts');
      _profile = null;
      if (errEl) errEl.textContent = 'Key wiped — 3 failed attempts. Import a new key.';
      setTimeout(() => _showImport(null), 2000);
    }
  }
}

/* Auto-unlock from shared session */
async function _tryAutoUnlock() {
  const vault = localStorage.getItem('00chat_vault');
  if (!vault) return false;
  try {
    const sess = JSON.parse(localStorage.getItem('00_session_auth') || '{}');
    if (sess.p && sess.ts && Date.now() - sess.ts < 30 * 60 * 1000) {
      const pass = atob(sess.p);
      _profile = await decryptVault(vault, pass);
      _sessionPass = pass;
      localStorage.setItem('00_session_auth', JSON.stringify({ p: sess.p, ts: Date.now() }));
      _attempts = 0;
      return true;
    }
  } catch {}
  /* Also try auto-create from wallet vault */
  if (!vault) {
    try {
      const sess = JSON.parse(localStorage.getItem('00_session_auth') || '{}');
      const walletVault = localStorage.getItem('00wallet_vault');
      if (sess.p && sess.ts && Date.now() - sess.ts < 30 * 60 * 1000 && walletVault) {
        const pass = atob(sess.p);
        const walletProfile = await decryptVault(walletVault, pass);
        const seed64 = walletProfile.seedHex
          ? h2b(walletProfile.seedHex)
          : concat(h2b(walletProfile.bchPrivHex), new Uint8Array(32));
        _profile = deriveProfileFromSeed(seed64);
        _sessionPass = pass;
        localStorage.setItem('00chat_vault', await encryptVault(_profile, pass));
        localStorage.setItem('00chat_attempts', '0');
        localStorage.setItem('00_session_auth', JSON.stringify({ p: sess.p, ts: Date.now() }));
        return true;
      }
    } catch {}
  }
  return false;
}

/* ══════════════════════════════════════════
   BOOT INTO CHAT
   ══════════════════════════════════════════ */

function _bootIntoChat() {
  _loadContacts();
  _loadSeen();
  _renderMain();
  _renderContacts();
  _bindEvents();
  _startScanner();
  _startNostrSub();
  _startBalance();
}

/* ══════════════════════════════════════════
   UI: MAIN TEMPLATE
   ══════════════════════════════════════════ */

function _renderMain() {
  if (!_container) return;
  _container.innerHTML = `
  <div style="padding:24px 32px;height:calc(100vh - 48px);display:flex;flex-direction:column">
    <!-- Header -->
    <div class="dt-page-header" style="flex-shrink:0;margin-bottom:16px">
      <div class="dt-page-title-wrap">
        <div class="dt-page-icon"><img src="icons/chat.png" style="width:28px;height:28px"></div>
        <div>
          <div class="dt-page-title">Chat</div>
          <div class="dt-page-sub">Split-Knowledge · BCH + Nostr</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span id="chat-balance" style="font-family:monospace;font-size:12px;color:var(--dt-text-secondary)">loading...</span>
        <div class="dt-page-actions" style="margin:0">
          <button class="dt-action-btn-outline" style="width:auto;padding:6px 14px;font-size:11px;border-color:#0AC18E;color:#0AC18E" id="chat-btn-topup">+ Top Up</button>
          <button class="dt-action-btn-outline" style="width:auto;padding:6px 14px;font-size:11px" id="chat-btn-card">My Card</button>
          <button class="dt-action-btn-outline" style="width:auto;padding:6px 14px;font-size:11px" id="chat-btn-ci">Change ID</button>
        </div>
      </div>
    </div>

    <!-- Split layout -->
    <div style="flex:1;display:flex;gap:0;min-height:0;background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:16px;overflow:hidden">
      <!-- Contacts panel -->
      <div style="width:320px;border-right:1px solid var(--dt-border);display:flex;flex-direction:column;flex-shrink:0">
        <div style="padding:16px 20px;border-bottom:1px solid var(--dt-border);display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:14px;font-weight:700;color:var(--dt-text)">Contacts</span>
          <button style="background:var(--dt-accent,#0AC18E);color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:11px;font-weight:600;cursor:pointer" id="chat-btn-add">+ Add</button>
        </div>
        <div style="flex:1;overflow-y:auto" id="chat-contact-list"></div>
      </div>

      <!-- Conversation panel -->
      <div style="flex:1;display:flex;flex-direction:column;min-width:0">
        <!-- Empty state -->
        <div id="chat-empty" style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--dt-text-secondary)">
          <div style="font-size:40px;opacity:.3">💬</div>
          <div style="font-size:15px;font-weight:600">Select a conversation</div>
          <div style="font-size:12px">Add a contact to start messaging</div>
        </div>
        <!-- Active conversation -->
        <div id="chat-conv" style="display:none;flex:1;flex-direction:column;min-height:0">
          <!-- Conversation header -->
          <div style="padding:14px 20px;border-bottom:1px solid var(--dt-border);display:flex;align-items:center;gap:12px;flex-shrink:0">
            <div id="chat-conv-avatar" style="width:36px;height:36px;border-radius:50%;background:var(--dt-accent,#0AC18E);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;flex-shrink:0"></div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600;color:var(--dt-text)" id="chat-conv-name">—</div>
              <div style="font-size:11px;color:var(--dt-text-secondary);font-family:monospace" id="chat-conv-status">—</div>
            </div>
            <button style="background:none;border:1px solid var(--dt-border);border-radius:6px;padding:4px 10px;font-size:11px;color:var(--dt-text-secondary);cursor:pointer" id="chat-conv-del">Delete</button>
          </div>
          <!-- Pending banner (unknown sender) -->
          <div id="chat-pending-banner" style="display:none;padding:8px 16px;background:rgba(10,193,142,.06);border-bottom:1px solid var(--dt-border);font-size:11px;color:var(--dt-text-secondary);align-items:center;justify-content:space-between">
            <span>Unknown sender — not in contacts</span>
            <button style="background:var(--dt-accent,#0AC18E);color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:10px;font-weight:600;cursor:pointer" id="chat-pending-add">+ Add</button>
          </div>
          <!-- Encryption badge -->
          <div style="text-align:center;padding:6px;font-size:9px;color:var(--dt-text-secondary);letter-spacing:1px;border-bottom:1px solid var(--dt-border);flex-shrink:0">🔒 SPLIT-KNOWLEDGE · XOR-OTP + AES-256-GCM · BCH + NOSTR</div>
          <!-- Messages -->
          <div id="chat-messages" style="flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:8px"></div>
          <!-- Input -->
          <div style="padding:12px 16px;border-top:1px solid var(--dt-border);display:flex;gap:8px;flex-shrink:0">
            <input class="dt-form-input" id="chat-msg-input" placeholder="Type a message..." style="flex:1;margin:0;border-radius:20px;padding:10px 18px">
            <button style="background:var(--dt-accent,#0AC18E);color:#fff;border:none;border-radius:50%;width:40px;height:40px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0" id="chat-send-btn">➤</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Contact Modal -->
    <div id="chat-add-modal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.4);align-items:center;justify-content:center">
      <div style="background:var(--dt-surface,#fff);border-radius:16px;padding:28px;width:440px;max-width:90vw">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <span style="font-size:16px;font-weight:700;color:var(--dt-text)">Add Contact</span>
          <button id="chat-add-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--dt-text-secondary)">&times;</button>
        </div>
        <div class="dt-form-group"><div class="dt-form-lbl">CONTACT CARD URL</div>
          <div style="display:flex;gap:8px"><input class="dt-form-input" id="chat-ac-url" placeholder="chatcash:bitcoincash:q...?pub=...&name=..." style="flex:1;font-family:monospace;font-size:11px"><button class="dt-action-btn" id="chat-ac-parse" style="width:auto;padding:8px 16px;background:var(--dt-accent,#0AC18E);font-size:12px">Parse</button></div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin:16px 0"><div style="flex:1;height:1px;background:var(--dt-border)"></div><span style="font-size:10px;color:var(--dt-text-secondary);font-weight:600">OR FILL MANUALLY</span><div style="flex:1;height:1px;background:var(--dt-border)"></div></div>
        <div class="dt-form-group"><div class="dt-form-lbl">NAME</div><input class="dt-form-input" id="chat-ac-name" placeholder="Contact name..."></div>
        <div class="dt-form-group"><div class="dt-form-lbl">X25519 PUBLIC KEY</div><input class="dt-form-input" id="chat-ac-pub" placeholder="64 hex characters..." style="font-family:monospace;font-size:11px"></div>
        <div class="dt-form-group"><div class="dt-form-lbl">BCH ADDRESS</div><input class="dt-form-input" id="chat-ac-bch" placeholder="bitcoincash:q..." style="font-family:monospace;font-size:11px"></div>
        <div id="chat-ac-err" style="font-size:12px;color:#ef4444;min-height:18px;margin-bottom:8px"></div>
        <button class="dt-action-btn" id="chat-ac-save" style="background:var(--dt-accent,#0AC18E);width:100%">+ Add Contact</button>
      </div>
    </div>

    <!-- Share Card Modal -->
    <div id="chat-share-modal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.4);align-items:center;justify-content:center">
      <div style="background:var(--dt-surface,#fff);border-radius:16px;padding:28px;width:440px;max-width:90vw">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <span style="font-size:16px;font-weight:700;color:var(--dt-text)">My Contact Card</span>
          <button id="chat-share-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--dt-text-secondary)">&times;</button>
        </div>
        <div style="font-size:13px;color:var(--dt-text-secondary);margin-bottom:16px;text-align:center">Share this URL so others can message you</div>
        <div class="dt-form-group"><div class="dt-form-lbl">DISPLAY NAME</div>
          <input class="dt-form-input" id="chat-sc-name" placeholder="anon">
        </div>
        <div class="dt-form-group"><div class="dt-form-lbl">SHARE URL</div>
          <div style="font-family:monospace;font-size:10px;color:var(--dt-text);word-break:break-all;padding:14px;background:var(--dt-bg,#f0f2f5);border-radius:10px;text-align:left" id="chat-sc-url">—</div>
        </div>
        <div style="display:flex;justify-content:center;margin:16px 0"><canvas id="chat-sc-qr" style="border-radius:10px;image-rendering:pixelated"></canvas></div>
        <button class="dt-action-btn" id="chat-sc-copy" style="background:var(--dt-accent,#0AC18E);width:100%;margin-bottom:12px">Copy URL</button>
        <div style="display:flex;align-items:center;gap:12px;margin:12px 0"><div style="flex:1;height:1px;background:var(--dt-border)"></div><span style="font-size:10px;color:var(--dt-text-secondary);font-weight:600">DETAILS</span><div style="flex:1;height:1px;background:var(--dt-border)"></div></div>
        <div class="dt-form-group"><div class="dt-form-lbl">BCH ADDRESS</div>
          <div style="font-family:monospace;font-size:10px;color:var(--dt-text);word-break:break-all;padding:10px;background:var(--dt-bg,#f0f2f5);border-radius:8px" id="chat-sc-bch">—</div>
        </div>
        <div class="dt-form-group"><div class="dt-form-lbl">X25519 PUBLIC KEY</div>
          <div style="font-family:monospace;font-size:10px;color:var(--dt-text);word-break:break-all;padding:10px;background:var(--dt-bg,#f0f2f5);border-radius:8px" id="chat-sc-pub">—</div>
        </div>
      </div>
    </div>

    <!-- Change Identity Modal -->
    <div id="chat-ci-modal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.4);align-items:center;justify-content:center">
      <div style="background:var(--dt-surface,#fff);border-radius:16px;padding:28px;width:480px;max-width:90vw;max-height:85vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <span style="font-size:16px;font-weight:700;color:var(--dt-text)">Change Identity</span>
          <button id="chat-ci-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--dt-text-secondary)">&times;</button>
        </div>
        <div id="chat-ci-body">
          <div id="chat-ci-spinner" style="text-align:center;padding:24px;color:var(--dt-text-secondary)">Generating new keypair...</div>
        </div>
      </div>
    </div>

  </div>`;
}

/* ══════════════════════════════════════════
   UI: CONTACTS LIST
   ══════════════════════════════════════════ */

function _renderContacts() {
  const el = document.getElementById('chat-contact-list');
  if (!el) return;
  if (!_contacts.length) {
    el.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--dt-text-secondary);font-size:13px">No contacts yet<br><span style="font-size:11px;opacity:.6">Add someone to start chatting</span></div>';
    return;
  }
  const COLS = ['#0AC18E','#627EEA','#F7931A','#BF5AF2','#E84142','#9945FF'];
  el.innerHTML = _contacts.map((c, i) => {
    const lastMsg = c.msgs?.length ? c.msgs[c.msgs.length - 1] : null;
    const active = i === _activeIdx;
    const col = COLS[i % COLS.length];
    const name = _esc(c.name || 'Unknown');
    const preview = lastMsg ? _esc(lastMsg.text).slice(0, 40) : 'No messages';
    const timeStr = lastMsg?.time || '';
    const pendingBadge = c.pending ? '<span style="font-size:9px;background:#f59e0b;color:#fff;padding:1px 6px;border-radius:8px;margin-left:4px">new</span>' : '';
    return `<div class="chat-crow" data-idx="${i}" style="display:flex;align-items:center;gap:12px;padding:14px 20px;cursor:pointer;border-bottom:1px solid var(--dt-border);transition:background .12s;${active ? 'background:var(--dt-accent-soft,rgba(10,193,142,.06));border-left:3px solid var(--dt-accent,#0AC18E)' : 'border-left:3px solid transparent'}">
      <div style="width:40px;height:40px;border-radius:50%;background:${col};display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;flex-shrink:0">${(c.name || '?').slice(0, 2).toUpperCase()}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:13px;font-weight:600;color:var(--dt-text)">${name}${pendingBadge}</span>
          <span style="font-size:10px;color:var(--dt-text-secondary)">${_esc(timeStr)}</span>
        </div>
        <div style="font-size:11px;color:var(--dt-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px">${preview}</div>
      </div>
    </div>`;
  }).join('');
  el.querySelectorAll('.chat-crow').forEach(row => {
    row.addEventListener('click', () => _openConv(parseInt(row.dataset.idx)));
  });
}

/* ══════════════════════════════════════════
   UI: CONVERSATION
   ══════════════════════════════════════════ */

function _openConv(idx) {
  _activeIdx = idx;
  const c = _contacts[idx];
  if (!c) return;
  document.getElementById('chat-empty').style.display = 'none';
  document.getElementById('chat-conv').style.display = 'flex';
  const COLS = ['#0AC18E','#627EEA','#F7931A','#BF5AF2','#E84142','#9945FF'];
  const col = COLS[idx % COLS.length];
  const avatar = document.getElementById('chat-conv-avatar');
  if (avatar) { avatar.style.background = col; avatar.textContent = (c.name || '?').slice(0, 2).toUpperCase(); }
  document.getElementById('chat-conv-name').textContent = c.name || 'Unknown';
  document.getElementById('chat-conv-status').textContent = c.bch_address
    ? c.bch_address.slice(0, 24) + '... · ccsh encrypted'
    : 'ccsh encrypted';
  document.getElementById('chat-pending-banner').style.display = c.pending ? 'flex' : 'none';
  _renderMessages();
  _renderContacts();
  document.getElementById('chat-msg-input')?.focus();
}

function _renderMessages() {
  const el = document.getElementById('chat-messages');
  if (!el || _activeIdx < 0) return;
  const c = _contacts[_activeIdx];
  if (!c?.msgs?.length) {
    el.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--dt-text-secondary);font-size:13px">No messages yet — say hello!</div>';
    return;
  }
  el.innerHTML = c.msgs.map(m => {
    const isMine = m.from === 'me';
    const v2Badge = m.v2 ? ' <span style="font-size:8px;opacity:.4">v2</span>' : '';
    return `<div style="display:flex;justify-content:${isMine ? 'flex-end' : 'flex-start'}">
      <div style="max-width:75%;padding:10px 16px;border-radius:${isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${isMine ? 'var(--dt-accent,#0AC18E)' : 'var(--dt-bg,#f0f2f5)'};color:${isMine ? '#fff' : 'var(--dt-text)'};font-size:13px;line-height:1.6;word-break:break-word">
        ${_esc(m.text)}
        <div style="font-size:9px;opacity:.5;margin-top:4px;text-align:right">${_esc(m.time || '')}${v2Badge}</div>
      </div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function _appendMsg(m) {
  const el = document.getElementById('chat-messages');
  if (!el) return;
  /* Clear "no messages" placeholder */
  if (el.querySelector('[style*="justify-content:center"]') && el.children.length === 1 && !_contacts[_activeIdx]?.msgs?.length) {
    el.innerHTML = '';
  }
  const isMine = m.from === 'me';
  const v2Badge = m.v2 ? ' <span style="font-size:8px;opacity:.4">v2</span>' : '';
  const div = document.createElement('div');
  div.style.cssText = `display:flex;justify-content:${isMine ? 'flex-end' : 'flex-start'}`;
  div.innerHTML = `<div style="max-width:75%;padding:10px 16px;border-radius:${isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};background:${isMine ? 'var(--dt-accent,#0AC18E)' : 'var(--dt-bg,#f0f2f5)'};color:${isMine ? '#fff' : 'var(--dt-text)'};font-size:13px;line-height:1.6;word-break:break-word">
    ${_esc(m.text)}
    <div style="font-size:9px;opacity:.5;margin-top:4px;text-align:right" class="msg-time-tag">${_esc(m.time || '')}${v2Badge}</div>
  </div>`;
  el.appendChild(div);
  setTimeout(() => el.scrollTop = el.scrollHeight, 50);
}

/* ══════════════════════════════════════════
   UI: EVENT BINDINGS
   ══════════════════════════════════════════ */

/* ── Top Up: transfer sats from wallet to chat ── */
async function _doTopUp() {
  const topUpAmount = 50000; // 50,000 sats default (~$0.25)
  const btn = document.getElementById('chat-btn-topup');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Sending...'; }

  try {
    if (!_profile?.bch_address) throw new Error('Chat address not available');
    const walletKeys = auth.getKeys();
    if (!walletKeys?.privKey) throw new Error('Wallet not unlocked');

    // Use sendBch from core
    const { sendBch } = await import('../core/send-bch.js');
    const { sha256: sha } = await import('https://esm.sh/@noble/hashes@1.7.1/sha256');
    const { secp256k1 } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
    const { cashAddrToHash20 } = await import('../core/cashaddr.js');

    // Fetch wallet UTXOs
    const hdAddrs = (await import('../core/state.js')).get('hdAddresses') || [];
    let utxos = [];
    const { getPrivForAddr } = await import('../services/hd-scanner.js');
    for (const hd of hdAddrs) {
      try {
        const h = cashAddrToHash20(hd.addr);
        const script = new Uint8Array([0x76, 0xa9, 0x14, ...h, 0x88, 0xac]);
        const sh = Array.from(sha(script)).reverse().map(b => b.toString(16).padStart(2, '0')).join('');
        const raw = await window._fvCall('blockchain.scripthash.listunspent', [sh]) || [];
        for (const u of raw) utxos.push({ txid: u.tx_hash, vout: u.tx_pos, value: u.value, addr: hd.addr });
      } catch {}
    }
    if (!utxos.length) throw new Error('No wallet UTXOs available');

    // Change address
    const changeAddr = (await import('../core/state.js')).get('hdChangeAddr');
    const changeH160 = changeAddr ? cashAddrToHash20(changeAddr) : ripemd160(sha256(secp256k1.getPublicKey(walletKeys.privKey, true)));

    const result = await sendBch({
      toAddress: _profile.bch_address,
      amountSats: topUpAmount,
      feeRate: 1,
      utxos,
      privKey: walletKeys.privKey,
      pubKey: secp256k1.getPublicKey(walletKeys.privKey, true),
      changeHash160: changeH160,
      hdGetKey: getPrivForAddr,
    });

    if (btn) { btn.textContent = '✓ Sent ' + topUpAmount + ' sats'; btn.disabled = false; }
    setTimeout(() => { if (btn) btn.textContent = '+ Top Up'; }, 3000);
    // Refresh chat balance
    setTimeout(_refreshBalance, 3000);
  } catch (e) {
    console.error('[chat] top-up error:', e);
    if (btn) { btn.textContent = '✗ ' + e.message; btn.disabled = false; }
    setTimeout(() => { if (btn) btn.textContent = '+ Top Up'; }, 3000);
  }
}

function _bindEvents() {
  /* Add contact */
  document.getElementById('chat-btn-add')?.addEventListener('click', () => _openAddModal());
  document.getElementById('chat-add-close')?.addEventListener('click', () => _closeModal('chat-add-modal'));

  /* Parse card URL */
  document.getElementById('chat-ac-parse')?.addEventListener('click', _parseCardUrl);

  /* Save contact */
  document.getElementById('chat-ac-save')?.addEventListener('click', _saveContact);

  /* Top Up — transfer from wallet to chat address */
  document.getElementById('chat-btn-topup')?.addEventListener('click', _doTopUp);

  /* Share card */
  document.getElementById('chat-btn-card')?.addEventListener('click', _openShareCard);
  document.getElementById('chat-share-close')?.addEventListener('click', () => _closeModal('chat-share-modal'));
  document.getElementById('chat-sc-name')?.addEventListener('input', _updateShareCard);
  document.getElementById('chat-sc-copy')?.addEventListener('click', _copyShareUrl);

  /* Change identity */
  document.getElementById('chat-btn-ci')?.addEventListener('click', _openChangeIdentity);
  document.getElementById('chat-ci-close')?.addEventListener('click', () => _closeModal('chat-ci-modal'));

  /* Delete contact */
  document.getElementById('chat-conv-del')?.addEventListener('click', _deleteContact);

  /* Pending add */
  document.getElementById('chat-pending-add')?.addEventListener('click', () => {
    if (_activeIdx >= 0) _openAddModal(_activeIdx);
  });

  /* Send message */
  document.getElementById('chat-send-btn')?.addEventListener('click', _sendMsg);
  document.getElementById('chat-msg-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMsg(); }
  });
}

function _openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
function _closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

/* ── Add Contact ── */

function _openAddModal(pendingIdx) {
  ['chat-ac-url','chat-ac-name','chat-ac-pub','chat-ac-bch'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  const errEl = document.getElementById('chat-ac-err');
  if (errEl) errEl.textContent = '';
  if (pendingIdx !== undefined && _contacts[pendingIdx]?.pending) {
    const c = _contacts[pendingIdx];
    const pubInput = document.getElementById('chat-ac-pub');
    if (pubInput) { pubInput.value = c.pub_hex; pubInput.readOnly = true; pubInput.style.opacity = '.5'; }
    const nameInput = document.getElementById('chat-ac-name');
    if (nameInput) nameInput.value = c.name.startsWith('Unknown ') ? '' : c.name;
    const bchInput = document.getElementById('chat-ac-bch');
    if (bchInput) bchInput.value = c.bch_address || '';
  } else {
    const pubInput = document.getElementById('chat-ac-pub');
    if (pubInput) { pubInput.readOnly = false; pubInput.style.opacity = ''; }
  }
  _openModal('chat-add-modal');
}

function _parseCardUrl() {
  const url = document.getElementById('chat-ac-url')?.value.trim();
  const errEl = document.getElementById('chat-ac-err');
  if (!url || !url.startsWith('chatcash:')) { if (errEl) errEl.textContent = 'Not a chatcash: URL'; return; }
  const rest = url.slice(9);
  const [bchAddr, query] = rest.split('?');
  const params = {};
  (query || '').split('&').forEach(p => {
    if (p.includes('=')) { const [k, v] = p.split('=', 2); params[k] = decodeURIComponent(v.replace(/\+/g, ' ')); }
  });
  const pubHex = params.pub || '';
  const name = params.name || bchAddr.slice(0, 16);
  if (!pubHex || pubHex.length !== 64) { if (errEl) errEl.textContent = 'Invalid pub_hex (64 hex chars required)'; return; }
  document.getElementById('chat-ac-name').value = name;
  document.getElementById('chat-ac-pub').value = pubHex;
  document.getElementById('chat-ac-bch').value = bchAddr;
  if (errEl) errEl.textContent = '';
}

function _saveContact() {
  const name = document.getElementById('chat-ac-name')?.value.trim();
  const pubHex = document.getElementById('chat-ac-pub')?.value.trim();
  const bchAddr = document.getElementById('chat-ac-bch')?.value.trim();
  const errEl = document.getElementById('chat-ac-err');
  if (!name) { if (errEl) errEl.textContent = 'Name required'; return; }
  if (!pubHex || pubHex.length !== 64) { if (errEl) errEl.textContent = 'Invalid pub_hex (64 hex chars)'; return; }
  if (!bchAddr.startsWith('bitcoincash:')) { if (errEl) errEl.textContent = 'Invalid BCH address'; return; }
  const existing = _contacts.findIndex(c => c.pub_hex === pubHex);
  if (existing !== -1) {
    if (!_contacts[existing].pending) { if (errEl) errEl.textContent = 'Contact already exists'; return; }
    _contacts[existing] = { ..._contacts[existing], name, bch_address: bchAddr,
      avatar: name.slice(0, 2).toUpperCase(), pending: false };
  } else {
    _contacts.push({ name, pub_hex: pubHex, bch_address: bchAddr,
      avatar: name.slice(0, 2).toUpperCase(), msgs: [] });
  }
  _saveContacts();
  _closeModal('chat-add-modal');
  _renderContacts();
  if (_activeIdx >= 0) _openConv(_activeIdx);
}

/* ── Share Card ── */

function _openShareCard() {
  if (!_profile) return;
  document.getElementById('chat-sc-bch').textContent = _profile.bch_address;
  document.getElementById('chat-sc-pub').textContent = _profile.x25519_pub_hex;
  _updateShareCard();
  _openModal('chat-share-modal');
}

function _updateShareCard() {
  if (!_profile) return;
  const name = document.getElementById('chat-sc-name')?.value.trim() || 'anon';
  const url = `chatcash:${_profile.bch_address}?pub=${_profile.x25519_pub_hex}&name=${encodeURIComponent(name)}`;
  document.getElementById('chat-sc-url').textContent = url;
  const canvas = document.getElementById('chat-sc-qr');
  if (canvas) {
    QRCode.toCanvas(canvas, url, { width: 200, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } }).catch(() => {});
  }
}

function _copyShareUrl() {
  const url = document.getElementById('chat-sc-url')?.textContent;
  if (url && navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('chat-sc-copy');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy URL', 1500); }
    });
  }
}

/* ── Change Identity ── */

let _ciNewPrivHex = null, _ciNewPubHex = null, _ciNewBchAddr = null, _ciNewBchPrivHex = null;

async function _openChangeIdentity() {
  if (!_profile) return;
  _openModal('chat-ci-modal');
  const body = document.getElementById('chat-ci-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dt-text-secondary)">Generating new keypair...</div>';

  const ephPriv = crypto.getRandomValues(new Uint8Array(32));
  const ephPub = x25519.getPublicKey(ephPriv);
  _ciNewPrivHex = b2h(ephPriv);
  _ciNewPubHex = b2h(ephPub);
  const newBchPriv = crypto.getRandomValues(new Uint8Array(32));
  _ciNewBchPrivHex = b2h(newBchPriv);
  _ciNewBchAddr = privToBchAddr(newBchPriv);

  // Check balance
  let balanceSats = 0;
  try {
    const data = await _bcGetAddr(_profile.bch_address);
    balanceSats = data?.address?.balance ?? 0;
    if (_profile.bch_address_prev) {
      const prev = await _bcGetAddr(_profile.bch_address_prev);
      balanceSats += prev?.address?.balance ?? 0;
    }
  } catch {}

  const costPerContact = 2046;
  const selectedCount = _contacts.length;
  const totalCost = selectedCount * costPerContact + 1500; // + self-transfer fee
  const hasEnough = balanceSats >= totalCost;

  body.innerHTML = `
    <div class="dt-form-group"><div class="dt-form-lbl">NEW X25519 PUBLIC KEY</div>
      <div style="font-family:monospace;font-size:10px;word-break:break-all;padding:10px;background:var(--dt-bg,#f0f2f5);border-radius:8px;color:var(--dt-text)">${_ciNewPubHex}</div>
    </div>
    <div class="dt-form-group"><div class="dt-form-lbl">NEW BCH ADDRESS</div>
      <div style="font-family:monospace;font-size:10px;word-break:break-all;padding:10px;background:var(--dt-bg,#f0f2f5);border-radius:8px;color:var(--dt-text)">${_ciNewBchAddr}</div>
    </div>
    <div class="dt-form-group">
      <div class="dt-form-lbl" style="display:flex;justify-content:space-between;align-items:center">
        CONTACTS TO NOTIFY
        <span style="font-size:10px;font-weight:400;color:var(--dt-text-secondary)">~${costPerContact} sats each</span>
      </div>
      <div id="chat-ci-contacts" style="display:flex;flex-direction:column;gap:4px">
        ${_contacts.length ? _contacts.map((c, i) => `<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--dt-bg,#f0f2f5);border-radius:6px;font-size:12px;color:var(--dt-text);cursor:pointer">
          <input type="checkbox" class="ci-contact-cb" data-idx="${i}" checked style="accent-color:#0AC18E">
          <span style="flex:1">${_esc(c.name)}</span>
          <span class="ci-status" data-pub="${c.pub_hex.slice(0, 8)}" style="font-size:10px;color:var(--dt-text-secondary)">pending</span>
        </label>`).join('') : '<div style="font-size:12px;color:var(--dt-text-secondary)">No contacts to notify</div>'}
      </div>
    </div>
    <div id="chat-ci-cost" style="padding:8px 12px;background:var(--dt-bg,#f0f2f5);border-radius:8px;margin:8px 0;display:flex;justify-content:space-between;font-size:11px">
      <span>Balance: <strong>${(balanceSats / 1e8).toFixed(8)} BCH</strong> (${balanceSats} sats)</span>
      <span>Cost: <strong id="chat-ci-total-cost">${totalCost}</strong> sats</span>
    </div>
    <div id="chat-ci-warning" style="display:${hasEnough ? 'none' : 'block'};padding:10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:8px;margin:8px 0;font-size:11px;color:#dc2626;text-align:center">
      ⚠ Insufficient funds to notify all contacts. Top up your chat balance or uncheck some contacts.
    </div>
    <div style="padding:12px;background:rgba(245,158,11,.06);border:1px solid rgba(245,158,11,.2);border-radius:8px;margin:8px 0;font-size:11px;color:#92400e;line-height:1.6;text-align:center">
      This action is irreversible. A BCH TX will be sent to each selected contact (~${costPerContact} sat each). They will update your address automatically.
    </div>
    <button class="dt-action-btn" id="chat-ci-broadcast" style="background:var(--dt-accent,#0AC18E);width:100%;${hasEnough ? '' : 'opacity:.5;pointer-events:none'}">${hasEnough ? 'Broadcast to Contacts' : 'Insufficient Funds — Top Up First'}</button>
    <div id="chat-ci-done" style="display:none;text-align:center;padding:20px">
      <div style="font-size:32px;margin-bottom:12px">&#10003;</div>
      <div style="font-size:14px;font-weight:600;color:var(--dt-text)">Identity Updated</div>
      <div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">New key active — Contacts notified — BCH transferred</div>
    </div>`;

  // Recalculate on checkbox toggle
  document.querySelectorAll('.ci-contact-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const checked = document.querySelectorAll('.ci-contact-cb:checked').length;
      const cost = checked * costPerContact + 1500;
      const ok = balanceSats >= cost;
      const costEl = document.getElementById('chat-ci-total-cost');
      const warnEl = document.getElementById('chat-ci-warning');
      const btn = document.getElementById('chat-ci-broadcast');
      if (costEl) costEl.textContent = cost;
      if (warnEl) warnEl.style.display = ok ? 'none' : 'block';
      if (btn) {
        btn.style.opacity = ok ? '' : '.5';
        btn.style.pointerEvents = ok ? '' : 'none';
        btn.textContent = ok ? 'Broadcast to Contacts' : 'Insufficient Funds — Top Up First';
      }
    });
  });

  document.getElementById('chat-ci-broadcast')?.addEventListener('click', _ciDoBroadcast);
}

async function _ciDoBroadcast() {
  if (!_ciNewPrivHex || !_ciNewBchAddr || !_ciNewBchPrivHex || !_profile) return;
  const btn = document.getElementById('chat-ci-broadcast');
  if (btn) { btn.disabled = true; btn.textContent = 'Broadcasting...'; }

  const oldPrivHex = _profile.bch_priv_hex;
  const oldAddr = _profile.bch_address;
  const _pub64 = btoa(String.fromCharCode(...h2b(_ciNewPubHex))).replace(/=+$/, '');
  const _addr = _ciNewBchAddr.replace('bitcoincash:', '');
  const payload = `${_addr}|${_pub64}`;

  // Only notify checked contacts
  const checkedIdxs = new Set([...document.querySelectorAll('.ci-contact-cb:checked')].map(cb => parseInt(cb.dataset.idx)));

  for (let i = 0; i < _contacts.length; i++) {
    const c = _contacts[i];
    const statusEl = document.querySelector(`.ci-status[data-pub="${c.pub_hex.slice(0, 8)}"]`);
    if (!checkedIdxs.has(i)) {
      if (statusEl) { statusEl.textContent = 'skipped'; statusEl.style.color = 'var(--dt-text-secondary)'; }
      continue;
    }
    try {
      await _sendCcshMsgV1(c, payload, 0x02);
      if (statusEl) { statusEl.textContent = 'sent'; statusEl.style.color = 'var(--dt-accent,#0AC18E)'; }
    } catch (e) {
      if (statusEl) { statusEl.textContent = 'failed'; statusEl.style.color = '#ef4444'; }
    }
  }

  /* Switch profile */
  _profile = {
    ..._profile,
    x25519_priv_hex: _ciNewPrivHex,
    x25519_pub_hex: _ciNewPubHex,
    bch_priv_hex: _ciNewBchPrivHex,
    bch_address: _ciNewBchAddr,
    bch_priv_hex_prev: oldPrivHex,
    bch_address_prev: oldAddr,
  };

  /* Re-encrypt vault */
  if (_sessionPass) {
    localStorage.setItem('00chat_vault', await encryptVault(_profile, _sessionPass));
  }

  /* Self-transfer BCH */
  try { await _selfTransfer(oldPrivHex, oldAddr, _ciNewBchAddr); } catch {}

  _seenTxids.clear();
  localStorage.removeItem('00chat_seen');
  _refreshBalance();

  /* Restart Nostr with new key */
  _stopNostrSub();
  _startNostrSub();

  /* Show done */
  if (btn) btn.style.display = 'none';
  const done = document.getElementById('chat-ci-done');
  if (done) done.style.display = 'block';
}

/* ── Delete contact ── */

function _deleteContact() {
  if (_activeIdx < 0 || !_contacts[_activeIdx]) return;
  const c = _contacts[_activeIdx];
  if (!confirm('Delete contact "' + c.name + '" and all messages?')) return;
  _contacts.splice(_activeIdx, 1);
  _saveContacts();
  _activeIdx = -1;
  document.getElementById('chat-conv').style.display = 'none';
  document.getElementById('chat-empty').style.display = 'flex';
  _renderContacts();
}

/* ── Send message ── */

async function _sendMsg() {
  if (_activeIdx < 0 || !_profile) return;
  const contact = _contacts[_activeIdx];
  const input = document.getElementById('chat-msg-input');
  const text = input?.value.trim();
  if (!text) return;
  if (!contact.bch_address || !contact.pub_hex) { alert('Contact missing BCH address or pub key'); return; }
  if (new TextEncoder().encode(text).length > 500) { alert('Message too long — max 500 bytes'); return; }
  input.value = '';
  const time = _timeStr();
  const msg = { from: 'me', text, time: time + ' · sending...', v2: true };
  _appendMsg(msg);

  try {
    const txid = await _sendCcshMsgV2(contact, text);
    msg.time = time + ' · v2 ' + txid.slice(0, 8) + '...';
    /* Update the last message time tag */
    const tags = document.querySelectorAll('#chat-messages .msg-time-tag');
    if (tags.length) tags[tags.length - 1].innerHTML = _esc(msg.time) + ' <span style="font-size:8px;opacity:.4">v2</span>';
    contact.msgs = contact.msgs || [];
    contact.msgs.push(msg);
    _saveContacts();
    _renderContacts();
  } catch (e) {
    msg.time = 'Error: ' + e.message;
    const tags = document.querySelectorAll('#chat-messages .msg-time-tag');
    if (tags.length) tags[tags.length - 1].textContent = msg.time;
  }
}

/* ══════════════════════════════════════════
   MOUNT / UNMOUNT
   ══════════════════════════════════════════ */

export async function mount(container) {
  _container = container;

  /* Check auth — wallet must be unlocked */
  if (!auth.isUnlocked()) { navigate('auth'); return; }

  /* Render loading state */
  container.innerHTML = `
    <div style="padding:24px 32px;height:calc(100vh - 48px);display:flex;flex-direction:column">
      <div class="dt-page-header" style="flex-shrink:0;margin-bottom:16px">
        <div class="dt-page-title-wrap">
          <div class="dt-page-icon"><img src="icons/chat.png" style="width:28px;height:28px"></div>
          <div><div class="dt-page-title">Chat</div><div class="dt-page-sub">Split-Knowledge · BCH + Nostr</div></div>
        </div>
      </div>
      <div id="chat-auth-area" style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--dt-surface,#fff);border:1px solid var(--dt-border);border-radius:16px;overflow:hidden"></div>
    </div>`;

  /* Auto-derive chat identity from wallet HD keys */
  const keys = auth.getKeys();
  if (keys?.acctPriv && keys?.acctChain) {
    try {
      const { bip32Child } = await import('../core/hd.js');
      const { x25519 } = await import('https://esm.sh/@noble/curves@1.8.1/ed25519');

      // Derive chat key at m/44'/145'/0'/2/0
      const chatBranch = bip32Child(keys.acctPriv, keys.acctChain, 2);
      const chatNode = bip32Child(chatBranch.priv || chatBranch.pub, chatBranch.chain, 0);
      const chatPriv = chatNode.priv;

      // Derive X25519 key from chat private key (first 32 bytes = x25519 priv)
      const x25519Priv = chatPriv.slice(0, 32);
      const x25519Pub = x25519.getPublicKey(x25519Priv);

      // Derive BCH address for chat funding
      const { secp256k1 } = await import('https://esm.sh/@noble/curves@1.8.1/secp256k1');
      const chatPub33 = secp256k1.getPublicKey(chatPriv, true);
      const chatH160 = ripemd160(sha256(chatPub33));
      const chatAddr = pubHashToCashAddr(chatH160);

      _profile = {
        x25519_priv_hex: b2h(x25519Priv),
        x25519_pub_hex: b2h(x25519Pub),
        bch_priv_hex: b2h(chatPriv),
        bch_address: chatAddr,
      };
      _sessionPass = auth.getPassword();

      // Also save as chat vault for compat
      if (_sessionPass) {
        try { localStorage.setItem('00chat_vault', await encryptVault(_profile, _sessionPass)); } catch {}
      }

      _bootIntoChat();
      return;
    } catch (e) { console.warn('[chat] HD derivation failed:', e.message); }
  }

  /* Fallback: try existing chat vault */
  const autoOk = await _tryAutoUnlock();
  if (autoOk) {
    _bootIntoChat();
  } else {
    /* Also try creating chat vault from wallet vault */
    const vault = localStorage.getItem('00chat_vault');
    if (!vault) {
      try {
        const sess = JSON.parse(localStorage.getItem('00_session_auth') || '{}');
        const walletVault = localStorage.getItem('00wallet_vault');
        if (sess.p && sess.ts && Date.now() - sess.ts < 30 * 60 * 1000 && walletVault) {
          const pass = atob(sess.p);
          const walletProfile = await decryptVault(walletVault, pass);
          const seed64 = walletProfile.seedHex
            ? h2b(walletProfile.seedHex)
            : concat(h2b(walletProfile.bchPrivHex), new Uint8Array(32));
          _profile = deriveProfileFromSeed(seed64);
          _sessionPass = pass;
          localStorage.setItem('00chat_vault', await encryptVault(_profile, pass));
          _bootIntoChat();
          return;
        }
      } catch {}
    }
    _showAuth();
  }
}

export function unmount() {
  _stopScanner();
  _stopNostrSub();
  if (_balanceTimer) { clearInterval(_balanceTimer); _balanceTimer = null; }
  _activeIdx = -1;
  _pendingChainParts.clear();
  _pendingRelayParts.clear();
  if (_container) _container.innerHTML = '';
  _container = null;
}
