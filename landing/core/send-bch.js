/* ══════════════════════════════════════════
   00 Wallet — BCH Send (sign + broadcast)
   ══════════════════════════════════════════
   Build, sign, and broadcast a BCH P2PKH transaction.
   Uses Fulcrum SharedWorker for broadcast.
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';

/* ── Helpers ── */
function b2h(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
function h2b(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < hex.length; i += 2) a[i/2] = parseInt(hex.substr(i, 2), 16); return a; }
function concat(...arrs) { const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; }
function u32LE(v) { const b = new Uint8Array(4); b[0]=v&0xff; b[1]=(v>>8)&0xff; b[2]=(v>>16)&0xff; b[3]=(v>>24)&0xff; return b; }
function u64LE(v) { const b = new Uint8Array(8); const lo=v&0xffffffff, hi=Math.floor(v/0x100000000); b[0]=lo&0xff;b[1]=(lo>>8)&0xff;b[2]=(lo>>16)&0xff;b[3]=(lo>>24)&0xff;b[4]=hi&0xff;b[5]=(hi>>8)&0xff;b[6]=(hi>>16)&0xff;b[7]=(hi>>24)&0xff; return b; }
function writeVI(v) { if (v < 0xfd) return new Uint8Array([v]); const b = new Uint8Array(3); b[0]=0xfd; b[1]=v&0xff; b[2]=(v>>8)&0xff; return b; }
function dsha256(d) { return sha256(sha256(d)); }
function p2pkhScript(h160) { return concat(new Uint8Array([0x76, 0xa9, 0x14]), h160, new Uint8Array([0x88, 0xac])); }

/* ── Estimate TX size ── */
export function estimateTxSize(nIn, nOut) {
  return 10 + nIn * 148 + nOut * 34;
}

/* ── Build and sign BCH TX (BIP143 sighash) ── */
export function buildSignedTx(inputs, outputs, getKeyForInput) {
  // BIP143 precomputed hashes
  const hashPrevouts = dsha256(concat(...inputs.map(u => concat(h2b(u.txid).reverse(), u32LE(u.vout)))));
  const hashSequence = dsha256(concat(...inputs.map(() => u32LE(0xffffffff))));
  const hashOutputs = dsha256(concat(...outputs.map(o => concat(u64LE(o.value), writeVI(o.script.length), o.script))));

  const rawParts = [u32LE(2)]; // version 2
  rawParts.push(writeVI(inputs.length));

  for (let i = 0; i < inputs.length; i++) {
    const u = inputs[i];
    const { priv, pub } = getKeyForInput(u, i);
    const iHash160 = ripemd160(sha256(pub));
    const scriptCode = p2pkhScript(iHash160);

    // BIP143 sighash preimage
    const preimage = concat(
      u32LE(2), hashPrevouts, hashSequence,
      h2b(u.txid).reverse(), u32LE(u.vout),
      writeVI(scriptCode.length), scriptCode,
      u64LE(u.value), u32LE(0xffffffff),
      hashOutputs, u32LE(0), u32LE(0x41) // SIGHASH_ALL | FORKID
    );
    const sighash = dsha256(preimage);
    const sig = secp256k1.sign(sighash, priv);
    const derSig = sig.toDERRawBytes();
    const sigWithHash = concat(derSig, new Uint8Array([0x41]));
    const scriptSig = concat(writeVI(sigWithHash.length), sigWithHash, writeVI(pub.length), pub);

    rawParts.push(h2b(u.txid).reverse());
    rawParts.push(u32LE(u.vout));
    rawParts.push(writeVI(scriptSig.length));
    rawParts.push(scriptSig);
    rawParts.push(u32LE(0xffffffff)); // sequence
  }

  rawParts.push(writeVI(outputs.length));
  for (const o of outputs) {
    rawParts.push(u64LE(o.value));
    rawParts.push(writeVI(o.script.length));
    rawParts.push(o.script);
  }
  rawParts.push(u32LE(0)); // locktime

  return b2h(concat(...rawParts));
}

/* ── Full send flow: select UTXOs, build TX, sign, broadcast ── */
export async function sendBch({ toAddress, amountSats, feeRate, utxos, privKey, pubKey, changeHash160, hdGetKey, opReturnData, ledgerSign }) {
  if (!toAddress) throw new Error('Recipient address required');
  if (amountSats < 546) throw new Error('Minimum 546 sats (dust limit)');
  if (!utxos || !utxos.length) throw new Error('No UTXOs available');

  // Parse recipient address
  const { cashAddrToHash20 } = await import('./cashaddr.js');
  const toHash160 = cashAddrToHash20(toAddress);
  const toScript = p2pkhScript(toHash160);

  // OP_RETURN output for stealth ephPub or other data
  let opReturnOutput = null;
  if (opReturnData && opReturnData.length > 0) {
    const data = opReturnData instanceof Uint8Array ? opReturnData : h2b(opReturnData);
    // OP_RETURN script: 0x6a (OP_RETURN) + push length + data
    const pushLen = data.length < 0x4c ? [data.length] : [0x4c, data.length];
    const script = new Uint8Array([0x6a, ...pushLen, ...data]);
    opReturnOutput = { value: 0, script };
  }

  // Count extra outputs for fee calculation
  const extraOutputs = opReturnOutput ? 1 : 0;

  // Select UTXOs (largest first)
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected = [];
  let total = 0;
  for (const u of sorted) {
    selected.push(u);
    total += u.value;
    const fee = Math.ceil(estimateTxSize(selected.length, 2 + extraOutputs) * feeRate);
    if (total >= amountSats + fee) break;
  }

  // Calculate fee (account for OP_RETURN output)
  const feeNoChange = Math.ceil(estimateTxSize(selected.length, 1 + extraOutputs) * feeRate);
  const fee2Out = Math.ceil(estimateTxSize(selected.length, 2 + extraOutputs) * feeRate);
  const changeWith2 = total - amountSats - fee2Out;
  const fee = changeWith2 >= 546 ? fee2Out : feeNoChange;

  if (total < amountSats + fee) throw new Error('Insufficient balance');

  const change = total - amountSats - fee;
  const outputs = [{ value: amountSats, script: toScript }];
  if (opReturnOutput) outputs.push(opReturnOutput);
  if (change >= 546) {
    const changeScript = p2pkhScript(changeHash160);
    outputs.push({ value: change, script: changeScript });
  }

  // Build and sign — Ledger or software
  let rawHex;
  if (ledgerSign) {
    // Ledger hardware wallet signing
    rawHex = await ledgerSign(selected, outputs);
  } else {
    // Software signing
    rawHex = buildSignedTx(selected, outputs, (u, i) => {
      // HD wallet: each UTXO may have its own key
      if (hdGetKey && u.addr) {
        const k = hdGetKey(u.addr);
        if (k) return { priv: k, pub: secp256k1.getPublicKey(k, true) };
      }
      // Fallback: main key
      return { priv: privKey, pub: pubKey };
    });
  }

  // Broadcast via Fulcrum
  if (!window._fvCall) throw new Error('Not connected to Fulcrum');
  const result = await window._fvCall('blockchain.transaction.broadcast', [rawHex]);

  // Check result
  if (result && typeof result === 'string' && result.length === 64) {
    return { txid: result, rawHex, fee, change };
  }
  throw new Error(typeof result === 'string' ? result : JSON.stringify(result));
}
