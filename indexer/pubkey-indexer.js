#!/usr/bin/env node
'use strict';

/**
 * BCH P2PKH Pubkey Indexer
 * Zero-knowledge scanning infrastructure for BCH privacy protocols.
 *
 * Serves all compressed pubkeys from P2PKH transaction inputs for any BCH
 * block range. Clients do ECDH locally — the server never learns scan keys.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────────
 *
 *   node pubkey-indexer.js serve                         # HTTP API (port 3847)
 *   node pubkey-indexer.js scan --from 943000            # JSON lines to stdout
 *   node pubkey-indexer.js scan --from 943000 --format binary   # 69-byte stream
 *   node pubkey-indexer.js scan --from 943000 --to 943100
 *
 * ─── Source Modes ─────────────────────────────────────────────────────────────
 *
 *   --source fulcrum      (default) Public Fulcrum WSS, no node needed
 *   --source local-node   Local BCHN JSON-RPC, full sovereignty
 *
 * ─── Options ──────────────────────────────────────────────────────────────────
 *
 *   --fulcrum-url wss://...    Override default Fulcrum server
 *   --rpc-url http://...       BCHN RPC endpoint (local-node mode)
 *   --rpc-user / --rpc-pass    BCHN credentials
 *   --cache-dir ./cache        Block cache directory
 *   --port 3847                HTTP API port
 *   --max-range 100            Max blocks per HTTP request
 *
 * ─── Binary Wire Format ───────────────────────────────────────────────────────
 *
 * File entry (106 bytes, stored in .bin cache):
 *   height(4 LE) | txid(32) | vin(1) | pubkey(33) | outpoint_txid(32) | outpoint_vout(4 LE)
 *
 * Block file header (8 bytes, precedes each block's entries in .bin file):
 *   height(4 LE) | entry_count(4 LE)
 *
 * Stream entry (69 bytes, scan --format binary stdout):
 *   pubkey(33) | outpoint_txid(32) | outpoint_vout(4 LE)
 *
 * ─── Library Usage ────────────────────────────────────────────────────────────
 *
 *   const { createScanner } = require('./pubkey-indexer');
 *   const scanner = createScanner({ source: 'fulcrum', cacheDir: './cache' });
 *
 *   for await (const entry of scanner.pubkeys(943000, 943100)) {
 *     // entry: { height, txid: Buffer(32), vin, pubkey: Buffer(33),
 *     //          outpointTxid: Buffer(32), outpointVout: number }
 *     const shared = secp256k1.getSharedSecret(scanPriv, entry.pubkey);
 *   }
 *
 *   const entries = await scanner.getPubkeys(943000, 943100); // all at once
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { createHash } = require('crypto');

// WebSocket loaded lazily (only needed for fulcrum mode)
let WebSocket;

// ─── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_FULCRUM_URLS = [
  'wss://bch.imaginary.cash:50004',
  'wss://electroncash.de:50004',
  'wss://bch.loping.net:50004',
];

function parseArgs(argv) {
  const r = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key  = argv[i].slice(2);
      const next = argv[i + 1];
      r[key] = (next && !next.startsWith('--')) ? argv[++i] : true;
    } else if (!r._cmd)    r._cmd    = argv[i];
    else if (!r._subcmd)   r._subcmd = argv[i];
  }
  return r;
}

function buildConfig(overrides = {}) {
  const args   = parseArgs(process.argv.slice(2));
  const merged = { ...args, ...overrides };
  return {
    source:      merged.source      || process.env.SOURCE       || 'fulcrum',
    fulcrumUrls: merged['fulcrum-url']
      ? [merged['fulcrum-url']]
      : (process.env.FULCRUM_URL ? [process.env.FULCRUM_URL] : DEFAULT_FULCRUM_URLS),
    rpcUrl:  merged['rpc-url']  || process.env.RPC_URL  || 'http://localhost:8332',
    rpcUser: merged['rpc-user'] || process.env.RPC_USER || 'rpc',
    rpcPass: merged['rpc-pass'] || process.env.RPC_PASS || 'rpc',
    cacheDir: merged['cache-dir'] || process.env.CACHE_DIR || './cache/pubkeys',
    port:     parseInt(merged.port     || process.env.PORT      || '3847'),
    cors:     true,
    maxRange: parseInt(merged['max-range'] || process.env.MAX_RANGE || '100'),
  };
}

// ─── TX / ScriptSig Parser ─────────────────────────────────────────────────────

/** Read Bitcoin varint at pos. Returns { value, nextPos }. */
function readVarInt(buf, pos) {
  const first = buf[pos];
  if (first < 0xfd) return { value: first,                       nextPos: pos + 1 };
  if (first === 0xfd) return { value: buf.readUInt16LE(pos + 1), nextPos: pos + 3 };
  if (first === 0xfe) return { value: buf.readUInt32LE(pos + 1), nextPos: pos + 5 };
  return { value: Number(buf.readBigUInt64LE(pos + 1)),          nextPos: pos + 9 };
}

/**
 * Extract compressed pubkey from P2PKH scriptSig hex.
 * P2PKH scriptSig: <push_sig><sig_DER+sighash><0x21><33_byte_compressed_pubkey>
 * Returns Buffer(33) or null.
 */
function pubkeyFromScriptSig(scriptSigHex) {
  if (!scriptSigHex || scriptSigHex.length < 2) return null;
  try {
    const buf = Buffer.from(scriptSigHex, 'hex');
    let pos = 0;
    // Sig push: DER signature (71–73 bytes) + 1 sighash type byte = push 72–74
    const sigPush = buf[pos++];
    if (sigPush < 0x47 || sigPush > 0x49) return null;
    pos += sigPush;
    if (pos >= buf.length) return null;
    // Pubkey push: 0x21 = 33 bytes (compressed)
    if (buf[pos++] !== 0x21) return null;
    if (pos + 33 > buf.length) return null;
    const pk = buf.slice(pos, pos + 33);
    if (pk[0] !== 0x02 && pk[0] !== 0x03) return null;
    return pk;
  } catch (_) { return null; }
}

/**
 * Parse a raw transaction hex.
 * Returns { txid: Buffer(32), inputs: [{ vin, pubkey, outpointTxid, outpointVout }] }
 * where txid is big-endian (human-readable order).
 */
function parseRawTx(txHex) {
  const buf = Buffer.from(txHex, 'hex');
  const inputs = [];
  let pos = 0;

  try {
    pos += 4; // version
    const inCount = readVarInt(buf, pos); pos = inCount.nextPos;

    for (let vin = 0; vin < inCount.value; vin++) {
      const outpointTxidLE = buf.slice(pos, pos + 32); pos += 32;
      const outpointVout   = buf.readUInt32LE(pos);    pos += 4;
      const scriptLen      = readVarInt(buf, pos);      pos = scriptLen.nextPos;
      const script         = buf.slice(pos, pos + scriptLen.value);
      pos += scriptLen.value;
      pos += 4; // sequence

      const pubkey = pubkeyFromScriptSig(script.toString('hex'));
      if (pubkey) {
        inputs.push({
          vin,
          pubkey,
          outpointTxid: Buffer.from(outpointTxidLE).reverse(), // → big-endian
          outpointVout,
        });
      }
    }
  } catch (_) { /* partial parse ok */ }

  // Compute txid: double SHA256 of raw tx bytes, reversed to big-endian
  const h1   = createHash('sha256').update(buf).digest();
  const h2   = createHash('sha256').update(h1).digest();
  const txid = Buffer.from(h2).reverse();

  return { txid, inputs };
}

/**
 * Parse raw block hex → array of raw tx hex strings (skips coinbase at index 0).
 * Used in Fulcrum mode to get each tx's raw bytes from the full block.
 */
function txHexesFromRawBlock(blockHex) {
  const buf    = Buffer.from(blockHex, 'hex');
  let pos      = 80; // skip 80-byte block header
  const txCount = readVarInt(buf, pos); pos = txCount.nextPos;
  const txHexes = [];

  for (let i = 0; i < txCount.value; i++) {
    const txStart = pos;
    pos += 4; // version
    const inCount = readVarInt(buf, pos); pos = inCount.nextPos;
    for (let j = 0; j < inCount.value; j++) {
      pos += 36;
      const sLen = readVarInt(buf, pos); pos = sLen.nextPos + sLen.value;
      pos += 4;
    }
    const outCount = readVarInt(buf, pos); pos = outCount.nextPos;
    for (let j = 0; j < outCount.value; j++) {
      pos += 8;
      const sLen = readVarInt(buf, pos); pos = sLen.nextPos + sLen.value;
    }
    pos += 4; // locktime

    if (i > 0) { // skip coinbase (index 0)
      txHexes.push(buf.slice(txStart, pos).toString('hex'));
    }
  }
  return txHexes;
}

// ─── Binary Wire Format ────────────────────────────────────────────────────────
//
// File entry:   106 bytes = height(4) + txid(32) + vin(1) + pubkey(33) + outpointTxid(32) + outpointVout(4)
// Stream entry:  69 bytes = pubkey(33) + outpointTxid(32) + outpointVout(4)
// Block header:   8 bytes = height(4) + count(4)

const FILE_ENTRY_SIZE   = 106;
const STREAM_ENTRY_SIZE = 69;
const BLOCK_HDR_SIZE    = 8;

function toFileEntry(height, entry) {
  const b = Buffer.allocUnsafe(FILE_ENTRY_SIZE);
  b.writeUInt32LE(height, 0);             //  4: height
  entry.txid.copy(b, 4);                  // 32: current txid (big-endian)
  b.writeUInt8(entry.vin, 36);            //  1: vin index
  entry.pubkey.copy(b, 37);              // 33: compressed pubkey
  entry.outpointTxid.copy(b, 70);        // 32: outpoint txid (big-endian)
  b.writeUInt32LE(entry.outpointVout, 102); //  4: outpoint vout
  return b;
}

function toStreamEntry(entry) {
  const b = Buffer.allocUnsafe(STREAM_ENTRY_SIZE);
  entry.pubkey.copy(b, 0);               // 33: compressed pubkey
  entry.outpointTxid.copy(b, 33);        // 32: outpoint txid
  b.writeUInt32LE(entry.outpointVout, 65); //  4: outpoint vout
  return b;
}

function blockHeader(height, count) {
  const b = Buffer.allocUnsafe(BLOCK_HDR_SIZE);
  b.writeUInt32LE(height, 0);
  b.writeUInt32LE(count,  4);
  return b;
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

function jsonCachePath(cacheDir, height) { return path.join(cacheDir, 'json', `${height}.json`); }
function binCachePath(cacheDir, height)  { return path.join(cacheDir, 'bin',  `${height}.bin`);  }

function initCache(cacheDir) {
  fs.mkdirSync(path.join(cacheDir, 'json'), { recursive: true });
  fs.mkdirSync(path.join(cacheDir, 'bin'),  { recursive: true });
}

function readCached(cacheDir, height) {
  try {
    const { entries } = JSON.parse(fs.readFileSync(jsonCachePath(cacheDir, height), 'utf8'));
    return entries.map(e => ({
      txid:          Buffer.from(e.txid,          'hex'),
      vin:           e.vin,
      pubkey:        Buffer.from(e.pubkey,        'hex'),
      outpointTxid:  Buffer.from(e.outpointTxid,  'hex'),
      outpointVout:  e.outpointVout,
    }));
  } catch (_) { return null; }
}

function writeCache(cacheDir, height, entries) {
  // JSON
  fs.writeFileSync(jsonCachePath(cacheDir, height), JSON.stringify({
    height,
    entries: entries.map(e => ({
      txid:         e.txid.toString('hex'),
      vin:          e.vin,
      pubkey:       e.pubkey.toString('hex'),
      outpointTxid: e.outpointTxid.toString('hex'),
      outpointVout: e.outpointVout,
    })),
  }));

  // Binary: block header + entries
  const bufs = [blockHeader(height, entries.length)];
  for (const e of entries) bufs.push(toFileEntry(height, e));
  fs.writeFileSync(binCachePath(cacheDir, height), Buffer.concat(bufs));
}

// ─── Fulcrum Client (Mode A) ───────────────────────────────────────────────────

class FulcrumClient {
  constructor(urls) {
    this.urls     = urls;
    this.urlIndex = 0;
    this.ws       = null;
    this.pending  = new Map();
    this.nextId   = 1;
    this._connP   = null;
  }

  async connect() {
    if (!this._connP) this._connP = this._doConnect();
    return this._connP;
  }

  _doConnect() {
    if (!WebSocket) WebSocket = require('ws');
    return new Promise((resolve, reject) => {
      const url = this.urls[this.urlIndex % this.urls.length];
      console.error(`[Fulcrum] Connecting → ${url}`);
      const ws = new WebSocket(url);
      ws.on('open', () => { this.ws = ws; console.error('[Fulcrum] Connected'); resolve(); });
      ws.on('message', data => {
        try {
          const msg = JSON.parse(data.toString());
          const cb  = this.pending.get(msg.id);
          if (cb) { this.pending.delete(msg.id); msg.error ? cb.reject(new Error(msg.error.message)) : cb.resolve(msg.result); }
        } catch (_) {}
      });
      ws.on('error', err => { this.ws = null; this._connP = null; this.urlIndex++; reject(err); });
      ws.on('close', () => { this.ws = null; this._connP = null; });
    });
  }

  async call(method, params = []) {
    if (!this.ws) await this.connect();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); } }, 30_000);
    });
  }

  async getBlockHex(height) { return this.call('blockchain.block.get', [height]); }
  async getTxHex(txid)      { return this.call('blockchain.transaction.get', [txid, false]); }

  async getTip() {
    const r = await this.call('blockchain.headers.subscribe');
    return typeof r === 'object' ? r.height : r;
  }
}

// ─── BCHN RPC Client (Mode B — Local Node) ────────────────────────────────────

class BCHNClient {
  constructor(config) {
    this.url  = config.rpcUrl;
    this.auth = Buffer.from(`${config.rpcUser}:${config.rpcPass}`).toString('base64');
    this.id   = 1;
  }

  call(method, params = []) {
    const body = JSON.stringify({ jsonrpc: '1.0', id: this.id++, method, params });
    const url  = new URL(this.url);
    const mod  = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = mod.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname || '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${this.auth}`,
          'Content-Length': Buffer.byteLength(body),
        },
      }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try { const p = JSON.parse(data); p.error ? reject(new Error(p.error.message)) : resolve(p.result); }
          catch (e) { reject(e); }
        });
      });
      req.on('error', reject); req.write(body); req.end();
    });
  }

  async getTip()           { return this.call('getblockcount'); }
  async getBlockHash(h)   { return this.call('getblockhash', [h]); }
  async getBlock(hash, v) { return this.call('getblock', [hash, v]); }
}

// ─── Indexer Core ──────────────────────────────────────────────────────────────

class PubkeyIndexer {
  constructor(config) {
    this.cfg     = config;
    this.fulcrum = config.source === 'fulcrum'     ? new FulcrumClient(config.fulcrumUrls) : null;
    this.bchn    = config.source === 'local-node'  ? new BCHNClient(config)                : null;
    initCache(config.cacheDir);
  }

  /** Get all P2PKH entries for a block. Returns from cache if available. */
  async getBlock(height) {
    const cached = readCached(this.cfg.cacheDir, height);
    if (cached) return cached;

    const entries = this.cfg.source === 'local-node'
      ? await this._fetchBCHN(height)
      : await this._fetchFulcrum(height);

    writeCache(this.cfg.cacheDir, height, entries);
    return entries;
  }

  /** Fulcrum mode: fetch full block hex, parse tx hexes inline (no extra requests per tx) */
  async _fetchFulcrum(height) {
    const blockHex = await this.fulcrum.getBlockHex(height);
    const txHexes  = txHexesFromRawBlock(blockHex); // already skips coinbase
    const entries  = [];
    for (const txHex of txHexes) {
      const { txid, inputs } = parseRawTx(txHex);
      for (const inp of inputs) entries.push({ txid, ...inp });
    }
    return entries;
  }

  /**
   * Local Node mode: getblock(hash, 2) gives full TX data with decoded inputs.
   * Falls back to getblock(hash, 0) + raw parse if verbosity 2 is unsupported.
   */
  async _fetchBCHN(height) {
    const hash    = await this.bchn.getBlockHash(height);
    const block   = await this.bchn.getBlock(hash, 2);
    const entries = [];

    for (const tx of block.tx) {
      if (tx.vin[0]?.coinbase) continue;
      const txid = Buffer.from(tx.txid, 'hex'); // already big-endian in RPC response

      for (let vin = 0; vin < tx.vin.length; vin++) {
        const input = tx.vin[vin];
        if (!input.scriptSig?.hex) continue;
        const pubkey = pubkeyFromScriptSig(input.scriptSig.hex);
        if (pubkey) {
          entries.push({
            txid,
            vin,
            pubkey,
            outpointTxid: Buffer.from(input.txid, 'hex'), // RPC txid is already big-endian
            outpointVout: input.vout,
          });
        }
      }
    }
    return entries;
  }

  /**
   * Async generator: yields { height, txid, vin, pubkey, outpointTxid, outpointVout }
   * for every P2PKH input in the given block range.
   */
  async *pubkeys(from, to) {
    for (let h = from; h <= to; h++) {
      const entries = await this.getBlock(h);
      for (const e of entries) yield { height: h, ...e };
    }
  }

  /** Convenience: collect all entries for a range into an array. */
  async getPubkeys(from, to) {
    const results = [];
    for await (const e of this.pubkeys(from, to)) results.push(e);
    return results;
  }

  async getTip() {
    return this.cfg.source === 'local-node' ? this.bchn.getTip() : this.fulcrum.getTip();
  }

  getCacheStats() {
    try {
      const files   = fs.readdirSync(path.join(this.cfg.cacheDir, 'json')).filter(f => f.endsWith('.json'));
      const heights = files.map(f => parseInt(f)).filter(n => !isNaN(n)).sort((a, b) => a - b);
      return { cached_blocks: heights.length, min_height: heights[0] ?? null, max_height: heights.at(-1) ?? null };
    } catch (_) {
      return { cached_blocks: 0, min_height: null, max_height: null };
    }
  }
}

// ─── HTTP API ──────────────────────────────────────────────────────────────────

function createServer(indexer, config) {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, `http://localhost:${config.port}`);

    if (config.cors) {
      res.setHeader('Access-Control-Allow-Origin',  '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method !== 'GET')     { jsonRes(res, 405, { error: 'Method not allowed' }); return; }

    // ── /api/health ──────────────────────────────────────────────────────────
    if (u.pathname === '/api/health') {
      jsonRes(res, 200, { status: 'ok', source: config.source, version: '1.0.0' });

    // ── /api/stats ───────────────────────────────────────────────────────────
    } else if (u.pathname === '/api/stats') {
      jsonRes(res, 200, indexer.getCacheStats());

    // ── /api/pubkeys ─────────────────────────────────────────────────────────
    } else if (u.pathname === '/api/pubkeys') {
      const from   = parseInt(u.searchParams.get('from'));
      const to     = parseInt(u.searchParams.get('to') || from);
      const format = u.searchParams.get('format') || 'json';

      if (isNaN(from)) { jsonRes(res, 400, { error: 'Missing required parameter: from' }); return; }
      if (to < from)   { jsonRes(res, 400, { error: '"to" must be >= "from"' }); return; }
      if (to - from >= config.maxRange) {
        jsonRes(res, 400, { error: `Range too large. Max ${config.maxRange} blocks per request.` }); return;
      }

      if (format === 'binary') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        for (let h = from; h <= to; h++) {
          try {
            const entries = await indexer.getBlock(h);
            res.write(blockHeader(h, entries.length));
            for (const e of entries) res.write(toFileEntry(h, e));
          } catch (err) { console.error(`block ${h}: ${err.message}`); }
        }
        res.end();
      } else {
        // JSON
        const result = { from, to, entries: [] };
        for (let h = from; h <= to; h++) {
          try {
            const entries = await indexer.getBlock(h);
            for (const e of entries) result.entries.push({
              height:       h,
              txid:         e.txid.toString('hex'),
              vin:          e.vin,
              pubkey:       e.pubkey.toString('hex'),
              outpointTxid: e.outpointTxid.toString('hex'),
              outpointVout: e.outpointVout,
            });
          } catch (err) { console.error(`block ${h}: ${err.message}`); }
        }
        jsonRes(res, 200, result);
      }

    } else {
      jsonRes(res, 404, { error: 'Not found' });
    }
  });
}

function jsonRes(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ─── CLI Commands ──────────────────────────────────────────────────────────────

async function cmdServe(config) {
  const indexer = new PubkeyIndexer(config);
  const server  = createServer(indexer, config);
  server.listen(config.port, () => {
    console.error(`[pubkey-indexer] Listening   → http://localhost:${config.port}`);
    console.error(`[pubkey-indexer] Source       → ${config.source}`);
    console.error(`[pubkey-indexer] Cache        → ${config.cacheDir}`);
    console.error(`[pubkey-indexer] Pubkeys API  → GET /api/pubkeys?from=943000&to=943001`);
    console.error(`[pubkey-indexer] Health       → GET /api/health`);
  });
}

async function cmdScan(config, args) {
  const from   = parseInt(args.from);
  const format = args.format || 'json';
  if (isNaN(from)) { console.error('Error: --from <height> is required'); process.exit(1); }

  const indexer = new PubkeyIndexer(config);
  const to      = args.to ? parseInt(args.to) : await indexer.getTip();
  console.error(`[scan] ${from}–${to}  format=${format}  source=${config.source}`);

  if (format === 'binary') {
    for await (const entry of indexer.pubkeys(from, to)) {
      process.stdout.write(toStreamEntry(entry));
    }
  } else {
    for await (const entry of indexer.pubkeys(from, to)) {
      process.stdout.write(JSON.stringify({
        height:       entry.height,
        txid:         entry.txid.toString('hex'),
        vin:          entry.vin,
        pubkey:       entry.pubkey.toString('hex'),
        outpointTxid: entry.outpointTxid.toString('hex'),
        outpointVout: entry.outpointVout,
      }) + '\n');
    }
  }
}

// ─── Library Export ────────────────────────────────────────────────────────────

/**
 * Create a scanner instance for library use.
 *
 * @param {object} options
 * @param {'fulcrum'|'local-node'} [options.source='fulcrum']
 * @param {string[]} [options.fulcrumUrls]    Override Fulcrum server list
 * @param {string}   [options.rpcUrl]         BCHN RPC URL (local-node mode)
 * @param {string}   [options.rpcUser]        BCHN RPC username
 * @param {string}   [options.rpcPass]        BCHN RPC password
 * @param {string}   [options.cacheDir]       Block cache directory
 * @returns {PubkeyIndexer}
 *
 * @example
 * const { createScanner } = require('./pubkey-indexer');
 * const scanner = createScanner({ source: 'fulcrum', cacheDir: './cache' });
 *
 * // Async generator (streaming, memory-efficient)
 * for await (const entry of scanner.pubkeys(943000, 943100)) {
 *   const shared = secp256k1.getSharedSecret(scanPriv, entry.pubkey);
 * }
 *
 * // All at once
 * const entries = await scanner.getPubkeys(943000, 943100);
 */
function createScanner(options = {}) {
  return new PubkeyIndexer(buildConfig(options));
}

// ─── Entry Point ───────────────────────────────────────────────────────────────

if (require.main === module) {
  const args   = parseArgs(process.argv.slice(2));
  const config = buildConfig();
  const cmd    = args._cmd || 'serve';

  if      (cmd === 'serve') cmdServe(config).catch(e => { console.error(e); process.exit(1); });
  else if (cmd === 'scan')  cmdScan(config, args).catch(e => { console.error(e); process.exit(1); });
  else {
    console.error(`Unknown command: ${cmd}`);
    console.error('Usage: pubkey-indexer serve | scan --from <height> [--to <height>] [--format json|binary]');
    process.exit(1);
  }
}

module.exports = { createScanner, PubkeyIndexer };
