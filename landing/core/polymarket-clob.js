/* ══════════════════════════════════════════
   00 Wallet — Polymarket CLOB Client
   ══════════════════════════════════════════
   EIP-712 order signing and API authentication
   for placing orders on Polymarket's Central
   Limit Order Book (CLOB).

   All signing happens locally in the browser.
   Requests are routed through our Tor proxy:
     Browser → /clob-tor/* → Tor → clob.polymarket.com
   ══════════════════════════════════════════ */

import { secp256k1 } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { keccak_256 } from 'https://esm.sh/@noble/hashes@1.7.1/sha3';
import { b2h, h2b, concat, rand } from './utils.js';

/* ══════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════ */

const CLOB_BASE = '/clob-tor';

const CHAIN_ID     = 137;  // Polygon mainnet
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const NEG_RISK_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const NEG_RISK_ADAPTER  = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';
const USDC_E       = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const SIDE_BUY  = 0;
const SIDE_SELL = 1;
const SIG_TYPE_EOA = 0;

const CREDS_KEY = '00_poly_api_creds';

/* ══════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════ */

/** EIP-55 checksum address from raw 20-byte hash or hex string */
function checksumAddress(addrHex) {
  const raw = addrHex.replace('0x', '').toLowerCase();
  const hashHex = b2h(keccak_256(new TextEncoder().encode(raw)));
  let cs = '0x';
  for (let i = 0; i < 40; i++) {
    cs += parseInt(hashHex[i], 16) >= 8 ? raw[i].toUpperCase() : raw[i];
  }
  return cs;
}

/** Derive EIP-55 checksum address from private key hex */
function addressFromPriv(privHex) {
  const pub = secp256k1.getPublicKey(h2b(privHex), false).slice(1);
  const hash = keccak_256(pub);
  return checksumAddress(b2h(hash.slice(-20)));
}

/** Zero-padded 32-byte hex (no 0x prefix) */
function pad32(hex) {
  return hex.replace('0x', '').padStart(64, '0');
}

/** BigInt to 32-byte Uint8Array (big-endian) */
function bigToBytes32(n) {
  const hex = n.toString(16).padStart(64, '0');
  return h2b(hex);
}

/** Random 256-bit BigInt for order salt */
function randomSalt() {
  // py_order_utils generate_seed() returns a ~32-bit int, not 256-bit
  const bytes = rand(4);
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}

/* ══════════════════════════════════════════
   EIP-712 IMPLEMENTATION
   ══════════════════════════════════════════
   Full from-scratch EIP-712 typed data hashing
   and signing. Matches Solidity's _hashTypedDataV4.
   ══════════════════════════════════════════ */

/* ── Solidity ABI type encoders ── */

/** ABI-encode a single value by EIP-712 type */
function abiEncodeField(type, value) {
  if (type === 'address') {
    // address → uint160 → left-padded to 32 bytes
    return h2b(pad32(value.replace('0x', '')));
  }
  if (type === 'string') {
    // string → keccak256(UTF-8 bytes)
    return keccak_256(new TextEncoder().encode(value));
  }
  if (type === 'bytes') {
    // bytes → keccak256(raw bytes)
    const raw = typeof value === 'string' ? h2b(value.replace('0x', '')) : value;
    return keccak_256(raw);
  }
  if (type === 'bool') {
    return bigToBytes32(value ? 1n : 0n);
  }
  // uint256, uint8, int256, etc. → BigInt → 32 bytes big-endian
  if (type.startsWith('uint') || type.startsWith('int')) {
    return bigToBytes32(BigInt(value));
  }
  if (type.startsWith('bytes') && type.length > 5) {
    // bytesN (fixed) — right-padded to 32 bytes
    const raw = typeof value === 'string' ? h2b(value.replace('0x', '')) : value;
    const out = new Uint8Array(32);
    out.set(raw);
    return out;
  }
  throw new Error(`EIP-712: unsupported type "${type}"`);
}

/**
 * Compute the EIP-712 typeHash for a struct.
 * typeString example: "Order(uint256 salt,address maker,...)"
 */
function typeHash(typeString) {
  return keccak_256(new TextEncoder().encode(typeString));
}

/**
 * Hash an EIP-712 struct: keccak256(typeHash || encodeData)
 * @param {string} typeStr  - full type string, e.g. "Order(uint256 salt,...)"
 * @param {string[]} types  - ordered list of Solidity types
 * @param {any[]} values    - ordered list of values
 */
function hashStruct(typeStr, types, values) {
  const parts = [typeHash(typeStr)];
  for (let i = 0; i < types.length; i++) {
    parts.push(abiEncodeField(types[i], values[i]));
  }
  return keccak_256(concat(...parts));
}

/**
 * Hash the EIP-712 domain separator.
 */
function hashDomain(domain) {
  // Build dynamic domain type string and fields based on present keys
  const dtypes = [];
  const dvals = [];
  const dfields = [];
  if (domain.name !== undefined) {
    dfields.push('string name');
    dtypes.push('string');
    dvals.push(domain.name);
  }
  if (domain.version !== undefined) {
    dfields.push('string version');
    dtypes.push('string');
    dvals.push(domain.version);
  }
  if (domain.chainId !== undefined) {
    dfields.push('uint256 chainId');
    dtypes.push('uint256');
    dvals.push(domain.chainId);
  }
  if (domain.verifyingContract !== undefined) {
    dfields.push('address verifyingContract');
    dtypes.push('address');
    dvals.push(domain.verifyingContract);
  }
  if (domain.salt !== undefined) {
    dfields.push('bytes32 salt');
    dtypes.push('bytes32');
    dvals.push(domain.salt);
  }
  const domainTypeStr = 'EIP712Domain(' + dfields.join(',') + ')';
  return hashStruct(domainTypeStr, dtypes, dvals);
}

/**
 * Full EIP-712 signing.
 * Returns { signature, v, r, s } where signature is 65 bytes (r + s + v).
 */
function signTypedData(domain, primaryTypeStr, types, values, privKeyBytes) {
  const domainSep = hashDomain(domain);
  const structHash = hashStruct(primaryTypeStr, types, values);

  // EIP-712 digest: keccak256(0x1901 || domainSeparator || structHash)
  const digest = keccak_256(concat(
    new Uint8Array([0x19, 0x01]),
    domainSep,
    structHash
  ));

  const sig = secp256k1.sign(digest, privKeyBytes);

  // r and s as 32-byte big-endian
  const rBytes = bigToBytes32(sig.r);
  const sBytes = bigToBytes32(sig.s);
  const v = sig.recovery + 27; // 27 or 28

  // Polymarket expects r + s + v (65 bytes)
  const signature = concat(rBytes, sBytes, new Uint8Array([v]));

  return { signature: '0x' + b2h(signature), v, r: sig.r, s: sig.s };
}

/* ══════════════════════════════════════════
   CLOB AUTH — API KEY DERIVATION
   ══════════════════════════════════════════
   Signs a ClobAuth EIP-712 message to derive
   API credentials (apiKey, secret, passphrase).
   ══════════════════════════════════════════ */

const CLOB_AUTH_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: CHAIN_ID,
};

const CLOB_AUTH_TYPE_STR =
  'ClobAuth(address address,string timestamp,uint256 nonce,string message)';
const CLOB_AUTH_TYPES = ['address', 'string', 'uint256', 'string'];

const MSG_TO_SIGN = 'This message attests that I control the given wallet';

/**
 * Derive or create Polymarket CLOB API credentials from a private key.
 * Uses Level 1 auth headers (EIP-712 signed ClobAuth message).
 * Tries POST /auth/api-key first (create), then GET /auth/derive-api-key (derive).
 */
async function deriveApiKey(privKeyHex) {
  const privBytes = h2b(privKeyHex);
  const address = addressFromPriv(privKeyHex);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = 0n;

  const { signature } = signTypedData(
    CLOB_AUTH_DOMAIN,
    CLOB_AUTH_TYPE_STR,
    CLOB_AUTH_TYPES,
    [address, timestamp, nonce, MSG_TO_SIGN],
    privBytes
  );

  // Level 1 auth headers (matching py_clob_client)
  const l1Headers = {
    'POLY_ADDRESS': address,
    'POLY_SIGNATURE': signature,
    'POLY_TIMESTAMP': timestamp,
    'POLY_NONCE': '0',
  };

  // 1. Try creating API key (POST /auth/api-key)
  try {
    const createResp = await fetch(`${CLOB_BASE}/auth/api-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...l1Headers },
    });
    if (createResp.ok) {
      const creds = await createResp.json();
      if (creds.apiKey) return creds;
    }
  } catch {}

  // 2. Fallback: derive existing key (GET /auth/derive-api-key)
  const deriveResp = await fetch(`${CLOB_BASE}/auth/derive-api-key`, {
    method: 'GET',
    headers: l1Headers,
  });

  if (!deriveResp.ok) {
    const text = await deriveResp.text();
    throw new Error(`CLOB auth failed (${deriveResp.status}): ${text}`);
  }

  return deriveResp.json(); // { apiKey, secret, passphrase }
}

/* ══════════════════════════════════════════
   HMAC REQUEST SIGNING
   ══════════════════════════════════════════
   Every authenticated request needs HMAC-SHA256
   headers computed from the API secret.
   ══════════════════════════════════════════ */

/**
 * Build HMAC-SHA256 signature for CLOB API.
 * message = timestamp + method + requestPath + body
 */
async function buildHmacSignature(secret, timestamp, method, requestPath, body = '') {
  // Message: timestamp + method + path + body (body = compact JSON string)
  let message = String(timestamp) + String(method) + String(requestPath);
  if (body) message += body;

  // Decode base64url secret (Polymarket uses urlsafe base64)
  const b64 = secret.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const keyBytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  // Return base64url encoded (matching Python's base64.urlsafe_b64encode)
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Build all Polymarket auth headers for a request.
 */
async function buildHeaders(method, path, body = '') {
  const creds = getApiCreds();
  if (!creds) throw new Error('CLOB: not initialized — call initClob() first');

  const address = _address || creds.address;
  if (!address) throw new Error('CLOB: no address — call initClob() first');

  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = await buildHmacSignature(creds.secret, timestamp, method, path, body);

  // L2 headers — no POLY_NONCE (that's L1 only)
  return {
    'Content-Type': 'application/json',
    'POLY_ADDRESS':    address,
    'POLY_SIGNATURE':  signature,
    'POLY_TIMESTAMP':  timestamp,
    'POLY_API_KEY':    creds.apiKey,
    'POLY_PASSPHRASE': creds.passphrase,
  };
}

/**
 * Authenticated fetch wrapper.
 */
async function clobFetch(method, path, body = null) {
  // Use compact JSON (no spaces) — must match what HMAC signs
  const bodyStr = body ? JSON.stringify(body).replace(/\s+/g, '') : '';
  const headers = await buildHeaders(method, path, bodyStr);

  const resp = await fetch(`${CLOB_BASE}${path}`, {
    method,
    headers,
    body: bodyStr || undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[clob] ${method} ${path} → ${resp.status}`, text);
    console.error(`[clob] request body:`, bodyStr);
    throw new Error(`CLOB ${method} ${path} failed (${resp.status}): ${text}`);
  }

  const contentType = resp.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return resp.json();
  return resp.text();
}

/* ══════════════════════════════════════════
   ORDER EIP-712 SIGNING
   ══════════════════════════════════════════
   Signs a Polymarket CTF Exchange order using
   EIP-712 typed data. Supports both regular CTF
   Exchange and NegRisk Exchange.
   ══════════════════════════════════════════ */

const ORDER_TYPE_STR =
  'Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)';

const ORDER_TYPES = [
  'uint256',  // salt
  'address',  // maker
  'address',  // signer
  'address',  // taker
  'uint256',  // tokenId
  'uint256',  // makerAmount
  'uint256',  // takerAmount
  'uint256',  // expiration
  'uint256',  // nonce
  'uint256',  // feeRateBps
  'uint8',    // side
  'uint8',    // signatureType
];

function orderDomain(exchangeAddr) {
  return {
    name: 'Polymarket CTF Exchange',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: exchangeAddr,
  };
}

/**
 * Build and sign an order.
 * @param {Object} params
 * @param {string} params.tokenId      - CTF outcome token ID
 * @param {BigInt} params.makerAmount   - raw amount (6 decimals for USDC.e)
 * @param {BigInt} params.takerAmount   - raw amount of outcome tokens
 * @param {number} params.side          - 0 = BUY, 1 = SELL
 * @param {number} params.feeRateBps   - fee in basis points (default 0)
 * @param {boolean} params.negRisk     - use NegRisk exchange (default true)
 * @param {number} params.expiration   - unix timestamp (0 = no expiration)
 * @returns {{ order, signature }}
 */
function signOrder(params) {
  const {
    tokenId,
    makerAmount,
    takerAmount,
    side = SIDE_BUY,
    feeRateBps = 0,
    negRisk = true,
    expiration = 0,
  } = params;

  if (!_privKey) throw new Error('CLOB: not initialized — call initClob() first');

  const exchange = negRisk ? NEG_RISK_EXCHANGE : CTF_EXCHANGE;
  const salt = randomSalt();

  const orderValues = [
    BigInt(salt),                                            // salt (uint256 for signing)
    _address,                                                // maker
    _address,                                                // signer (same as maker for EOA)
    '0x0000000000000000000000000000000000000000',             // taker (public order)
    BigInt(tokenId),                                         // tokenId
    BigInt(makerAmount),                                     // makerAmount
    BigInt(takerAmount),                                     // takerAmount
    BigInt(expiration),                                      // expiration
    0n,                                                      // nonce (0 for new orders)
    BigInt(feeRateBps),                                      // feeRateBps
    BigInt(side),                                            // side
    BigInt(SIG_TYPE_EOA),                                    // signatureType
  ];

  // DEBUG: log intermediate hashes for comparison with Python
  const domSep = hashDomain(orderDomain(exchange));
  const structH = hashStruct(ORDER_TYPE_STR, ORDER_TYPES, orderValues);
  const typeH = keccak_256(new TextEncoder().encode(ORDER_TYPE_STR));
  const digest = keccak_256(concat(new Uint8Array([0x19, 0x01]), domSep, structH));

  const { signature } = signTypedData(
    orderDomain(exchange),
    ORDER_TYPE_STR,
    ORDER_TYPES,
    orderValues,
    _privKey
  );

  // Match py_clob_client SignedOrder.dict() format exactly:
  // salt = number, signatureType = number, rest = strings (except maker/signer/taker = addresses)
  const order = {
    salt:          Number(salt),         // number, not string
    maker:         _address,
    signer:        _address,
    taker:         '0x0000000000000000000000000000000000000000',
    tokenId:       tokenId.toString(),
    makerAmount:   makerAmount.toString(),
    takerAmount:   takerAmount.toString(),
    expiration:    String(expiration),
    nonce:         '0',
    feeRateBps:    String(feeRateBps),
    side:          side === SIDE_BUY ? 'BUY' : 'SELL',  // string "BUY"/"SELL"
    signatureType: SIG_TYPE_EOA,        // number, not string
  };

  return { order, signature };
}

/* ══════════════════════════════════════════
   MODULE STATE
   ══════════════════════════════════════════ */

let _privKey = null;   // Uint8Array
let _address = null;   // EIP-55 checksum string

/* ══════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════ */

/**
 * Initialize the CLOB client.
 * Derives API credentials from the wallet private key and stores them.
 * If valid credentials already exist in localStorage, reuses them.
 *
 * @param {string} privKeyHex - hex-encoded secp256k1 private key (no 0x prefix)
 */
export async function initClob(privKeyHex) {
  const cleanHex = privKeyHex.replace('0x', '');
  _privKey = h2b(cleanHex);
  _address = addressFromPriv(cleanHex);

  // Check for existing credentials
  const existing = getApiCreds();
  if (existing) {
    if (!existing.address) { existing.address = _address; localStorage.setItem(CREDS_KEY, JSON.stringify(existing)); }
    return existing;
  }

  // Derive new credentials
  const creds = await deriveApiKey(cleanHex);

  // Store credentials + address
  creds.address = _address;
  localStorage.setItem(CREDS_KEY, JSON.stringify(creds));

  return creds;
}

/**
 * Place an order on Polymarket CLOB.
 *
 * @param {Object} params
 * @param {string} params.tokenId     - CTF outcome token ID
 * @param {BigInt|number} params.makerAmount  - raw USDC.e amount (BUY) or token amount (SELL)
 * @param {BigInt|number} params.takerAmount  - raw token amount (BUY) or USDC.e amount (SELL)
 * @param {number} params.side        - 0 = BUY, 1 = SELL
 * @param {string} params.orderType   - "GTC" (Good Till Cancel) or "FOK" (Fill or Kill)
 * @param {number} [params.feeRateBps=0]
 * @param {boolean} [params.negRisk=true]
 * @param {number} [params.expiration=0]
 */
export async function placeOrder(params) {
  const {
    tokenId,
    makerAmount,
    takerAmount,
    side = SIDE_BUY,
    orderType = 'GTC',
    feeRateBps = 0,
    negRisk = true,
    expiration = 0,
  } = params;

  const { order, signature } = signOrder({
    tokenId,
    makerAmount: BigInt(makerAmount),
    takerAmount: BigInt(takerAmount),
    side,
    feeRateBps,
    negRisk,
    expiration,
  });

  // Add signature into order dict (matching py_clob_client SignedOrder.dict())
  order.signature = signature;

  const creds = getApiCreds();
  const payload = {
    order,
    owner: creds?.apiKey || _address,  // owner = API key
    orderType,
    postOnly: false,
  };

  return clobFetch('POST', '/order', payload);
}

/**
 * Convenience: place a BUY order at a given price.
 *
 * @param {string} tokenId  - CTF outcome token ID
 * @param {number} amount   - USDC.e amount (human-readable, e.g. 10 for $10)
 * @param {number} price    - price per share (0.0 - 1.0, e.g. 0.55 for 55 cents)
 * @param {Object} [opts]   - { negRisk, feeRateBps, orderType }
 */
export async function placeBuyOrder(tokenId, amount, price, opts = {}) {
  const {
    negRisk = true,
    feeRateBps = 1000,  // 10% maker fee (Polymarket default for crypto markets)
    orderType = 'GTC',
  } = opts;

  // Round price to tick size (0.01) to avoid "breaks minimum tick size" error
  const roundedPrice = Math.round(price * 100) / 100;

  // BUY: taker_amount = size (shares), maker_amount = size * price (USDC.e)
  // Match py_clob_client: size = floor(amount / price, 2 decimals) then maker = size * price
  const rawSize = Math.floor((amount / roundedPrice) * 100) / 100; // 2 decimal places
  const rawMaker = rawSize * roundedPrice;

  const makerAmount = BigInt(Math.round(rawMaker * 1e6));
  const takerAmount = BigInt(Math.round(rawSize * 1e6));

  return placeOrder({
    tokenId,
    makerAmount,
    takerAmount,
    side: SIDE_BUY,
    orderType,
    feeRateBps,
    negRisk,
  });
}

/**
 * Convenience: place a SELL order at a given price.
 *
 * @param {string} tokenId  - CTF outcome token ID
 * @param {number} amount   - number of tokens to sell (human-readable)
 * @param {number} price    - price per share (0.0 - 1.0)
 * @param {Object} [opts]   - { negRisk, feeRateBps, orderType }
 */
export async function placeSellOrder(tokenId, amount, price, opts = {}) {
  const {
    negRisk = true,
    feeRateBps = 0,
    orderType = 'GTC',
  } = opts;

  // SELL: makerAmount = token amount in raw units (6 decimals)
  //       takerAmount = USDC.e received = makerAmount * price
  const makerAmount = BigInt(Math.round(amount * 1e6));
  const takerAmount = BigInt(Math.round(amount * price * 1e6));

  return placeOrder({
    tokenId,
    makerAmount,
    takerAmount,
    side: SIDE_SELL,
    orderType,
    feeRateBps,
    negRisk,
  });
}

/**
 * Cancel an open order.
 * @param {string} orderId
 */
export async function cancelOrder(orderId) {
  return clobFetch('DELETE', `/order/${orderId}`);
}

/**
 * Get all open orders for the authenticated wallet.
 */
export async function getOpenOrders() {
  return clobFetch('GET', '/data/orders');
}

/**
 * Get trade history for the authenticated wallet.
 */
export async function getTrades() {
  return clobFetch('GET', '/trades');
}

/**
 * Get CLOB server time (useful for clock sync checks).
 */
export async function getServerTime() {
  const resp = await fetch(`${CLOB_BASE}/data/time`);
  return resp.json();
}

/**
 * Return stored API credentials (or null if not authenticated).
 */
export function getApiCreds() {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear stored API credentials and module state.
 */
export function clearCreds() {
  localStorage.removeItem(CREDS_KEY);
  _privKey = null;
  _address = null;
}

/**
 * Get the wallet address associated with the current session.
 */
export function getAddress() {
  return _address;
}

/* ── Re-export constants for consumers ── */
export {
  CHAIN_ID,
  CTF_EXCHANGE,
  NEG_RISK_EXCHANGE,
  NEG_RISK_ADAPTER,
  USDC_E,
  SIDE_BUY,
  SIDE_SELL,
};
