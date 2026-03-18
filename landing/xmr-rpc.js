/**
 * 00-Protocol: Monero RPC Client + Output Scanner
 *
 * Pure JavaScript — connects to Monero daemon (monerod) via JSON-RPC
 * and scans outputs using view key cryptography.
 *
 * For browser use: requires CORS proxy since most XMR nodes don't allow CORS.
 * Proxy: /xmr-rpc/ on our server → forwards to monerod.
 *
 * Implements:
 *  1. Monero daemon RPC client (get_info, get_block, get_transactions, etc.)
 *  2. View key output scanning (detect incoming outputs)
 *  3. Amount decryption (decode encrypted amounts from RingCT)
 *  4. Key image computation (detect spent outputs)
 *  5. Transaction verification (confirm XMR lock for atomic swap)
 */

import {
  b2h, h2b, concat, mod, keccak256, scReduce32,
  bytesToBigInt, bigIntToBytes32BE, bigIntToBytes32LE,
  L_ED
} from './xmr-swap-crypto.js?v=3';

import { ed25519 } from 'https://esm.sh/@noble/curves@1.8.1/ed25519';

const G_ED = ed25519.ExtendedPoint.BASE;

/* ══════════════════════════════════════════
   XMR NODE CONFIGURATION
   ══════════════════════════════════════════ */

const XMR_NODES = [
  // Our CORS proxy (primary)
  { url: '/xmr-rpc', name: '00-proxy', cors: true },
  // Public nodes (need CORS proxy)
  { url: 'https://node.moneroworld.com:18089', name: 'moneroworld', cors: false },
  { url: 'https://xmr-node.cakewallet.com:18081', name: 'cakewallet', cors: false },
  { url: 'https://nodes.hashvault.pro:18081', name: 'hashvault', cors: false }
];

let _activeNode = XMR_NODES[0];
let _connected = false;

/* ══════════════════════════════════════════
   JSON-RPC CLIENT
   ══════════════════════════════════════════ */

/**
 * Call a Monero daemon JSON-RPC method
 * @param {string} method - RPC method name
 * @param {object} params - method parameters
 * @returns {Promise<object>} result
 */
async function daemonRpc(method, params = {}) {
  const url = _activeNode.url + '/json_rpc';
  const body = {
    jsonrpc: '2.0',
    id: '0',
    method,
    params
  };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ac.signal
  });
  clearTimeout(t);

  if (!resp.ok) throw new Error(`XMR RPC error: ${resp.status} ${resp.statusText}`);
  const json = await resp.json();
  if (json.error) throw new Error(`XMR RPC: ${json.error.message}`);
  return json.result;
}

/**
 * Call a Monero daemon "other" endpoint (non-JSON-RPC)
 * Some endpoints like /get_transactions use a different format
 */
async function daemonOther(endpoint, params = {}) {
  const url = _activeNode.url + '/' + endpoint;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: ac.signal
  });
  clearTimeout(t);

  if (!resp.ok) throw new Error(`XMR RPC error: ${resp.status}`);
  return resp.json();
}

/* ══════════════════════════════════════════
   DAEMON RPC METHODS
   ══════════════════════════════════════════ */

/** Get daemon info (height, difficulty, version, etc.) */
async function getInfo() {
  return daemonRpc('get_info');
}

/** Get current block count */
async function getBlockCount() {
  const r = await daemonRpc('get_block_count');
  return r.count;
}

/** Get block header by height */
async function getBlockHeaderByHeight(height) {
  const r = await daemonRpc('get_block_header_by_height', { height });
  return r.block_header;
}

/** Get block (full, with TX hashes) */
async function getBlock(height) {
  const r = await daemonRpc('get_block', { height });
  return r;
}

/** Get block by hash */
async function getBlockByHash(hash) {
  const r = await daemonRpc('get_block', { hash });
  return r;
}

/** Get transactions by hash (with details) */
async function getTransactions(txHashes, decodeAsJson = true) {
  return daemonOther('get_transactions', {
    txs_hashes: txHashes,
    decode_as_json: decodeAsJson
  });
}

/** Get transaction pool (mempool) */
async function getTransactionPool() {
  return daemonOther('get_transaction_pool', {});
}

/** Check if key images are spent (0=unspent, 1=spent in block, 2=spent in pool) */
async function isKeyImageSpent(keyImages) {
  return daemonOther('is_key_image_spent', { key_images: keyImages });
}

/** Get output distribution for RingCT */
async function getOutputDistribution(amounts = [0], fromHeight = 0) {
  return daemonRpc('get_output_distribution', {
    amounts,
    from_height: fromHeight,
    cumulative: true
  });
}

/* ══════════════════════════════════════════
   MONERO OUTPUT CRYPTO
   ══════════════════════════════════════════

   Output scanning: for each TX output, check if it belongs to us.

   Monero TX structure:
   - tx.extra contains the TX public key (R = r*G where r is random per-TX)
   - Each output has a one-time public key P_i
   - P_i = Hs(a*R, i)*G + B   where:
     - a = view private key
     - R = TX public key
     - i = output index
     - B = spend public key
     - Hs() = hash-to-scalar = keccak256() mod l

   If P_i matches the output key, it belongs to us.
*/

/**
 * Scalar hash: Keccak256(data) mod l
 * This is the "Hs" function in Monero crypto
 */
function hashToScalar(data) {
  const hash = keccak256(data);
  return scReduce32(hash);
}

/**
 * Hash to scalar from shared secret + output index
 * Hs(a*R || varint(i))
 *
 * @param {Uint8Array} sharedSecret - 32-byte compressed point (a*R or r*A)
 * @param {number} outputIndex - output index in the transaction
 * @returns {Uint8Array} 32-byte scalar (little-endian, reduced mod l)
 */
function derivationToScalar(sharedSecret, outputIndex) {
  // Monero encodes the output index as a varint
  const viBytes = varintEncode(outputIndex);
  const data = concat(sharedSecret, viBytes);
  return hashToScalar(data);
}

/**
 * Derive the one-time public key for an output
 * P = Hs(a*R, i)*G + B
 *
 * @param {Uint8Array} sharedSecret - 32-byte ECDH point
 * @param {number} outputIndex - output index
 * @param {Uint8Array} spendPub - 32-byte spend public key (B)
 * @returns {Uint8Array} 32-byte expected output public key
 */
function deriveOutputPubKey(sharedSecret, outputIndex, spendPub) {
  const scalar = derivationToScalar(sharedSecret, outputIndex);
  // Convert scalar from LE bytes to bigint
  let sN = 0n;
  for (let i = 31; i >= 0; i--) sN = (sN << 8n) | BigInt(scalar[i]);

  // Hs(a*R, i) * G
  const hPoint = G_ED.multiply(sN);
  // B (spend public key as point)
  const B = ed25519.ExtendedPoint.fromHex(spendPub);
  // P = Hs*G + B
  const P = hPoint.add(B);
  return new Uint8Array(P.toRawBytes());
}

/**
 * Derive the one-time private key for spending an output we own
 * x = Hs(a*R, i) + b    where b is the spend private key
 *
 * @param {Uint8Array} sharedSecret - 32-byte ECDH point
 * @param {number} outputIndex - output index
 * @param {bigint} spendPriv - spend private key as scalar
 * @returns {Uint8Array} 32-byte private key (little-endian)
 */
function deriveOutputPrivKey(sharedSecret, outputIndex, spendPriv) {
  const scalar = derivationToScalar(sharedSecret, outputIndex);
  let sN = 0n;
  for (let i = 31; i >= 0; i--) sN = (sN << 8n) | BigInt(scalar[i]);
  const x = mod(sN + spendPriv, L_ED);
  return bigIntToBytes32LE(x);
}

/**
 * Compute ECDH shared secret from our view private key and TX public key
 * shared = 8 * a * R  (Monero multiplies by cofactor 8)
 * But actually, Monero uses: shared = a * R (no cofactor for standard addresses)
 *
 * @param {bigint} viewPriv - view private key as scalar
 * @param {Uint8Array} txPubKey - 32-byte TX public key (R)
 * @returns {Uint8Array} 32-byte shared secret (compressed point)
 */
function computeSharedSecret(viewPriv, txPubKey) {
  const R = ed25519.ExtendedPoint.fromHex(txPubKey);
  // Convert viewPriv to bigint if it's a Uint8Array (LE bytes)
  let a = viewPriv;
  if (viewPriv instanceof Uint8Array || Array.isArray(viewPriv)) {
    a = 0n;
    for (let i = 31; i >= 0; i--) a = (a << 8n) | BigInt(viewPriv[i]);
  }
  // Monero: derivation = 8 * a * R (cofactor multiplication)
  const shared = R.multiply(a).multiply(8n);
  return new Uint8Array(shared.toRawBytes());
}

/**
 * Compute key image: I = x * Hp(P)
 * where x = output private key, P = output public key
 * Hp = hash-to-point (maps pubkey to a point on ed25519)
 *
 * @param {Uint8Array} outputPrivKey - 32-byte output private key (LE)
 * @param {Uint8Array} outputPubKey - 32-byte output public key
 * @returns {Uint8Array} 32-byte key image
 */
function computeKeyImage(outputPrivKey, outputPubKey) {
  // Hash-to-point: Hp(P) — iterative hashing until we get a valid point
  const hp = hashToPoint(outputPubKey);

  // x * Hp(P)
  let xN = 0n;
  for (let i = 31; i >= 0; i--) xN = (xN << 8n) | BigInt(outputPrivKey[i]);

  const I = hp.multiply(xN);
  return new Uint8Array(I.toRawBytes());
}

/**
 * Hash to ed25519 point (Monero's ge_fromfe_frombytes_vartime equivalent)
 * Simple approach: hash + try to decode as point, increment if invalid
 */
function hashToPoint(data) {
  let counter = 0;
  while (counter < 256) {
    const hash = keccak256(concat(data, new Uint8Array([counter])));
    try {
      // Try to decode as a valid ed25519 point
      // Multiply by cofactor (8) to ensure we're in the prime-order subgroup
      const p = ed25519.ExtendedPoint.fromHex(hash);
      return p.multiply(8n);
    } catch (e) {
      counter++;
    }
  }
  throw new Error('hashToPoint: failed to find valid point');
}

/* ══════════════════════════════════════════
   AMOUNT DECRYPTION (RingCT)
   ══════════════════════════════════════════

   Monero encrypts output amounts in RingCT transactions.
   Decryption: amount = encrypted_amount XOR first_8_bytes(Hs("amount" || Hs(a*R, i)))

   For RCTTypeBulletproof2 and later:
   amount_key = Hs("amount" || Hs(shared_secret || varint(output_index)))
   decrypted = encrypted_amount XOR amount_key[0..8]
*/

/**
 * Decrypt an output amount
 *
 * @param {Uint8Array} encryptedAmount - 8-byte encrypted amount
 * @param {Uint8Array} sharedSecret - 32-byte ECDH point
 * @param {number} outputIndex - output index
 * @returns {bigint} decrypted amount in piconero
 */
function decryptAmount(encryptedAmount, sharedSecret, outputIndex) {
  // Compute amount key: Hs("amount" || Hs(shared_secret, outputIndex))
  const derivScalar = derivationToScalar(sharedSecret, outputIndex);
  const amountKey = keccak256(concat(new TextEncoder().encode('amount'), derivScalar));

  // XOR first 8 bytes
  const decrypted = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    decrypted[i] = encryptedAmount[i] ^ amountKey[i];
  }

  // Little-endian to bigint
  let amount = 0n;
  for (let i = 7; i >= 0; i--) amount = (amount << 8n) | BigInt(decrypted[i]);
  return amount;
}

/* ══════════════════════════════════════════
   TX EXTRA PARSING
   ══════════════════════════════════════════

   TX extra field contains tagged data:
   - Tag 0x01: TX public key (32 bytes)
   - Tag 0x02: Extra nonce (variable length)
   - Tag 0x04: Additional public keys (for multi-output)
*/

/**
 * Extract TX public key(s) from tx_extra bytes
 * @param {Uint8Array} extra - tx.extra bytes
 * @returns {{ txPubKey: Uint8Array|null, additionalPubKeys: Uint8Array[] }}
 */
function parseTxExtra(extra) {
  let txPubKey = null;
  const additionalPubKeys = [];
  let i = 0;

  while (i < extra.length) {
    const tag = extra[i++];

    if (tag === 0x01) {
      // TX public key: next 32 bytes
      if (i + 32 <= extra.length) {
        txPubKey = extra.slice(i, i + 32);
        i += 32;
      } else break;
    } else if (tag === 0x02) {
      // Extra nonce: varint length, then data
      if (i >= extra.length) break;
      const len = extra[i++];
      i += len;
    } else if (tag === 0x04) {
      // Additional public keys: varint count, then count * 32 bytes
      if (i >= extra.length) break;
      const count = extra[i++];
      for (let j = 0; j < count && i + 32 <= extra.length; j++) {
        additionalPubKeys.push(extra.slice(i, i + 32));
        i += 32;
      }
    } else {
      // Unknown tag — try to skip
      // This is a heuristic: if we see something that looks like a 32-byte key, skip it
      if (i + 32 <= extra.length) {
        i += 32;
      } else break;
    }
  }

  return { txPubKey, additionalPubKeys };
}

/* ══════════════════════════════════════════
   OUTPUT SCANNER
   ══════════════════════════════════════════ */

/**
 * Scan a transaction for outputs belonging to a given view/spend key pair
 *
 * @param {object} txJson - parsed transaction JSON
 * @param {bigint} viewPriv - view private key scalar
 * @param {Uint8Array} spendPub - 32-byte spend public key
 * @returns {{ outputs: Array<{index, amount, outputKey, outputPrivKey}> }}
 */
function scanTransaction(txJson, viewPriv, spendPub) {
  const found = [];

  // Get TX extra
  const extraBytes = new Uint8Array(txJson.extra || []);
  const { txPubKey, additionalPubKeys } = parseTxExtra(extraBytes);
  if (!txPubKey) return { outputs: found };

  // Compute shared secret: a * R
  let sharedSecret;
  try {
    sharedSecret = computeSharedSecret(viewPriv, txPubKey);
  } catch (e) {
    return { outputs: found }; // invalid TX pubkey
  }

  // Get outputs
  const outputs = txJson.vout || [];
  const ecdhInfo = txJson.rct_signatures ? txJson.rct_signatures.ecdhInfo : null;

  for (let i = 0; i < outputs.length; i++) {
    const out = outputs[i];
    const outputKey = h2b(out.target && out.target.tagged_key
      ? out.target.tagged_key.key
      : out.target && out.target.key
        ? out.target.key
        : '');

    if (outputKey.length !== 32) continue;

    // Use additional pubkey if available (for multi-output TXs)
    let ss = sharedSecret;
    if (additionalPubKeys.length > i) {
      try {
        ss = computeSharedSecret(viewPriv, additionalPubKeys[i]);
      } catch (e) { continue; }
    }

    // Derive expected output key: P = Hs(a*R, i)*G + B
    const expectedKey = deriveOutputPubKey(ss, i, spendPub);

    // Compare
    if (b2h(expectedKey) === b2h(outputKey)) {
      // This output belongs to us!
      let amount = 0n;

      // Try to decrypt amount from ecdhInfo
      if (ecdhInfo && ecdhInfo[i]) {
        const encAmount = h2b(ecdhInfo[i].amount || '0000000000000000');
        if (encAmount.length >= 8) {
          amount = decryptAmount(encAmount.slice(0, 8), ss, i);
        }
      }

      // For non-RingCT (very old TXs), amount is in clear
      if (amount === 0n && out.amount) {
        amount = BigInt(out.amount);
      }

      found.push({
        index: i,
        amount,
        outputKey: b2h(outputKey),
        txPubKey: b2h(txPubKey)
      });
    }
  }

  return { outputs: found };
}

/**
 * Scan a range of blocks for outputs belonging to our keys
 *
 * @param {bigint} viewPriv - view private key
 * @param {Uint8Array} spendPub - spend public key
 * @param {number} fromHeight - start block height
 * @param {number} toHeight - end block height
 * @param {function} onProgress - callback(current, total)
 * @returns {Promise<Array>} found outputs with block + tx info
 */
async function scanBlocks(viewPriv, spendPub, fromHeight, toHeight, onProgress) {
  const allFound = [];
  const delay = ms => new Promise(r => setTimeout(r, ms));

  for (let bh = fromHeight; bh <= toHeight; bh++) {
    let txHashes = [];

    // Fetch block with retry
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const block = await getBlock(bh);
        const blockJson = JSON.parse(block.json);
        txHashes = blockJson.tx_hashes || [];
        break;
      } catch(e) {
        if (attempt < 2) await delay(1000);
        else console.warn('[XMR] block', bh, 'failed:', e.message);
      }
    }

    // Fetch transactions in chunks of 10
    for (let ti = 0; ti < txHashes.length; ti += 10) {
      const chunk = txHashes.slice(ti, ti + 10);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const txData = await getTransactions(chunk);
          if (txData.txs) {
            for (const tx of txData.txs) {
              if (!tx.as_json) continue;
              try {
                const txJson = JSON.parse(tx.as_json);
                const result = scanTransaction(txJson, viewPriv, spendPub);
                for (const out of result.outputs) {
                  allFound.push({ ...out, txHash: tx.tx_hash, blockHeight: bh, confirmations: toHeight - bh });
                }
              } catch (e) { /* skip parse error */ }
            }
          }
          break;
        } catch (e) {
          if (attempt < 2) await delay(500);
          else console.warn('[XMR] TXs block', bh, 'chunk', ti, 'failed:', e.message);
        }
      }
    }

    if (onProgress) onProgress(bh - fromHeight, toHeight - fromHeight);
  }

  return allFound;
}

/**
 * Scan a single transaction by hash for outputs belonging to our keys
 * Used to verify an XMR lock in atomic swap
 *
 * @param {string} txHash - transaction hash
 * @param {bigint} viewPriv - view private key
 * @param {Uint8Array} spendPub - spend public key
 * @returns {Promise<{found: boolean, outputs: Array, confirmations: number}>}
 */
async function scanSingleTx(txHash, viewPriv, spendPub) {
  const txData = await getTransactions([txHash]);
  if (!txData.txs || txData.txs.length === 0) {
    return { found: false, outputs: [], confirmations: 0 };
  }

  const tx = txData.txs[0];
  const confirmations = tx.block_height ? (await getBlockCount()) - tx.block_height : 0;

  if (!tx.as_json) return { found: false, outputs: [], confirmations };

  const txJson = JSON.parse(tx.as_json);
  const result = scanTransaction(txJson, viewPriv, spendPub);

  return {
    found: result.outputs.length > 0,
    outputs: result.outputs,
    confirmations,
    blockHeight: tx.block_height || null,
    inPool: !tx.block_height
  };
}

/* ══════════════════════════════════════════
   ATOMIC SWAP VERIFICATION
   ══════════════════════════════════════════

   Bob needs to verify that Alice has locked XMR to the shared address.
   Steps:
   1. Alice sends the TX hash to Bob via Nostr
   2. Bob computes the shared view key (he knows it from the swap setup)
   3. Bob scans the TX for outputs to the shared spend pubkey
   4. Bob verifies: amount >= agreed amount, enough confirmations
*/

/**
 * Verify an XMR lock for atomic swap
 *
 * @param {string} txHash - Alice's XMR lock TX hash
 * @param {bigint} viewPriv - shared view private key
 * @param {Uint8Array} spendPub - shared spend public key
 * @param {bigint} expectedAmount - expected amount in piconero
 * @param {number} minConfirmations - required confirmations (default 10)
 * @returns {Promise<{verified: boolean, amount: bigint, confirmations: number, reason: string}>}
 */
async function verifyXmrLock(txHash, viewPriv, spendPub, expectedAmount, minConfirmations = 10) {
  try {
    const result = await scanSingleTx(txHash, viewPriv, spendPub);

    if (!result.found) {
      return { verified: false, amount: 0n, confirmations: 0, reason: 'no matching outputs' };
    }

    // Sum all matching outputs
    let totalAmount = 0n;
    for (const out of result.outputs) {
      totalAmount += out.amount;
    }

    if (totalAmount < expectedAmount) {
      return {
        verified: false, amount: totalAmount, confirmations: result.confirmations,
        reason: `insufficient amount: ${totalAmount} < ${expectedAmount}`
      };
    }

    if (result.confirmations < minConfirmations) {
      return {
        verified: false, amount: totalAmount, confirmations: result.confirmations,
        reason: `need ${minConfirmations} confirmations, have ${result.confirmations}`
      };
    }

    return {
      verified: true,
      amount: totalAmount,
      confirmations: result.confirmations,
      blockHeight: result.blockHeight,
      outputs: result.outputs,
      reason: 'ok'
    };
  } catch (e) {
    return { verified: false, amount: 0n, confirmations: 0, reason: e.message };
  }
}

/**
 * Poll XMR lock until verified or timeout
 *
 * @param {string} txHash - TX hash to monitor
 * @param {bigint} viewPriv - shared view private key
 * @param {Uint8Array} spendPub - shared spend public key
 * @param {bigint} expectedAmount - expected piconero
 * @param {number} minConfirmations - required confirmations
 * @param {number} timeoutMs - timeout in ms (default 1h)
 * @param {function} onStatus - callback with status updates
 * @returns {Promise<object>} verification result
 */
async function pollXmrLock(txHash, viewPriv, spendPub, expectedAmount, minConfirmations = 10, timeoutMs = 3600000, onStatus) {
  const start = Date.now();
  let lastConf = -1;

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await verifyXmrLock(txHash, viewPriv, spendPub, expectedAmount, minConfirmations);

      if (result.verified) {
        if (onStatus) onStatus({ state: 'verified', ...result });
        return result;
      }

      if (result.confirmations !== lastConf) {
        lastConf = result.confirmations;
        if (onStatus) onStatus({ state: 'waiting', ...result });
      }
    } catch (e) {
      if (onStatus) onStatus({ state: 'error', reason: e.message });
    }

    // Wait 30s between polls (XMR blocks ~2min)
    await new Promise(r => setTimeout(r, 30000));
  }

  return { verified: false, reason: 'timeout' };
}

/* ══════════════════════════════════════════
   MEMPOOL SCANNING
   ══════════════════════════════════════════ */

/**
 * Scan mempool for incoming outputs (unconfirmed)
 */
async function scanMempool(viewPriv, spendPub) {
  const pool = await getTransactionPool();
  const found = [];

  if (!pool.transactions) return found;

  for (const tx of pool.transactions) {
    if (!tx.tx_json) continue;
    try {
      const txJson = JSON.parse(tx.tx_json);
      const result = scanTransaction(txJson, viewPriv, spendPub);
      for (const out of result.outputs) {
        found.push({
          ...out,
          txHash: tx.id_hash,
          blockHeight: null,
          confirmations: 0,
          inPool: true
        });
      }
    } catch (e) { /* skip */ }
  }

  return found;
}

/* ══════════════════════════════════════════
   CONNECTION MANAGEMENT
   ══════════════════════════════════════════ */

/**
 * Test connection to XMR node
 * @returns {Promise<{connected: boolean, height: number, name: string}>}
 */
async function testConnection() {
  try {
    const info = await getInfo();
    _connected = true;
    return {
      connected: true,
      height: info.height,
      name: _activeNode.name,
      version: info.version,
      network: info.mainnet ? 'mainnet' : info.stagenet ? 'stagenet' : info.testnet ? 'testnet' : 'unknown'
    };
  } catch (e) {
    _connected = false;
    return { connected: false, height: 0, name: _activeNode.name, error: e.message };
  }
}

/**
 * Try connecting to available nodes, use the first that works
 */
async function autoConnect() {
  for (const node of XMR_NODES) {
    _activeNode = node;
    const result = await testConnection();
    if (result.connected) {
      console.log('[XMR] connected to', node.name, 'height:', result.height);
      return result;
    }
  }
  console.warn('[XMR] no node available');
  return { connected: false };
}

/**
 * Set active node
 */
function setNode(url, name) {
  _activeNode = { url, name, cors: true };
  _connected = false;
}

/* ══════════════════════════════════════════
   VARINT ENCODING (Monero format)
   ══════════════════════════════════════════ */
function varintEncode(n) {
  const bytes = [];
  while (n >= 0x80) {
    bytes.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  bytes.push(n & 0x7f);
  return new Uint8Array(bytes);
}

function varintDecode(bytes, offset = 0) {
  let n = 0, shift = 0;
  let i = offset;
  while (i < bytes.length) {
    const b = bytes[i++];
    n |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: n, length: i - offset };
}

/* ══════════════════════════════════════════
   EXPORTS
   ══════════════════════════════════════════ */
export {
  // Connection
  autoConnect,
  testConnection,
  setNode,

  // Daemon RPC
  getInfo,
  getBlockCount,
  getBlockHeaderByHeight,
  getBlock,
  getTransactions,
  getTransactionPool,
  isKeyImageSpent,

  // Output crypto
  computeSharedSecret,
  deriveOutputPubKey,
  deriveOutputPrivKey,
  derivationToScalar,
  hashToScalar,
  hashToPoint,
  computeKeyImage,
  decryptAmount,
  parseTxExtra,

  // Scanning
  scanTransaction,
  scanBlocks,
  scanSingleTx,
  scanMempool,

  // Atomic swap verification
  verifyXmrLock,
  pollXmrLock,

  // Helpers
  varintEncode,
  varintDecode
};
