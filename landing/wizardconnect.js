/**
 * WizardConnect — BCH HD Wallet Connection Protocol
 * Compatible with RiftenLabs WizardConnect (hdwalletv1)
 *
 * Transport: Nostr NIP-17 encrypted messages via WebSocket relay
 * Protocol:  hdwalletv1 — xpub exchange + transaction signing
 *
 * 00 Protocol implements BOTH sides:
 * - WALLET: external dapps connect to 00 Wallet (expose xpubs, sign TXs)
 * - DAPP:   00 Protocol connects to external wallets (receive xpubs, request signing)
 *
 * @license LGPL-3.0 (compatible with WizardConnect)
 */

'use strict';

/* ══════════════════════════════════════════
   IMPORTS — reuse noble-curves already loaded in wallet.html
   ══════════════════════════════════════════ */

// These globals are set by wallet.html's module before wizardconnect.js runs:
// window._secp256k1, window._sha256, window._nip04Encrypt, window._nip04Decrypt

/* ══════════════════════════════════════════
   PROTOCOL CONSTANTS
   ══════════════════════════════════════════ */

const WIZ_PROTOCOL = 'hdwalletv1';
const WIZ_VERSION  = '1.0';

const WIZ_ACTION = Object.freeze({
  DAPP_READY:           'dapp_ready',
  WALLET_READY:         'wallet_ready',
  SIGN_TX_REQUEST:      'sign_transaction_request',
  SIGN_TX_RESPONSE:     'sign_transaction_response',
  SIGN_CANCEL:          'sign_cancel',
  DISCONNECT:           'disconnect',
});

// PathName → BIP44 child index (under account node m/44'/145'/0')
const WIZ_PATH_INDEX = Object.freeze({
  receive: 0,      // m/44'/145'/0'/0
  change:  1,      // m/44'/145'/0'/1
  defi:    7,      // m/44'/145'/0'/7  — RiftenLabs standard
});

// WizardConnect Extensions — standard naming per BCH Stealth Protocol spec
// Each extension has its own BIP tree, NOT under BIP44
const WIZ_EXTENSIONS = Object.freeze({
  bch_stealth_bip352: {
    spend_path: "m/352'/145'/0'/0'",   // Hardened gate — wallet exports xpub here
    scan_path:  "m/352'/145'/0'/1'",   // Hardened gate — wallet exports xpub here
  },
  rpa_bip47: {
    spend_path: "m/47'/145'/0'/0'",    // Hardened gate — wallet exports xpub here
    scan_path:  "m/47'/145'/0'/1'",    // Hardened gate — wallet exports xpub here
  },
});

const WIZ_DEFAULT_RELAY = 'wss://relay.cauldron.quest:443';

/* ══════════════════════════════════════════
   UTILITY — hex, bech32, etc.
   ══════════════════════════════════════════ */

const _b2h = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('');
const _h2b = h => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x,16)));

// Minimal bech32 for URI encoding (WizardConnect uses bech32-padded for pubkey + secret)
const _BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function _bech32Encode(data) {
  const bits = [];
  for (const b of data) { for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1); }
  const out = [];
  for (let i = 0; i < bits.length; i += 5) {
    let v = 0;
    for (let j = 0; j < 5; j++) v = (v << 1) | (bits[i + j] || 0);
    out.push(_BECH32_CHARSET[v]);
  }
  return out.join('');
}

function _bech32Decode(str) {
  const bits = [];
  for (const c of str.toLowerCase()) {
    const v = _BECH32_CHARSET.indexOf(c);
    if (v === -1) throw new Error('Invalid bech32 char: ' + c);
    for (let i = 4; i >= 0; i--) bits.push((v >> i) & 1);
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  return new Uint8Array(bytes);
}

function _randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/* ══════════════════════════════════════════
   URI — wiz:// encode/decode
   ══════════════════════════════════════════ */

function wizEncodeURI(pubkeyHex, secretHex, relayUrl) {
  const pubBech32 = _bech32Encode(_h2b(pubkeyHex));
  const secBech32 = _bech32Encode(_h2b(secretHex));

  const defaultRelay = WIZ_DEFAULT_RELAY;
  if (!relayUrl || relayUrl === defaultRelay) {
    return `wiz://?p=${pubBech32}&s=${secBech32}`;
  }
  const m = relayUrl.match(/^(wss?):\/\/([^:\/]+)(?::(\d+))?/);
  if (!m) return `wiz://?p=${pubBech32}&s=${secBech32}`;
  const host = m[2];
  const port = m[3] ? ':' + m[3] : '';
  let uri = `wiz://${host}${port}?p=${pubBech32}&s=${secBech32}`;
  if (m[1] === 'ws') uri += '&pr=ws';
  return uri;
}

function wizDecodeURI(uri) {
  const lower = uri.toLowerCase();
  const isQR = lower.includes('%3f') && !lower.includes('?');
  const normalized = isQR
    ? lower.replace('%3f', '?').replace(/%3d/g, '=').replace(/%26/g, '&')
    : lower;
  const url = new URL(normalized);
  if (url.protocol !== 'wiz:') throw new Error('Not a wiz:// URI');

  const pBech32 = url.searchParams.get('p');
  const sBech32 = url.searchParams.get('s');
  if (!pBech32 || !sBech32) throw new Error('Missing p or s param');

  const publicKey = _b2h(_bech32Decode(pBech32));
  const secret = _b2h(_bech32Decode(sBech32));

  const hostname = url.hostname || 'relay.cauldron.quest';
  const protocol = url.searchParams.get('pr') || 'wss';
  const port = url.port ? parseInt(url.port) : (protocol === 'wss' ? 443 : 80);

  return { publicKey, secret, hostname, port, protocol };
}

/* ══════════════════════════════════════════
   NOSTR NIP-17 RELAY TRANSPORT
   ══════════════════════════════════════════

   WizardConnect uses Nostr NIP-17 (gift-wrap) for encrypted relay.
   Simplified version: we use NIP-04 (AES-CBC) like the rest of 00 Protocol,
   wrapped in Nostr kind 21059 (ephemeral DM) events.

   The relay sees: sender pubkey, recipient pubkey tag, encrypted blob.
   It cannot read the content.
   ══════════════════════════════════════════ */

class WizRelay {
  constructor(relayUrl, myPrivHex, sessionId) {
    this._relayUrl = relayUrl;
    this._myPriv = _h2b(myPrivHex);
    this._myPrivHex = myPrivHex;
    // Derive x-only pubkey (Nostr format: 32 bytes, no prefix)
    this._myPub = null; // set after secp256k1 available
    this._sessionId = sessionId;
    this._peerPubHex = null;
    this._ws = null;
    this._connected = false;
    this._onMessage = null;
    this._onStatus = null;
    this._reconnectTimer = null;
    this._reqId = 1;
  }

  setMyPub(pubHex32) { this._myPub = pubHex32; }
  setPeerPub(pubHex32) { this._peerPubHex = pubHex32; }

  connect() {
    if (this._ws) { try { this._ws.close(); } catch {} }
    const ws = new WebSocket(this._relayUrl);
    this._ws = ws;

    ws.onopen = () => {
      this._connected = true;
      if (this._onStatus) this._onStatus('connected');
      // Subscribe to events tagged with our pubkey
      ws.send(JSON.stringify(['REQ', 'wiz-' + this._sessionId, {
        kinds: [21059],
        '#p': [this._myPub],
        since: Math.floor(Date.now() / 1000) - 300, // last 5 min
      }]));
    };

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg[0] !== 'EVENT' || !msg[2]) return;
        const ev = msg[2];
        if (ev.kind !== 21059) return;

        // Decrypt content (NIP-04)
        const senderPub = ev.pubkey; // x-only, 32 bytes hex
        const decrypt = window._nip04Decrypt;
        if (!decrypt) return;
        const plaintext = await decrypt(this._myPriv, senderPub, ev.content);
        const payload = JSON.parse(plaintext);

        // Set peer pub if not yet known (first message from peer)
        if (!this._peerPubHex && senderPub) {
          this._peerPubHex = senderPub;
        }

        if (this._onMessage) this._onMessage(payload, senderPub);
      } catch (err) {
        console.warn('[WIZ-RELAY] decrypt error:', err.message);
      }
    };

    ws.onerror = () => {
      this._connected = false;
      if (this._onStatus) this._onStatus('error');
    };

    ws.onclose = () => {
      this._connected = false;
      if (this._onStatus) this._onStatus('disconnected');
      // Auto-reconnect after 5s
      this._reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  async send(payload) {
    if (!this._ws || this._ws.readyState !== 1) {
      console.warn('[WIZ-RELAY] not connected, cannot send');
      return;
    }
    if (!this._peerPubHex) {
      console.warn('[WIZ-RELAY] no peer pubkey, cannot encrypt');
      return;
    }

    const encrypt = window._nip04Encrypt;
    const makeEvent = window._makeNostrEvent;
    if (!encrypt || !makeEvent) {
      console.error('[WIZ-RELAY] missing NIP-04 encrypt or makeEvent');
      return;
    }

    const content = await encrypt(this._myPriv, this._peerPubHex, JSON.stringify(payload));
    const ev = await makeEvent(this._myPriv, 21059, content, [['p', this._peerPubHex]]);
    this._ws.send(JSON.stringify(['EVENT', ev]));
  }

  disconnect(reason) {
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
    if (this._ws) {
      try {
        this.send({ action: WIZ_ACTION.DISCONNECT, time: Date.now(), reason: reason || 'user_disconnect' });
      } catch {}
      setTimeout(() => { try { this._ws.close(); } catch {} }, 200);
    }
    this._connected = false;
  }

  onMessage(cb) { this._onMessage = cb; }
  onStatus(cb) { this._onStatus = cb; }
  isConnected() { return this._connected; }
}

/* ══════════════════════════════════════════
   WALLET SIDE — 00 Wallet as WizardConnect Wallet

   External dapps (Cauldron DEX, etc.) scan our QR code
   and connect to derive addresses + request signatures.
   ══════════════════════════════════════════ */

class WizWalletManager {
  constructor() {
    this._relay = null;
    this._credentials = null;
    this._connected = false;
    this._dappDiscovered = false;
    this._dappName = '';
    this._dappIcon = '';
    this._pendingSignRequests = new Map();
    this._onSignRequest = null;
    this._onConnect = null;
    this._onDisconnect = null;
  }

  /**
   * Generate connection credentials and wiz:// URI for QR code
   * @param {string} relayUrl - Nostr relay URL (default: relay.cauldron.quest)
   * @returns {{ uri: string, qrUri: string, credentials: object }}
   */
  generateConnection(relayUrl) {
    const privBytes = _randomBytes(32);
    const privHex = _b2h(privBytes);
    const secretBytes = _randomBytes(8);
    const secretHex = _b2h(secretBytes);

    // Derive x-only pubkey
    const secp = window._secp256k1;
    if (!secp) throw new Error('secp256k1 not loaded');
    const fullPub = secp.getPublicKey(privBytes, true); // 33 bytes compressed
    const pubHex32 = _b2h(fullPub.slice(1)); // x-only (drop 02/03 prefix)

    this._credentials = { privateKey: privHex, publicKey: pubHex32, secret: secretHex };
    const uri = wizEncodeURI(pubHex32, secretHex, relayUrl);
    const qrUri = uri.toUpperCase().replace('?', '%3F').replace(/=/g, '%3D').replace(/&/g, '%26');

    return { uri, qrUri, credentials: this._credentials };
  }

  /**
   * Start listening for dapp connections
   * @param {string} relayUrl
   */
  startListening(relayUrl) {
    if (!this._credentials) throw new Error('Call generateConnection first');

    const relay = new WizRelay(
      relayUrl || WIZ_DEFAULT_RELAY,
      this._credentials.privateKey,
      'wallet-' + this._credentials.secret.slice(0, 8)
    );
    relay.setMyPub(this._credentials.publicKey);
    this._relay = relay;

    relay.onMessage((payload, senderPub) => {
      if (payload.action === WIZ_ACTION.DAPP_READY) {
        this._handleDappReady(payload, senderPub);
      } else if (payload.action === WIZ_ACTION.SIGN_TX_REQUEST) {
        this._handleSignRequest(payload);
      } else if (payload.action === WIZ_ACTION.SIGN_CANCEL) {
        this._handleSignCancel(payload);
      } else if (payload.action === WIZ_ACTION.DISCONNECT) {
        this._handleDisconnect(payload);
      }
    });

    relay.onStatus((status) => {
      console.log('[WIZ-WALLET] relay status:', status);
    });

    relay.connect();
  }

  /**
   * Handle DappReady → send WalletReady with xpubs
   */
  _handleDappReady(msg, senderPub) {
    console.log('[WIZ-WALLET] dapp ready:', msg.dapp_name || 'unknown');
    this._dappDiscovered = true;
    this._dappName = msg.dapp_name || '';
    this._dappIcon = msg.dapp_icon || '';

    // Set peer pubkey for encryption
    this._relay.setPeerPub(senderPub);

    // Build xpubs for all paths
    const acctPubHex = window._acctPubHex;
    const acctChainHex = window._acctChainHex;
    if (!acctPubHex || !acctChainHex) {
      console.error('[WIZ-WALLET] no account xpub available (need HD wallet)');
      return;
    }

    // Derive BIP44 child xpubs for standard paths
    const paths = [];
    for (const [name, childIdx] of Object.entries(WIZ_PATH_INDEX)) {
      const xpub = this._deriveChildXpub(acctPubHex, acctChainHex, childIdx);
      if (xpub) paths.push({ name, xpub });
    }

    // Derive stealth xpubs from BIP352 tree (separate from BIP44)
    // The wallet derives to the hardened gate and exports xpubs
    // The dapp does the final /0 non-hardened derivation locally
    const stealthSpendXpub = window._stealthSpendXpub;  // xpub at m/352'/145'/0'/0'
    const stealthScanXpub = window._stealthScanXpub;    // xpub at m/352'/145'/0'/1'
    if (stealthSpendXpub) paths.push({ name: 'stealth_spend', xpub: stealthSpendXpub });
    if (stealthScanXpub) paths.push({ name: 'stealth_scan', xpub: stealthScanXpub });

    // RPA xpubs from BIP47 tree (if available)
    const rpaSpendXpub = window._rpaSpendXpub;  // xpub at m/47'/145'/0'/0'
    const rpaScanXpub = window._rpaScanXpub;     // xpub at m/47'/145'/0'/1'
    if (rpaSpendXpub) paths.push({ name: 'rpa_spend', xpub: rpaSpendXpub });
    if (rpaScanXpub) paths.push({ name: 'rpa_scan', xpub: rpaScanXpub });

    // Build extensions block for standard compliance
    const extensions = {};
    if (stealthSpendXpub || stealthScanXpub) {
      extensions.bch_stealth_bip352 = {
        spend_path: "m/352'/145'/0'/0'",
        scan_path: "m/352'/145'/0'/1'",
      };
    }
    if (rpaSpendXpub || rpaScanXpub) {
      extensions.rpa_bip47 = {
        spend_path: "m/47'/145'/0'/0'",
        scan_path: "m/47'/145'/0'/1'",
      };
    }

    // Send WalletReady
    const walletReady = {
      action: WIZ_ACTION.WALLET_READY,
      time: Date.now(),
      wallet_name: '00 Protocol',
      wallet_icon: 'https://0penw0rld.com/icons/00.png',
      dapp_discovered: this._dappDiscovered,
      supported_protocols: [WIZ_PROTOCOL],
      session: {
        [WIZ_PROTOCOL]: {
          paths,
          extensions: Object.keys(extensions).length ? extensions : undefined,
        }
      },
      public_key: this._credentials.publicKey,
      secret: this._credentials.secret,
    };

    this._relay.send(walletReady);
    this._connected = true;
    if (this._onConnect) this._onConnect(this._dappName, this._dappIcon);
    console.log('[WIZ-WALLET] sent WalletReady with', paths.length, 'paths');
  }

  /**
   * Derive a BIP32 xpub string for a child path
   * Uses base58check encoding: version(4) + depth(1) + fingerprint(4) + index(4) + chain(32) + key(33)
   */
  _deriveChildXpub(parentPubHex, parentChainHex, childIndex) {
    const bip32Child = window._bip32ChildPub;
    if (!bip32Child) {
      console.warn('[WIZ-WALLET] _bip32ChildPub not available');
      return null;
    }
    const child = bip32Child(_h2b(parentPubHex), _h2b(parentChainHex), childIndex);
    if (!child) return null;

    // Encode as base58check xpub (version 0x0488B21E for mainnet)
    const version = new Uint8Array([0x04, 0x88, 0xB2, 0x1E]);
    const depth = new Uint8Array([4]); // account level + 1
    const fingerprint = new Uint8Array(4); // simplified — 0x00000000
    const index = new Uint8Array(4);
    index[3] = childIndex & 0xff;
    index[2] = (childIndex >> 8) & 0xff;
    index[1] = (childIndex >> 16) & 0xff;
    index[0] = (childIndex >> 24) & 0xff;

    const payload = new Uint8Array(78);
    payload.set(version, 0);
    payload.set(depth, 4);
    payload.set(fingerprint, 5);
    payload.set(index, 9);
    payload.set(child.chain, 13);
    payload.set(child.pub, 45);

    return _base58CheckEncode(payload);
  }

  /**
   * Handle incoming sign transaction request
   */
  _handleSignRequest(msg) {
    console.log('[WIZ-WALLET] sign request #' + msg.sequence);
    this._pendingSignRequests.set(msg.sequence, msg);
    if (this._onSignRequest) this._onSignRequest(msg);
  }

  /**
   * Approve a sign request — sign the transaction and send response
   * @param {number} sequence - request sequence number
   * @param {string} signedTxHex - signed transaction hex
   */
  approveSign(sequence, signedTxHex) {
    const req = this._pendingSignRequests.get(sequence);
    if (!req) return;
    this._pendingSignRequests.delete(sequence);

    this._relay.send({
      action: WIZ_ACTION.SIGN_TX_RESPONSE,
      time: Date.now(),
      sequence: sequence,
      signedTransaction: signedTxHex,
    });
    console.log('[WIZ-WALLET] approved sign #' + sequence);
  }

  /**
   * Reject a sign request
   */
  rejectSign(sequence, reason) {
    this._pendingSignRequests.delete(sequence);
    this._relay.send({
      action: WIZ_ACTION.SIGN_CANCEL,
      time: Date.now(),
      sequence: sequence,
      reason: reason || 'user_rejected',
    });
    console.log('[WIZ-WALLET] rejected sign #' + sequence);
  }

  _handleSignCancel(msg) {
    this._pendingSignRequests.delete(msg.sequence);
    console.log('[WIZ-WALLET] sign cancelled #' + msg.sequence);
  }

  _handleDisconnect(msg) {
    console.log('[WIZ-WALLET] dapp disconnected:', msg.reason);
    this._connected = false;
    this._dappDiscovered = false;
    if (this._onDisconnect) this._onDisconnect(msg.reason);
  }

  disconnect() {
    if (this._relay) this._relay.disconnect('user_disconnect');
    this._connected = false;
  }

  // Event handlers
  onSignRequest(cb) { this._onSignRequest = cb; }
  onConnect(cb) { this._onConnect = cb; }
  onDisconnect(cb) { this._onDisconnect = cb; }
  isConnected() { return this._connected; }
  getDappName() { return this._dappName; }
}

/* ══════════════════════════════════════════
   DAPP SIDE — 00 Protocol as WizardConnect Dapp

   Connects to external wallets (Electron Cash, Cashonize, etc.)
   to access their funds for swaps, stealth, etc.
   ══════════════════════════════════════════ */

class WizDappManager {
  constructor(dappName, dappIcon) {
    this._dappName = dappName || '00 Protocol';
    this._dappIcon = dappIcon || 'https://0penw0rld.com/icons/00.png';
    this._relay = null;
    this._connected = false;
    this._walletDiscovered = false;
    this._walletName = '';
    this._walletIcon = '';
    this._paths = [];        // [{name, xpub}]
    this._signSequence = 0;
    this._pendingSignCallbacks = new Map();
    this._onConnect = null;
    this._onDisconnect = null;
    this._stealthScanPub = null;
    this._stealthSpendPub = null;
    this._rpaScanPub = null;
    this._rpaSpendPub = null;
    this._extensions = {};
  }

  /**
   * Connect to a wallet via wiz:// URI
   * @param {string} wizUri - wiz:// URI from QR code scan
   */
  connect(wizUri) {
    const decoded = wizDecodeURI(wizUri);
    const relayUrl = `${decoded.protocol}://${decoded.hostname}:${decoded.port}`;

    // Generate our own credentials
    const privBytes = _randomBytes(32);
    const privHex = _b2h(privBytes);
    const secp = window._secp256k1;
    const fullPub = secp.getPublicKey(privBytes, true);
    const pubHex32 = _b2h(fullPub.slice(1));

    this._peerPubHex = decoded.publicKey;
    this._peerSecret = decoded.secret;

    const relay = new WizRelay(relayUrl, privHex, 'dapp-' + decoded.secret.slice(0, 8));
    relay.setMyPub(pubHex32);
    relay.setPeerPub(decoded.publicKey);
    this._relay = relay;
    this._myPubHex = pubHex32;

    relay.onMessage((payload, senderPub) => {
      if (payload.action === WIZ_ACTION.WALLET_READY) {
        this._handleWalletReady(payload);
      } else if (payload.action === WIZ_ACTION.SIGN_TX_RESPONSE) {
        this._handleSignResponse(payload);
      } else if (payload.action === WIZ_ACTION.SIGN_CANCEL) {
        this._handleSignCancel(payload);
      } else if (payload.action === WIZ_ACTION.DISCONNECT) {
        this._handleDisconnect(payload);
      }
    });

    relay.onStatus((status) => {
      if (status === 'connected') {
        // Send proactive DappReady
        relay.send({
          action: WIZ_ACTION.DAPP_READY,
          time: Date.now(),
          supported_protocols: [WIZ_PROTOCOL],
          wallet_discovered: this._walletDiscovered,
          dapp_name: this._dappName,
          dapp_icon: this._dappIcon,
        });
      }
    });

    relay.connect();
  }

  /**
   * Handle WalletReady → store xpubs → derive addresses locally
   */
  _handleWalletReady(msg) {
    // Verify secret (MITM prevention)
    if (msg.secret !== this._peerSecret) {
      console.error('[WIZ-DAPP] secret mismatch — possible MITM');
      return;
    }

    this._walletDiscovered = true;
    this._walletName = msg.wallet_name || 'Unknown Wallet';
    this._walletIcon = msg.wallet_icon || '';
    this._connected = true;

    // Extract hdwalletv1 session
    const session = msg.session?.[WIZ_PROTOCOL];
    if (!session || !session.paths) {
      console.error('[WIZ-DAPP] no hdwalletv1 session data');
      return;
    }

    this._paths = session.paths;
    this._extensions = session.extensions || {};
    console.log('[WIZ-DAPP] connected to', this._walletName, '—', this._paths.length, 'paths',
      Object.keys(this._extensions).length ? '+ extensions: ' + Object.keys(this._extensions).join(', ') : '');

    // Derive stealth pubkeys from new-format paths (stealth_spend, stealth_scan)
    // The wallet sends xpubs at the hardened gate — dapp derives /0 locally
    const bip32Child = window._bip32ChildPub;
    const spendPath = this._paths.find(p => p.name === 'stealth_spend');
    const scanPath = this._paths.find(p => p.name === 'stealth_scan');

    if (spendPath && bip32Child) {
      const decoded = _base58CheckDecode(spendPath.xpub);
      if (decoded) {
        const child = bip32Child(decoded.slice(45, 78), decoded.slice(13, 45), 0);
        if (child) this._stealthSpendPub = child.pub;
      }
    }
    if (scanPath && bip32Child) {
      const decoded = _base58CheckDecode(scanPath.xpub);
      if (decoded) {
        const child = bip32Child(decoded.slice(45, 78), decoded.slice(13, 45), 0);
        if (child) this._stealthScanPub = child.pub;
      }
    }

    // Fallback: old format where 'stealth' was a single BIP44 child (deprecated)
    if (!this._stealthSpendPub && !this._stealthScanPub) {
      const legacyStealth = this._paths.find(p => p.name === 'stealth');
      if (legacyStealth && bip32Child) {
        const decoded = _base58CheckDecode(legacyStealth.xpub);
        if (decoded) {
          const chain = decoded.slice(13, 45);
          const pub = decoded.slice(45, 78);
          const spendChild = bip32Child(pub, chain, 0);
          const scanChild = bip32Child(pub, chain, 1);
          if (spendChild) this._stealthSpendPub = spendChild.pub;
          if (scanChild) this._stealthScanPub = scanChild.pub;
          console.log('[WIZ-DAPP] stealth derived from legacy format (deprecated)');
        }
      }
    }

    if (this._stealthSpendPub || this._stealthScanPub) {
      console.log('[WIZ-DAPP] stealth pubkeys derived ✓',
        'spend:', this._stealthSpendPub ? 'yes' : 'no',
        'scan:', this._stealthScanPub ? 'yes' : 'no');
    }

    // Derive RPA pubkeys if available
    const rpaSpendPath = this._paths.find(p => p.name === 'rpa_spend');
    const rpaScanPath = this._paths.find(p => p.name === 'rpa_scan');
    if (rpaSpendPath && bip32Child) {
      const decoded = _base58CheckDecode(rpaSpendPath.xpub);
      if (decoded) {
        const child = bip32Child(decoded.slice(45, 78), decoded.slice(13, 45), 0);
        if (child) this._rpaSpendPub = child.pub;
      }
    }
    if (rpaScanPath && bip32Child) {
      const decoded = _base58CheckDecode(rpaScanPath.xpub);
      if (decoded) {
        const child = bip32Child(decoded.slice(45, 78), decoded.slice(13, 45), 0);
        if (child) this._rpaScanPub = child.pub;
      }
    }

    // Send reactive DappReady with selected protocol
    this._relay.send({
      action: WIZ_ACTION.DAPP_READY,
      time: Date.now(),
      supported_protocols: [WIZ_PROTOCOL],
      selected_protocol: WIZ_PROTOCOL,
      wallet_discovered: true,
      dapp_name: this._dappName,
      dapp_icon: this._dappIcon,
    });

    if (this._onConnect) this._onConnect(this._walletName, this._walletIcon, this._paths);
  }

  /**
   * Derive a receive address from the wallet's xpub
   * @param {string} pathName - 'receive', 'change', 'stealth', 'defi'
   * @param {number} index - address index (0, 1, 2, ...)
   * @returns {Uint8Array|null} compressed public key (33 bytes)
   */
  derivePubkey(pathName, index) {
    const path = this._paths.find(p => p.name === pathName);
    if (!path) return null;

    const decoded = _base58CheckDecode(path.xpub);
    if (!decoded) return null;
    const chain = decoded.slice(13, 45);
    const pub = decoded.slice(45, 78);

    const bip32Child = window._bip32ChildPub;
    if (!bip32Child) return null;
    const child = bip32Child(pub, chain, index);
    return child ? child.pub : null;
  }

  /**
   * Request the wallet to sign a transaction
   * @param {object} transaction - WcSignTransactionRequest format
   * @param {Array} inputPaths - [[inputIndex, pathName, addressIndex], ...]
   * @returns {Promise<string>} signed transaction hex
   */
  requestSign(transaction, inputPaths) {
    return new Promise((resolve, reject) => {
      const seq = ++this._signSequence;
      this._pendingSignCallbacks.set(seq, { resolve, reject });

      this._relay.send({
        action: WIZ_ACTION.SIGN_TX_REQUEST,
        time: Date.now(),
        transaction,
        sequence: seq,
        inputPaths: inputPaths,
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this._pendingSignCallbacks.has(seq)) {
          this._pendingSignCallbacks.delete(seq);
          reject(new Error('Sign request timed out'));
        }
      }, 300000);
    });
  }

  _handleSignResponse(msg) {
    const cb = this._pendingSignCallbacks.get(msg.sequence);
    if (!cb) return;
    this._pendingSignCallbacks.delete(msg.sequence);
    if (msg.error) {
      cb.reject(new Error(msg.error));
    } else {
      cb.resolve(msg.signedTransaction);
    }
  }

  _handleSignCancel(msg) {
    const cb = this._pendingSignCallbacks.get(msg.sequence);
    if (!cb) return;
    this._pendingSignCallbacks.delete(msg.sequence);
    cb.reject(new Error('Sign cancelled: ' + (msg.reason || 'unknown')));
  }

  _handleDisconnect(msg) {
    console.log('[WIZ-DAPP] wallet disconnected:', msg.reason);
    this._connected = false;
    this._walletDiscovered = false;
    if (this._onDisconnect) this._onDisconnect(msg.reason);
  }

  disconnect() {
    if (this._relay) this._relay.disconnect('user_disconnect');
    this._connected = false;
  }

  // Event handlers
  onConnect(cb) { this._onConnect = cb; }
  onDisconnect(cb) { this._onDisconnect = cb; }
  isConnected() { return this._connected; }
  getWalletName() { return this._walletName; }
  getPaths() { return this._paths; }
  getStealthScanPub() { return this._stealthScanPub; }
  getStealthSpendPub() { return this._stealthSpendPub; }
  getRpaScanPub() { return this._rpaScanPub; }
  getRpaSpendPub() { return this._rpaSpendPub; }
  getExtensions() { return this._extensions; }
}

/* ══════════════════════════════════════════
   BASE58CHECK — encode/decode for xpub strings
   ══════════════════════════════════════════ */

const _B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function _base58CheckEncode(payload) {
  const sha = window._sha256;
  if (!sha) return null;
  const checksum = sha(sha(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload);
  full.set(checksum, payload.length);

  // Base58 encode
  let num = 0n;
  for (const b of full) num = num * 256n + BigInt(b);
  let str = '';
  while (num > 0n) { str = _B58_ALPHABET[Number(num % 58n)] + str; num /= 58n; }
  for (const b of full) { if (b === 0) str = '1' + str; else break; }
  return str;
}

function _base58CheckDecode(str) {
  let num = 0n;
  for (const c of str) {
    const idx = _B58_ALPHABET.indexOf(c);
    if (idx === -1) return null;
    num = num * 58n + BigInt(idx);
  }
  // Convert to bytes
  const hex = num.toString(16).padStart(164, '0'); // 82 bytes * 2
  const bytes = _h2b(hex.slice(hex.length - 164));

  // Verify checksum
  const sha = window._sha256;
  if (!sha) return null;
  const payload = bytes.slice(0, 78);
  const checksum = bytes.slice(78, 82);
  const computed = sha(sha(payload)).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== computed[i]) return null;
  }
  return payload;
}

/* ══════════════════════════════════════════
   PUBLIC API — expose on window
   ══════════════════════════════════════════ */

window.WizardConnect = Object.freeze({
  // Protocol constants
  PROTOCOL: WIZ_PROTOCOL,
  ACTION: WIZ_ACTION,
  PATH_INDEX: WIZ_PATH_INDEX,
  EXTENSIONS: WIZ_EXTENSIONS,
  DEFAULT_RELAY: WIZ_DEFAULT_RELAY,

  // URI helpers
  encodeURI: wizEncodeURI,
  decodeURI: wizDecodeURI,

  // Managers
  WalletManager: WizWalletManager,
  DappManager: WizDappManager,

  // Version
  VERSION: WIZ_VERSION,
});

console.log('[WizardConnect] v' + WIZ_VERSION + ' loaded — wallet + dapp sides ready');
