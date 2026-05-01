import { secp256k1 } from "../lib/noble-curves.js";
import { sha256 } from "../lib/noble-hashes.js";
import { ripemd160 } from "../lib/noble-hashes.js";
import { concat, u32LE, u64LE, writeVarint, b2h, h2b, dsha256 } from "./utils.js";
function p2pkhScript(hash20) {
  return concat(new Uint8Array([118, 169, 20]), hash20, new Uint8Array([136, 172]));
}
function p2shScript(hash20) {
  return concat(new Uint8Array([169, 20]), hash20, new Uint8Array([135]));
}
function bchSighash(version, locktime, inputs, outputs, i, utxoScript, utxoValue) {
  const prevouts = concat(...inputs.map((x) => concat(x.txidLE, u32LE(x.vout))));
  const seqs = concat(...inputs.map((x) => u32LE(x.sequence)));
  const outsData = concat(...outputs.map((o) => concat(u64LE(o.value), writeVarint(o.script.length), o.script)));
  const inp = inputs[i];
  return dsha256(concat(
    u32LE(version),
    dsha256(prevouts),
    dsha256(seqs),
    inp.txidLE,
    u32LE(inp.vout),
    writeVarint(utxoScript.length),
    utxoScript,
    u64LE(utxoValue),
    u32LE(inp.sequence),
    dsha256(outsData),
    u32LE(locktime),
    u32LE(65)
    // SIGHASH_ALL | SIGHASH_FORKID
  ));
}
function signInput(sighash, privKey) {
  const sig = secp256k1.sign(sighash, privKey);
  const der = sig.toDERRawBytes();
  return concat(der, new Uint8Array([65]));
}
function p2pkhScriptSig(sig, pubkey) {
  return concat(
    new Uint8Array([sig.length]),
    sig,
    new Uint8Array([pubkey.length]),
    pubkey
  );
}
function serializeTx(version, locktime, inputs, outputs) {
  return concat(
    u32LE(version),
    writeVarint(inputs.length),
    ...inputs.flatMap((inp) => [
      inp.txidLE,
      u32LE(inp.vout),
      writeVarint(inp.scriptSig.length),
      inp.scriptSig,
      u32LE(inp.sequence)
    ]),
    writeVarint(outputs.length),
    ...outputs.flatMap((o) => [
      u64LE(o.value),
      writeVarint(o.script.length),
      o.script
    ]),
    u32LE(locktime)
  );
}
function parseTxHex(hex) {
  try {
    const b = h2b(hex);
    let p = 0;
    const rB = (n) => {
      const s = b.slice(p, p + n);
      p += n;
      return s;
    };
    const rLE = (n) => {
      let r = 0;
      for (let i = 0; i < n; i++) r |= b[p + i] << i * 8;
      p += n;
      return r >>> 0;
    };
    const rVI = () => {
      const f = b[p++];
      if (f < 253) return f;
      if (f === 253) return rLE(2);
      if (f === 254) return rLE(4);
      return rLE(8);
    };
    const rLE8 = () => {
      const lo = rLE(4), hi = rLE(4);
      return hi * 4294967296 + lo;
    };
    rLE(4);
    const inCount = rVI();
    for (let i = 0; i < inCount; i++) {
      rB(32);
      rLE(4);
      rB(rVI());
      rLE(4);
    }
    const outCount = rVI();
    const outputs = [];
    for (let i = 0; i < outCount; i++) {
      const value = rLE8();
      const script = b2h(rB(rVI()));
      outputs.push({ value, script });
    }
    return outputs;
  } catch {
    return null;
  }
}
function txidFromRaw(rawHex) {
  const hash = dsha256(h2b(rawHex));
  return b2h(hash.reverse());
}
function pubToHash160(pub) {
  return ripemd160(sha256(pub));
}
function estimateTxSize(numInputs, numOutputs) {
  return 10 + numInputs * 148 + numOutputs * 34;
}
function serializeUnsignedTx(utxos, outputs) {
  return b2h(concat(
    u32LE(2),
    writeVarint(utxos.length),
    ...utxos.flatMap((u) => [
      h2b(u.txid).reverse(),
      u32LE(u.vout),
      new Uint8Array([0]),
      // empty scriptSig (varint 0 = no script)
      u32LE(4294967295)
      // sequence
    ]),
    writeVarint(outputs.length),
    ...outputs.flatMap((o) => [
      u64LE(o.value),
      writeVarint(o.script.length),
      o.script
    ]),
    u32LE(0)
    // locktime
  ));
}
function selectUtxos(utxos, targetSats, feePerByte = 1) {
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected = [];
  let total = 0;
  for (const u of sorted) {
    selected.push(u);
    total += u.value;
    const estFee = estimateTxSize(selected.length, 2) * feePerByte;
    if (total >= targetSats + estFee) {
      return { utxos: selected, total, fee: estFee };
    }
  }
  return null;
}
export {
  bchSighash,
  estimateTxSize,
  p2pkhScript,
  p2pkhScriptSig,
  p2shScript,
  parseTxHex,
  pubToHash160,
  selectUtxos,
  serializeTx,
  serializeUnsignedTx,
  signInput,
  txidFromRaw
};
