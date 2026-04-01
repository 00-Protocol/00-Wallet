/* ══════════════════════════════════════════
   00 Wallet — Multi-chain Address Derivation
   ══════════════════════════════════════════
   ETH, TRX (keccak), SOL, XLM (ed25519), XRP (custom base58)
   Lazy-loaded — heavy crypto deps only imported when needed.
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';
import { keccak_256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha3';
import { ed25519 } from 'https://esm.sh/@noble/curves@1.8.1/ed25519';
import { concat, b2h, h2b, utf8, dsha256 } from './utils.js';
import { base58Check } from './cashaddr.js';

/* ── ETH (EIP-55 checksum) ── */
export function ethAddr(pubkey33) {
  const uncompressed = secp256k1.ProjectivePoint.fromHex(pubkey33).toRawBytes(false).slice(1);
  const hash = keccak_256(uncompressed);
  const raw = hash.slice(12);
  const hexLower = b2h(raw);
  const hashHex = b2h(keccak_256(utf8(hexLower)));
  let cs = '0x';
  for (let i = 0; i < 40; i++) cs += parseInt(hashHex[i], 16) >= 8 ? hexLower[i].toUpperCase() : hexLower[i];
  return cs;
}

/* ── BTC (P2PKH, version 0x00) ── */
export function btcAddr(pubkey33) {
  const hash = ripemd160(sha256(pubkey33));
  return base58Check(concat(new Uint8Array([0x00]), hash));
}

/* ── LTC (P2PKH, version 0x30) ── */
export function ltcAddr(pubkey33) {
  const hash = ripemd160(sha256(pubkey33));
  return base58Check(concat(new Uint8Array([0x30]), hash));
}

/* ── TRX (keccak + base58check 0x41) ── */
export function tronAddr(pubkey33) {
  const uncompressed = secp256k1.ProjectivePoint.fromHex(pubkey33).toRawBytes(false).slice(1);
  const hash = keccak_256(uncompressed);
  const raw = hash.slice(12);
  return base58Check(concat(new Uint8Array([0x41]), raw));
}

/* ── XRP (custom base58) ── */
const XRP_ALPHABET = 'rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz';
export function xrpAddr(pubkey33) {
  const hash = ripemd160(sha256(pubkey33));
  const payload = concat(new Uint8Array([0x00]), hash);
  const input = concat(payload, dsha256(payload).slice(0, 4));
  let n = BigInt('0x' + b2h(input));
  let str = '';
  while (n > 0n) { str = XRP_ALPHABET[Number(n % 58n)] + str; n = n / 58n; }
  for (const b of input) { if (b === 0) str = XRP_ALPHABET[0] + str; else break; }
  return str;
}

/* ── SOL (ed25519 pub → base58) ── */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function solAddr(priv32) {
  const pubKey = ed25519.getPublicKey(priv32.slice(0, 32));
  let n = BigInt('0x' + b2h(pubKey));
  let str = '';
  while (n > 0n) { str = B58[Number(n % 58n)] + str; n = n / 58n; }
  for (const b of pubKey) { if (b === 0) str = '1' + str; else break; }
  return str;
}

/* ── XLM (ed25519 → StrKey base32 + CRC16) ── */
const XLM_B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function _crc16xmodem(data) {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xFFFF;
  }
  return crc;
}
function _base32Encode(data) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < data.length; i++) { value = (value << 8) | data[i]; bits += 8; while (bits >= 5) { bits -= 5; out += XLM_B32[(value >> bits) & 31]; } }
  if (bits > 0) out += XLM_B32[(value << (5 - bits)) & 31];
  return out;
}
export function xlmAddr(priv32) {
  const pubKey = ed25519.getPublicKey(priv32.slice(0, 32));
  const payload = concat(new Uint8Array([6 << 3]), pubKey); // version byte for public key = 'G'
  const crc = _crc16xmodem(payload);
  const full = concat(payload, new Uint8Array([crc & 0xff, (crc >> 8) & 0xff]));
  return _base32Encode(full);
}

/* ══════════════════════════════════════════
   Derive ALL addresses from auth keys.
   Returns clean, display-ready addresses.
   Token addresses share their base chain.
   ══════════════════════════════════════════ */
export function deriveAllAddresses(keys) {
  const addrs = { bch: keys.bchAddr };
  if (!keys.acctPriv || !keys.acctChain) return addrs;

  try {
    const acctPriv = keys.acctPriv;
    const acctChain = keys.acctChain;

    // BTC: /3/0
    const btcPub = _childPub(acctPriv, acctChain, 3);
    if (btcPub) addrs.btc = btcAddr(btcPub);

    // ETH: /4/0 → also BNB, AVAX, Polygon (all EVM share same address)
    const ethPub = _childPub(acctPriv, acctChain, 4);
    if (ethPub) {
      const evmAddr = ethAddr(ethPub);
      addrs.eth = evmAddr;
      addrs.bnb = evmAddr;
      addrs.avax = evmAddr;
      addrs.matic = evmAddr;    // Polygon (chains.js uses 'matic' key)
      addrs.polygon = evmAddr;  // Alias for display
      // ERC-20 tokens share base chain address
      addrs.usdc_eth = evmAddr;
      addrs.usdt_eth = evmAddr;
      addrs.usdc_polygon = evmAddr;
      addrs.usdce_polygon = evmAddr;
      addrs.usdc_bsc = evmAddr;
      addrs.usdt_bsc = evmAddr;
      addrs.usdt_avax = evmAddr;
      addrs.usdc_avax = evmAddr;
    }

    // LTC: /6/0
    const ltcPub = _childPub(acctPriv, acctChain, 6);
    if (ltcPub) addrs.ltc = ltcAddr(ltcPub);

    // XRP: /7/0 (need priv for signing)
    const xrpPriv = _childPriv(acctPriv, acctChain, 7);
    const xrpPub = xrpPriv ? secp256k1.getPublicKey(xrpPriv, true) : null;
    if (xrpPub) { addrs.xrp = xrpAddr(xrpPub); addrs.rlusd_xrp = addrs.xrp; }

    // SOL: /8/0
    const solPriv = _childPriv(acctPriv, acctChain, 8);
    if (solPriv) { addrs.sol = solAddr(solPriv); addrs.usdc_sol = addrs.sol; addrs.usdt_sol = addrs.sol; }

    // TRX: /9/0 (need priv for signing)
    const trxPriv = _childPriv(acctPriv, acctChain, 9);
    const trxPub = trxPriv ? secp256k1.getPublicKey(trxPriv, true) : null;
    if (trxPub) { addrs.trx = tronAddr(trxPub); addrs.usdt_trx = addrs.trx; }

    // XLM: /10/0
    const xlmPriv = _childPriv(acctPriv, acctChain, 10);
    if (xlmPriv) addrs.xlm = xlmAddr(xlmPriv);

    // XMR: address from auth keys (if available)
    if (keys.xmrPrimaryAddress) addrs.xmr = keys.xmrPrimaryAddress;
    else if (keys.xmr?.addr) addrs.xmr = keys.xmr.addr;

    // Stealth BCH: same as BCH (scanning is separate)
    addrs.sbch = addrs.bch;

  } catch (e) {
    console.warn('[addr-derive] error:', e.message);
  }

  return addrs;
}

/* ══════════════════════════════════════════
   Derive EVM private key for Polygon/ETH TX signing.
   Returns hex string (no 0x prefix).
   ONLY call when needed (signing), never store in state.
   ══════════════════════════════════════════ */
export function deriveEvmPrivKey(keys) {
  if (!keys?.acctPriv || !keys?.acctChain) return null;
  try {
    const priv = _childPriv(keys.acctPriv, keys.acctChain, 4); // ETH = /4/0
    return b2h(priv);
  } catch (e) {
    console.warn('[addr-derive] EVM key derivation error:', e.message);
    return null;
  }
}

export function deriveTrxPrivKey(keys) {
  if (!keys?.acctPriv || !keys?.acctChain) return null;
  try {
    const priv = _childPriv(keys.acctPriv, keys.acctChain, 9); // TRX = /9/0
    return b2h(priv);
  } catch { return null; }
}

export function deriveXrpPrivKey(keys) {
  if (!keys?.acctPriv || !keys?.acctChain) return null;
  try {
    const priv = _childPriv(keys.acctPriv, keys.acctChain, 7); // XRP = /7/0
    return priv; // raw 32 bytes
  } catch { return null; }
}

export function deriveSolPrivKey(keys) {
  if (!keys?.acctPriv || !keys?.acctChain) return null;
  try {
    return _childPriv(keys.acctPriv, keys.acctChain, 8); // SOL = /8/0, returns raw 32 bytes (ed25519 seed)
  } catch { return null; }
}

export function deriveXlmPrivKey(keys) {
  if (!keys?.acctPriv || !keys?.acctChain) return null;
  try {
    return _childPriv(keys.acctPriv, keys.acctChain, 10); // XLM = /10/0, returns raw 32 bytes
  } catch { return null; }
}

/* ── HD child helpers (inline to avoid circular import) ── */
import { hmac } from 'https://esm.sh/@noble/hashes@1.7.1/hmac';
import { sha512 } from 'https://esm.sh/@noble/hashes@1.7.1/sha512';

const N_SECP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

function _bip32Child(priv, chain, idx, hard) {
  const ib = new Uint8Array([idx >>> 24, (idx >>> 16) & 0xff, (idx >>> 8) & 0xff, idx & 0xff]);
  const data = hard ? concat(new Uint8Array([0]), priv, ib) : concat(secp256k1.getPublicKey(priv, true), ib);
  const I = hmac(sha512, chain, data);
  const child = ((BigInt('0x' + b2h(I.slice(0, 32))) + BigInt('0x' + b2h(priv))) % N_SECP).toString(16).padStart(64, '0');
  return { priv: h2b(child), chain: I.slice(32) };
}

function _childPub(acctPriv, acctChain, branchIdx) {
  const branch = _bip32Child(acctPriv, acctChain, branchIdx, false);
  const node = _bip32Child(branch.priv, branch.chain, 0, false);
  return secp256k1.getPublicKey(node.priv, true);
}

function _childPriv(acctPriv, acctChain, branchIdx) {
  const branch = _bip32Child(acctPriv, acctChain, branchIdx, false);
  const node = _bip32Child(branch.priv, branch.chain, 0, false);
  return node.priv;
}
