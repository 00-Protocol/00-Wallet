/* ══════════════════════════════════════════
   Stellar (XLM) Transaction Builder & Signer
   ══════════════════════════════════════════
   Signs and broadcasts XLM transfers via Horizon API.
   Uses ed25519 signing.
   ══════════════════════════════════════════ */

import { ed25519 } from 'https://esm.sh/@noble/curves@1.8.1/ed25519';

const HORIZON = 'https://horizon.stellar.org';

/* ── Memo encoding ── */
function _encodeMemo(memo) {
  const str = String(memo).trim();
  if (!str) return xdrUint32(0); // MEMO_NONE
  // Try as numeric ID first (MEMO_ID = 2)
  if (/^\d+$/.test(str) && str.length <= 19) {
    return concat(xdrUint32(2), xdrUint64(BigInt(str))); // MEMO_ID
  }
  // Otherwise MEMO_TEXT (type 1), max 28 bytes
  const enc = new TextEncoder().encode(str.slice(0, 28));
  const padded = new Uint8Array(Math.ceil(enc.length / 4) * 4);
  padded.set(enc);
  return concat(xdrUint32(1), xdrUint32(enc.length), padded); // MEMO_TEXT
}
function xdrUint64(n) { const b = new ArrayBuffer(8); const dv = new DataView(b); dv.setUint32(0, Number(n >> 32n)); dv.setUint32(4, Number(n & 0xFFFFFFFFn)); return new Uint8Array(b); }
const NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const BASE_FEE = 100; // 100 stroops = 0.00001 XLM

/* ── Helpers ── */
function b2h(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
function h2b(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; }
function concat(...arrs) { const len = arrs.reduce((s, a) => s + a.length, 0); const r = new Uint8Array(len); let off = 0; for (const a of arrs) { r.set(a, off); off += a.length; } return r; }

/* ── XDR Encoding helpers ── */
function xdrInt32(n) { const b = new ArrayBuffer(4); new DataView(b).setInt32(0, n); return new Uint8Array(b); }
function xdrUint32(n) { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, n); return new Uint8Array(b); }
function xdrInt64(n) { const b = new ArrayBuffer(8); const v = new DataView(b); const bn = BigInt(n); v.setUint32(0, Number(bn >> 32n)); v.setUint32(4, Number(bn & 0xFFFFFFFFn)); return new Uint8Array(b); }
function xdrString(s) { const enc = new TextEncoder().encode(s); const padded = enc.length % 4 ? new Uint8Array(enc.length + (4 - enc.length % 4)) : new Uint8Array(enc.length); padded.set(enc); return concat(xdrUint32(enc.length), padded); }
function xdrOpaque(bytes, fixed = false) { if (fixed) return bytes; const padLen = bytes.length % 4 ? 4 - bytes.length % 4 : 0; return concat(xdrUint32(bytes.length), bytes, new Uint8Array(padLen)); }

/* ── Stellar keypair from raw ed25519 private key ── */
function getPublicKey(priv32) {
  return ed25519.getPublicKey(priv32.slice(0, 32));
}

/* ── Base32 encode/decode (RFC 4648, Stellar StrKey) ── */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(str) {
  str = str.replace(/=+$/, '');
  const out = [];
  let bits = 0, val = 0;
  for (const c of str) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('Invalid base32');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((val >> bits) & 0xff); }
  }
  return new Uint8Array(out);
}

function base32Encode(data) {
  let bits = 0, val = 0, out = '';
  for (const b of data) { val = (val << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; out += B32[(val >> bits) & 31]; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  while (out.length % 8) out += '=';
  return out;
}

/* ── CRC16-XMODEM ── */
function crc16(data) {
  let crc = 0;
  for (const b of data) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = (crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0); crc &= 0xffff; }
  return crc;
}

/* ── Decode Stellar G... address → 32-byte public key ── */
function decodeAddress(addr) {
  const decoded = base32Decode(addr);
  const versionByte = decoded[0];
  const pubKey = decoded.slice(1, 33);
  const checksum = decoded[33] | (decoded[34] << 8);
  const expected = crc16(decoded.slice(0, 33));
  if (checksum !== expected) throw new Error('Invalid Stellar address checksum');
  return pubKey;
}

/* ── Encode public key → G... address ── */
function encodeAddress(pubKey) {
  const payload = concat(new Uint8Array([6 << 3]), pubKey); // G... = version 6
  const cs = crc16(payload);
  return base32Encode(concat(payload, new Uint8Array([cs & 0xff, (cs >> 8) & 0xff])));
}

/* ── SHA-256 ── */
async function sha256(data) {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buf);
}

/* ── Build & sign a payment transaction ── */
export async function sendXlm({ toAddress, amountStroops, privKey32, memo }) {
  const pubKey = getPublicKey(privKey32);
  const fromAddress = encodeAddress(pubKey);
  const toPubKey = decodeAddress(toAddress);

  // 1. Fetch account info (sequence number)
  const acctResp = await fetch(`${HORIZON}/accounts/${fromAddress}?_=${Date.now()}`, { cache: 'no-store' });
  if (!acctResp.ok) throw new Error('Account not found on Stellar — needs activation (min 1 XLM)');
  const acctData = await acctResp.json();
  const sequence = BigInt(acctData.sequence) + 1n;

  // 2. Check if destination account exists
  let destExists = true;
  try {
    const destResp = await fetch(`${HORIZON}/accounts/${toAddress}`);
    if (destResp.status === 404) destExists = false;
  } catch { destExists = false; }

  if (!destExists && amountStroops < 10000000) {
    throw new Error('Destination account does not exist — minimum 1 XLM required to create it');
  }

  // 3. Build transaction envelope (XDR)
  const networkHash = await sha256(new TextEncoder().encode(NETWORK_PASSPHRASE));
  const sourceAccount = concat(xdrUint32(0), xdrOpaque(pubKey, true));

  let operation;
  if (!destExists) {
    // CREATE_ACCOUNT (opType 0): creates new account with starting balance
    operation = concat(
      xdrUint32(0),                           // no source account override
      xdrUint32(0),                           // opType = CREATE_ACCOUNT
      xdrUint32(0), xdrOpaque(toPubKey, true), // destination (ED25519)
      xdrInt64(amountStroops),                // startingBalance in stroops
    );
  } else {
    // PAYMENT (opType 1): send to existing account
    operation = concat(
      xdrUint32(0),                           // no source account override
      xdrUint32(1),                           // opType = PAYMENT
      xdrUint32(0), xdrOpaque(toPubKey, true), // destination (ED25519)
      xdrUint32(0),                           // ASSET_TYPE_NATIVE
      xdrInt64(amountStroops),                // amount in stroops
    );
  }

  const txBody = concat(
    sourceAccount,                          // source
    xdrUint32(BASE_FEE),                    // fee
    xdrInt64(sequence),                     // seqNum
    xdrUint32(0),                           // timeBounds (none)
    memo ? _encodeMemo(memo) : xdrUint32(0), // memo (none if empty)
    xdrUint32(1),                           // num operations = 1
    operation,                              // the operation
    xdrUint32(0),                           // ext (TransactionExt)
  );

  // 3. Sign
  // Transaction hash = SHA256(networkHash + ENVELOPE_TYPE_TX(2) + txBody)
  const ENVELOPE_TYPE_TX = xdrUint32(2);
  const signPayload = concat(networkHash, ENVELOPE_TYPE_TX, txBody);
  const txHash = await sha256(signPayload);

  const signature = ed25519.sign(txHash, privKey32.slice(0, 32));

  // 4. Build envelope XDR
  // TransactionEnvelope = ENVELOPE_TYPE_TX(2) + tx + signatures[1]
  const envelope = concat(
    xdrUint32(2),                           // ENVELOPE_TYPE_TX
    txBody,                                 // transaction
    xdrUint32(1),                           // num signatures = 1
    // DecoratedSignature: hint(4) + signature
    xdrOpaque(pubKey.slice(-4), true),      // hint = last 4 bytes of pubkey
    xdrOpaque(signature),                   // signature (variable length opaque)
  );

  // 5. Broadcast
  const envelopeB64 = btoa(String.fromCharCode(...envelope));
  const broadcastResp = await fetch(`${HORIZON}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'tx=' + encodeURIComponent(envelopeB64),
  });

  const result = await broadcastResp.json();
  if (result.successful || result.hash) {
    return { txid: result.hash || result.id };
  }

  // Parse error
  const errMsg = result.extras?.result_codes?.operations?.[0] || result.extras?.result_codes?.transaction || result.detail || result.title || 'Unknown error';
  throw new Error('Stellar: ' + errMsg);
}
