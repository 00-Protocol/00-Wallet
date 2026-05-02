(function() {
  "use strict";
  const RELAYS = ["wss://relay.riften.net", "wss://relay.cauldron.quest", "wss://relay.damus.io", "wss://nos.lol", "wss://relay.snort.social"];
  const WIZ_KIND = 24133;
  function _hex(b) {
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  function _h2b(h) {
    const a = new Uint8Array(h.length >> 1);
    for (let i = 0; i < h.length; i += 2) a[i >> 1] = parseInt(h.slice(i, i + 2), 16);
    return a;
  }
  function _rand(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }
  const _B32_CH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const _B32_GEN = [996825010, 642813549, 513874426, 1027748829, 705979059];
  function _b32Polymod(values) {
    let chk = 1;
    for (const v of values) {
      const top = chk >> 25;
      chk = (chk & 33554431) << 5 ^ v;
      for (let i = 0; i < 5; i++) if (top >> i & 1) chk ^= _B32_GEN[i];
    }
    return chk;
  }
  function _b32HrpExpand(hrp) {
    const out = [];
    for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
    out.push(0);
    for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
    return out;
  }
  function _b32CreateChecksum(hrp, data) {
    const values = _b32HrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
    const pm = _b32Polymod(values) ^ 1;
    const out = [];
    for (let i = 0; i < 6; i++) out.push(pm >> 5 * (5 - i) & 31);
    return out;
  }
  function _convertBits(data, fromBits, toBits, pad) {
    let acc = 0, bits = 0;
    const out = [];
    const maxv = (1 << toBits) - 1;
    for (const value of data) {
      if (value < 0 || value >> fromBits !== 0) return [];
      acc = acc << fromBits | value;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        out.push(acc >> bits & maxv);
      }
    }
    if (pad) {
      if (bits > 0) out.push(acc << toBits - bits & maxv);
    } else if (bits >= fromBits || acc << toBits - bits & maxv) {
      return [];
    }
    return out;
  }
  function _bech32Encode(hrp, bytes) {
    const data = _convertBits(bytes, 8, 5, true);
    const chk = _b32CreateChecksum(hrp, data);
    return hrp + "1" + data.concat(chk).map((v) => _B32_CH[v]).join("");
  }
  function _bech32Decode(s) {
    const str = String(s || "").trim().toLowerCase();
    const pos = str.lastIndexOf("1");
    if (pos < 1 || pos + 7 > str.length) return null;
    const hrp = str.slice(0, pos);
    const d = [];
    for (const c of str.slice(pos + 1)) {
      const i = _B32_CH.indexOf(c);
      if (i < 0) return null;
      d.push(i);
    }
    if (_b32Polymod(_b32HrpExpand(hrp).concat(d)) !== 1) return null;
    const raw5 = d.slice(0, -6);
    const raw8 = _convertBits(raw5, 5, 8, false);
    return { hrp, data: new Uint8Array(raw8) };
  }
  function _b32PadEncode(bytes) {
    return _convertBits(bytes, 8, 5, true).map((v) => _B32_CH[v]).join("");
  }
  function _b32PadDecode(s) {
    const str = String(s || "").trim().toLowerCase();
    if (!str) return null;
    const d = [];
    for (const c of str) {
      const i = _B32_CH.indexOf(c);
      if (i < 0) return null;
      d.push(i);
    }
    const raw8 = _convertBits(d, 5, 8, false);
    return raw8.length ? new Uint8Array(raw8) : null;
  }
  function _normalizeWizUriInput(uri) {
    let s = String(uri || "").trim();
    if (!s) return s;
    if (!/^wiz:\/\//i.test(s)) {
      try {
        const dec = decodeURIComponent(s);
        if (/^wiz:\/\//i.test(dec)) s = dec;
      } catch {
      }
    }
    if (!s.includes("?") && /%3f/i.test(s)) {
      s = s.replace(/%3f/ig, "?").replace(/%3d/ig, "=").replace(/%26/ig, "&").replace(/^WIZ:\/\//, "wiz://");
    }
    return s;
  }
  let _wcSdkPromise = null;
  function _wcSdk() {
    if (!_wcSdkPromise) _wcSdkPromise = import("./lib/wizardconnect-stack.js");
    return _wcSdkPromise;
  }
  async function _sha256bytes(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return new Uint8Array(buf);
  }
  async function _pubToCashAddr(pub33) {
    try {
      const h = await import("./lib/noble-hashes.js");
      const ca = await import("./core/cashaddr.js");
      const hash160 = h.ripemd160(h.sha256(pub33));
      return ca.pubHashToCashAddr(hash160);
    } catch {
      return "";
    }
  }
  let _secp256k1 = null;
  async function _secp() {
    if (!_secp256k1) {
      const m = await import("./lib/noble-curves.js");
      _secp256k1 = m.secp256k1;
    }
    return _secp256k1;
  }
  async function _genKeypair() {
    const secp = await _secp();
    let priv = _rand(32);
    let pub = secp.getPublicKey(priv, true);
    if (pub[0] === 3) {
      const N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
      let p = 0n;
      for (const b of priv) p = p << 8n | BigInt(b);
      p = (N - p) % N;
      priv = _h2b(p.toString(16).padStart(64, "0"));
      pub = secp.getPublicKey(priv, true);
    }
    const xonly = pub.slice(1);
    return { priv, pub, xonly, xonlyHex: _hex(xonly), pubHex: _hex(pub) };
  }
  async function _ecdh(myPriv, theirPub33Hex) {
    const secp = await _secp();
    return secp.getSharedSecret(myPriv, _h2b(theirPub33Hex)).slice(1);
  }
  async function _aesKey(keyBytes) {
    return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }
  async function _encrypt(keyBytes, obj) {
    const key = await _aesKey(keyBytes);
    const iv = _rand(12);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(obj))
    );
    const out = new Uint8Array(12 + ct.byteLength);
    out.set(iv);
    out.set(new Uint8Array(ct), 12);
    return btoa(String.fromCharCode(...out));
  }
  async function _decrypt(keyBytes, b64) {
    const key = await _aesKey(keyBytes);
    const normalized = String(b64 || "").trim().replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function _makeNostrEvent(priv, xonlyHex, kind, tags, content) {
    const secp = await _secp();
    const created_at = Math.floor(Date.now() / 1e3);
    const ser = JSON.stringify([0, xonlyHex, created_at, kind, tags, content]);
    const idBytes = await _sha256bytes(ser);
    const sig = secp.schnorr.sign(idBytes, priv);
    return { id: _hex(idBytes), pubkey: xonlyHex, created_at, kind, tags, content, sig: _hex(sig) };
  }
  function _openRelay(url, onEvent, onOpen) {
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => onOpen?.(ws);
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m[0] === "EVENT") onEvent?.(m[2]);
        } catch {
        }
      };
      ws.onerror = ws.onclose = () => {
      };
      return ws;
    } catch {
      return null;
    }
  }
  function _subscribe(ws, subId, filters) {
    if (ws?.readyState === 1) ws.send(JSON.stringify(["REQ", subId, ...filters]));
  }
  function _publish(wsList, event) {
    for (const ws of wsList) {
      try {
        if (ws?.readyState === 1) ws.send(JSON.stringify(["EVENT", event]));
      } catch {
      }
    }
  }
  class WalletManager {
    constructor() {
      this._priv = null;
      this._xonlyHex = null;
      this._pubHex = null;
      this._sessionId = null;
      this._dappPubHex = null;
      this._sharedKey = null;
      this._relays = [];
      this._subId = null;
      this._dappName = null;
      this._onConnect = null;
      this._onSignReq = null;
      this._onDisconnect = null;
      this._stealthSpendXpub = null;
      this._stealthScanXpub = null;
      this._sdkRelay = null;
      this._sdkDappMgr = null;
    }
    /** Set stealth xpubs for WizardConnect hdwalletv1 capability advertisement. Call after wallet unlock. */
    setStealthXpubs(spendXpub, scanXpub) {
      this._stealthSpendXpub = spendXpub;
      this._stealthScanXpub = scanXpub;
    }
    /** Generate a new wiz:// URI and QR code data. Call before startListening(). */
    async generateConnection() {
      try {
        if (this._sdkRelay?.cleanup) {
          try {
            this._sdkRelay.cleanup();
          } catch {
          }
        }
        const sdk = await _wcSdk();
        const relay = sdk.initiateDappRelay((payload) => {
          try {
            this._sdkDappMgr?.updateConnection(payload.client, payload.status);
          } catch {
          }
        }, { explicitRelayUrls: RELAYS });
        const mgr = new sdk.DappConnectionManager("00 Wallet", "");
        mgr.attachRelay(relay);
        mgr.on("walletready", async (msg) => {
          const walletName = msg?.wallet_name || msg?.name || "Wallet";
          const directAddr = String(msg?.bchAddr || msg?.address || msg?.bch_address || "").trim();
          const nsAddr = String(msg?.session?.addresses?.bch || "").trim();
          const listAddr = Array.isArray(msg?.addresses) && msg.addresses.length ? String(msg.addresses[0] || "").trim() : "";
          try {
            const rawPaths = Array.isArray(mgr.getSessionPaths?.()) ? mgr.getSessionPaths() : [];
            if (rawPaths.length) {
              const normName = (name) => {
                const n = String(name || "").trim().toLowerCase();
                if (n === "0" || n.includes("receive") || n.includes("external")) return "receive";
                if (n === "1" || n.includes("change") || n.includes("internal")) return "change";
                if (n === "7" || n.includes("defi") || n.includes("cauldron")) return "defi";
                return n;
              };
              const normalized = rawPaths.filter((p2) => p2 && typeof p2.xpub === "string" && p2.xpub.length > 8).map((p2) => ({ ...p2, name: normName(p2.name) }));
              if (normalized.length) {
                try {
                  mgr.restoreSessionPaths?.(normalized);
                } catch {
                }
              }
            }
          } catch {
          }
          let derivedAddr = "";
          try {
            const pub = mgr.getPubkey?.(0, 0n) || mgr.pubkeyState?.getPubkey?.(0, 0n);
            if (pub && pub.length === 33) derivedAddr = await _pubToCashAddr(pub);
          } catch {
          }
          const bchAddr = directAddr || nsAddr || listAddr || derivedAddr || "";
          this._dappName = walletName;
          this._onConnect?.({ name: walletName, bchAddr });
        });
        mgr.on("disconnect", (_reason, message) => {
          this._onDisconnect?.();
          if (message) console.warn("[WizardConnect] disconnect:", message);
        });
        this._sdkRelay = relay;
        this._sdkDappMgr = mgr;
        return { uri: relay.uri, qrUri: relay.qrUri || relay.uri };
      } catch {
      }
      const kp = await _genKeypair();
      this._priv = kp.priv;
      this._xonlyHex = kp.xonlyHex;
      this._pubHex = kp.pubHex;
      this._sessionId = _hex(_rand(8));
      const p = _b32PadEncode(kp.xonly);
      const s = _b32PadEncode(_h2b(this._sessionId));
      const uri = `wiz://?p=${p}&s=${s}`;
      const qrUri = `WIZ://%3FP%3D${p.toUpperCase()}%26S%3D${s.toUpperCase()}`;
      return { uri, qrUri };
    }
    /** Open relay connections and wait for a dapp to connect. */
    startListening() {
      if (this._sdkRelay) return;
      if (!this._sessionId) return;
      const sid = this._sessionId;
      this._subId = "wiz-" + _hex(_rand(8));
      const onEvent = async (ev) => {
        if (!ev?.content || !ev?.tags) return;
        if (!ev.tags.find((t) => t[0] === "s" && t[1] === sid)) return;
        if (!this._sharedKey) {
          if (!ev.pubkey || ev.pubkey.length !== 64) return;
          this._dappPubHex = "02" + ev.pubkey;
          try {
            this._sharedKey = await _ecdh(this._priv, this._dappPubHex);
          } catch {
            return;
          }
        }
        let payload;
        try {
          payload = await _decrypt(this._sharedKey, ev.content);
        } catch {
          return;
        }
        const isConnect = payload?.type === "connect" || payload?.action === "connect_request" || payload?.action === "dapp_ready";
        const isSignReq = payload?.type === "sign_req" || payload?.action === "sign_transaction_request" || payload?.action === "sign_request";
        const isDisconnect = payload?.type === "disconnect" || payload?.action === "disconnect_request" || payload?.action === "disconnect";
        if (isConnect) {
          this._dappName = payload.dapp_name || payload.name || "Dapp";
          this._onConnect?.({ name: this._dappName || "Dapp" });
          const paths = [];
          const extensions = {};
          if (this._stealthSpendXpub && this._stealthScanXpub) {
            paths.push({ name: "stealth_spend", xpub: this._stealthSpendXpub });
            paths.push({ name: "stealth_scan", xpub: this._stealthScanXpub });
            extensions["bch_stealth_bip352"] = {
              spend_path: "m/352'/145'/0'/0'",
              scan_path: "m/352'/145'/0'/1'"
            };
          }
          const hdwalletv1 = { paths, ...Object.keys(extensions).length ? { extensions } : {} };
          const session = { hdwalletv1 };
          const dappSaysSeenWallet = !!payload?.wallet_discovered;
          const respPayload = {
            type: "wallet_ready",
            action: "wallet_ready",
            time: Math.floor(Date.now() / 1e3),
            name: "00 Wallet",
            icon: "",
            wallet_name: "00 Wallet",
            wallet_icon: "",
            supported_protocols: ["hdwalletv1"],
            dapp_discovered: dappSaysSeenWallet,
            session,
            public_key: this._xonlyHex,
            secret: this._sessionId
          };
          const resp = await _encrypt(this._sharedKey, respPayload);
          const ev2 = await _makeNostrEvent(
            this._priv,
            this._xonlyHex,
            WIZ_KIND,
            [["s", sid], ["p", ev.pubkey]],
            resp
          );
          _publish(this._relays, ev2);
        } else if (isSignReq) {
          const norm = {
            ...payload,
            sequence: payload.sequence ?? payload.seq ?? null,
            seq: payload.seq ?? payload.sequence ?? null,
            signedTx: payload.signedTx || payload.signedTransaction || payload.tx || ""
          };
          this._onSignReq?.(norm);
        } else if (isDisconnect) {
          this._onDisconnect?.();
        }
      };
      for (const url of RELAYS) {
        const ws = _openRelay(url, onEvent, (ws2) => {
          _subscribe(ws2, this._subId, [{ kinds: [WIZ_KIND], "#s": [sid] }]);
        });
        if (ws) this._relays.push(ws);
      }
    }
    onConnect(cb) {
      this._onConnect = cb;
    }
    onSignRequest(cb) {
      this._onSignReq = cb;
    }
    onDisconnect(cb) {
      this._onDisconnect = cb;
    }
    getDappName() {
      return this._dappName;
    }
    async approveSign(seq, signedTx) {
      if (!this._sharedKey || !this._sessionId || !this._dappPubHex) return;
      const c = await _encrypt(this._sharedKey, {
        type: "sign_resp",
        action: "sign_transaction_response",
        time: Math.floor(Date.now() / 1e3),
        seq,
        sequence: seq,
        status: "ok",
        signed: signedTx,
        signedTransaction: signedTx
      });
      const ev = await _makeNostrEvent(
        this._priv,
        this._xonlyHex,
        WIZ_KIND,
        [["s", this._sessionId], ["p", this._dappPubHex.slice(2)]],
        c
      );
      _publish(this._relays, ev);
    }
    async rejectSign(seq, reason) {
      if (!this._sharedKey || !this._sessionId || !this._dappPubHex) return;
      const c = await _encrypt(this._sharedKey, {
        type: "sign_resp",
        action: "sign_transaction_response",
        time: Math.floor(Date.now() / 1e3),
        seq,
        sequence: seq,
        status: "rejected",
        reason: reason || "Rejected"
      });
      const ev = await _makeNostrEvent(
        this._priv,
        this._xonlyHex,
        WIZ_KIND,
        [["s", this._sessionId], ["p", this._dappPubHex.slice(2)]],
        c
      );
      _publish(this._relays, ev);
    }
    destroy() {
      for (const ws of this._relays) try {
        ws.close();
      } catch {
      }
      this._relays = [];
      try {
        this._sdkRelay?.cleanup?.();
      } catch {
      }
      try {
        this._sdkDappMgr?.destroy?.();
      } catch {
      }
      this._sdkRelay = null;
      this._sdkDappMgr = null;
    }
  }
  class DappManager {
    constructor(name, icon) {
      this._name = name || "Dapp";
      this._icon = icon || "";
      this._priv = null;
      this._xonlyHex = null;
      this._walletPubHex = null;
      this._sessionId = null;
      this._sharedKey = null;
      this._relays = [];
      this._subId = null;
      this._onConnect = null;
      this._onDisconnect = null;
    }
    onConnect(cb) {
      this._onConnect = cb;
    }
    onDisconnect(cb) {
      this._onDisconnect = cb;
    }
    /** Parse a wiz:// URI and connect to the wallet. */
    async connect(uri) {
      const wizUri = _normalizeWizUriInput(uri);
      let params;
      let parsed;
      try {
        parsed = new URL(wizUri.replace(/^wiz:\/\//i, "https://wiz.local/"));
        params = parsed.searchParams;
      } catch {
        throw new Error("Invalid wiz:// URI");
      }
      let walletPubRaw = (params.get("p") || params.get("ph") || "").trim();
      let sessionRaw = (params.get("s") || params.get("sh") || "").trim();
      const legacyRelay = (params.get("r") || "").trim();
      const pr = (params.get("pr") || "").trim().toLowerCase() || "wss";
      const hasAuthority = !!parsed.host && parsed.host !== "wiz.local";
      const relayUrl = legacyRelay || (hasAuthority ? `${pr}://${parsed.host}` : RELAYS[0]);
      if (!walletPubRaw || !sessionRaw) throw new Error("Missing p or s in wiz:// URI");
      const pPad = _b32PadDecode(walletPubRaw);
      if (pPad && pPad.length === 32) walletPubRaw = _hex(pPad);
      const sPad = _b32PadDecode(sessionRaw);
      if (sPad && sPad.length === 8) sessionRaw = _hex(sPad);
      if (/^npub1/i.test(walletPubRaw)) {
        const dec = _bech32Decode(walletPubRaw);
        if (!dec || dec.hrp !== "npub") throw new Error("Invalid p in wiz:// URI");
        walletPubRaw = _hex(dec.data);
      }
      if (/^nsec1/i.test(sessionRaw)) {
        const dec = _bech32Decode(sessionRaw);
        if (!dec || dec.hrp !== "nsec") throw new Error("Invalid s in wiz:// URI");
        sessionRaw = _hex(dec.data);
      }
      let walletPub = walletPubRaw.replace(/^0x/i, "");
      const sessionId = sessionRaw;
      if (walletPub.length === 64) walletPub = "02" + walletPub;
      if (walletPub.length !== 66) throw new Error("Invalid p in wiz:// URI");
      this._walletPubHex = walletPub;
      this._sessionId = sessionId;
      const kp = await _genKeypair();
      this._priv = kp.priv;
      this._xonlyHex = kp.xonlyHex;
      this._sharedKey = await _ecdh(kp.priv, walletPub);
      this._subId = "wizd-" + _hex(_rand(8));
      const onEvent = async (ev) => {
        if (!ev?.content || !ev?.tags) return;
        if (!ev.tags.find((t) => t[0] === "s" && t[1] === sessionId)) return;
        let payload;
        try {
          payload = await _decrypt(this._sharedKey, ev.content);
        } catch {
          return;
        }
        if (payload.type === "connected" || payload.type === "wallet_ready" || payload.action === "wallet_ready") {
          if (payload?.secret && String(payload.secret).toLowerCase() !== String(sessionId).toLowerCase()) return;
          const walletProtocols = Array.isArray(payload?.supported_protocols) ? payload.supported_protocols : [];
          if (walletProtocols.length && !walletProtocols.includes("hdwalletv1")) {
            this._onDisconnect?.("Protocol mismatch");
            return;
          }
          try {
            const selected = walletProtocols.includes("hdwalletv1") ? "hdwalletv1" : void 0;
            const dappReadyAck = await _encrypt(this._sharedKey, {
              action: "dapp_ready",
              type: "connect",
              supported_protocols: ["hdwalletv1"],
              selected_protocol: selected,
              wallet_discovered: true,
              dapp_name: this._name,
              dapp_icon: this._icon,
              time: Math.floor(Date.now() / 1e3),
              name: this._name,
              icon: this._icon
            });
            const evAck = await _makeNostrEvent(
              kp.priv,
              kp.xonlyHex,
              WIZ_KIND,
              [["s", sessionId], ["p", walletPub.slice(2)]],
              dappReadyAck
            );
            _publish(this._relays, evAck);
          } catch {
          }
          this._onConnect?.(
            payload.wallet_name || payload.name || "Wallet",
            payload.wallet_icon || payload.icon || "",
            payload.session?.hdwalletv1?.paths || payload.paths || []
          );
        } else if (payload.type === "disconnect" || payload.action === "disconnect" || payload.action === "disconnect_response") {
          this._onDisconnect?.(payload.reason || "Disconnected");
        }
      };
      const relayList = [relayUrl, ...RELAYS.filter((r) => r !== relayUrl)].slice(0, 3);
      for (const url of relayList) {
        const ws = _openRelay(url, onEvent, async (ws2) => {
          _subscribe(ws2, this._subId, [{ kinds: [WIZ_KIND], "#s": [sessionId] }]);
          const content = await _encrypt(this._sharedKey, {
            type: "connect",
            action: "connect_request",
            supported_protocols: ["hdwalletv1"],
            wallet_discovered: false,
            dapp_name: this._name,
            dapp_icon: this._icon,
            time: Math.floor(Date.now() / 1e3),
            name: this._name,
            icon: this._icon
          });
          const dappReady = await _encrypt(this._sharedKey, {
            action: "dapp_ready",
            type: "connect",
            supported_protocols: ["hdwalletv1"],
            wallet_discovered: false,
            dapp_name: this._name,
            dapp_icon: this._icon,
            time: Math.floor(Date.now() / 1e3),
            name: this._name,
            icon: this._icon
          });
          const walletXonly = walletPub.slice(2);
          const ev = await _makeNostrEvent(
            kp.priv,
            kp.xonlyHex,
            WIZ_KIND,
            [["s", sessionId], ["p", walletXonly]],
            content
          );
          const evReady = await _makeNostrEvent(
            kp.priv,
            kp.xonlyHex,
            WIZ_KIND,
            [["s", sessionId], ["p", walletXonly]],
            dappReady
          );
          if (ws2.readyState === 1) ws2.send(JSON.stringify(["EVENT", ev]));
          if (ws2.readyState === 1) ws2.send(JSON.stringify(["EVENT", evReady]));
        });
        if (ws) this._relays.push(ws);
      }
    }
    destroy() {
      for (const ws of this._relays) try {
        ws.close();
      } catch {
      }
      this._relays = [];
    }
  }
  if (!window.WizardConnect) {
    window.WizardConnect = {
      version: "2.0",
      _session: null,
      _listeners: [],
      isConnected() {
        return !!this._session;
      },
      onSession(fn) {
        this._listeners.push(fn);
      },
      _setSession(s) {
        this._session = s;
        this._listeners.forEach((fn) => {
          try {
            fn(s);
          } catch {
          }
        });
      }
    };
  }
  window.WizardConnect.WalletManager = WalletManager;
  window.WizardConnect.DappManager = DappManager;
})();
