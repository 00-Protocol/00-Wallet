/* ══════════════════════════════════════════
   XRP (Ripple) Transaction Signing & Broadcast
   ══════════════════════════════════════════
   Signs XRP Payment transactions offline using
   secp256k1 + XRPL canonical binary serialization,
   then broadcasts via WebSocket.
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha512 } from 'https://esm.sh/@noble/hashes@1.7.1/sha512';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';

const WS_URL = 'wss://xrplcluster.com';

function b2h(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
function h2b(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; }
function concat(...arrs) { const len = arrs.reduce((s, a) => s + a.length, 0); const r = new Uint8Array(len); let off = 0; for (const a of arrs) { r.set(a, off); off += a.length; } return r; }

/* ── XRP Base58 decode ── */
const XRP_ALPHA = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
function xrpBase58Decode(addr) {
  let n = 0n;
  for (const c of addr) { const i = XRP_ALPHA.indexOf(c); if (i < 0) throw new Error('Invalid XRP address'); n = n * 58n + BigInt(i); }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let leading = 0;
  for (const c of addr) { if (c === XRP_ALPHA[0]) leading++; else break; }
  hex = '00'.repeat(leading) + hex;
  return h2b(hex).slice(1, 21); // strip version byte, strip 4-byte checksum
}

/* ── Half-SHA512 ── */
function halfSha512(...parts) { return sha512(concat(...parts)).slice(0, 32); }

/* ── XRPL Binary Field Encoding ── */
function fieldId(type, field) {
  if (type < 16 && field < 16) return new Uint8Array([(type << 4) | field]);
  if (type >= 16 && field < 16) return new Uint8Array([field, type]);
  if (type < 16 && field >= 16) return new Uint8Array([(type << 4), field]);
  return new Uint8Array([0, type, field]);
}

function encU16(type, field, v) { const b = new Uint8Array(2); b[0] = v >> 8; b[1] = v & 0xff; return concat(fieldId(type, field), b); }
function encU32(type, field, v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return concat(fieldId(type, field), b); }

function encAmount(type, field, drops) {
  // XRP native amount: 8 bytes. Bit 63 = "not IOU" (1), bit 62 = positive (1 if positive)
  const v = BigInt(drops);
  const hi = Number((v >> 32n) & 0x3FFFFFFFn) | 0x40000000; // set bit 62 (positive), bit 63 will be set below
  const lo = Number(v & 0xFFFFFFFFn);
  const b = new Uint8Array(8);
  new DataView(b.buffer).setUint32(0, hi | 0x40000000); // bit 62
  new DataView(b.buffer).setUint32(4, lo);
  // Set bit 63 (not IOU)
  b[0] |= 0x40; // bit 62 = positive
  // For positive XRP amounts: top byte should be 0x40 | high bits
  // Actually simpler: encode as (0x4000000000000000 | drops)
  const encoded = BigInt('0x4000000000000000') | v;
  new DataView(b.buffer).setUint32(0, Number(encoded >> 32n));
  new DataView(b.buffer).setUint32(4, Number(encoded & 0xFFFFFFFFn));
  return concat(fieldId(type, field), b);
}

function encVL(type, field, data) {
  const len = data.length;
  const lb = len < 192 ? new Uint8Array([len]) : new Uint8Array([193 + ((len - 193) >> 8), (len - 193) & 0xff]);
  return concat(fieldId(type, field), lb, data);
}

function encAcct(type, field, accountId20) { return encVL(type, field, accountId20); }

/* ── Serialize Payment TX (canonical field order) ── */
function serializeForSigning({ srcAcctId, dstAcctId, amountDrops, feeDrops, sequence, lastLedgerSeq, pubKey33, destinationTag }) {
  // XRPL canonical order: sorted by (typeCode, fieldCode)
  // Type 1 = UInt16: TransactionType(2)
  // Type 2 = UInt32: Flags(2), Sequence(4), DestinationTag(14), LastLedgerSequence(27)
  // Type 6 = Amount: Amount(1), Fee(8)
  // Type 7 = Blob: SigningPubKey(3)
  // Type 8 = AccountID: Account(1), Destination(3)
  const parts = [
    encU16(1, 2, 0),                   // TransactionType = Payment (0)
    encU32(2, 2, 0x80000000),          // Flags = tfFullyCanonicalSig
    encU32(2, 4, sequence),            // Sequence
  ];
  if (destinationTag !== undefined && destinationTag !== null && destinationTag !== '') {
    parts.push(encU32(2, 14, parseInt(destinationTag))); // DestinationTag
  }
  parts.push(
    encU32(2, 27, lastLedgerSeq),      // LastLedgerSequence
    encAmount(6, 1, amountDrops),      // Amount
    encAmount(6, 8, feeDrops),         // Fee
    encVL(7, 3, pubKey33),             // SigningPubKey
    encAcct(8, 1, srcAcctId),          // Account
    encAcct(8, 3, dstAcctId),          // Destination
  );
  return concat(...parts);
}

/* ── Send XRP ── */
export async function sendXrp({ toAddress, amountDrops, privKey32, fromAddress, destinationTag }) {
  const pubKey33 = secp256k1.getPublicKey(privKey32, true);
  const srcAcctId = ripemd160(sha256(pubKey33));
  const dstAcctId = xrpBase58Decode(toAddress);
  const rpcUrl = window._00ep?.xrp_rpc || WS_URL;

  // 1. Get account info
  const acctInfo = await _wsCmd(rpcUrl, { command: 'account_info', account: fromAddress, ledger_index: 'current' });
  if (acctInfo.result?.error) throw new Error('XRP: ' + (acctInfo.result.error_message || acctInfo.result.error));
  const sequence = acctInfo.result?.account_data?.Sequence;
  if (sequence === undefined) throw new Error('Could not get XRP account sequence');

  // 2. Current validated ledger
  const ledgerResp = await _wsCmd(rpcUrl, { command: 'ledger_current' });
  const currentLedger = ledgerResp.result?.ledger_current_index || 0;

  const feeDrops = 12;
  const lastLedgerSeq = currentLedger + 20;

  // 3. Serialize for signing
  const serialized = serializeForSigning({ srcAcctId, dstAcctId, amountDrops, feeDrops: feeDrops, sequence, lastLedgerSeq, pubKey33, destinationTag });

  // 4. Sign: SHA-512Half(0x53545800 + serialized)
  const STX = new Uint8Array([0x53, 0x54, 0x58, 0x00]);
  const hash = halfSha512(STX, serialized);
  const sig = secp256k1.sign(hash, privKey32);
  const derSig = sig.toDERRawBytes();

  // 5. Build signed TX: serialized + TxnSignature
  const signedTx = concat(serialized, encVL(7, 4, derSig));

  // 6. Submit
  const submitResult = await _wsCmd(rpcUrl, { command: 'submit', tx_blob: b2h(signedTx).toUpperCase() });
  console.log('[xrp] submit:', JSON.stringify(submitResult).slice(0, 500));

  const er = submitResult.result?.engine_result;
  if (er === 'tesSUCCESS' || er?.startsWith('tes') || er === 'terQUEUED') {
    return { txid: submitResult.result?.tx_json?.hash || 'submitted' };
  }
  throw new Error('XRP: ' + (submitResult.result?.engine_result_message || er || submitResult.error_message || submitResult.error || JSON.stringify(submitResult).slice(0, 200)));
}

/* ── WS one-shot ── */
function _wsCmd(url, cmd) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { ws.close(); reject(new Error('XRP timeout')); }, 15000);
    ws.onopen = () => ws.send(JSON.stringify(cmd));
    ws.onmessage = e => { clearTimeout(t); try { resolve(JSON.parse(e.data)); } catch { reject(new Error('Bad XRP response')); } ws.close(); };
    ws.onerror = () => { clearTimeout(t); reject(new Error('XRP WS error')); };
  });
}
