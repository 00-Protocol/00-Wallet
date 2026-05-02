import { sha256 } from "../lib/noble-hashes.js";
import { secp256k1 } from "../lib/noble-curves.js";
import { deriveBchPriv, deriveStealth, deriveStealthXpubs, bip32Child, bip32ChildPub } from "./hd.js";
import { pubHashToCashAddr, cashAddrToHash20 } from "./cashaddr.js";
import { b2h, h2b, utf8, rand } from "./utils.js";
import { ripemd160 } from "../lib/noble-hashes.js";
function _cashAddrToHash20Safe(addr) {
  try {
    return cashAddrToHash20(addr);
  } catch {
    const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const raw = (addr || "").toLowerCase().replace(/^bitcoincash:/, "");
    const data = [];
    for (const c of raw) {
      const v = alphabet.indexOf(c);
      if (v === -1) throw new Error("invalid cashaddr character: " + c);
      data.push(v);
    }
    const payload = data.slice(0, -8);
    const bytes = [];
    let acc = 0;
    let bits = 0;
    for (const v of payload) {
      acc = acc << 5 | v;
      bits += 5;
      while (bits >= 8) {
        bits -= 8;
        bytes.push(acc >> bits & 255);
      }
    }
    return new Uint8Array(bytes.slice(1, 21));
  }
}
let _keys = null;
let _profile = null;
let _password = null;
let _listeners = /* @__PURE__ */ new Set();
const SESSION_TTL = 30 * 60 * 1e3;
async function _importFirst(urls) {
  let lastErr = null;
  for (const u of urls) {
    try {
      return await import(u);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Failed to load remote module");
}
async function _loadScript(src) {
  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing) {
      if (existing._loaded) return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Script load failed: " + src)), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.setAttribute("data-src", src);
    s.onload = () => {
      s._loaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error("Script load failed: " + src));
    document.head.appendChild(s);
  });
}
async function _pbkdf2Key(password, salt) {
  const km = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 2e5 },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
async function decryptVault(vaultStr, password) {
  const { salt, iv, data } = JSON.parse(vaultStr);
  const key = await _pbkdf2Key(password, h2b(salt));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: h2b(iv) }, key, h2b(data));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function encryptVault(profile, password) {
  const salt = rand(16);
  const iv = rand(12);
  const key = await _pbkdf2Key(password, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8(JSON.stringify(profile)));
  return JSON.stringify({ v: 1, salt: b2h(salt), iv: b2h(iv), data: b2h(new Uint8Array(ct)) });
}
async function _deriveKeys(profile) {
  let privKey, acctPriv = null, acctChain = null;
  const seedHex = profile.seed || profile.seedHex;
  if (seedHex) {
    const seed64 = h2b(seedHex);
    const bch = deriveBchPriv(seed64);
    privKey = bch.priv;
    acctPriv = bch.acctPriv;
    acctChain = bch.acctChain;
  } else if (profile.bchPrivHex) {
    privKey = h2b(profile.bchPrivHex);
    acctPriv = profile.acctPrivHex ? h2b(profile.acctPrivHex) : null;
    acctChain = profile.acctChainHex ? h2b(profile.acctChainHex) : null;
  } else if (profile.wif || profile.priv) {
    privKey = h2b(profile.priv || profile.wif);
    acctPriv = null;
    acctChain = null;
  }
  if (!privKey) return null;
  const pubKey = secp256k1.getPublicKey(privKey, true);
  const hash160 = ripemd160(sha256(pubKey));
  const bchAddr = pubHashToCashAddr(hash160);
  const sessionPriv = rand(32);
  const sessionPub = b2h(secp256k1.getPublicKey(sessionPriv, true));
  let stealthSpendPriv = null, stealthSpendPub = null;
  let stealthScanPriv = null, stealthScanPub = null;
  let stealthCode = null;
  let stealthSpendXpub = null;
  let stealthScanXpub = null;
  if (seedHex) {
    const seed64 = h2b(seedHex);
    const stealth = deriveStealth(seed64);
    stealthSpendPriv = stealth.spendPriv;
    stealthSpendPub = stealth.spendPub;
    stealthScanPriv = stealth.scanPriv;
    stealthScanPub = stealth.scanPub;
    stealthCode = "stealth:" + b2h(stealth.scanPub) + b2h(stealth.spendPub);
    const xpubs = deriveStealthXpubs(seed64);
    stealthSpendXpub = xpubs.spendXpub;
    stealthScanXpub = xpubs.scanXpub;
  }
  let xmrKeys = null;
  if (acctPriv && acctChain) {
    try {
      const { deriveXmrKeys } = await import("./xmr-keys.js");
      xmrKeys = deriveXmrKeys(acctPriv, acctChain, (priv, chain, idx) => bip32Child(priv, chain, idx, false));
    } catch (e) {
      console.warn("[auth] XMR key derivation failed:", e.message);
    }
  }
  return {
    privKey,
    pubKey,
    hash160,
    bchAddr,
    acctPriv,
    acctChain,
    sessionPriv,
    sessionPub,
    stealthSpendPriv,
    stealthSpendPub,
    stealthScanPriv,
    stealthScanPub,
    stealthCode,
    stealthSpendXpub,
    stealthScanXpub,
    xmr: xmrKeys
  };
}
function isConnected() {
  return !!(localStorage.getItem("00_wif") || localStorage.getItem("00_pub") || localStorage.getItem("00_ledger") || localStorage.getItem("00wallet_vault") || localStorage.getItem("00_wc_session") || localStorage.getItem("00_wiz_session") || localStorage.getItem("00_session_auth"));
}
function isUnlocked() {
  return _keys !== null;
}
async function unlock(password) {
  const vault = localStorage.getItem("00wallet_vault");
  if (!vault) throw new Error("No wallet vault found");
  const profile = await decryptVault(vault, password);
  _profile = profile;
  _password = password;
  _keys = await _deriveKeys(profile);
  if (!_keys) throw new Error("Failed to derive keys from profile");
  localStorage.setItem("00_session_auth", JSON.stringify({
    p: btoa(password),
    ts: Date.now()
  }));
  for (const cb of _listeners) {
    try {
      cb("unlock", _keys);
    } catch (e) {
      console.error("[auth] listener error:", e);
    }
  }
  return _keys;
}
async function tryAutoUnlock() {
  const vault = localStorage.getItem("00wallet_vault");
  if (!vault) return false;
  try {
    const sess = JSON.parse(localStorage.getItem("00_session_auth") || "{}");
    if (sess.p && sess.ts && Date.now() - sess.ts < SESSION_TTL) {
      const pass = atob(sess.p);
      await unlock(pass);
      return true;
    }
  } catch {
  }
  return false;
}
function refreshSession() {
  try {
    const sess = JSON.parse(localStorage.getItem("00_session_auth") || "{}");
    if (sess.p) {
      localStorage.setItem("00_session_auth", JSON.stringify({ p: sess.p, ts: Date.now() }));
    }
  } catch {
  }
}
function getKeys() {
  return _keys;
}
function getProfile() {
  return _profile;
}
function getPassword() {
  return _password;
}
let _ledgerDevice = null;
let _ledgerAddresses = [];
let _ledgerChangePath = null;
let _ledgerChangeHash160 = null;
let _ledgerChangePub33 = null;
function isLedger() {
  return !!_ledgerDevice;
}
function getLedgerDevice() {
  return _ledgerDevice;
}
function getLedgerAddresses() {
  return _ledgerAddresses;
}
function getLedgerChangePath() {
  return _ledgerChangePath;
}
function getLedgerChangeHash160() {
  return _ledgerChangeHash160;
}
async function connectLedger(onProgress) {
  if (!window.Ledger) throw new Error("Ledger module not loaded");
  const L = window.Ledger;
  onProgress?.("Connecting to Ledger...");
  const device = await L.connectLedger();
  onProgress?.("Reading account xpub...");
  const { pubKey: rawAcct, chainCode: acctChain } = await L.getLedgerPubKey(device, L.ACCOUNT_PATH);
  const acctPub = rawAcct.length === 65 ? new Uint8Array([rawAcct[64] & 1 ? 3 : 2, ...rawAcct.slice(1, 33)]) : rawAcct;
  _ledgerDevice = device;
  _ledgerAddresses = [];
  onProgress?.("Scanning addresses...");
  for (const changeIdx of [0, 1]) {
    const changeKey = bip32ChildPub(acctPub, acctChain, changeIdx);
    let gap = 0;
    for (let i = 0; i < 50 && gap < 20; i++) {
      const child = bip32ChildPub(changeKey.pub, changeKey.chain, i);
      const h160 = ripemd160(sha256(child.pub));
      const addr = pubHashToCashAddr(h160);
      const script = new Uint8Array([118, 169, 20, ...h160, 136, 172]);
      const sh = Array.from(sha256(script)).reverse().map((b) => b.toString(16).padStart(2, "0")).join("");
      try {
        const hist = await window._fvCall("blockchain.scripthash.get_history", [sh]) || [];
        const utxos = await window._fvCall("blockchain.scripthash.listunspent", [sh]) || [];
        const path5 = _ledgerPath(changeIdx, i);
        if (hist.length > 0 || utxos.length > 0) {
          _ledgerAddresses.push({ pubKey: child.pub, addr, path5 });
          gap = 0;
        } else {
          gap++;
        }
      } catch {
        gap++;
      }
    }
  }
  if (_ledgerAddresses.length === 0) {
    const firstChild = bip32ChildPub(bip32ChildPub(acctPub, acctChain, 0).pub, bip32ChildPub(acctPub, acctChain, 0).chain, 0);
    const h160 = ripemd160(sha256(firstChild.pub));
    _ledgerAddresses.push({
      pubKey: firstChild.pub,
      addr: pubHashToCashAddr(h160),
      path5: _ledgerPath(0, 0)
    });
  }
  const primary = _ledgerAddresses.find((a) => a.path5[3] === 0) || _ledgerAddresses[0];
  const usedChg1 = _ledgerAddresses.filter((a) => a.path5[3] === 1);
  const nextChgIdx = usedChg1.length > 0 ? Math.max(...usedChg1.map((a) => a.path5[4])) + 1 : 0;
  const chgLvl = bip32ChildPub(acctPub, acctChain, 1);
  const chgChild = bip32ChildPub(chgLvl.pub, chgLvl.chain, nextChgIdx);
  const chgH160 = ripemd160(sha256(chgChild.pub));
  const chgPath = _ledgerPath(1, nextChgIdx);
  _ledgerChangeHash160 = chgH160;
  _ledgerChangePub33 = chgChild.pub;
  _ledgerChangePath = chgPath;
  _keys = {
    privKey: null,
    // No private key — Ledger signs
    pubKey: primary.pubKey,
    hash160: ripemd160(sha256(primary.pubKey)),
    bchAddr: primary.addr,
    acctPriv: null,
    acctChain,
    sessionPriv: rand(32),
    sessionPub: b2h(secp256k1.getPublicKey(rand(32), true)),
    stealthSpendPriv: null,
    stealthSpendPub: null,
    stealthScanPriv: null,
    stealthScanPub: null,
    stealthCode: null,
    stealthSpendXpub: null,
    stealthScanXpub: null,
    ledger: true
    // Flag for send flow
  };
  _profile = { type: "ledger" };
  const { set } = await import("./state.js");
  set("hdAddresses", _ledgerAddresses.map((a) => ({ addr: a.addr, branch: a.path5[3], index: a.path5[4] })));
  set("hdChangeAddr", pubHashToCashAddr(chgH160));
  _notifyListeners();
  onProgress?.(`Connected \u2014 ${_ledgerAddresses.length} addresses found`);
  return { addr: primary.addr, addressCount: _ledgerAddresses.length };
}
async function ledgerSignTx(utxos, outputs) {
  if (!_ledgerDevice) throw new Error("No Ledger connected");
  const L = window.Ledger;
  const scripts = utxos.map((u) => {
    const la = _ledgerAddresses.find((a) => a.addr === u.addr);
    if (!la) {
      const h2 = ripemd160(sha256(_ledgerAddresses[0].pubKey));
      return new Uint8Array([118, 169, 20, ...h2, 136, 172]);
    }
    const h = ripemd160(sha256(la.pubKey));
    return new Uint8Array([118, 169, 20, ...h, 136, 172]);
  });
  const paths = utxos.map((u) => {
    const la = _ledgerAddresses.find((a) => a.addr === u.addr);
    return la ? la.path5 : L.BCH_PATH;
  });
  const pubKeys = utxos.map((u) => {
    const la = _ledgerAddresses.find((a) => a.addr === u.addr);
    return la ? la.pubKey : _ledgerAddresses[0].pubKey;
  });
  const sigs = await L.signLedgerTx(_ledgerDevice, utxos, outputs, scripts, paths);
  return L.buildLedgerTx(utxos, sigs, pubKeys, outputs);
}
function _ledgerPath(changeIdx, addrIdx) {
  return [2147483692, 2147483793, 2147483648, changeIdx, addrIdx];
}
let _wcClient = null, _wcSession = null;
const WC_PROJECT_ID = "082bda1ddb7c62dc3aee194b5e8dc8f9";
const WC_REQUIRED_NAMESPACES = {
  bch: { chains: ["bch:bitcoincash"], methods: ["bch_getAddresses", "bch_signTransaction", "bch_signMessage"], events: ["addressesChanged"] }
};
function isWalletConnect() {
  return !!_wcSession;
}
function isWizardConnect() {
  return !!_keys?.wizardConnect || !!localStorage.getItem("00_wiz_session");
}
function getWcClient() {
  return _wcClient;
}
function getWcSession() {
  return _wcSession;
}
async function _finishWcSession(client, session) {
  _wcSession = session;
  const addresses = await client.request({ chainId: "bch:bitcoincash", topic: _wcSession.topic, request: { method: "bch_getAddresses", params: {} } });
  const bchAddr = addresses[0];
  _wcSubEvents(client);
  localStorage.setItem("00_wc_session", "true");
  const sp = rand(32);
  _keys = { privKey: null, pubKey: null, hash160: _cashAddrToHash20Safe(bchAddr), bchAddr, acctPriv: null, acctChain: null, sessionPriv: sp, sessionPub: b2h(secp256k1.getPublicKey(sp, true)), stealthSpendPriv: null, stealthSpendPub: null, stealthScanPriv: null, stealthScanPub: null, stealthCode: null, stealthSpendXpub: null, stealthScanXpub: null, walletConnect: true };
  _profile = { type: "walletconnect" };
  _notifyListeners();
  return { addr: bchAddr };
}
async function _initWC() {
  if (_wcClient) return _wcClient;
  const mod = await _importFirst([
    "https://esm.sh/@walletconnect/sign-client@2.17.5",
    "https://cdn.jsdelivr.net/npm/@walletconnect/sign-client@2.17.5/+esm"
  ]);
  const SC = mod.SignClient || mod.default;
  _wcClient = await SC.init({
    projectId: WC_PROJECT_ID,
    metadata: { name: "BCH Stealth Wallet", description: "BCH Self-Custody", url: "https://0penw0rld.com", icons: ["https://0penw0rld.com/icons/icon-180.png"] }
  });
  return _wcClient;
}
async function connectWalletConnect(onUri, onProgress) {
  onProgress?.("Loading WalletConnect SDK...");
  const client = await _initWC();
  onProgress?.("Pairing...");
  const { uri, approval } = await client.connect({
    requiredNamespaces: WC_REQUIRED_NAMESPACES
  });
  if (uri) onUri?.(uri);
  const session = await approval();
  return _finishWcSession(client, session);
}
async function connectWalletConnectWithUri(uri, onProgress) {
  if (!uri || !uri.startsWith("wc:")) throw new Error("Invalid WalletConnect URI");
  onProgress?.("Loading WalletConnect SDK...");
  const client = await _initWC();
  onProgress?.("Pairing URI...");
  await client.pair({ uri });
  const topic = (uri.match(/^wc:([^@]+)@/) || [])[1];
  onProgress?.("Creating session...");
  const { approval } = await client.connect({
    pairingTopic: topic,
    requiredNamespaces: WC_REQUIRED_NAMESPACES
  });
  const session = await approval();
  return _finishWcSession(client, session);
}
async function restoreWcSession() {
  if (!localStorage.getItem("00_wc_session")) return false;
  try {
    const client = await _initWC();
    if (!client.session.length) {
      localStorage.removeItem("00_wc_session");
      return false;
    }
    const key = client.session.keys[client.session.keys.length - 1];
    _wcSession = client.session.get(key);
    const addrs = await client.request({ chainId: "bch:bitcoincash", topic: _wcSession.topic, request: { method: "bch_getAddresses", params: {} } });
    const bchAddr = addrs[0];
    const sp = rand(32);
    _keys = { privKey: null, pubKey: null, hash160: _cashAddrToHash20Safe(bchAddr), bchAddr, acctPriv: null, acctChain: null, sessionPriv: sp, sessionPub: b2h(secp256k1.getPublicKey(sp, true)), stealthSpendPriv: null, stealthSpendPub: null, stealthScanPriv: null, stealthScanPub: null, stealthCode: null, stealthSpendXpub: null, stealthScanXpub: null, walletConnect: true };
    _profile = { type: "walletconnect" };
    _wcSubEvents(client);
    _notifyListeners();
    return true;
  } catch {
    localStorage.removeItem("00_wc_session");
    return false;
  }
}
function connectWizardSession(meta) {
  const persistedRaw = localStorage.getItem("00_wiz_session") || "{}";
  let persistedAddr = "";
  try {
    persistedAddr = (JSON.parse(persistedRaw)?.bchAddr || "").trim();
  } catch {
  }
  const bchAddr = (meta?.bchAddr || _keys?.bchAddr || persistedAddr || "").trim();
  const sp = rand(32);
  let hash160 = null;
  if (bchAddr) {
    try {
      hash160 = _cashAddrToHash20Safe(bchAddr);
    } catch {
      hash160 = null;
    }
  }
  if (_keys) {
    _keys = {
      ..._keys,
      hash160: _keys.hash160 || hash160,
      bchAddr: _keys.bchAddr || bchAddr,
      sessionPriv: _keys.sessionPriv || sp,
      sessionPub: _keys.sessionPub || b2h(secp256k1.getPublicKey(sp, true)),
      wizardConnect: true
    };
  } else {
    _keys = {
      privKey: null,
      pubKey: null,
      hash160,
      bchAddr,
      acctPriv: null,
      acctChain: null,
      sessionPriv: sp,
      sessionPub: b2h(secp256k1.getPublicKey(sp, true)),
      stealthSpendPriv: null,
      stealthSpendPub: null,
      stealthScanPriv: null,
      stealthScanPub: null,
      stealthCode: null,
      stealthSpendXpub: null,
      stealthScanXpub: null,
      wizardConnect: true
    };
    _profile = { type: "wizardconnect" };
  }
  localStorage.setItem("00_wiz_session", JSON.stringify({
    bchAddr: _keys.bchAddr || bchAddr,
    label: meta?.label || "",
    ts: Date.now()
  }));
  _notifyListeners();
  return { addr: _keys.bchAddr || bchAddr };
}
function restoreExternalSession() {
  if (localStorage.getItem("00_wc_session")) {
    return restoreWcSession();
  }
  const raw = localStorage.getItem("00_wiz_session");
  if (!raw) return Promise.resolve(false);
  try {
    const meta = JSON.parse(raw || "{}");
    connectWizardSession({ bchAddr: meta?.bchAddr || "", label: meta?.label || "" });
    return Promise.resolve(true);
  } catch {
    localStorage.removeItem("00_wiz_session");
    return Promise.resolve(false);
  }
}
async function wcSignTx(unsignedHex, sourceOutputs, userPrompt) {
  if (!_wcClient || !_wcSession) throw new Error("WalletConnect not connected");
  const r = await _wcClient.request({ chainId: "bch:bitcoincash", topic: _wcSession.topic, request: { method: "bch_signTransaction", params: { transaction: unsignedHex, sourceOutputs, broadcast: false, userPrompt } } });
  if (!r?.signedTransaction) throw new Error("Signing rejected");
  return r.signedTransaction;
}
async function wcDisconnect() {
  if (_wcClient && _wcSession) {
    try {
      await _wcClient.disconnect({ topic: _wcSession.topic, reason: { code: 6e3, message: "USER_DISCONNECTED" } });
    } catch {
    }
  }
  _wcSession = null;
  _wcClient = null;
  _keys = null;
  _profile = null;
  localStorage.removeItem("00_wc_session");
  _notifyListeners();
}
function wizDisconnect() {
  localStorage.removeItem("00_wiz_session");
  if (_keys?.wizardConnect) {
    _keys = null;
    _profile = null;
    _notifyListeners();
  }
}
async function connectTrezor(onProgress) {
  onProgress?.("Loading Trezor SDK...");
  if (!window.TrezorConnect) {
    await _loadScript("https://connect.trezor.io/9/trezor-connect.js");
  }
  const T = window.TrezorConnect;
  if (!T) throw new Error("Trezor SDK unavailable");
  if (T?.init) {
    await T.init({
      lazyLoad: true,
      popup: true,
      manifest: {
        email: "support@0penw0rld.com",
        appUrl: "https://0penw0rld.com"
      }
    });
  }
  onProgress?.("Confirm on Trezor...");
  const r = await T.getAddress({
    path: "m/44'/145'/0'/0/0",
    coin: "bch",
    showOnTrezor: true
  });
  if (!r?.success) {
    const msg = r?.payload?.error || "Trezor connection failed";
    throw new Error(msg);
  }
  const bchAddr = r.payload.address;
  const sp = rand(32);
  _keys = {
    privKey: null,
    pubKey: null,
    hash160: _cashAddrToHash20Safe(bchAddr),
    bchAddr,
    acctPriv: null,
    acctChain: null,
    sessionPriv: sp,
    sessionPub: b2h(secp256k1.getPublicKey(sp, true)),
    stealthSpendPriv: null,
    stealthSpendPub: null,
    stealthScanPriv: null,
    stealthScanPub: null,
    stealthCode: null,
    stealthSpendXpub: null,
    stealthScanXpub: null,
    trezor: true
  };
  _profile = { type: "trezor" };
  _notifyListeners();
  return { addr: bchAddr };
}
function _notifyListeners() {
  for (const cb of _listeners) {
    try {
      cb(_keys ? "unlock" : "disconnect", _keys);
    } catch {
    }
  }
}
function _wcSubEvents(client) {
  client.on("session_delete", () => {
    _wcSession = null;
    _keys = null;
    _profile = null;
    localStorage.removeItem("00_wc_session");
    _notifyListeners();
  });
  client.on("session_event", (args) => {
    if (args.params?.event?.name === "addressesChanged" && _keys) {
      _keys.bchAddr = args.params.event.data[0];
      _keys.hash160 = _cashAddrToHash20Safe(_keys.bchAddr);
      _notifyListeners();
    }
  });
}
function lock() {
  _keys = null;
  _profile = null;
  _password = null;
  localStorage.removeItem("00_session_auth");
  for (const cb of _listeners) {
    try {
      cb("lock", null);
    } catch (e) {
    }
  }
}
function disconnect() {
  lock();
  const keysToKeep = ["00_theme", "00_lang", "00_ep_fulcrum", "00_ep_btc_electrum", "00_ep_relays"];
  const allKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("00") && !keysToKeep.includes(k)) allKeys.push(k);
  }
  allKeys.forEach((k) => localStorage.removeItem(k));
  for (const cb of _listeners) {
    try {
      cb("disconnect", null);
    } catch (e) {
    }
  }
}
function onAuth(callback) {
  _listeners.add(callback);
  return () => _listeners.delete(callback);
}
async function createVault(profile, password) {
  const vaultB64 = await encryptVault(profile, password);
  localStorage.setItem("00wallet_vault", vaultB64);
  localStorage.setItem("00_session_auth", JSON.stringify({ p: btoa(password), ts: Date.now() }));
  _profile = profile;
  _password = password;
  _keys = await _deriveKeys(profile);
  for (const cb of _listeners) {
    try {
      cb("unlock", _keys);
    } catch (e) {
    }
  }
  return _keys;
}
export {
  connectLedger,
  connectTrezor,
  connectWalletConnect,
  connectWalletConnectWithUri,
  connectWizardSession,
  createVault,
  decryptVault,
  disconnect,
  encryptVault,
  getKeys,
  getLedgerAddresses,
  getLedgerChangeHash160,
  getLedgerChangePath,
  getLedgerDevice,
  getPassword,
  getProfile,
  getWcClient,
  getWcSession,
  isConnected,
  isLedger,
  isUnlocked,
  isWalletConnect,
  isWizardConnect,
  ledgerSignTx,
  lock,
  onAuth,
  refreshSession,
  restoreExternalSession,
  restoreWcSession,
  tryAutoUnlock,
  unlock,
  wcDisconnect,
  wcSignTx,
  wizDisconnect
};
