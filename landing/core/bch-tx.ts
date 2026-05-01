/* ══════════════════════════════════════════
   00 Wallet — BCH Transaction Builder
   ══════════════════════════════════════════
   Extracted from 10+ duplicated copies.
   Sighash, serialization, script helpers.
   ══════════════════════════════════════════ */

import { secp256k1 } from '../lib/noble-curves.js';
import { sha256 } from '../lib/noble-hashes.js';
import { ripemd160 } from '../lib/noble-hashes.js';
import { concat, u32LE, u64LE, writeVarint, b2h, h2b, dsha256 } from './utils.js';

export interface TxInput {
  txidLE: Uint8Array;
  vout: number;
  sequence: number;
  scriptSig: Uint8Array;
}

export interface TxOutput {
  value: number;
  script: Uint8Array;
}

export interface ParsedOutput {
  value: number;
  script: string;
}

export interface Utxo {
  value: number;
  [key: string]: unknown;
}

export interface UtxoSelection {
  utxos: Utxo[];
  total: number;
  fee: number;
}

/* ── Script templates ── */
export function p2pkhScript(hash20: Uint8Array): Uint8Array {
  return concat(new Uint8Array([0x76, 0xa9, 0x14]), hash20, new Uint8Array([0x88, 0xac]));
}

export function p2shScript(hash20: Uint8Array): Uint8Array {
  return concat(new Uint8Array([0xa9, 0x14]), hash20, new Uint8Array([0x87]));
}

/* ── BIP143 Sighash (BCH) ── */
export function bchSighash(
  version: number,
  locktime: number,
  inputs: TxInput[],
  outputs: TxOutput[],
  i: number,
  utxoScript: Uint8Array,
  utxoValue: number
): Uint8Array {
  const prevouts = concat(...inputs.map(x => concat(x.txidLE, u32LE(x.vout))));
  const seqs = concat(...inputs.map(x => u32LE(x.sequence)));
  const outsData = concat(...outputs.map(o => concat(u64LE(o.value), writeVarint(o.script.length), o.script)));
  const inp = inputs[i];
  return dsha256(concat(
    u32LE(version), dsha256(prevouts), dsha256(seqs),
    inp.txidLE, u32LE(inp.vout),
    writeVarint(utxoScript.length), utxoScript,
    u64LE(utxoValue), u32LE(inp.sequence),
    dsha256(outsData), u32LE(locktime),
    u32LE(0x41) // SIGHASH_ALL | SIGHASH_FORKID
  ));
}

/* ── Sign a single input ── */
export function signInput(sighash: Uint8Array, privKey: Uint8Array): Uint8Array {
  const sig = secp256k1.sign(sighash, privKey);
  const der = sig.toDERRawBytes();
  return concat(der, new Uint8Array([0x41])); // append SIGHASH_ALL|FORKID
}

/* ── Build scriptSig for P2PKH ── */
export function p2pkhScriptSig(sig: Uint8Array, pubkey: Uint8Array): Uint8Array {
  return concat(
    new Uint8Array([sig.length]), sig,
    new Uint8Array([pubkey.length]), pubkey
  );
}

/* ── Serialize full TX ── */
export function serializeTx(version: number, locktime: number, inputs: TxInput[], outputs: TxOutput[]): Uint8Array {
  return concat(
    u32LE(version), writeVarint(inputs.length),
    ...inputs.flatMap(inp => [
      inp.txidLE, u32LE(inp.vout),
      writeVarint(inp.scriptSig.length), inp.scriptSig,
      u32LE(inp.sequence)
    ]),
    writeVarint(outputs.length),
    ...outputs.flatMap(o => [
      u64LE(o.value), writeVarint(o.script.length), o.script
    ]),
    u32LE(locktime)
  );
}

/* ── Parse raw TX hex → outputs ── */
export function parseTxHex(hex: string): ParsedOutput[] | null {
  try {
    const b = h2b(hex); let p = 0;
    const rB = (n: number) => { const s = b.slice(p, p + n); p += n; return s; };
    const rLE = (n: number) => { let r = 0; for (let i = 0; i < n; i++) r |= b[p + i] << (i * 8); p += n; return r >>> 0; };
    const rVI = () => { const f = b[p++]; if (f < 0xfd) return f; if (f === 0xfd) return rLE(2); if (f === 0xfe) return rLE(4); return rLE(8); };
    const rLE8 = () => { const lo = rLE(4), hi = rLE(4); return hi * 0x100000000 + lo; };
    rLE(4); // version
    const inCount = rVI();
    for (let i = 0; i < inCount; i++) { rB(32); rLE(4); rB(rVI()); rLE(4); }
    const outCount = rVI();
    const outputs: ParsedOutput[] = [];
    for (let i = 0; i < outCount; i++) {
      const value = rLE8();
      const script = b2h(rB(rVI()));
      outputs.push({ value, script });
    }
    return outputs;
  } catch { return null; }
}

/* ── TXID from raw hex (double-SHA256, reversed) ── */
export function txidFromRaw(rawHex: string): string {
  const hash = dsha256(h2b(rawHex));
  return b2h(hash.reverse());
}

/* ── Pub → hash160 ── */
export function pubToHash160(pub: Uint8Array): Uint8Array {
  return ripemd160(sha256(pub));
}

/* ── Estimate TX size (for fee calculation) ── */
export function estimateTxSize(numInputs: number, numOutputs: number): number {
  // P2PKH: ~148 bytes per input, ~34 bytes per output, 10 bytes overhead
  return 10 + (numInputs * 148) + (numOutputs * 34);
}

/* ── Build an unsigned TX hex (empty scriptSigs) for WalletConnect signing ── */
export function serializeUnsignedTx(utxos: Array<{ txid: string; vout: number; value: number }>, outputs: TxOutput[]): string {
  return b2h(concat(
    u32LE(2),
    writeVarint(utxos.length),
    ...utxos.flatMap(u => [
      h2b(u.txid).reverse() as Uint8Array,
      u32LE(u.vout),
      new Uint8Array([0]),         // empty scriptSig (varint 0 = no script)
      u32LE(0xffffffff),           // sequence
    ]),
    writeVarint(outputs.length),
    ...outputs.flatMap(o => [
      u64LE(o.value),
      writeVarint(o.script.length),
      o.script,
    ]),
    u32LE(0),                      // locktime
  ));
}

/* ── UTXO selection (simple largest-first) ── */
export function selectUtxos(utxos: Utxo[], targetSats: number, feePerByte: number = 1): UtxoSelection | null {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected: Utxo[] = [];
  let total = 0;

  for (const u of sorted) {
    selected.push(u);
    total += u.value;
    const estFee = estimateTxSize(selected.length, 2) * feePerByte;
    if (total >= targetSats + estFee) {
      return { utxos: selected, total, fee: estFee };
    }
  }

  return null; // insufficient funds
}
