#!/usr/bin/env node
'use strict';

/**
 * BCH P2PKH Pubkey Indexer
 * Zero-knowledge scanning infrastructure for BCH privacy protocols.
 *
 * Serves all compressed pubkeys from P2PKH transaction inputs for any BCH
 * block range. Clients do ECDH locally — the server never learns scan keys.
 *
 * Usage:
 *   node pubkey-indexer.js serve                        # HTTP API (port 3847)
 *   node pubkey-indexer.js scan --from 943000           # JSON lines to stdout
 *   node pubkey-indexer.js scan --from 943000 --format binary  # 69-byte records
 *   node pubkey-indexer.js scan --from 943000 --to 943100
 *
 * Source modes:
 *   --source fulcrum  (default) Public Fulcrum WSS, no node needed
 *   --source node     Local BCHN JSON-RPC, full sovereignty
 *
 * Options:
 *   --fulcrum-url wss://...    Override Fulcrum server
 *   --rpc-url http://...       BCHN RPC endpoint
 *   --rpc-user / --rpc-pass    BCHN credentials
 *   --cache-dir ./cache        Block cache location
 *   --port 3847                HTTP API port
 *   --max-range 100            Max blocks per HTTP request
 *
 * Binary format (file, 73 bytes/entry):
 *   height(4 LE) | pubkey(33) | prev_txid(32) | prev_vout(4 LE)
 *
 * Binary format (stream, 69 bytes/entry):
 *   pubkey(33) | prev_txid(32) | prev_vout(4 LE)
 *
 * Block file header (8 bytes):
 *   height(4 LE) | entry_count(4 LE)
 *
 * Library usage:
 *   const { createScanner } = require('./pubkey-indexer');
 *   const scanner = createScanner({ source: 'fulcrum', cacheDir: './cache' });
 *   for await (const entry of scanner.pubkeys(943000, 943100)) { ... }
 */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const { createHash } = require('crypto');

// WebSocket is only needed for fulcrum mode. Loaded lazily.
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
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      r[key] = (next && !next.startsWith('--')) ? argv[++i] : true;
    } else if (!r._cmd)    r._cmd    = argv[i];
    else if (!r._subcmd)   r._subcmd = argv[i];
  }
  return r;
}

function buildConfig(overrides = {}) {
  const args = parseArgs(process.argv.slice(2));
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

/** Read Bitcoin varint from buffer at pos. Returns { value, nextPos }. */
function readVarInt(buf, pos) {
  const first = buf[pos];
  if (first < 0xfd) return { value: first,                       nextPos: pos + 1 };
  if (first === 0xfd) return { value: buf.readUInt16LE(pos + 1), nextPos: pos + 3 };
  if (first === 0xfe) return { value: buf.readUInt32LE(pos + 1), nextPos: pos + 5 };
  return { value: Number(buf.readBigUInt64LE(pos + 1)),          nextPos: pos + 9 };
}

/**
 * Extract compressed pubkey from P2PKH scriptSig hex.
 * P2PKH scriptSig: <push_sig><sig_bytes><0x21><33_byte_compressed_pubkey>
 * Returns Buffer(33) or null.
 */
function pubkeyFromScriptSig(scriptSigHex) {
  if (!scriptSigHex || scriptSigHex.length < 2) return null;
  try {
    const buf = Buffer.from(scriptSigHex, 'hex');
    let pos = 0;
    // First push: DER signature (71–73 bytes + sighash type = 72–74 total)
    const sigPush = buf[pos++];
    if (sigPush < 0x47 || sigPush > 0x49) return null; // 71-73 bytes
    pos += sigPush; // skip signature bytes
    if (pos >= buf.length) return null;
    // Second push: compressed pubkey (0x21 = 33 bytes)
    if (buf[pos++] !== 0x21) return null;
    if (pos + 33 > buf.length) return null;
    const pubkey = buf.slice(pos, pos + 33);
    if (pubkey[0] !== 0x02 && pubkey[0] !== 0x03) return null;
    return pubkey;
  } catch (_) {
    return null;
  }
}

/**
 * Parse raw transaction hex. Extract { vin, pubkey, prevTxid, prevVout } for
 * every P2PKH input (coinbase inputs skipped automatically — they have no pubkey).
 */
function extractFromRawTx(txHex) {
  const buf = Buffer.from(txHex, 'hex');
  const results = [];
  let pos = 0;
  try {
    pos += 4; // version
    const inputCount = readVarInt(buf, pos); pos = inputCount.nextPos;
    for (let vin = 0; vin < inputCount.value; vin++) {
      const prevTxidLE = buf.slice(pos, pos + 32); pos += 32;
      const prevVout   = buf.readUInt32LE(pos);    pos += 4;
      const scriptLen  = readVarInt(buf, pos);      pos = scriptLen.nextPos;
      const script     = buf.slice(pos, pos + scriptLen.value); pos += scriptLen.value;
      pos += 4; // sequence
      const pubkey = pubkeyFromScriptSig(script.toString('hex'));
      if (pubkey) {
        // prevTxid stored big-endian (human-readable txid order)
        results.push({ vin, pubkey, prevTxid: Buffer.from(prevTxidLE).reverse(), prevVout });
      }
    }
  } catch (_) { /* partial parse acceptable */ }
  return results;
}

/**
 * Parse a raw block hex and return all txids (double-SHA256 of each raw tx).
 * Needed for Fulcrum mode where we get the full block and derive txids ourselves.
 */
function txidsFromRawBlock(blockHex) {
  const buf = Buffer.from(blockHex, 'hex');
  let pos = 80; // skip 80-byte block header
  const txCount = readVarInt(buf, pos); pos = txCount.nextPos;
  const txids = [];
  for (let i = 0; i < txCount.value; i++) {
    const txStart = pos;
    pos += 4; // version
    const inCount = readVarInt(buf, pos); pos = inCount.nextPos;
    for (let j = 0; j < inCount.value; j++) {
      pos += 36; // prevout
      const sLen = readVarInt(buf, pos); pos = sLen.nextPos + sLen.value;
      pos += 4; // sequence
    }
    const outCount = readVarInt(buf, pos); pos = outCount.nextPos;
    for (let j = 0; j < outCount.value; j++) {
      pos += 8; // value
      const sLen = readVarInt(buf, pos); pos = sLen.nextPos + sLen.value;
    }
    pos += 4; // locktime
    const txData = buf.slice(txStart, pos);
    const h1 = createHash('sha256').update(txData).digest();
    const h2 = createHash('sha256').update(h1).digest();
    txids.push(Buffer.from(h2).reverse().toString('hex'));
  }
  return txids;
}

// ─── Binary Wire Format ────────────────────────────────────────────────────────

const STREAM_ENTRY_SIZE = 69; // pubkey(33) + prevTxid(32) + prevVout(4)
const FILE_ENTRY_SIZE   = 73; // height(4)  + pubkey(33) + prevTxid(32) + prevVout(4)
const BLOCK_HDR_SIZE    = 8;  // height(4)  + count(4)

function toStreamEntry(entry) {
  const b = Buffer.allocUnsafe(STREAM_ENTRY_SIZE);
  entry.pubkey.copy(b, 0);
  entry.prevTxid.copy(b, 33);
  b.writeUInt32LE(entry.prevVout, 65);
  return b;
}

function toFileEntry(height, entry) {
  const b = Buffer.allocUnsafe(FILE_ENTRY_SIZE);
  b.writeUInt32LE(height, 0);
  entry.pubkey.copy(b, 4);
  entry.prevTxid.copy(b, 37);
  b.writeUInt32LE(entry.prevVout, 69);
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
    const raw = fs.readFileSync(jsonCachePath(cacheDir, height), 'utf8');
    const { entries } = JSON.parse(raw);
    return entries.map(e => ({
      vin:      e.vin,
      pubkey:   Buffer.from(e.pubkey,   'hex'),
      prevTxid: Buffer.from(e.prevTxid, 'hex'),
      prevVout: e.prevVout,
    }));
  } catch (_) { return null; }
}

function writeCache(cacheDir, height, entries) {
  // JSON cache
  const jsonData = JSON.stringify({
    height,
    entries: entries.map(e => ({
      vin:      e.vin,
      pubkey:   e.pubkey.toString('hex'),
      prevTxid: e.prevTxid.toString('hex'),
      prevVout: e.prevVout,
    })),
  });
  fs.writeFileSync(jsonCachePath(cacheDir, height), jsonData);

  // Binary cache: block header + entries
  const bufs = [blockHeader(height, entries.length)];
  for (const e of entries) bufs.push(toFileEntry(height, e));
  fs.writeFileSync(binCachePath(cacheDir, height), Buffer.concat(bufs));
}

// ─── Fulcrum Client ────────────────────────────────────────────────────────────

class FulcrumClient {
  constructor(urls) {
    this.urls     = urls;
    this.urlIndex = 0;
    this.ws       = null;
    this.pending  = new Map();
    this.nextId   = 1;
    this._connectP = null;
  }

  async connect() {
    if (!this._connectP) this._connectP = this._doConnect();
    return this._connectP;
  }

  _doConnect() {
    if (!WebSocket) WebSocket = require('ws');
    return new Promise((resolve, reject) => {
      const url = this.urls[this.urlIndex % this.urls.length];
      console.error(`[Fulcrum] Connecting to ${url} …`);
      const ws = new WebSocket(url);
      ws.on('open', () => { this.ws = ws; console.error('[Fulcrum] Connected'); resolve(); });
      ws.on('message', data => {
        try {
          const msg = JSON.parse(data.toString());
          const cb = this.pending.get(msg.id);
          if (cb) {
            this.pending.delete(msg.id);
            msg.error ? cb.reject(new Error(msg.error.message)) : cb.resolve(msg.result);
          }
        } catch (_) {}
      });
      ws.on('error', err => {
        this.ws = null; this._connectP = null; this.urlIndex++;
        reject(err);
      });
      ws.on('close', () => { this.ws = null; this._connectP = null; });
    });
  }

  async call(method, params = []) {
    if (!this.ws) await this.connect();
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`Timeout: ${method}`)); }
      }, 30_000);
    });
  }

  async getBlockHex(height) {
    return this.call('blockchain.block.get', [height]);
  }

  async getTxHex(txid) {
    return this.call('blockchain.transaction.get', [txid, false]);
  }

  async getTip() {
    const r = await this.call('blockchain.headers.subscribe');
    return typeof r === 'object' ? r.height : r;
  }
}

// ─── BCHN RPC Client ───────────────────────────────────────────────────────────

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
          try {
            const p = JSON.parse(data);
            p.error ? reject(new Error(p.error.message)) : resolve(p.result);
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(body); req.end();
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
    this.fulcrum = config.source === 'fulcrum' ? new FulcrumClient(config.fulcrumUrls) : null;
    this.bchn    = config.source === 'node'    ? new BCHNClient(config)                : null;
    initCache(config.cacheDir);
  }

  /** Get all P2PKH input pubkey entries for a single block. Caches result. */
  async getBlock(height) {
    const cached = readCached(this.cfg.cacheDir, height);
    if (cached) return cached;

    const entries = this.cfg.source === 'node'
      ? await this._fetchBCHN(height)
      : await this._fetchFulcrum(height);

    writeCache(this.cfg.cacheDir, height, entries);
    return entries;
  }

  async _fetchFulcrum(height) {
    const blockHex = await this.fulcrum.getBlockHex(height);
    const txids    = txidsFromRawBlock(blockHex);
    const entries  = [];
    // Skip coinbase (index 0)
    const BATCH = 10;
    for (let i = 1; i < txids.length; i += BATCH) {
      const batch = txids.slice(i, i + BATCH);
      const hexes = await Promise.all(batch.map(id => this.fulcrum.getTxHex(id)));
      for (const hex of hexes) if (hex) entries.push(...extractFromRawTx(hex));
    }
    return entries;
  }

  async _fetchBCHN(height) {
    const hash  = await this.bchn.getBlockHash(height);
    const block = await this.bchn.getBlock(hash, 2); // verbosity 2 = full tx data
    const entries = [];
    for (const tx of block.tx) {
      if (tx.vin[0]?.coinbase) continue; // skip coinbase
      for (let vin = 0; vin < tx.vin.length; vin++) {
        const input = tx.vin[vin];
        if (!input.scriptSig?.hex) continue;
        const pubkey = pubkeyFromScriptSig(input.scriptSig.hex);
        if (pubkey) {
          entries.push({
            vin,
            pubkey,
            prevTxid: Buffer.from(input.txid, 'hex').reverse(), // store big-endian
            prevVout: input.vout,
          });
        }
      }
    }
    return entries;
  }

  /** Async generator yielding { height, vin, pubkey, prevTxid, prevVout } */
  async *pubkeys(from, to) {
    for (let h = from; h <= to; h++) {
      const entries = await this.getBlock(h);
      for (const e of entries) yield { height: h, ...e };
    }
  }

  async getTip() {
    return this.cfg.source === 'node' ? this.bchn.getTip() : this.fulcrum.getTip();
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
    if (req.method !== 'GET')     { json(res, 405, { error: 'Method not allowed' }); return; }

    if (u.pathname === '/api/health') {
      json(res, 200, { status: 'ok', source: config.source, version: '1.0.0' });

    } else if (u.pathname === '/api/stats') {
      json(res, 200, indexer.getCacheStats());

    } else if (u.pathname === '/api/pubkeys') {
      const from   = parseInt(u.searchParams.get('from'));
      const to     = parseInt(u.searchParams.get('to') || from);
      const format = u.searchParams.get('format') || 'json';

      if (isNaN(from)) { json(res, 400, { error: 'Missing "from" parameter' }); return; }
      if (to < from)   { json(res, 400, { error: '"to" must be >= "from"' }); return; }
      if (to - from >= config.maxRange) {
        json(res, 400, { error: `Range too large. Max ${config.maxRange} blocks per request.` }); return;
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
        const result = { from, to, entries: [] };
        for (let h = from; h <= to; h++) {
          try {
            const entries = await indexer.getBlock(h);
            for (const e of entries) result.entries.push({
              height:   h,
              vin:      e.vin,
              pubkey:   e.pubkey.toString('hex'),
              prevTxid: e.prevTxid.toString('hex'),
              prevVout: e.prevVout,
            });
          } catch (err) { console.error(`block ${h}: ${err.message}`); }
        }
        json(res, 200, result);
      }

    } else {
      json(res, 404, { error: 'Not found' });
    }
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ─── CLI Commands ──────────────────────────────────────────────────────────────

async function cmdServe(config) {
  const indexer = new PubkeyIndexer(config);
  const server  = createServer(indexer, config);
  server.listen(config.port, () => {
    console.error(`[pubkey-indexer] Listening on port ${config.port}`);
    console.error(`[pubkey-indexer] Source:    ${config.source}`);
    console.error(`[pubkey-indexer] Cache:     ${config.cacheDir}`);
    console.error(`[pubkey-indexer] API:       http://localhost:${config.port}/api/pubkeys?from=943000&to=943001`);
    console.error(`[pubkey-indexer] Health:    http://localhost:${config.port}/api/health`);
  });
}

async function cmdScan(config, args) {
  const from   = parseInt(args.from);
  const format = args.format || 'json';

  if (isNaN(from)) { console.error('Error: --from <height> required'); process.exit(1); }

  const indexer = new PubkeyIndexer(config);
  const to      = args.to ? parseInt(args.to) : await indexer.getTip();

  console.error(`[scan] height ${from}–${to}, format=${format}`);

  if (format === 'binary') {
    for await (const entry of indexer.pubkeys(from, to)) {
      process.stdout.write(toStreamEntry(entry));
    }
  } else {
    // JSON lines (one object per line, pipeable)
    for await (const entry of indexer.pubkeys(from, to)) {
      process.stdout.write(JSON.stringify({
        height:   entry.height,
        vin:      entry.vin,
        pubkey:   entry.pubkey.toString('hex'),
        prevTxid: entry.prevTxid.toString('hex'),
        prevVout: entry.prevVout,
      }) + '\n');
    }
  }
}

// ─── Library Export ────────────────────────────────────────────────────────────

/**
 * Create a scanner instance for use as a library.
 *
 * @param {object} options
 * @param {'fulcrum'|'node'} options.source
 * @param {string[]} [options.fulcrumUrls]
 * @param {string}   [options.rpcUrl]
 * @param {string}   [options.cacheDir]
 * @returns {PubkeyIndexer}
 *
 * @example
 * const { createScanner } = require('./pubkey-indexer');
 * const scanner = createScanner({ source: 'fulcrum', cacheDir: './cache' });
 * for await (const { height, pubkey, prevTxid, prevVout } of scanner.pubkeys(943000, 943100)) {
 *   const shared = ecdh(scanPriv, pubkey); // ECDH check
 * }
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
