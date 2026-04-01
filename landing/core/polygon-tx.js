/* ══════════════════════════════════════════
   Polygon Transaction Builder & Signer
   ══════════════════════════════════════════
   Signs and broadcasts EVM transactions on Polygon.
   Used by 00 Bet for approvals, swaps, and CLOB orders.

   All signing happens locally in the browser.
   Broadcasts via /polygon-rpc/ proxy.
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { keccak_256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha3';
import { b2h, h2b, concat } from './utils.js';

const RPC = '/polygon-rpc/';  // proxied via nginx → polygon-bor-rpc.publicnode.com
const CHAIN_ID = 137;

/* ── RPC helper ── */
let _rpcId = 1;
async function rpc(method, params = []) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: _rpcId++ }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
  return j.result;
}

/* ── Hex helpers ── */
function toHex(n) { return '0x' + (typeof n === 'bigint' ? n.toString(16) : Number(n).toString(16)); }
function padHex(hex, bytes) { return hex.replace('0x', '').padStart(bytes * 2, '0'); }

/* ── RLP encoding ── */
function rlpEncode(items) {
  if (items instanceof Uint8Array) {
    if (items.length === 1 && items[0] < 0x80) return items;
    if (items.length <= 55) return concat(new Uint8Array([0x80 + items.length]), items);
    const lenBytes = _intToBytes(items.length);
    return concat(new Uint8Array([0xb7 + lenBytes.length]), lenBytes, items);
  }
  if (Array.isArray(items)) {
    const encoded = concat(...items.map(i => rlpEncode(i)));
    if (encoded.length <= 55) return concat(new Uint8Array([0xc0 + encoded.length]), encoded);
    const lenBytes = _intToBytes(encoded.length);
    return concat(new Uint8Array([0xf7 + lenBytes.length]), lenBytes, encoded);
  }
  return rlpEncode(new Uint8Array(0));
}

function _intToBytes(n) {
  const hex = n.toString(16);
  const padded = hex.length % 2 ? '0' + hex : hex;
  return h2b(padded);
}

function _numToRlpBytes(n) {
  const big = BigInt(n);
  if (big === 0n) return new Uint8Array(0);
  const hex = big.toString(16);
  const padded = hex.length % 2 ? '0' + hex : hex;
  return h2b(padded);
}

/* ── ERC20 ABI encoding ── */
// approve(address spender, uint256 amount)
export function encodeApprove(spender, amount = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') {
  const selector = '095ea7b3'; // keccak256("approve(address,uint256)")
  const addr = padHex(spender, 32);
  const amt = padHex(amount, 32);
  return '0x' + selector + addr + amt;
}

// allowance(address owner, address spender) → uint256
export function encodeAllowance(owner, spender) {
  const selector = 'dd62ed3e'; // keccak256("allowance(address,address)")
  return '0x' + selector + padHex(owner, 32) + padHex(spender, 32);
}

// balanceOf(address) → uint256
export function encodeBalanceOf(addr) {
  const selector = '70a08231';
  return '0x' + selector + padHex(addr, 32);
}

// setApprovalForAll(address operator, bool approved) — ERC1155
export function encodeSetApprovalForAll(operator, approved = true) {
  const selector = 'a22cb465';
  return '0x' + selector + padHex(operator, 32) + padHex(approved ? '1' : '0', 32);
}

// isApprovedForAll(address owner, address operator) → bool — ERC1155
export function encodeIsApprovedForAll(owner, operator) {
  const selector = 'e985e9c5';
  return '0x' + selector + padHex(owner, 32) + padHex(operator, 32);
}

// Uniswap V3 exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))
export function encodeExactInputSingle(tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMin) {
  const selector = '414bf389'; // keccak256("exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))")
  return '0x' + selector
    + padHex(tokenIn, 32)
    + padHex(tokenOut, 32)
    + padHex(toHex(fee), 32)
    + padHex(recipient, 32)
    + padHex(toHex(deadline), 32)
    + padHex(toHex(amountIn), 32)
    + padHex(toHex(amountOutMin), 32)
    + padHex('0', 32); // sqrtPriceLimitX96 = 0
}

/* ══════════════════════════════════════════
   SIGN & BROADCAST TRANSACTION
   ══════════════════════════════════════════ */
export async function signAndSend(privKeyHex, to, data, value = '0x0', gasLimit = 200000, opts = {}) {
  const chainId = opts.chainId || CHAIN_ID;
  const rpcUrl = opts.rpc || RPC;
  const _rpcFn = async (method, params = []) => {
    if (rpcUrl === RPC) return rpc(method, params);
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++_rpcId, method, params }) });
    const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
  };

  const from = getAddress(privKeyHex);

  // Get nonce + gas price
  const [nonceHex, gasPriceHex] = await Promise.all([
    _rpcFn('eth_getTransactionCount', [from, 'pending']),
    _rpcFn('eth_gasPrice'),
  ]);

  const nonce = parseInt(nonceHex, 16);
  const gasPrice = Math.floor(parseInt(gasPriceHex, 16) * 1.5); // 1.5x for faster confirm

  // Legacy TX fields (pre-EIP-1559, works on all EVM chains)
  const txFields = [
    _numToRlpBytes(nonce),
    _numToRlpBytes(gasPrice),
    _numToRlpBytes(gasLimit),
    h2b(to.replace('0x', '')),
    _numToRlpBytes(BigInt(value)),
    h2b(data.replace('0x', '')),
  ];

  // EIP-155 signing: hash(RLP(nonce, gasPrice, gas, to, value, data, chainId, 0, 0))
  const sigFields = [...txFields, _numToRlpBytes(chainId), new Uint8Array(0), new Uint8Array(0)];
  const encoded = rlpEncode(sigFields);
  const hash = keccak_256(encoded);

  // Sign with secp256k1
  const sig = secp256k1.sign(hash, h2b(privKeyHex));
  const r = sig.r;
  const s = sig.s;
  const v = sig.recovery + chainId * 2 + 35; // EIP-155 v

  // Build signed TX
  const signedFields = [
    ...txFields,
    _numToRlpBytes(v),
    _numToRlpBytes(r),
    _numToRlpBytes(s),
  ];
  const rawTx = '0x' + b2h(rlpEncode(signedFields));

  // Broadcast
  const chainName = { 137: 'polygon', 1: 'eth', 56: 'bnb', 43114: 'avax' }[chainId] || chainId;
  console.log(`[evm-tx] broadcasting on ${chainName} from ${from}, nonce=${nonce}, gas=${gasLimit}`);
  const txHash = await _rpcFn('eth_sendRawTransaction', [rawTx]);
  console.log(`[evm-tx] tx sent: ${txHash}`);

  return txHash;
}

/* ── Wait for TX confirmation ── */
export async function waitForTx(txHash, timeout = 60000, opts = {}) {
  const rpcUrl = opts.rpc || RPC;
  const _rpcFn = async (method, params = []) => {
    if (rpcUrl === RPC) return rpc(method, params);
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++_rpcId, method, params }) });
    const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
  };
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const receipt = await _rpcFn('eth_getTransactionReceipt', [txHash]);
    if (receipt) {
      return { status: parseInt(receipt.status, 16), gasUsed: parseInt(receipt.gasUsed, 16) };
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('TX confirmation timeout');
}

/* ── Get address from private key ── */
export function getAddress(privKeyHex) {
  const pub = secp256k1.getPublicKey(h2b(privKeyHex), false).slice(1);
  const hash = keccak_256(pub);
  return '0x' + b2h(hash.slice(-20));
}

/* ══════════════════════════════════════════
   HIGH-LEVEL FUNCTIONS
   ══════════════════════════════════════════ */

/* ── Check ERC20 allowance ── */
export async function checkAllowance(token, owner, spender) {
  const data = encodeAllowance(owner, spender);
  const result = await rpc('eth_call', [{ to: token, data }, 'latest']);
  return BigInt(result || '0x0');
}

/* ── Check ERC1155 approval ── */
export async function checkApprovalForAll(token, owner, operator) {
  const data = encodeIsApprovedForAll(owner, operator);
  const result = await rpc('eth_call', [{ to: token, data }, 'latest']);
  return BigInt(result || '0x0') > 0n;
}

/* ── Check ERC20 balance ── */
export async function checkBalance(token, owner) {
  const data = encodeBalanceOf(owner);
  const result = await rpc('eth_call', [{ to: token, data }, 'latest']);
  return BigInt(result || '0x0');
}

/* ── Get native POL balance ── */
export async function getPolBalance(addr) {
  const result = await rpc('eth_getBalance', [addr, 'latest']);
  return BigInt(result || '0x0');
}

/* ══════════════════════════════════════════
   CONTRACT ADDRESSES
   ══════════════════════════════════════════ */
export const CONTRACTS = {
  USDC:              '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  USDCE:             '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CTF:               '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  EXCHANGE:          '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  NEG_RISK_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  NEG_RISK_ADAPTER:  '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  SWAP_ROUTER:       '0xE592427A0AEce92De3Edee1F18E0157C05861564',
};

/* ── RPC call export for other modules ── */
export { rpc };
