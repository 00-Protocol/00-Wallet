var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod2) => function __require() {
  return mod2 || (0, cb[__getOwnPropNames(cb)[0]])((mod2 = { exports: {} }).exports, mod2), mod2.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod2, isNodeMode, target) => (target = mod2 != null ? __create(__getProtoOf(mod2)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod2 || !mod2.__esModule ? __defProp(target, "default", { value: mod2, enumerable: true }) : target,
  mod2
));

// node_modules/eventemitter3/index.js
var require_eventemitter3 = __commonJS({
  "node_modules/eventemitter3/index.js"(exports, module) {
    "use strict";
    var has = Object.prototype.hasOwnProperty;
    var prefix = "~";
    function Events() {
    }
    if (Object.create) {
      Events.prototype = /* @__PURE__ */ Object.create(null);
      if (!new Events().__proto__) prefix = false;
    }
    function EE(fn, context, once) {
      this.fn = fn;
      this.context = context;
      this.once = once || false;
    }
    function addListener(emitter, event, fn, context, once) {
      if (typeof fn !== "function") {
        throw new TypeError("The listener must be a function");
      }
      var listener = new EE(fn, context || emitter, once), evt = prefix ? prefix + event : event;
      if (!emitter._events[evt]) emitter._events[evt] = listener, emitter._eventsCount++;
      else if (!emitter._events[evt].fn) emitter._events[evt].push(listener);
      else emitter._events[evt] = [emitter._events[evt], listener];
      return emitter;
    }
    function clearEvent(emitter, evt) {
      if (--emitter._eventsCount === 0) emitter._events = new Events();
      else delete emitter._events[evt];
    }
    function EventEmitter2() {
      this._events = new Events();
      this._eventsCount = 0;
    }
    EventEmitter2.prototype.eventNames = function eventNames() {
      var names = [], events, name;
      if (this._eventsCount === 0) return names;
      for (name in events = this._events) {
        if (has.call(events, name)) names.push(prefix ? name.slice(1) : name);
      }
      if (Object.getOwnPropertySymbols) {
        return names.concat(Object.getOwnPropertySymbols(events));
      }
      return names;
    };
    EventEmitter2.prototype.listeners = function listeners(event) {
      var evt = prefix ? prefix + event : event, handlers = this._events[evt];
      if (!handlers) return [];
      if (handlers.fn) return [handlers.fn];
      for (var i3 = 0, l = handlers.length, ee = new Array(l); i3 < l; i3++) {
        ee[i3] = handlers[i3].fn;
      }
      return ee;
    };
    EventEmitter2.prototype.listenerCount = function listenerCount(event) {
      var evt = prefix ? prefix + event : event, listeners = this._events[evt];
      if (!listeners) return 0;
      if (listeners.fn) return 1;
      return listeners.length;
    };
    EventEmitter2.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt]) return false;
      var listeners = this._events[evt], len = arguments.length, args, i3;
      if (listeners.fn) {
        if (listeners.once) this.removeListener(event, listeners.fn, void 0, true);
        switch (len) {
          case 1:
            return listeners.fn.call(listeners.context), true;
          case 2:
            return listeners.fn.call(listeners.context, a1), true;
          case 3:
            return listeners.fn.call(listeners.context, a1, a2), true;
          case 4:
            return listeners.fn.call(listeners.context, a1, a2, a3), true;
          case 5:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
          case 6:
            return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
        }
        for (i3 = 1, args = new Array(len - 1); i3 < len; i3++) {
          args[i3 - 1] = arguments[i3];
        }
        listeners.fn.apply(listeners.context, args);
      } else {
        var length = listeners.length, j;
        for (i3 = 0; i3 < length; i3++) {
          if (listeners[i3].once) this.removeListener(event, listeners[i3].fn, void 0, true);
          switch (len) {
            case 1:
              listeners[i3].fn.call(listeners[i3].context);
              break;
            case 2:
              listeners[i3].fn.call(listeners[i3].context, a1);
              break;
            case 3:
              listeners[i3].fn.call(listeners[i3].context, a1, a2);
              break;
            case 4:
              listeners[i3].fn.call(listeners[i3].context, a1, a2, a3);
              break;
            default:
              if (!args) for (j = 1, args = new Array(len - 1); j < len; j++) {
                args[j - 1] = arguments[j];
              }
              listeners[i3].fn.apply(listeners[i3].context, args);
          }
        }
      }
      return true;
    };
    EventEmitter2.prototype.on = function on(event, fn, context) {
      return addListener(this, event, fn, context, false);
    };
    EventEmitter2.prototype.once = function once(event, fn, context) {
      return addListener(this, event, fn, context, true);
    };
    EventEmitter2.prototype.removeListener = function removeListener(event, fn, context, once) {
      var evt = prefix ? prefix + event : event;
      if (!this._events[evt]) return this;
      if (!fn) {
        clearEvent(this, evt);
        return this;
      }
      var listeners = this._events[evt];
      if (listeners.fn) {
        if (listeners.fn === fn && (!once || listeners.once) && (!context || listeners.context === context)) {
          clearEvent(this, evt);
        }
      } else {
        for (var i3 = 0, events = [], length = listeners.length; i3 < length; i3++) {
          if (listeners[i3].fn !== fn || once && !listeners[i3].once || context && listeners[i3].context !== context) {
            events.push(listeners[i3]);
          }
        }
        if (events.length) this._events[evt] = events.length === 1 ? events[0] : events;
        else clearEvent(this, evt);
      }
      return this;
    };
    EventEmitter2.prototype.removeAllListeners = function removeAllListeners(event) {
      var evt;
      if (event) {
        evt = prefix ? prefix + event : event;
        if (this._events[evt]) clearEvent(this, evt);
      } else {
        this._events = new Events();
        this._eventsCount = 0;
      }
      return this;
    };
    EventEmitter2.prototype.off = EventEmitter2.prototype.removeListener;
    EventEmitter2.prototype.addListener = EventEmitter2.prototype.on;
    EventEmitter2.prefixed = prefix;
    EventEmitter2.EventEmitter = EventEmitter2;
    if ("undefined" !== typeof module) {
      module.exports = EventEmitter2;
    }
  }
});

// node_modules/@wizardconnect/core/dist/primitives.js
var throwUnless = (x, what) => {
  if (!x) {
    throw Error(`Internal application error: ${what}`);
  }
};
function unwrap(value) {
  if (typeof value === "string") {
    throw new Error(`unwrap: ${value}`);
  }
  if (value instanceof Error) {
    throw value;
  }
  return value;
}

// node_modules/nostr-tools/node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function anumber(n, title = "") {
  if (!Number.isSafeInteger(n) || n < 0) {
    const prefix = title && `"${title}" `;
    throw new Error(`${prefix}expected integer >= 0, got ${n}`);
  }
}
function abytes(value, length, title = "") {
  const bytes = isBytes(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
}
function ahash(h) {
  if (typeof h !== "function" || typeof h.create !== "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  anumber(h.outputLen);
  anumber(h.blockLen);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "digestInto() output");
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error('"digestInto() output" expected to be of length >=' + min);
  }
}
function clean(...arrays) {
  for (let i3 = 0; i3 < arrays.length; i3++) {
    arrays[i3].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
var hasHexBuiltin = /* @__PURE__ */ (() => (
  // @ts-ignore
  typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
))();
var hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i3) => i3.toString(16).padStart(2, "0"));
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i3 = 0; i3 < bytes.length; i3++) {
    hex += hexes[bytes[i3]];
  }
  return hex;
}
var asciis = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function asciiToBase16(ch) {
  if (ch >= asciis._0 && ch <= asciis._9)
    return ch - asciis._0;
  if (ch >= asciis.A && ch <= asciis.F)
    return ch - (asciis.A - 10);
  if (ch >= asciis.a && ch <= asciis.f)
    return ch - (asciis.a - 10);
  return;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  if (hasHexBuiltin)
    return Uint8Array.fromHex(hex);
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new Error("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new Error('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i3 = 0; i3 < arrays.length; i3++) {
    const a = arrays[i3];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i3 = 0, pad2 = 0; i3 < arrays.length; i3++) {
    const a = arrays[i3];
    res.set(a, pad2);
    pad2 += a.length;
  }
  return res;
}
function createHasher(hashCons, info = {}) {
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
function randomBytes(bytesLength = 32) {
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  return cr.getRandomValues(new Uint8Array(bytesLength));
}
var oidNist = (suffix) => ({
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
});

// node_modules/nostr-tools/node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class {
  blockLen;
  outputLen;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = false;
  length = 0;
  pos = 0;
  destroyed = false;
  constructor(blockLen, outputLen, padOffset, isLE2) {
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE2;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE: isLE2 } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i3 = pos; i3 < blockLen; i3++)
      buffer[i3] = 0;
    view.setBigUint64(blockLen - 8, BigInt(this.length * 8), isLE2);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i3 = 0; i3 < outLen; i3++)
      oview.setUint32(4 * i3, state[i3], isLE2);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to ||= new this.constructor();
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/nostr-tools/node_modules/@noble/hashes/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA2_32B = class extends HashMD {
  constructor(outputLen) {
    super(64, outputLen, 8, false);
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i3 = 0; i3 < 16; i3++, offset += 4)
      SHA256_W[i3] = view.getUint32(offset, false);
    for (let i3 = 16; i3 < 64; i3++) {
      const W15 = SHA256_W[i3 - 15];
      const W2 = SHA256_W[i3 - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i3] = s1 + SHA256_W[i3 - 7] + s0 + SHA256_W[i3 - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i3 = 0; i3 < 64; i3++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i3] + SHA256_W[i3] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var _SHA256 = class extends SHA2_32B {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = SHA256_IV[0] | 0;
  B = SHA256_IV[1] | 0;
  C = SHA256_IV[2] | 0;
  D = SHA256_IV[3] | 0;
  E = SHA256_IV[4] | 0;
  F = SHA256_IV[5] | 0;
  G = SHA256_IV[6] | 0;
  H = SHA256_IV[7] | 0;
  constructor() {
    super(32);
  }
};
var sha256 = /* @__PURE__ */ createHasher(
  () => new _SHA256(),
  /* @__PURE__ */ oidNist(1)
);

// node_modules/nostr-tools/node_modules/@noble/curves/utils.js
var _0n = /* @__PURE__ */ BigInt(0);
var _1n = /* @__PURE__ */ BigInt(1);
function abool(value, title = "") {
  if (typeof value !== "boolean") {
    const prefix = title && `"${title}" `;
    throw new Error(prefix + "expected boolean, got type=" + typeof value);
  }
  return value;
}
function abignumber(n) {
  if (typeof n === "bigint") {
    if (!isPosBig(n))
      throw new Error("positive bigint expected, got " + n);
  } else
    anumber(n);
  return n;
}
function numberToHexUnpadded(num2) {
  const hex = abignumber(num2).toString(16);
  return hex.length & 1 ? "0" + hex : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  return hexToNumber(bytesToHex(copyBytes(abytes(bytes)).reverse()));
}
function numberToBytesBE(n, len) {
  anumber(len);
  n = abignumber(n);
  const res = hexToBytes(n.toString(16).padStart(len * 2, "0"));
  if (res.length !== len)
    throw new Error("number too large");
  return res;
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function copyBytes(bytes) {
  return Uint8Array.from(bytes);
}
function asciiToBytes(ascii) {
  return Uint8Array.from(ascii, (c, i3) => {
    const charCode = c.charCodeAt(0);
    if (c.length !== 1 || charCode > 127) {
      throw new Error(`string contains non-ASCII character "${ascii[i3]}" with code ${charCode} at position ${i3}`);
    }
    return charCode;
  });
}
var isPosBig = (n) => typeof n === "bigint" && _0n <= n;
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new Error("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  let len;
  for (len = 0; n > _0n; n >>= _1n, len += 1)
    ;
  return len;
}
var bitMask = (n) => (_1n << BigInt(n)) - _1n;
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  anumber(hashLen, "hashLen");
  anumber(qByteLen, "qByteLen");
  if (typeof hmacFn !== "function")
    throw new Error("hmacFn must be a function");
  const u8n = (len) => new Uint8Array(len);
  const NULL = Uint8Array.of();
  const byte0 = Uint8Array.of(0);
  const byte1 = Uint8Array.of(1);
  const _maxDrbgIters = 1e3;
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i3 = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i3 = 0;
  };
  const h = (...msgs) => hmacFn(k, concatBytes(v, ...msgs));
  const reseed = (seed = NULL) => {
    k = h(byte0, seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(byte1, seed);
    v = h();
  };
  const gen = () => {
    if (i3++ >= _maxDrbgIters)
      throw new Error("drbg: tried max amount of iterations");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while (!(res = pred(gen())))
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function validateObject(object, fields = {}, optFields = {}) {
  if (!object || typeof object !== "object")
    throw new Error("expected valid options object");
  function checkField(fieldName, expectedType, isOpt) {
    const val = object[fieldName];
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new Error(`param "${fieldName}" is invalid: expected ${expectedType}, got ${current}`);
  }
  const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
  iter(fields, false);
  iter(optFields, true);
}
function memoized(fn) {
  const map = /* @__PURE__ */ new WeakMap();
  return (arg, ...args) => {
    const val = map.get(arg);
    if (val !== void 0)
      return val;
    const computed = fn(arg, ...args);
    map.set(arg, computed);
    return computed;
  };
}

// node_modules/nostr-tools/node_modules/@noble/curves/abstract/modular.js
var _0n2 = /* @__PURE__ */ BigInt(0);
var _1n2 = /* @__PURE__ */ BigInt(1);
var _2n = /* @__PURE__ */ BigInt(2);
var _3n = /* @__PURE__ */ BigInt(3);
var _4n = /* @__PURE__ */ BigInt(4);
var _5n = /* @__PURE__ */ BigInt(5);
var _7n = /* @__PURE__ */ BigInt(7);
var _8n = /* @__PURE__ */ BigInt(8);
var _9n = /* @__PURE__ */ BigInt(9);
var _16n = /* @__PURE__ */ BigInt(16);
function mod(a, b) {
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow2(x, power, modulo) {
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _0n2)
    throw new Error("invert: expected positive modulus, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, y = _1n2, u = _1n2, v = _0n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b % a;
    const m = x - u * q;
    const n = y - v * q;
    b = a, a = r, x = u, y = v, u = m, v = n;
  }
  const gcd2 = b;
  if (gcd2 !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function assertIsSquare(Fp, root, n) {
  if (!Fp.eql(Fp.sqr(root), n))
    throw new Error("Cannot find square root");
}
function sqrt3mod4(Fp, n) {
  const p1div4 = (Fp.ORDER + _1n2) / _4n;
  const root = Fp.pow(n, p1div4);
  assertIsSquare(Fp, root, n);
  return root;
}
function sqrt5mod8(Fp, n) {
  const p5div8 = (Fp.ORDER - _5n) / _8n;
  const n2 = Fp.mul(n, _2n);
  const v = Fp.pow(n2, p5div8);
  const nv = Fp.mul(n, v);
  const i3 = Fp.mul(Fp.mul(nv, _2n), v);
  const root = Fp.mul(nv, Fp.sub(i3, Fp.ONE));
  assertIsSquare(Fp, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return (Fp, n) => {
    let tv1 = Fp.pow(n, c4);
    let tv2 = Fp.mul(tv1, c1);
    const tv3 = Fp.mul(tv1, c2);
    const tv4 = Fp.mul(tv1, c3);
    const e1 = Fp.eql(Fp.sqr(tv2), n);
    const e2 = Fp.eql(Fp.sqr(tv3), n);
    tv1 = Fp.cmov(tv1, tv2, e1);
    tv2 = Fp.cmov(tv4, tv3, e2);
    const e3 = Fp.eql(Fp.sqr(tv2), n);
    const root = Fp.cmov(tv1, tv2, e3);
    assertIsSquare(Fp, root, n);
    return root;
  };
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp, n) {
    if (Fp.is0(n))
      return n;
    if (FpLegendre(Fp, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = Fp.mul(Fp.ONE, cc);
    let t = Fp.pow(n, Q);
    let R = Fp.pow(n, Q1div2);
    while (!Fp.eql(t, Fp.ONE)) {
      if (Fp.is0(t))
        return Fp.ZERO;
      let i3 = 1;
      let t_tmp = Fp.sqr(t);
      while (!Fp.eql(t_tmp, Fp.ONE)) {
        i3++;
        t_tmp = Fp.sqr(t_tmp);
        if (i3 === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i3 - 1);
      const b = Fp.pow(c, exponent);
      M = i3;
      c = Fp.sqr(b);
      t = Fp.mul(t, c);
      R = Fp.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
var FIELD_FIELDS = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  validateObject(field, opts);
  return field;
}
function FpPow(Fp, num2, power) {
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return Fp.ONE;
  if (power === _1n2)
    return num2;
  let p = Fp.ONE;
  let d = num2;
  while (power > _0n2) {
    if (power & _1n2)
      p = Fp.mul(p, d);
    d = Fp.sqr(d);
    power >>= _1n2;
  }
  return p;
}
function FpInvertBatch(Fp, nums, passZero = false) {
  const inverted = new Array(nums.length).fill(passZero ? Fp.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num2, i3) => {
    if (Fp.is0(num2))
      return acc;
    inverted[i3] = acc;
    return Fp.mul(acc, num2);
  }, Fp.ONE);
  const invertedAcc = Fp.inv(multipliedAcc);
  nums.reduceRight((acc, num2, i3) => {
    if (Fp.is0(num2))
      return acc;
    inverted[i3] = Fp.mul(acc, inverted[i3]);
    return Fp.mul(acc, num2);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp, n) {
  const p1mod2 = (Fp.ORDER - _1n2) / _2n;
  const powered = Fp.pow(n, p1mod2);
  const yes = Fp.eql(powered, Fp.ONE);
  const zero = Fp.eql(powered, Fp.ZERO);
  const no = Fp.eql(powered, Fp.neg(Fp.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber(nBitLength);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
var _Field = class {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = _0n2;
  ONE = _1n2;
  _lengths;
  _sqrt;
  // cached sqrt
  _mod;
  constructor(ORDER, opts = {}) {
    if (ORDER <= _0n2)
      throw new Error("invalid field: expected ORDER > 0, got " + ORDER);
    let _nbitLength = void 0;
    this.isLE = false;
    if (opts != null && typeof opts === "object") {
      if (typeof opts.BITS === "number")
        _nbitLength = opts.BITS;
      if (typeof opts.sqrt === "function")
        this.sqrt = opts.sqrt;
      if (typeof opts.isLE === "boolean")
        this.isLE = opts.isLE;
      if (opts.allowedLengths)
        this._lengths = opts.allowedLengths?.slice();
      if (typeof opts.modFromBytes === "boolean")
        this._mod = opts.modFromBytes;
    }
    const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
    if (nByteLength > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = ORDER;
    this.BITS = nBitLength;
    this.BYTES = nByteLength;
    this._sqrt = void 0;
    Object.preventExtensions(this);
  }
  create(num2) {
    return mod(num2, this.ORDER);
  }
  isValid(num2) {
    if (typeof num2 !== "bigint")
      throw new Error("invalid field element: expected bigint, got " + typeof num2);
    return _0n2 <= num2 && num2 < this.ORDER;
  }
  is0(num2) {
    return num2 === _0n2;
  }
  // is valid and invertible
  isValidNot0(num2) {
    return !this.is0(num2) && this.isValid(num2);
  }
  isOdd(num2) {
    return (num2 & _1n2) === _1n2;
  }
  neg(num2) {
    return mod(-num2, this.ORDER);
  }
  eql(lhs, rhs) {
    return lhs === rhs;
  }
  sqr(num2) {
    return mod(num2 * num2, this.ORDER);
  }
  add(lhs, rhs) {
    return mod(lhs + rhs, this.ORDER);
  }
  sub(lhs, rhs) {
    return mod(lhs - rhs, this.ORDER);
  }
  mul(lhs, rhs) {
    return mod(lhs * rhs, this.ORDER);
  }
  pow(num2, power) {
    return FpPow(this, num2, power);
  }
  div(lhs, rhs) {
    return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
  }
  // Same as above, but doesn't normalize
  sqrN(num2) {
    return num2 * num2;
  }
  addN(lhs, rhs) {
    return lhs + rhs;
  }
  subN(lhs, rhs) {
    return lhs - rhs;
  }
  mulN(lhs, rhs) {
    return lhs * rhs;
  }
  inv(num2) {
    return invert(num2, this.ORDER);
  }
  sqrt(num2) {
    if (!this._sqrt)
      this._sqrt = FpSqrt(this.ORDER);
    return this._sqrt(this, num2);
  }
  toBytes(num2) {
    return this.isLE ? numberToBytesLE(num2, this.BYTES) : numberToBytesBE(num2, this.BYTES);
  }
  fromBytes(bytes, skipValidation = false) {
    abytes(bytes);
    const { _lengths: allowedLengths, BYTES, isLE: isLE2, ORDER, _mod: modFromBytes } = this;
    if (allowedLengths) {
      if (!allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
        throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
      }
      const padded = new Uint8Array(BYTES);
      padded.set(bytes, isLE2 ? 0 : padded.length - bytes.length);
      bytes = padded;
    }
    if (bytes.length !== BYTES)
      throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
    let scalar = isLE2 ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
    if (modFromBytes)
      scalar = mod(scalar, ORDER);
    if (!skipValidation) {
      if (!this.isValid(scalar))
        throw new Error("invalid field element: outside of range 0..ORDER");
    }
    return scalar;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(lst) {
    return FpInvertBatch(this, lst);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(a, b, condition) {
    return condition ? b : a;
  }
};
function Field(ORDER, opts = {}) {
  return new _Field(ORDER, opts);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  const bitLength = fieldOrder.toString(2).length;
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE2 = false) {
  abytes(key);
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = getMinHashLength(fieldOrder);
  if (len < 16 || len < minLen || len > 1024)
    throw new Error("expected " + minLen + "-1024 bytes of input, got " + len);
  const num2 = isLE2 ? bytesToNumberLE(key) : bytesToNumberBE(key);
  const reduced = mod(num2, fieldOrder - _1n2) + _1n2;
  return isLE2 ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}

// node_modules/nostr-tools/node_modules/@noble/curves/abstract/curve.js
var _0n3 = /* @__PURE__ */ BigInt(0);
var _1n3 = /* @__PURE__ */ BigInt(1);
function negateCt(condition, item) {
  const neg = item.negate();
  return condition ? neg : item;
}
function normalizeZ(c, points) {
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i3) => c.fromAffine(p.toAffine(invertedZs[i3])));
}
function validateW(W, bits) {
  if (!Number.isSafeInteger(W) || W <= 0 || W > bits)
    throw new Error("invalid window size, expected [1.." + bits + "], got W=" + W);
}
function calcWOpts(W, scalarBits) {
  validateW(W, scalarBits);
  const windows = Math.ceil(scalarBits / W) + 1;
  const windowSize = 2 ** (W - 1);
  const maxNumber = 2 ** W;
  const mask = bitMask(W);
  const shiftBy = BigInt(W);
  return { windows, windowSize, mask, maxNumber, shiftBy };
}
function calcOffsets(n, window2, wOpts) {
  const { windowSize, mask, maxNumber, shiftBy } = wOpts;
  let wbits = Number(n & mask);
  let nextN = n >> shiftBy;
  if (wbits > windowSize) {
    wbits -= maxNumber;
    nextN += _1n3;
  }
  const offsetStart = window2 * windowSize;
  const offset = offsetStart + Math.abs(wbits) - 1;
  const isZero = wbits === 0;
  const isNeg = wbits < 0;
  const isNegF = window2 % 2 !== 0;
  const offsetF = offsetStart;
  return { nextN, offset, isZero, isNeg, isNegF, offsetF };
}
var pointPrecomputes = /* @__PURE__ */ new WeakMap();
var pointWindowSizes = /* @__PURE__ */ new WeakMap();
function getW(P) {
  return pointWindowSizes.get(P) || 1;
}
function assert0(n) {
  if (n !== _0n3)
    throw new Error("invalid wNAF");
}
var wNAF = class {
  BASE;
  ZERO;
  Fn;
  bits;
  // Parametrized with a given Point class (not individual point)
  constructor(Point, bits) {
    this.BASE = Point.BASE;
    this.ZERO = Point.ZERO;
    this.Fn = Point.Fn;
    this.bits = bits;
  }
  // non-const time multiplication ladder
  _unsafeLadder(elm, n, p = this.ZERO) {
    let d = elm;
    while (n > _0n3) {
      if (n & _1n3)
        p = p.add(d);
      d = d.double();
      n >>= _1n3;
    }
    return p;
  }
  /**
   * Creates a wNAF precomputation window. Used for caching.
   * Default window size is set by `utils.precompute()` and is equal to 8.
   * Number of precomputed points depends on the curve size:
   * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
   * - 𝑊 is the window size
   * - 𝑛 is the bitlength of the curve order.
   * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
   * @param point Point instance
   * @param W window size
   * @returns precomputed point tables flattened to a single array
   */
  precomputeWindow(point, W) {
    const { windows, windowSize } = calcWOpts(W, this.bits);
    const points = [];
    let p = point;
    let base = p;
    for (let window2 = 0; window2 < windows; window2++) {
      base = p;
      points.push(base);
      for (let i3 = 1; i3 < windowSize; i3++) {
        base = base.add(p);
        points.push(base);
      }
      p = base.double();
    }
    return points;
  }
  /**
   * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
   * More compact implementation:
   * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
   * @returns real and fake (for const-time) points
   */
  wNAF(W, precomputes, n) {
    if (!this.Fn.isValid(n))
      throw new Error("invalid scalar");
    let p = this.ZERO;
    let f = this.BASE;
    const wo = calcWOpts(W, this.bits);
    for (let window2 = 0; window2 < wo.windows; window2++) {
      const { nextN, offset, isZero, isNeg, isNegF, offsetF } = calcOffsets(n, window2, wo);
      n = nextN;
      if (isZero) {
        f = f.add(negateCt(isNegF, precomputes[offsetF]));
      } else {
        p = p.add(negateCt(isNeg, precomputes[offset]));
      }
    }
    assert0(n);
    return { p, f };
  }
  /**
   * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
   * @param acc accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(W, precomputes, n, acc = this.ZERO) {
    const wo = calcWOpts(W, this.bits);
    for (let window2 = 0; window2 < wo.windows; window2++) {
      if (n === _0n3)
        break;
      const { nextN, offset, isZero, isNeg } = calcOffsets(n, window2, wo);
      n = nextN;
      if (isZero) {
        continue;
      } else {
        const item = precomputes[offset];
        acc = acc.add(isNeg ? item.negate() : item);
      }
    }
    assert0(n);
    return acc;
  }
  getPrecomputes(W, point, transform) {
    let comp = pointPrecomputes.get(point);
    if (!comp) {
      comp = this.precomputeWindow(point, W);
      if (W !== 1) {
        if (typeof transform === "function")
          comp = transform(comp);
        pointPrecomputes.set(point, comp);
      }
    }
    return comp;
  }
  cached(point, scalar, transform) {
    const W = getW(point);
    return this.wNAF(W, this.getPrecomputes(W, point, transform), scalar);
  }
  unsafe(point, scalar, transform, prev) {
    const W = getW(point);
    if (W === 1)
      return this._unsafeLadder(point, scalar, prev);
    return this.wNAFUnsafe(W, this.getPrecomputes(W, point, transform), scalar, prev);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(P, W) {
    validateW(W, this.bits);
    pointWindowSizes.set(P, W);
    pointPrecomputes.delete(P);
  }
  hasCache(elm) {
    return getW(elm) !== 1;
  }
};
function mulEndoUnsafe(Point, point, k1, k2) {
  let acc = point;
  let p1 = Point.ZERO;
  let p2 = Point.ZERO;
  while (k1 > _0n3 || k2 > _0n3) {
    if (k1 & _1n3)
      p1 = p1.add(acc);
    if (k2 & _1n3)
      p2 = p2.add(acc);
    acc = acc.double();
    k1 >>= _1n3;
    k2 >>= _1n3;
  }
  return { p1, p2 };
}
function createField(order, field, isLE2) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE: isLE2 });
  }
}
function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(typeof val === "bigint" && val > _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp, Fn };
}
function createKeygen(randomSecretKey, getPublicKey3) {
  return function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey3(secretKey) };
  };
}

// node_modules/nostr-tools/node_modules/@noble/hashes/hmac.js
var _HMAC = class {
  oHash;
  iHash;
  blockLen;
  outputLen;
  finished = false;
  destroyed = false;
  constructor(hash, key) {
    ahash(hash);
    abytes(key, void 0, "key");
    this.iHash = hash.create();
    if (typeof this.iHash.update !== "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen;
    this.outputLen = this.iHash.outputLen;
    const blockLen = this.blockLen;
    const pad2 = new Uint8Array(blockLen);
    pad2.set(key.length > blockLen ? hash.create().update(key).digest() : key);
    for (let i3 = 0; i3 < pad2.length; i3++)
      pad2[i3] ^= 54;
    this.iHash.update(pad2);
    this.oHash = hash.create();
    for (let i3 = 0; i3 < pad2.length; i3++)
      pad2[i3] ^= 54 ^ 92;
    this.oHash.update(pad2);
    clean(pad2);
  }
  update(buf) {
    aexists(this);
    this.iHash.update(buf);
    return this;
  }
  digestInto(out) {
    aexists(this);
    abytes(out, this.outputLen, "output");
    this.finished = true;
    this.iHash.digestInto(out);
    this.oHash.update(out);
    this.oHash.digestInto(out);
    this.destroy();
  }
  digest() {
    const out = new Uint8Array(this.oHash.outputLen);
    this.digestInto(out);
    return out;
  }
  _cloneInto(to) {
    to ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
    to = to;
    to.finished = finished;
    to.destroyed = destroyed;
    to.blockLen = blockLen;
    to.outputLen = outputLen;
    to.oHash = oHash._cloneInto(to.oHash);
    to.iHash = iHash._cloneInto(to.iHash);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = true;
    this.oHash.destroy();
    this.iHash.destroy();
  }
};
var hmac = (hash, key, message) => new _HMAC(hash, key).update(message).digest();
hmac.create = (hash, key) => new _HMAC(hash, key);

// node_modules/nostr-tools/node_modules/@noble/curves/abstract/weierstrass.js
var divNearest = (num2, den) => (num2 + (num2 >= 0 ? den : -den) / _2n2) / den;
function _splitEndoScalar(k, basis, n) {
  const [[a1, b1], [a2, b2]] = basis;
  const c1 = divNearest(b2 * k, n);
  const c2 = divNearest(-b1 * k, n);
  let k1 = k - c1 * a1 - c2 * a2;
  let k2 = -c1 * b1 - c2 * b2;
  const k1neg = k1 < _0n4;
  const k2neg = k2 < _0n4;
  if (k1neg)
    k1 = -k1;
  if (k2neg)
    k2 = -k2;
  const MAX_NUM = bitMask(Math.ceil(bitLen(n) / 2)) + _1n4;
  if (k1 < _0n4 || k1 >= MAX_NUM || k2 < _0n4 || k2 >= MAX_NUM) {
    throw new Error("splitScalar (endomorphism): failed, k=" + k);
  }
  return { k1neg, k1, k2neg, k2 };
}
function validateSigFormat(format) {
  if (!["compact", "recovered", "der"].includes(format))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return format;
}
function validateSigOpts(opts, def) {
  const optsn = {};
  for (let optName of Object.keys(def)) {
    optsn[optName] = opts[optName] === void 0 ? def[optName] : opts[optName];
  }
  abool(optsn.lowS, "lowS");
  abool(optsn.prehash, "prehash");
  if (optsn.format !== void 0)
    validateSigFormat(optsn.format);
  return optsn;
}
var DERErr = class extends Error {
  constructor(m = "") {
    super(m);
  }
};
var DER = {
  // asn.1 DER encoding utils
  Err: DERErr,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (tag, data) => {
      const { Err: E } = DER;
      if (tag < 0 || tag > 256)
        throw new E("tlv.encode: wrong tag");
      if (data.length & 1)
        throw new E("tlv.encode: unpadded data");
      const dataLen = data.length / 2;
      const len = numberToHexUnpadded(dataLen);
      if (len.length / 2 & 128)
        throw new E("tlv.encode: long form length too big");
      const lenLen = dataLen > 127 ? numberToHexUnpadded(len.length / 2 | 128) : "";
      const t = numberToHexUnpadded(tag);
      return t + lenLen + len + data;
    },
    // v - value, l - left bytes (unparsed)
    decode(tag, data) {
      const { Err: E } = DER;
      let pos = 0;
      if (tag < 0 || tag > 256)
        throw new E("tlv.encode: wrong tag");
      if (data.length < 2 || data[pos++] !== tag)
        throw new E("tlv.decode: wrong tlv");
      const first = data[pos++];
      const isLong = !!(first & 128);
      let length = 0;
      if (!isLong)
        length = first;
      else {
        const lenLen = first & 127;
        if (!lenLen)
          throw new E("tlv.decode(long): indefinite length not supported");
        if (lenLen > 4)
          throw new E("tlv.decode(long): byte length is too big");
        const lengthBytes = data.subarray(pos, pos + lenLen);
        if (lengthBytes.length !== lenLen)
          throw new E("tlv.decode: length bytes not complete");
        if (lengthBytes[0] === 0)
          throw new E("tlv.decode(long): zero leftmost byte");
        for (const b of lengthBytes)
          length = length << 8 | b;
        pos += lenLen;
        if (length < 128)
          throw new E("tlv.decode(long): not minimal encoding");
      }
      const v = data.subarray(pos, pos + length);
      if (v.length !== length)
        throw new E("tlv.decode: wrong value length");
      return { v, l: data.subarray(pos + length) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(num2) {
      const { Err: E } = DER;
      if (num2 < _0n4)
        throw new E("integer: negative integers are not allowed");
      let hex = numberToHexUnpadded(num2);
      if (Number.parseInt(hex[0], 16) & 8)
        hex = "00" + hex;
      if (hex.length & 1)
        throw new E("unexpected DER parsing assertion: unpadded hex");
      return hex;
    },
    decode(data) {
      const { Err: E } = DER;
      if (data[0] & 128)
        throw new E("invalid signature integer: negative");
      if (data[0] === 0 && !(data[1] & 128))
        throw new E("invalid signature integer: unnecessary leading zero");
      return bytesToNumberBE(data);
    }
  },
  toSig(bytes) {
    const { Err: E, _int: int, _tlv: tlv } = DER;
    const data = abytes(bytes, void 0, "signature");
    const { v: seqBytes, l: seqLeftBytes } = tlv.decode(48, data);
    if (seqLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    const { v: rBytes, l: rLeftBytes } = tlv.decode(2, seqBytes);
    const { v: sBytes, l: sLeftBytes } = tlv.decode(2, rLeftBytes);
    if (sLeftBytes.length)
      throw new E("invalid signature: left bytes after parsing");
    return { r: int.decode(rBytes), s: int.decode(sBytes) };
  },
  hexFromSig(sig) {
    const { _tlv: tlv, _int: int } = DER;
    const rs = tlv.encode(2, int.encode(sig.r));
    const ss = tlv.encode(2, int.encode(sig.s));
    const seq = rs + ss;
    return tlv.encode(48, seq);
  }
};
var _0n4 = BigInt(0);
var _1n4 = BigInt(1);
var _2n2 = BigInt(2);
var _3n2 = BigInt(3);
var _4n2 = BigInt(4);
function weierstrass(params, extraOpts = {}) {
  const validated = createCurveFields("weierstrass", params, extraOpts);
  const { Fp, Fn } = validated;
  let CURVE = validated.CURVE;
  const { h: cofactor, n: CURVE_ORDER } = CURVE;
  validateObject(extraOpts, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object"
  });
  const { endo } = extraOpts;
  if (endo) {
    if (!Fp.is0(CURVE.a) || typeof endo.beta !== "bigint" || !Array.isArray(endo.basises)) {
      throw new Error('invalid endo: expected "beta": bigint and "basises": array');
    }
  }
  const lengths = getWLengths(Fp, Fn);
  function assertCompressionIsSupported() {
    if (!Fp.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function pointToBytes2(_c, point, isCompressed) {
    const { x, y } = point.toAffine();
    const bx = Fp.toBytes(x);
    abool(isCompressed, "isCompressed");
    if (isCompressed) {
      assertCompressionIsSupported();
      const hasEvenY = !Fp.isOdd(y);
      return concatBytes(pprefix(hasEvenY), bx);
    } else {
      return concatBytes(Uint8Array.of(4), bx, Fp.toBytes(y));
    }
  }
  function pointFromBytes(bytes) {
    abytes(bytes, void 0, "Point");
    const { publicKey: comp, publicKeyUncompressed: uncomp } = lengths;
    const length = bytes.length;
    const head = bytes[0];
    const tail = bytes.subarray(1);
    if (length === comp && (head === 2 || head === 3)) {
      const x = Fp.fromBytes(tail);
      if (!Fp.isValid(x))
        throw new Error("bad point: is not on curve, wrong x");
      const y2 = weierstrassEquation(x);
      let y;
      try {
        y = Fp.sqrt(y2);
      } catch (sqrtError) {
        const err = sqrtError instanceof Error ? ": " + sqrtError.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + err);
      }
      assertCompressionIsSupported();
      const evenY = Fp.isOdd(y);
      const evenH = (head & 1) === 1;
      if (evenH !== evenY)
        y = Fp.neg(y);
      return { x, y };
    } else if (length === uncomp && head === 4) {
      const L = Fp.BYTES;
      const x = Fp.fromBytes(tail.subarray(0, L));
      const y = Fp.fromBytes(tail.subarray(L, L * 2));
      if (!isValidXY(x, y))
        throw new Error("bad point: is not on curve");
      return { x, y };
    } else {
      throw new Error(`bad point: got length ${length}, expected compressed=${comp} or uncompressed=${uncomp}`);
    }
  }
  const encodePoint = extraOpts.toBytes || pointToBytes2;
  const decodePoint = extraOpts.fromBytes || pointFromBytes;
  function weierstrassEquation(x) {
    const x2 = Fp.sqr(x);
    const x3 = Fp.mul(x2, x);
    return Fp.add(Fp.add(x3, Fp.mul(x, CURVE.a)), CURVE.b);
  }
  function isValidXY(x, y) {
    const left = Fp.sqr(y);
    const right = weierstrassEquation(x);
    return Fp.eql(left, right);
  }
  if (!isValidXY(CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const _4a3 = Fp.mul(Fp.pow(CURVE.a, _3n2), _4n2);
  const _27b2 = Fp.mul(Fp.sqr(CURVE.b), BigInt(27));
  if (Fp.is0(Fp.add(_4a3, _27b2)))
    throw new Error("bad curve params: a or b");
  function acoord(title, n, banZero = false) {
    if (!Fp.isValid(n) || banZero && Fp.is0(n))
      throw new Error(`bad point coordinate ${title}`);
    return n;
  }
  function aprjpoint(other) {
    if (!(other instanceof Point))
      throw new Error("Weierstrass Point expected");
  }
  function splitEndoScalarN(k) {
    if (!endo || !endo.basises)
      throw new Error("no endo");
    return _splitEndoScalar(k, endo.basises, Fn.ORDER);
  }
  const toAffineMemo = memoized((p, iz) => {
    const { X, Y, Z } = p;
    if (Fp.eql(Z, Fp.ONE))
      return { x: X, y: Y };
    const is0 = p.is0();
    if (iz == null)
      iz = is0 ? Fp.ONE : Fp.inv(Z);
    const x = Fp.mul(X, iz);
    const y = Fp.mul(Y, iz);
    const zz = Fp.mul(Z, iz);
    if (is0)
      return { x: Fp.ZERO, y: Fp.ZERO };
    if (!Fp.eql(zz, Fp.ONE))
      throw new Error("invZ was invalid");
    return { x, y };
  });
  const assertValidMemo = memoized((p) => {
    if (p.is0()) {
      if (extraOpts.allowInfinityPoint && !Fp.is0(p.Y))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x, y } = p.toAffine();
    if (!Fp.isValid(x) || !Fp.isValid(y))
      throw new Error("bad point: x or y not field elements");
    if (!isValidXY(x, y))
      throw new Error("bad point: equation left != right");
    if (!p.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return true;
  });
  function finishEndo(endoBeta, k1p, k2p, k1neg, k2neg) {
    k2p = new Point(Fp.mul(k2p.X, endoBeta), k2p.Y, k2p.Z);
    k1p = negateCt(k1neg, k1p);
    k2p = negateCt(k2neg, k2p);
    return k1p.add(k2p);
  }
  class Point {
    // base / generator point
    static BASE = new Point(CURVE.Gx, CURVE.Gy, Fp.ONE);
    // zero / infinity / identity point
    static ZERO = new Point(Fp.ZERO, Fp.ONE, Fp.ZERO);
    // 0, 1, 0
    // math field
    static Fp = Fp;
    // scalar field
    static Fn = Fn;
    X;
    Y;
    Z;
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(X, Y, Z) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y, true);
      this.Z = acoord("z", Z);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp.isValid(x) || !Fp.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point)
        throw new Error("projective point not allowed");
      if (Fp.is0(x) && Fp.is0(y))
        return Point.ZERO;
      return new Point(x, y, Fp.ONE);
    }
    static fromBytes(bytes) {
      const P = Point.fromAffine(decodePoint(abytes(bytes, void 0, "point")));
      P.assertValidity();
      return P;
    }
    static fromHex(hex) {
      return Point.fromBytes(hexToBytes(hex));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     *
     * @param windowSize
     * @param isLazy true will defer table computation until the first multiplication
     * @returns
     */
    precompute(windowSize = 8, isLazy = true) {
      wnaf.createCache(this, windowSize);
      if (!isLazy)
        this.multiply(_3n2);
      return this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      assertValidMemo(this);
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (!Fp.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !Fp.isOdd(y);
    }
    /** Compare one point to another. */
    equals(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const U1 = Fp.eql(Fp.mul(X1, Z2), Fp.mul(X2, Z1));
      const U2 = Fp.eql(Fp.mul(Y1, Z2), Fp.mul(Y2, Z1));
      return U1 && U2;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new Point(this.X, Fp.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a, b } = CURVE;
      const b3 = Fp.mul(b, _3n2);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      let t0 = Fp.mul(X1, X1);
      let t1 = Fp.mul(Y1, Y1);
      let t2 = Fp.mul(Z1, Z1);
      let t3 = Fp.mul(X1, Y1);
      t3 = Fp.add(t3, t3);
      Z3 = Fp.mul(X1, Z1);
      Z3 = Fp.add(Z3, Z3);
      X3 = Fp.mul(a, Z3);
      Y3 = Fp.mul(b3, t2);
      Y3 = Fp.add(X3, Y3);
      X3 = Fp.sub(t1, Y3);
      Y3 = Fp.add(t1, Y3);
      Y3 = Fp.mul(X3, Y3);
      X3 = Fp.mul(t3, X3);
      Z3 = Fp.mul(b3, Z3);
      t2 = Fp.mul(a, t2);
      t3 = Fp.sub(t0, t2);
      t3 = Fp.mul(a, t3);
      t3 = Fp.add(t3, Z3);
      Z3 = Fp.add(t0, t0);
      t0 = Fp.add(Z3, t0);
      t0 = Fp.add(t0, t2);
      t0 = Fp.mul(t0, t3);
      Y3 = Fp.add(Y3, t0);
      t2 = Fp.mul(Y1, Z1);
      t2 = Fp.add(t2, t2);
      t0 = Fp.mul(t2, t3);
      X3 = Fp.sub(X3, t0);
      Z3 = Fp.mul(t2, t1);
      Z3 = Fp.add(Z3, Z3);
      Z3 = Fp.add(Z3, Z3);
      return new Point(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      aprjpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      let X3 = Fp.ZERO, Y3 = Fp.ZERO, Z3 = Fp.ZERO;
      const a = CURVE.a;
      const b3 = Fp.mul(CURVE.b, _3n2);
      let t0 = Fp.mul(X1, X2);
      let t1 = Fp.mul(Y1, Y2);
      let t2 = Fp.mul(Z1, Z2);
      let t3 = Fp.add(X1, Y1);
      let t4 = Fp.add(X2, Y2);
      t3 = Fp.mul(t3, t4);
      t4 = Fp.add(t0, t1);
      t3 = Fp.sub(t3, t4);
      t4 = Fp.add(X1, Z1);
      let t5 = Fp.add(X2, Z2);
      t4 = Fp.mul(t4, t5);
      t5 = Fp.add(t0, t2);
      t4 = Fp.sub(t4, t5);
      t5 = Fp.add(Y1, Z1);
      X3 = Fp.add(Y2, Z2);
      t5 = Fp.mul(t5, X3);
      X3 = Fp.add(t1, t2);
      t5 = Fp.sub(t5, X3);
      Z3 = Fp.mul(a, t4);
      X3 = Fp.mul(b3, t2);
      Z3 = Fp.add(X3, Z3);
      X3 = Fp.sub(t1, Z3);
      Z3 = Fp.add(t1, Z3);
      Y3 = Fp.mul(X3, Z3);
      t1 = Fp.add(t0, t0);
      t1 = Fp.add(t1, t0);
      t2 = Fp.mul(a, t2);
      t4 = Fp.mul(b3, t4);
      t1 = Fp.add(t1, t2);
      t2 = Fp.sub(t0, t2);
      t2 = Fp.mul(a, t2);
      t4 = Fp.add(t4, t2);
      t0 = Fp.mul(t1, t4);
      Y3 = Fp.add(Y3, t0);
      t0 = Fp.mul(t5, t4);
      X3 = Fp.mul(t3, X3);
      X3 = Fp.sub(X3, t0);
      t0 = Fp.mul(t3, t1);
      Z3 = Fp.mul(t5, Z3);
      Z3 = Fp.add(Z3, t0);
      return new Point(X3, Y3, Z3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      const { endo: endo2 } = extraOpts;
      if (!Fn.isValidNot0(scalar))
        throw new Error("invalid scalar: out of range");
      let point, fake;
      const mul = (n) => wnaf.cached(this, n, (p) => normalizeZ(Point, p));
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(scalar);
        const { p: k1p, f: k1f } = mul(k1);
        const { p: k2p, f: k2f } = mul(k2);
        fake = k1f.add(k2f);
        point = finishEndo(endo2.beta, k1p, k2p, k1neg, k2neg);
      } else {
        const { p, f } = mul(scalar);
        point = p;
        fake = f;
      }
      return normalizeZ(Point, [point, fake])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(sc) {
      const { endo: endo2 } = extraOpts;
      const p = this;
      if (!Fn.isValid(sc))
        throw new Error("invalid scalar: out of range");
      if (sc === _0n4 || p.is0())
        return Point.ZERO;
      if (sc === _1n4)
        return p;
      if (wnaf.hasCache(this))
        return this.multiply(sc);
      if (endo2) {
        const { k1neg, k1, k2neg, k2 } = splitEndoScalarN(sc);
        const { p1, p2 } = mulEndoUnsafe(Point, p, k1, k2);
        return finishEndo(endo2.beta, p1, p2, k1neg, k2neg);
      } else {
        return wnaf.unsafe(p, sc);
      }
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(invertedZ) {
      return toAffineMemo(this, invertedZ);
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree } = extraOpts;
      if (cofactor === _1n4)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point, this);
      return wnaf.unsafe(this, CURVE_ORDER).is0();
    }
    clearCofactor() {
      const { clearCofactor } = extraOpts;
      if (cofactor === _1n4)
        return this;
      if (clearCofactor)
        return clearCofactor(Point, this);
      return this.multiplyUnsafe(cofactor);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(cofactor).is0();
    }
    toBytes(isCompressed = true) {
      abool(isCompressed, "isCompressed");
      this.assertValidity();
      return encodePoint(Point, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex(this.toBytes(isCompressed));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const bits = Fn.BITS;
  const wnaf = new wNAF(Point, extraOpts.endo ? Math.ceil(bits / 2) : bits);
  Point.BASE.precompute(8);
  return Point;
}
function pprefix(hasEvenY) {
  return Uint8Array.of(hasEvenY ? 2 : 3);
}
function getWLengths(Fp, Fn) {
  return {
    secretKey: Fn.BYTES,
    publicKey: 1 + Fp.BYTES,
    publicKeyUncompressed: 1 + 2 * Fp.BYTES,
    publicKeyHasPrefix: true,
    signature: 2 * Fn.BYTES
  };
}
function ecdh(Point, ecdhOpts = {}) {
  const { Fn } = Point;
  const randomBytes_ = ecdhOpts.randomBytes || randomBytes;
  const lengths = Object.assign(getWLengths(Point.Fp, Fn), { seed: getMinHashLength(Fn.ORDER) });
  function isValidSecretKey(secretKey) {
    try {
      const num2 = Fn.fromBytes(secretKey);
      return Fn.isValidNot0(num2);
    } catch (error2) {
      return false;
    }
  }
  function isValidPublicKey(publicKey, isCompressed) {
    const { publicKey: comp, publicKeyUncompressed } = lengths;
    try {
      const l = publicKey.length;
      if (isCompressed === true && l !== comp)
        return false;
      if (isCompressed === false && l !== publicKeyUncompressed)
        return false;
      return !!Point.fromBytes(publicKey);
    } catch (error2) {
      return false;
    }
  }
  function randomSecretKey(seed = randomBytes_(lengths.seed)) {
    return mapHashToField(abytes(seed, lengths.seed, "seed"), Fn.ORDER);
  }
  function getPublicKey3(secretKey, isCompressed = true) {
    return Point.BASE.multiply(Fn.fromBytes(secretKey)).toBytes(isCompressed);
  }
  function isProbPub(item) {
    const { secretKey, publicKey, publicKeyUncompressed } = lengths;
    if (!isBytes(item))
      return void 0;
    if ("_lengths" in Fn && Fn._lengths || secretKey === publicKey)
      return void 0;
    const l = abytes(item, void 0, "key").length;
    return l === publicKey || l === publicKeyUncompressed;
  }
  function getSharedSecret(secretKeyA, publicKeyB, isCompressed = true) {
    if (isProbPub(secretKeyA) === true)
      throw new Error("first arg must be private key");
    if (isProbPub(publicKeyB) === false)
      throw new Error("second arg must be public key");
    const s = Fn.fromBytes(secretKeyA);
    const b = Point.fromBytes(publicKeyB);
    return b.multiply(s).toBytes(isCompressed);
  }
  const utils = {
    isValidSecretKey,
    isValidPublicKey,
    randomSecretKey
  };
  const keygen = createKeygen(randomSecretKey, getPublicKey3);
  return Object.freeze({ getPublicKey: getPublicKey3, getSharedSecret, keygen, Point, utils, lengths });
}
function ecdsa(Point, hash, ecdsaOpts = {}) {
  ahash(hash);
  validateObject(ecdsaOpts, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  ecdsaOpts = Object.assign({}, ecdsaOpts);
  const randomBytes3 = ecdsaOpts.randomBytes || randomBytes;
  const hmac2 = ecdsaOpts.hmac || ((key, msg) => hmac(hash, key, msg));
  const { Fp, Fn } = Point;
  const { ORDER: CURVE_ORDER, BITS: fnBits } = Fn;
  const { keygen, getPublicKey: getPublicKey3, getSharedSecret, utils, lengths } = ecdh(Point, ecdsaOpts);
  const defaultSigOpts = {
    prehash: true,
    lowS: typeof ecdsaOpts.lowS === "boolean" ? ecdsaOpts.lowS : true,
    format: "compact",
    extraEntropy: false
  };
  const hasLargeCofactor = CURVE_ORDER * _2n2 < Fp.ORDER;
  function isBiggerThanHalfOrder(number) {
    const HALF = CURVE_ORDER >> _1n4;
    return number > HALF;
  }
  function validateRS(title, num2) {
    if (!Fn.isValidNot0(num2))
      throw new Error(`invalid signature ${title}: out of range 1..Point.Fn.ORDER`);
    return num2;
  }
  function assertSmallCofactor() {
    if (hasLargeCofactor)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function validateSigLength(bytes, format) {
    validateSigFormat(format);
    const size = lengths.signature;
    const sizer = format === "compact" ? size : format === "recovered" ? size + 1 : void 0;
    return abytes(bytes, sizer);
  }
  class Signature {
    r;
    s;
    recovery;
    constructor(r, s, recovery) {
      this.r = validateRS("r", r);
      this.s = validateRS("s", s);
      if (recovery != null) {
        assertSmallCofactor();
        if (![0, 1, 2, 3].includes(recovery))
          throw new Error("invalid recovery id");
        this.recovery = recovery;
      }
      Object.freeze(this);
    }
    static fromBytes(bytes, format = defaultSigOpts.format) {
      validateSigLength(bytes, format);
      let recid;
      if (format === "der") {
        const { r: r2, s: s2 } = DER.toSig(abytes(bytes));
        return new Signature(r2, s2);
      }
      if (format === "recovered") {
        recid = bytes[0];
        format = "compact";
        bytes = bytes.subarray(1);
      }
      const L = lengths.signature / 2;
      const r = bytes.subarray(0, L);
      const s = bytes.subarray(L, L * 2);
      return new Signature(Fn.fromBytes(r), Fn.fromBytes(s), recid);
    }
    static fromHex(hex, format) {
      return this.fromBytes(hexToBytes(hex), format);
    }
    assertRecovery() {
      const { recovery } = this;
      if (recovery == null)
        throw new Error("invalid recovery id: must be present");
      return recovery;
    }
    addRecoveryBit(recovery) {
      return new Signature(this.r, this.s, recovery);
    }
    recoverPublicKey(messageHash) {
      const { r, s } = this;
      const recovery = this.assertRecovery();
      const radj = recovery === 2 || recovery === 3 ? r + CURVE_ORDER : r;
      if (!Fp.isValid(radj))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const x = Fp.toBytes(radj);
      const R = Point.fromBytes(concatBytes(pprefix((recovery & 1) === 0), x));
      const ir = Fn.inv(radj);
      const h = bits2int_modN(abytes(messageHash, void 0, "msgHash"));
      const u1 = Fn.create(-h * ir);
      const u2 = Fn.create(s * ir);
      const Q = Point.BASE.multiplyUnsafe(u1).add(R.multiplyUnsafe(u2));
      if (Q.is0())
        throw new Error("invalid recovery: point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    toBytes(format = defaultSigOpts.format) {
      validateSigFormat(format);
      if (format === "der")
        return hexToBytes(DER.hexFromSig(this));
      const { r, s } = this;
      const rb = Fn.toBytes(r);
      const sb = Fn.toBytes(s);
      if (format === "recovered") {
        assertSmallCofactor();
        return concatBytes(Uint8Array.of(this.assertRecovery()), rb, sb);
      }
      return concatBytes(rb, sb);
    }
    toHex(format) {
      return bytesToHex(this.toBytes(format));
    }
  }
  const bits2int = ecdsaOpts.bits2int || function bits2int_def(bytes) {
    if (bytes.length > 8192)
      throw new Error("input is too large");
    const num2 = bytesToNumberBE(bytes);
    const delta = bytes.length * 8 - fnBits;
    return delta > 0 ? num2 >> BigInt(delta) : num2;
  };
  const bits2int_modN = ecdsaOpts.bits2int_modN || function bits2int_modN_def(bytes) {
    return Fn.create(bits2int(bytes));
  };
  const ORDER_MASK = bitMask(fnBits);
  function int2octets(num2) {
    aInRange("num < 2^" + fnBits, num2, _0n4, ORDER_MASK);
    return Fn.toBytes(num2);
  }
  function validateMsgAndHash(message, prehash) {
    abytes(message, void 0, "message");
    return prehash ? abytes(hash(message), void 0, "prehashed message") : message;
  }
  function prepSig(message, secretKey, opts) {
    const { lowS, prehash, extraEntropy } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    const h1int = bits2int_modN(message);
    const d = Fn.fromBytes(secretKey);
    if (!Fn.isValidNot0(d))
      throw new Error("invalid private key");
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (extraEntropy != null && extraEntropy !== false) {
      const e = extraEntropy === true ? randomBytes3(lengths.secretKey) : extraEntropy;
      seedArgs.push(abytes(e, void 0, "extraEntropy"));
    }
    const seed = concatBytes(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!Fn.isValidNot0(k))
        return;
      const ik = Fn.inv(k);
      const q = Point.BASE.multiply(k).toAffine();
      const r = Fn.create(q.x);
      if (r === _0n4)
        return;
      const s = Fn.create(ik * Fn.create(m + r * d));
      if (s === _0n4)
        return;
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n4);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = Fn.neg(s);
        recovery ^= 1;
      }
      return new Signature(r, normS, hasLargeCofactor ? void 0 : recovery);
    }
    return { seed, k2sig };
  }
  function sign(message, secretKey, opts = {}) {
    const { seed, k2sig } = prepSig(message, secretKey, opts);
    const drbg = createHmacDrbg(hash.outputLen, Fn.BYTES, hmac2);
    const sig = drbg(seed, k2sig);
    return sig.toBytes(opts.format);
  }
  function verify(signature, message, publicKey, opts = {}) {
    const { lowS, prehash, format } = validateSigOpts(opts, defaultSigOpts);
    publicKey = abytes(publicKey, void 0, "publicKey");
    message = validateMsgAndHash(message, prehash);
    if (!isBytes(signature)) {
      const end = signature instanceof Signature ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + end);
    }
    validateSigLength(signature, format);
    try {
      const sig = Signature.fromBytes(signature, format);
      const P = Point.fromBytes(publicKey);
      if (lowS && sig.hasHighS())
        return false;
      const { r, s } = sig;
      const h = bits2int_modN(message);
      const is = Fn.inv(s);
      const u1 = Fn.create(h * is);
      const u2 = Fn.create(r * is);
      const R = Point.BASE.multiplyUnsafe(u1).add(P.multiplyUnsafe(u2));
      if (R.is0())
        return false;
      const v = Fn.create(R.x);
      return v === r;
    } catch (e) {
      return false;
    }
  }
  function recoverPublicKey(signature, message, opts = {}) {
    const { prehash } = validateSigOpts(opts, defaultSigOpts);
    message = validateMsgAndHash(message, prehash);
    return Signature.fromBytes(signature, "recovered").recoverPublicKey(message).toBytes();
  }
  return Object.freeze({
    keygen,
    getPublicKey: getPublicKey3,
    getSharedSecret,
    utils,
    lengths,
    Point,
    sign,
    verify,
    recoverPublicKey,
    Signature,
    hash
  });
}

// node_modules/nostr-tools/node_modules/@noble/curves/secp256k1.js
var secp256k1_CURVE = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
};
var secp256k1_ENDO = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
};
var _0n5 = /* @__PURE__ */ BigInt(0);
var _2n3 = /* @__PURE__ */ BigInt(2);
function sqrtMod(y) {
  const P = secp256k1_CURVE.p;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n3, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n3, P);
  if (!Fpk1.eql(Fpk1.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var Fpk1 = Field(secp256k1_CURVE.p, { sqrt: sqrtMod });
var Pointk1 = /* @__PURE__ */ weierstrass(secp256k1_CURVE, {
  Fp: Fpk1,
  endo: secp256k1_ENDO
});
var secp256k1 = /* @__PURE__ */ ecdsa(Pointk1, sha256);
var TAGGED_HASH_PREFIXES = {};
function taggedHash(tag, ...messages) {
  let tagP = TAGGED_HASH_PREFIXES[tag];
  if (tagP === void 0) {
    const tagH = sha256(asciiToBytes(tag));
    tagP = concatBytes(tagH, tagH);
    TAGGED_HASH_PREFIXES[tag] = tagP;
  }
  return sha256(concatBytes(tagP, ...messages));
}
var pointToBytes = (point) => point.toBytes(true).slice(1);
var hasEven = (y) => y % _2n3 === _0n5;
function schnorrGetExtPubKey(priv) {
  const { Fn, BASE } = Pointk1;
  const d_ = Fn.fromBytes(priv);
  const p = BASE.multiply(d_);
  const scalar = hasEven(p.y) ? d_ : Fn.neg(d_);
  return { scalar, bytes: pointToBytes(p) };
}
function lift_x(x) {
  const Fp = Fpk1;
  if (!Fp.isValidNot0(x))
    throw new Error("invalid x: Fail if x \u2265 p");
  const xx = Fp.create(x * x);
  const c = Fp.create(xx * x + BigInt(7));
  let y = Fp.sqrt(c);
  if (!hasEven(y))
    y = Fp.neg(y);
  const p = Pointk1.fromAffine({ x, y });
  p.assertValidity();
  return p;
}
var num = bytesToNumberBE;
function challenge(...args) {
  return Pointk1.Fn.create(num(taggedHash("BIP0340/challenge", ...args)));
}
function schnorrGetPublicKey(secretKey) {
  return schnorrGetExtPubKey(secretKey).bytes;
}
function schnorrSign(message, secretKey, auxRand = randomBytes(32)) {
  const { Fn } = Pointk1;
  const m = abytes(message, void 0, "message");
  const { bytes: px, scalar: d } = schnorrGetExtPubKey(secretKey);
  const a = abytes(auxRand, 32, "auxRand");
  const t = Fn.toBytes(d ^ num(taggedHash("BIP0340/aux", a)));
  const rand = taggedHash("BIP0340/nonce", t, px, m);
  const { bytes: rx, scalar: k } = schnorrGetExtPubKey(rand);
  const e = challenge(rx, px, m);
  const sig = new Uint8Array(64);
  sig.set(rx, 0);
  sig.set(Fn.toBytes(Fn.create(k + e * d)), 32);
  if (!schnorrVerify(sig, m, px))
    throw new Error("sign: Invalid signature produced");
  return sig;
}
function schnorrVerify(signature, message, publicKey) {
  const { Fp, Fn, BASE } = Pointk1;
  const sig = abytes(signature, 64, "signature");
  const m = abytes(message, void 0, "message");
  const pub = abytes(publicKey, 32, "publicKey");
  try {
    const P = lift_x(num(pub));
    const r = num(sig.subarray(0, 32));
    if (!Fp.isValidNot0(r))
      return false;
    const s = num(sig.subarray(32, 64));
    if (!Fn.isValidNot0(s))
      return false;
    const e = challenge(Fn.toBytes(r), pointToBytes(P), m);
    const R = BASE.multiplyUnsafe(s).add(P.multiplyUnsafe(Fn.neg(e)));
    const { x, y } = R.toAffine();
    if (R.is0() || !hasEven(y) || x !== r)
      return false;
    return true;
  } catch (error2) {
    return false;
  }
}
var schnorr = /* @__PURE__ */ (() => {
  const size = 32;
  const seedLength = 48;
  const randomSecretKey = (seed = randomBytes(seedLength)) => {
    return mapHashToField(seed, secp256k1_CURVE.n);
  };
  return {
    keygen: createKeygen(randomSecretKey, schnorrGetPublicKey),
    getPublicKey: schnorrGetPublicKey,
    sign: schnorrSign,
    verify: schnorrVerify,
    Point: Pointk1,
    utils: {
      randomSecretKey,
      taggedHash,
      lift_x,
      pointToBytes
    },
    lengths: {
      secretKey: size,
      publicKey: size,
      publicKeyHasPrefix: false,
      signature: size * 2,
      seed: seedLength
    }
  };
})();

// node_modules/nostr-tools/lib/esm/pool.js
var verifiedSymbol = /* @__PURE__ */ Symbol("verified");
var isRecord = (obj) => obj instanceof Object;
function validateEvent(event) {
  if (!isRecord(event))
    return false;
  if (typeof event.kind !== "number")
    return false;
  if (typeof event.content !== "string")
    return false;
  if (typeof event.created_at !== "number")
    return false;
  if (typeof event.pubkey !== "string")
    return false;
  if (!event.pubkey.match(/^[a-f0-9]{64}$/))
    return false;
  if (!Array.isArray(event.tags))
    return false;
  for (let i22 = 0; i22 < event.tags.length; i22++) {
    let tag = event.tags[i22];
    if (!Array.isArray(tag))
      return false;
    for (let j = 0; j < tag.length; j++) {
      if (typeof tag[j] !== "string")
        return false;
    }
  }
  return true;
}
var utf8Decoder = new TextDecoder("utf-8");
var utf8Encoder = new TextEncoder();
function normalizeURL(url) {
  try {
    if (url.indexOf("://") === -1)
      url = "wss://" + url;
    let p = new URL(url);
    if (p.protocol === "http:")
      p.protocol = "ws:";
    else if (p.protocol === "https:")
      p.protocol = "wss:";
    p.pathname = p.pathname.replace(/\/+/g, "/");
    if (p.pathname.endsWith("/"))
      p.pathname = p.pathname.slice(0, -1);
    if (p.port === "80" && p.protocol === "ws:" || p.port === "443" && p.protocol === "wss:")
      p.port = "";
    p.searchParams.sort();
    p.hash = "";
    return p.toString();
  } catch (e) {
    throw new Error(`Invalid URL: ${url}`);
  }
}
var JS = class {
  generateSecretKey() {
    return schnorr.utils.randomSecretKey();
  }
  getPublicKey(secretKey) {
    return bytesToHex(schnorr.getPublicKey(secretKey));
  }
  finalizeEvent(t, secretKey) {
    const event = t;
    event.pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
    event.id = getEventHash(event);
    event.sig = bytesToHex(schnorr.sign(hexToBytes(getEventHash(event)), secretKey));
    event[verifiedSymbol] = true;
    return event;
  }
  verifyEvent(event) {
    if (typeof event[verifiedSymbol] === "boolean")
      return event[verifiedSymbol];
    try {
      const hash = getEventHash(event);
      if (hash !== event.id) {
        event[verifiedSymbol] = false;
        return false;
      }
      const valid = schnorr.verify(hexToBytes(event.sig), hexToBytes(hash), hexToBytes(event.pubkey));
      event[verifiedSymbol] = valid;
      return valid;
    } catch (err) {
      event[verifiedSymbol] = false;
      return false;
    }
  }
};
function serializeEvent(evt) {
  if (!validateEvent(evt))
    throw new Error("can't serialize event with wrong or missing properties");
  return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
}
function getEventHash(event) {
  let eventHash = sha256(utf8Encoder.encode(serializeEvent(event)));
  return bytesToHex(eventHash);
}
var i = new JS();
var generateSecretKey = i.generateSecretKey;
var getPublicKey = i.getPublicKey;
var finalizeEvent = i.finalizeEvent;
var verifyEvent = i.verifyEvent;
var ClientAuth = 22242;
function matchFilter(filter, event) {
  if (filter.ids && filter.ids.indexOf(event.id) === -1) {
    return false;
  }
  if (filter.kinds && filter.kinds.indexOf(event.kind) === -1) {
    return false;
  }
  if (filter.authors && filter.authors.indexOf(event.pubkey) === -1) {
    return false;
  }
  for (let f in filter) {
    if (f[0] === "#") {
      let tagName = f.slice(1);
      let values = filter[`#${tagName}`];
      if (values && !event.tags.find(([t, v]) => t === f.slice(1) && values.indexOf(v) !== -1))
        return false;
    }
  }
  if (filter.since && event.created_at < filter.since)
    return false;
  if (filter.until && event.created_at > filter.until)
    return false;
  return true;
}
function matchFilters(filters, event) {
  for (let i22 = 0; i22 < filters.length; i22++) {
    if (matchFilter(filters[i22], event)) {
      return true;
    }
  }
  return false;
}
function getHex64(json, field) {
  let len = field.length + 3;
  let idx = json.indexOf(`"${field}":`) + len;
  let s = json.slice(idx).indexOf(`"`) + idx + 1;
  return json.slice(s, s + 64);
}
function getSubscriptionId(json) {
  let idx = json.slice(0, 22).indexOf(`"EVENT"`);
  if (idx === -1)
    return null;
  let pstart = json.slice(idx + 7 + 1).indexOf(`"`);
  if (pstart === -1)
    return null;
  let start = idx + 7 + 1 + pstart;
  let pend = json.slice(start + 1, 80).indexOf(`"`);
  if (pend === -1)
    return null;
  let end = start + 1 + pend;
  return json.slice(start + 1, end);
}
function makeAuthEvent(relayURL, challenge2) {
  return {
    kind: ClientAuth,
    created_at: Math.floor(Date.now() / 1e3),
    tags: [
      ["relay", relayURL],
      ["challenge", challenge2]
    ],
    content: ""
  };
}
var SendingOnClosedConnection = class extends Error {
  constructor(message, relay) {
    super(`Tried to send message '${message} on a closed connection to ${relay}.`);
    this.name = "SendingOnClosedConnection";
  }
};
var AbstractRelay = class {
  url;
  _connected = false;
  onclose = null;
  onnotice = (msg) => console.debug(`NOTICE from ${this.url}: ${msg}`);
  onauth;
  baseEoseTimeout = 4400;
  publishTimeout = 4400;
  pingFrequency = 29e3;
  pingTimeout = 2e4;
  resubscribeBackoff = [1e4, 1e4, 1e4, 2e4, 2e4, 3e4, 6e4];
  openSubs = /* @__PURE__ */ new Map();
  enablePing;
  enableReconnect;
  idleSince = Date.now();
  ongoingOperations = 0;
  reconnectTimeoutHandle;
  pingIntervalHandle;
  reconnectAttempts = 0;
  skipReconnection = false;
  connectionPromise;
  openCountRequests = /* @__PURE__ */ new Map();
  openEventPublishes = /* @__PURE__ */ new Map();
  ws;
  challenge;
  authPromise;
  serial = 0;
  verifyEvent;
  _WebSocket;
  constructor(url, opts) {
    this.url = normalizeURL(url);
    this.verifyEvent = opts.verifyEvent;
    this._WebSocket = opts.websocketImplementation || WebSocket;
    this.enablePing = opts.enablePing;
    this.enableReconnect = opts.enableReconnect || false;
  }
  static async connect(url, opts) {
    const relay = new AbstractRelay(url, opts);
    await relay.connect(opts);
    return relay;
  }
  closeAllSubscriptions(reason) {
    for (let [_, sub] of this.openSubs) {
      sub.close(reason);
    }
    this.openSubs.clear();
    for (let [_, ep] of this.openEventPublishes) {
      ep.reject(new Error(reason));
    }
    this.openEventPublishes.clear();
    for (let [_, cr] of this.openCountRequests) {
      cr.reject(new Error(reason));
    }
    this.openCountRequests.clear();
  }
  get connected() {
    return this._connected;
  }
  async reconnect() {
    const backoff = this.resubscribeBackoff[Math.min(this.reconnectAttempts, this.resubscribeBackoff.length - 1)];
    this.reconnectAttempts++;
    this.reconnectTimeoutHandle = setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
      }
    }, backoff);
  }
  handleHardClose(reason) {
    if (this.pingIntervalHandle) {
      clearInterval(this.pingIntervalHandle);
      this.pingIntervalHandle = void 0;
    }
    this._connected = false;
    this.connectionPromise = void 0;
    this.idleSince = void 0;
    if (this.enableReconnect && !this.skipReconnection) {
      this.reconnect();
    } else {
      this.onclose?.();
      this.closeAllSubscriptions(reason);
    }
  }
  async connect(opts) {
    let connectionTimeoutHandle;
    if (this.connectionPromise)
      return this.connectionPromise;
    this.challenge = void 0;
    this.authPromise = void 0;
    this.skipReconnection = false;
    this.connectionPromise = new Promise((resolve, reject) => {
      if (opts?.timeout) {
        connectionTimeoutHandle = setTimeout(() => {
          reject("connection timed out");
          this.connectionPromise = void 0;
          this.skipReconnection = true;
          this.onclose?.();
          this.handleHardClose("relay connection timed out");
        }, opts.timeout);
      }
      if (opts?.abort) {
        opts.abort.onabort = reject;
      }
      try {
        this.ws = new this._WebSocket(this.url);
      } catch (err) {
        clearTimeout(connectionTimeoutHandle);
        reject(err);
        return;
      }
      this.ws.onopen = () => {
        if (this.reconnectTimeoutHandle) {
          clearTimeout(this.reconnectTimeoutHandle);
          this.reconnectTimeoutHandle = void 0;
        }
        clearTimeout(connectionTimeoutHandle);
        this._connected = true;
        const isReconnection = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;
        for (const sub of this.openSubs.values()) {
          sub.eosed = false;
          if (isReconnection) {
            for (let f = 0; f < sub.filters.length; f++) {
              if (sub.lastEmitted) {
                sub.filters[f].since = sub.lastEmitted + 1;
              }
            }
          }
          sub.fire();
        }
        if (this.enablePing) {
          this.pingIntervalHandle = setInterval(() => this.pingpong(), this.pingFrequency);
        }
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(connectionTimeoutHandle);
        reject("connection failed");
        this.connectionPromise = void 0;
        this.skipReconnection = true;
        this.onclose?.();
        this.handleHardClose("relay connection failed");
      };
      this.ws.onclose = (ev) => {
        clearTimeout(connectionTimeoutHandle);
        reject(ev.message || "websocket closed");
        this.handleHardClose("relay connection closed");
      };
      this.ws.onmessage = this._onmessage.bind(this);
    });
    return this.connectionPromise;
  }
  waitForPingPong() {
    return new Promise((resolve) => {
      ;
      this.ws.once("pong", () => resolve(true));
      this.ws.ping();
    });
  }
  waitForDummyReq() {
    return new Promise((resolve, reject) => {
      if (!this.connectionPromise)
        return reject(new Error(`no connection to ${this.url}, can't ping`));
      try {
        const sub = this.subscribe(
          [{ ids: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"], limit: 0 }],
          {
            label: "<forced-ping>",
            oneose: () => {
              resolve(true);
              sub.close();
            },
            onclose() {
              resolve(true);
            },
            eoseTimeout: this.pingTimeout + 1e3
          }
        );
      } catch (err) {
        reject(err);
      }
    });
  }
  async pingpong() {
    if (this.ws?.readyState === 1) {
      const result = await Promise.any([
        this.ws && this.ws.ping && this.ws.once ? this.waitForPingPong() : this.waitForDummyReq(),
        new Promise((res) => setTimeout(() => res(false), this.pingTimeout))
      ]);
      if (!result) {
        if (this.ws?.readyState === this._WebSocket.OPEN) {
          this.ws?.close();
        }
      }
    }
  }
  async send(message) {
    if (!this.connectionPromise)
      throw new SendingOnClosedConnection(message, this.url);
    this.connectionPromise.then(() => {
      this.ws?.send(message);
    });
  }
  async auth(signAuthEvent) {
    const challenge2 = this.challenge;
    if (!challenge2)
      throw new Error("can't perform auth, no challenge was received");
    if (this.authPromise)
      return this.authPromise;
    this.authPromise = new Promise(async (resolve, reject) => {
      try {
        let evt = await signAuthEvent(makeAuthEvent(this.url, challenge2));
        let timeout = setTimeout(() => {
          let ep = this.openEventPublishes.get(evt.id);
          if (ep) {
            ep.reject(new Error("auth timed out"));
            this.openEventPublishes.delete(evt.id);
          }
        }, this.publishTimeout);
        this.openEventPublishes.set(evt.id, { resolve, reject, timeout });
        this.send('["AUTH",' + JSON.stringify(evt) + "]");
      } catch (err) {
        console.warn("subscribe auth function failed:", err);
      }
    });
    return this.authPromise;
  }
  async publish(event) {
    this.idleSince = void 0;
    this.ongoingOperations++;
    const ret = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const ep = this.openEventPublishes.get(event.id);
        if (ep) {
          ep.reject(new Error("publish timed out"));
          this.openEventPublishes.delete(event.id);
        }
      }, this.publishTimeout);
      this.openEventPublishes.set(event.id, { resolve, reject, timeout });
    });
    this.send('["EVENT",' + JSON.stringify(event) + "]");
    this.ongoingOperations--;
    if (this.ongoingOperations === 0)
      this.idleSince = Date.now();
    return ret;
  }
  async count(filters, params) {
    this.serial++;
    const id = params?.id || "count:" + this.serial;
    const ret = new Promise((resolve, reject) => {
      this.openCountRequests.set(id, { resolve, reject });
    });
    this.send('["COUNT","' + id + '",' + JSON.stringify(filters).substring(1));
    return ret;
  }
  subscribe(filters, params) {
    if (params.label !== "<forced-ping>") {
      this.idleSince = void 0;
      this.ongoingOperations++;
    }
    const sub = this.prepareSubscription(filters, params);
    sub.fire();
    if (params.abort) {
      params.abort.onabort = () => sub.close(String(params.abort.reason || "<aborted>"));
    }
    return sub;
  }
  prepareSubscription(filters, params) {
    this.serial++;
    const id = params.id || (params.label ? params.label + ":" : "sub:") + this.serial;
    const sub = new Subscription(this, id, filters, params);
    this.openSubs.set(id, sub);
    return sub;
  }
  close() {
    this.skipReconnection = true;
    if (this.reconnectTimeoutHandle) {
      clearTimeout(this.reconnectTimeoutHandle);
      this.reconnectTimeoutHandle = void 0;
    }
    if (this.pingIntervalHandle) {
      clearInterval(this.pingIntervalHandle);
      this.pingIntervalHandle = void 0;
    }
    this.closeAllSubscriptions("relay connection closed by us");
    this._connected = false;
    this.idleSince = void 0;
    this.onclose?.();
    if (this.ws?.readyState === this._WebSocket.OPEN) {
      this.ws?.close();
    }
  }
  _onmessage(ev) {
    const json = ev.data;
    if (!json) {
      return;
    }
    const subid = getSubscriptionId(json);
    if (subid) {
      const so = this.openSubs.get(subid);
      if (!so) {
        return;
      }
      const id = getHex64(json, "id");
      const alreadyHave = so.alreadyHaveEvent?.(id);
      so.receivedEvent?.(this, id);
      if (alreadyHave) {
        return;
      }
    }
    try {
      let data = JSON.parse(json);
      switch (data[0]) {
        case "EVENT": {
          const so = this.openSubs.get(data[1]);
          const event = data[2];
          if (this.verifyEvent(event) && matchFilters(so.filters, event)) {
            so.onevent(event);
          } else {
            so.oninvalidevent?.(event);
          }
          if (!so.lastEmitted || so.lastEmitted < event.created_at)
            so.lastEmitted = event.created_at;
          return;
        }
        case "COUNT": {
          const id = data[1];
          const payload = data[2];
          const cr = this.openCountRequests.get(id);
          if (cr) {
            cr.resolve(payload.count);
            this.openCountRequests.delete(id);
          }
          return;
        }
        case "EOSE": {
          const so = this.openSubs.get(data[1]);
          if (!so)
            return;
          so.receivedEose();
          return;
        }
        case "OK": {
          const id = data[1];
          const ok = data[2];
          const reason = data[3];
          const ep = this.openEventPublishes.get(id);
          if (ep) {
            clearTimeout(ep.timeout);
            if (ok)
              ep.resolve(reason);
            else
              ep.reject(new Error(reason));
            this.openEventPublishes.delete(id);
          }
          return;
        }
        case "CLOSED": {
          const id = data[1];
          const so = this.openSubs.get(id);
          if (!so)
            return;
          so.closed = true;
          so.close(data[2]);
          return;
        }
        case "NOTICE": {
          this.onnotice(data[1]);
          return;
        }
        case "AUTH": {
          this.challenge = data[1];
          if (this.onauth) {
            this.auth(this.onauth);
          }
          return;
        }
        default: {
          const so = this.openSubs.get(data[1]);
          so?.oncustom?.(data);
          return;
        }
      }
    } catch (err) {
      try {
        const [_, __, event] = JSON.parse(json);
        console.warn(`[nostr] relay ${this.url} error processing message:`, err, event);
      } catch (_) {
        console.warn(`[nostr] relay ${this.url} error processing message:`, err);
      }
      return;
    }
  }
};
var Subscription = class {
  relay;
  id;
  lastEmitted;
  closed = false;
  eosed = false;
  filters;
  alreadyHaveEvent;
  receivedEvent;
  onevent;
  oninvalidevent;
  oneose;
  onclose;
  oncustom;
  eoseTimeout;
  eoseTimeoutHandle;
  constructor(relay, id, filters, params) {
    if (filters.length === 0)
      throw new Error("subscription can't be created with zero filters");
    this.relay = relay;
    this.filters = filters;
    this.id = id;
    this.alreadyHaveEvent = params.alreadyHaveEvent;
    this.receivedEvent = params.receivedEvent;
    this.eoseTimeout = params.eoseTimeout || relay.baseEoseTimeout;
    this.oneose = params.oneose;
    this.onclose = params.onclose;
    this.oninvalidevent = params.oninvalidevent;
    this.onevent = params.onevent || ((event) => {
      console.warn(
        `onevent() callback not defined for subscription '${this.id}' in relay ${this.relay.url}. event received:`,
        event
      );
    });
  }
  fire() {
    this.relay.send('["REQ","' + this.id + '",' + JSON.stringify(this.filters).substring(1));
    this.eoseTimeoutHandle = setTimeout(this.receivedEose.bind(this), this.eoseTimeout);
  }
  receivedEose() {
    if (this.eosed)
      return;
    clearTimeout(this.eoseTimeoutHandle);
    this.eosed = true;
    this.oneose?.();
  }
  close(reason = "closed by caller") {
    if (!this.closed && this.relay.connected) {
      try {
        this.relay.send('["CLOSE",' + JSON.stringify(this.id) + "]");
      } catch (err) {
        if (err instanceof SendingOnClosedConnection) {
        } else {
          throw err;
        }
      }
      this.closed = true;
    }
    this.relay.openSubs.delete(this.id);
    this.relay.ongoingOperations--;
    if (this.relay.ongoingOperations === 0)
      this.relay.idleSince = Date.now();
    this.onclose?.(reason);
  }
};
var alwaysTrue = (t) => {
  t[verifiedSymbol] = true;
  return true;
};
var AbstractSimplePool = class {
  relays = /* @__PURE__ */ new Map();
  seenOn = /* @__PURE__ */ new Map();
  trackRelays = false;
  verifyEvent;
  enablePing;
  enableReconnect;
  automaticallyAuth;
  trustedRelayURLs = /* @__PURE__ */ new Set();
  onRelayConnectionFailure;
  onRelayConnectionSuccess;
  allowConnectingToRelay;
  maxWaitForConnection;
  _WebSocket;
  constructor(opts) {
    this.verifyEvent = opts.verifyEvent;
    this._WebSocket = opts.websocketImplementation;
    this.enablePing = opts.enablePing;
    this.enableReconnect = opts.enableReconnect || false;
    this.automaticallyAuth = opts.automaticallyAuth;
    this.onRelayConnectionFailure = opts.onRelayConnectionFailure;
    this.onRelayConnectionSuccess = opts.onRelayConnectionSuccess;
    this.allowConnectingToRelay = opts.allowConnectingToRelay;
    this.maxWaitForConnection = opts.maxWaitForConnection || 3e3;
  }
  async ensureRelay(url, params) {
    url = normalizeURL(url);
    let relay = this.relays.get(url);
    if (!relay) {
      relay = new AbstractRelay(url, {
        verifyEvent: this.trustedRelayURLs.has(url) ? alwaysTrue : this.verifyEvent,
        websocketImplementation: this._WebSocket,
        enablePing: this.enablePing,
        enableReconnect: this.enableReconnect
      });
      relay.onclose = () => {
        this.relays.delete(url);
      };
      this.relays.set(url, relay);
    }
    if (this.automaticallyAuth) {
      const authSignerFn = this.automaticallyAuth(url);
      if (authSignerFn) {
        relay.onauth = authSignerFn;
      }
    }
    try {
      await relay.connect({
        timeout: params?.connectionTimeout,
        abort: params?.abort
      });
    } catch (err) {
      this.relays.delete(url);
      throw err;
    }
    return relay;
  }
  close(relays) {
    relays.map(normalizeURL).forEach((url) => {
      this.relays.get(url)?.close();
      this.relays.delete(url);
    });
  }
  subscribe(relays, filter, params) {
    const request = [];
    const uniqUrls = [];
    for (let i22 = 0; i22 < relays.length; i22++) {
      const url = normalizeURL(relays[i22]);
      if (!request.find((r) => r.url === url)) {
        if (uniqUrls.indexOf(url) === -1) {
          uniqUrls.push(url);
          request.push({ url, filter });
        }
      }
    }
    return this.subscribeMap(request, params);
  }
  subscribeMany(relays, filter, params) {
    return this.subscribe(relays, filter, params);
  }
  subscribeMap(requests, params) {
    const grouped = /* @__PURE__ */ new Map();
    for (const req of requests) {
      const { url, filter } = req;
      if (!grouped.has(url))
        grouped.set(url, []);
      grouped.get(url).push(filter);
    }
    const groupedRequests = Array.from(grouped.entries()).map(([url, filters]) => ({ url, filters }));
    if (this.trackRelays) {
      params.receivedEvent = (relay, id) => {
        let set = this.seenOn.get(id);
        if (!set) {
          set = /* @__PURE__ */ new Set();
          this.seenOn.set(id, set);
        }
        set.add(relay);
      };
    }
    const _knownIds = /* @__PURE__ */ new Set();
    const subs = [];
    const eosesReceived = [];
    let handleEose = (i22) => {
      if (eosesReceived[i22])
        return;
      eosesReceived[i22] = true;
      if (eosesReceived.filter((a) => a).length === groupedRequests.length) {
        params.oneose?.();
        handleEose = () => {
        };
      }
    };
    const closesReceived = [];
    let handleClose = (i22, reason) => {
      if (closesReceived[i22])
        return;
      handleEose(i22);
      closesReceived[i22] = reason;
      if (closesReceived.filter((a) => a).length === groupedRequests.length) {
        params.onclose?.(closesReceived);
        handleClose = () => {
        };
      }
    };
    const localAlreadyHaveEventHandler = (id) => {
      if (params.alreadyHaveEvent?.(id)) {
        return true;
      }
      const have = _knownIds.has(id);
      _knownIds.add(id);
      return have;
    };
    const allOpened = Promise.all(
      groupedRequests.map(async ({ url, filters }, i22) => {
        if (this.allowConnectingToRelay?.(url, ["read", filters]) === false) {
          handleClose(i22, "connection skipped by allowConnectingToRelay");
          return;
        }
        let relay;
        try {
          relay = await this.ensureRelay(url, {
            connectionTimeout: this.maxWaitForConnection < (params.maxWait || 0) ? Math.max(params.maxWait * 0.8, params.maxWait - 1e3) : this.maxWaitForConnection,
            abort: params.abort
          });
        } catch (err) {
          this.onRelayConnectionFailure?.(url);
          handleClose(i22, err?.message || String(err));
          return;
        }
        this.onRelayConnectionSuccess?.(url);
        let subscription = relay.subscribe(filters, {
          ...params,
          oneose: () => handleEose(i22),
          onclose: (reason) => {
            if (reason.startsWith("auth-required: ") && params.onauth) {
              relay.auth(params.onauth).then(() => {
                relay.subscribe(filters, {
                  ...params,
                  oneose: () => handleEose(i22),
                  onclose: (reason2) => {
                    handleClose(i22, reason2);
                  },
                  alreadyHaveEvent: localAlreadyHaveEventHandler,
                  eoseTimeout: params.maxWait,
                  abort: params.abort
                });
              }).catch((err) => {
                handleClose(i22, `auth was required and attempted, but failed with: ${err}`);
              });
            } else {
              handleClose(i22, reason);
            }
          },
          alreadyHaveEvent: localAlreadyHaveEventHandler,
          eoseTimeout: params.maxWait,
          abort: params.abort
        });
        subs.push(subscription);
      })
    );
    return {
      async close(reason) {
        await allOpened;
        subs.forEach((sub) => {
          sub.close(reason);
        });
      }
    };
  }
  subscribeEose(relays, filter, params) {
    let subcloser;
    subcloser = this.subscribe(relays, filter, {
      ...params,
      oneose() {
        const reason = "closed automatically on eose";
        if (subcloser)
          subcloser.close(reason);
        else
          params.onclose?.(relays.map((_) => reason));
      }
    });
    return subcloser;
  }
  subscribeManyEose(relays, filter, params) {
    return this.subscribeEose(relays, filter, params);
  }
  async querySync(relays, filter, params) {
    return new Promise(async (resolve) => {
      const events = [];
      this.subscribeEose(relays, filter, {
        ...params,
        onevent(event) {
          events.push(event);
        },
        onclose(_) {
          resolve(events);
        }
      });
    });
  }
  async get(relays, filter, params) {
    filter.limit = 1;
    const events = await this.querySync(relays, filter, params);
    events.sort((a, b) => b.created_at - a.created_at);
    return events[0] || null;
  }
  publish(relays, event, params) {
    return relays.map(normalizeURL).map(async (url, i22, arr) => {
      if (arr.indexOf(url) !== i22) {
        return Promise.reject("duplicate url");
      }
      if (this.allowConnectingToRelay?.(url, ["write", event]) === false) {
        return Promise.reject("connection skipped by allowConnectingToRelay");
      }
      let r;
      try {
        r = await this.ensureRelay(url, {
          connectionTimeout: this.maxWaitForConnection < (params?.maxWait || 0) ? Math.max(params.maxWait * 0.8, params.maxWait - 1e3) : this.maxWaitForConnection,
          abort: params?.abort
        });
      } catch (err) {
        this.onRelayConnectionFailure?.(url);
        return String("connection failure: " + String(err));
      }
      return r.publish(event).catch(async (err) => {
        if (err instanceof Error && err.message.startsWith("auth-required: ") && params?.onauth) {
          await r.auth(params.onauth);
          return r.publish(event);
        }
        throw err;
      }).then((reason) => {
        if (this.trackRelays) {
          let set = this.seenOn.get(event.id);
          if (!set) {
            set = /* @__PURE__ */ new Set();
            this.seenOn.set(event.id, set);
          }
          set.add(r);
        }
        return reason;
      });
    });
  }
  listConnectionStatus() {
    const map = /* @__PURE__ */ new Map();
    this.relays.forEach((relay, url) => map.set(url, relay.connected));
    return map;
  }
  destroy() {
    this.relays.forEach((conn) => conn.close());
    this.relays = /* @__PURE__ */ new Map();
  }
  pruneIdleRelays(idleThresholdMs = 1e4) {
    const prunedUrls = [];
    for (const [url, relay] of this.relays) {
      if (relay.idleSince && Date.now() - relay.idleSince >= idleThresholdMs) {
        this.relays.delete(url);
        prunedUrls.push(url);
        relay.close();
      }
    }
    return prunedUrls;
  }
};
var _WebSocket;
try {
  _WebSocket = WebSocket;
} catch {
}
function useWebSocketImplementation(websocketImplementation) {
  _WebSocket = websocketImplementation;
}
var SimplePool = class extends AbstractSimplePool {
  constructor(options) {
    super({ verifyEvent, websocketImplementation: _WebSocket, maxWaitForConnection: 3e3, ...options });
  }
};

// node_modules/nostr-tools/node_modules/@noble/ciphers/utils.js
function isBytes2(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abool2(b) {
  if (typeof b !== "boolean")
    throw new Error(`boolean expected, not ${b}`);
}
function anumber2(n) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error("positive integer expected, got " + n);
}
function abytes2(value, length, title = "") {
  const bytes = isBytes2(value);
  const len = value?.length;
  const needsLen = length !== void 0;
  if (!bytes || needsLen && len !== length) {
    const prefix = title && `"${title}" `;
    const ofLen = needsLen ? ` of length ${length}` : "";
    const got = bytes ? `length=${len}` : `type=${typeof value}`;
    throw new Error(prefix + "expected Uint8Array" + ofLen + ", got " + got);
  }
  return value;
}
function aexists2(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput2(out, instance) {
  abytes2(out, void 0, "output");
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function u32(arr) {
  return new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
}
function clean2(...arrays) {
  for (let i3 = 0; i3 < arrays.length; i3++) {
    arrays[i3].fill(0);
  }
}
function createView2(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
var isLE = /* @__PURE__ */ (() => new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68)();
function checkOpts(defaults, opts) {
  if (opts == null || typeof opts !== "object")
    throw new Error("options must be defined");
  const merged = Object.assign(defaults, opts);
  return merged;
}
function equalBytes(a, b) {
  if (a.length !== b.length)
    return false;
  let diff = 0;
  for (let i3 = 0; i3 < a.length; i3++)
    diff |= a[i3] ^ b[i3];
  return diff === 0;
}
var wrapCipher = /* @__NO_SIDE_EFFECTS__ */ (params, constructor) => {
  function wrappedCipher(key, ...args) {
    abytes2(key, void 0, "key");
    if (!isLE)
      throw new Error("Non little-endian hardware is not yet supported");
    if (params.nonceLength !== void 0) {
      const nonce = args[0];
      abytes2(nonce, params.varSizeNonce ? void 0 : params.nonceLength, "nonce");
    }
    const tagl = params.tagLength;
    if (tagl && args[1] !== void 0)
      abytes2(args[1], void 0, "AAD");
    const cipher = constructor(key, ...args);
    const checkOutput = (fnLength, output) => {
      if (output !== void 0) {
        if (fnLength !== 2)
          throw new Error("cipher output not supported");
        abytes2(output, void 0, "output");
      }
    };
    let called = false;
    const wrCipher = {
      encrypt(data, output) {
        if (called)
          throw new Error("cannot encrypt() twice with same key + nonce");
        called = true;
        abytes2(data);
        checkOutput(cipher.encrypt.length, output);
        return cipher.encrypt(data, output);
      },
      decrypt(data, output) {
        abytes2(data);
        if (tagl && data.length < tagl)
          throw new Error('"ciphertext" expected length bigger than tagLength=' + tagl);
        checkOutput(cipher.decrypt.length, output);
        return cipher.decrypt(data, output);
      }
    };
    return wrCipher;
  }
  Object.assign(wrappedCipher, params);
  return wrappedCipher;
};
function getOutput(expectedLength, out, onlyAligned = true) {
  if (out === void 0)
    return new Uint8Array(expectedLength);
  if (out.length !== expectedLength)
    throw new Error('"output" expected Uint8Array of length ' + expectedLength + ", got: " + out.length);
  if (onlyAligned && !isAligned32(out))
    throw new Error("invalid output, must be aligned");
  return out;
}
function u64Lengths(dataLength, aadLength, isLE2) {
  abool2(isLE2);
  const num2 = new Uint8Array(16);
  const view = createView2(num2);
  view.setBigUint64(0, BigInt(aadLength), isLE2);
  view.setBigUint64(8, BigInt(dataLength), isLE2);
  return num2;
}
function isAligned32(bytes) {
  return bytes.byteOffset % 4 === 0;
}
function copyBytes2(bytes) {
  return Uint8Array.from(bytes);
}

// node_modules/nostr-tools/node_modules/@noble/ciphers/_arx.js
var encodeStr = (str) => Uint8Array.from(str.split(""), (c) => c.charCodeAt(0));
var sigma16 = encodeStr("expand 16-byte k");
var sigma32 = encodeStr("expand 32-byte k");
var sigma16_32 = u32(sigma16);
var sigma32_32 = u32(sigma32);
function rotl(a, b) {
  return a << b | a >>> 32 - b;
}
function isAligned322(b) {
  return b.byteOffset % 4 === 0;
}
var BLOCK_LEN = 64;
var BLOCK_LEN32 = 16;
var MAX_COUNTER = 2 ** 32 - 1;
var U32_EMPTY = Uint32Array.of();
function runCipher(core, sigma, key, nonce, data, output, counter, rounds) {
  const len = data.length;
  const block = new Uint8Array(BLOCK_LEN);
  const b32 = u32(block);
  const isAligned = isAligned322(data) && isAligned322(output);
  const d32 = isAligned ? u32(data) : U32_EMPTY;
  const o32 = isAligned ? u32(output) : U32_EMPTY;
  for (let pos = 0; pos < len; counter++) {
    core(sigma, key, nonce, b32, counter, rounds);
    if (counter >= MAX_COUNTER)
      throw new Error("arx: counter overflow");
    const take = Math.min(BLOCK_LEN, len - pos);
    if (isAligned && take === BLOCK_LEN) {
      const pos32 = pos / 4;
      if (pos % 4 !== 0)
        throw new Error("arx: invalid block position");
      for (let j = 0, posj; j < BLOCK_LEN32; j++) {
        posj = pos32 + j;
        o32[posj] = d32[posj] ^ b32[j];
      }
      pos += BLOCK_LEN;
      continue;
    }
    for (let j = 0, posj; j < take; j++) {
      posj = pos + j;
      output[posj] = data[posj] ^ block[j];
    }
    pos += take;
  }
}
function createCipher(core, opts) {
  const { allowShortKeys, extendNonceFn, counterLength, counterRight, rounds } = checkOpts({ allowShortKeys: false, counterLength: 8, counterRight: false, rounds: 20 }, opts);
  if (typeof core !== "function")
    throw new Error("core must be a function");
  anumber2(counterLength);
  anumber2(rounds);
  abool2(counterRight);
  abool2(allowShortKeys);
  return (key, nonce, data, output, counter = 0) => {
    abytes2(key, void 0, "key");
    abytes2(nonce, void 0, "nonce");
    abytes2(data, void 0, "data");
    const len = data.length;
    if (output === void 0)
      output = new Uint8Array(len);
    abytes2(output, void 0, "output");
    anumber2(counter);
    if (counter < 0 || counter >= MAX_COUNTER)
      throw new Error("arx: counter overflow");
    if (output.length < len)
      throw new Error(`arx: output (${output.length}) is shorter than data (${len})`);
    const toClean = [];
    let l = key.length;
    let k;
    let sigma;
    if (l === 32) {
      toClean.push(k = copyBytes2(key));
      sigma = sigma32_32;
    } else if (l === 16 && allowShortKeys) {
      k = new Uint8Array(32);
      k.set(key);
      k.set(key, 16);
      sigma = sigma16_32;
      toClean.push(k);
    } else {
      abytes2(key, 32, "arx key");
      throw new Error("invalid key size");
    }
    if (!isAligned322(nonce))
      toClean.push(nonce = copyBytes2(nonce));
    const k32 = u32(k);
    if (extendNonceFn) {
      if (nonce.length !== 24)
        throw new Error(`arx: extended nonce must be 24 bytes`);
      extendNonceFn(sigma, k32, u32(nonce.subarray(0, 16)), k32);
      nonce = nonce.subarray(16);
    }
    const nonceNcLen = 16 - counterLength;
    if (nonceNcLen !== nonce.length)
      throw new Error(`arx: nonce must be ${nonceNcLen} or 16 bytes`);
    if (nonceNcLen !== 12) {
      const nc = new Uint8Array(12);
      nc.set(nonce, counterRight ? 0 : 12 - nonce.length);
      nonce = nc;
      toClean.push(nonce);
    }
    const n32 = u32(nonce);
    runCipher(core, sigma, k32, n32, data, output, counter, rounds);
    clean2(...toClean);
    return output;
  };
}

// node_modules/nostr-tools/node_modules/@noble/ciphers/_poly1305.js
function u8to16(a, i3) {
  return a[i3++] & 255 | (a[i3++] & 255) << 8;
}
var Poly1305 = class {
  blockLen = 16;
  outputLen = 16;
  buffer = new Uint8Array(16);
  r = new Uint16Array(10);
  // Allocating 1 array with .subarray() here is slower than 3
  h = new Uint16Array(10);
  pad = new Uint16Array(8);
  pos = 0;
  finished = false;
  // Can be speed-up using BigUint64Array, at the cost of complexity
  constructor(key) {
    key = copyBytes2(abytes2(key, 32, "key"));
    const t0 = u8to16(key, 0);
    const t1 = u8to16(key, 2);
    const t2 = u8to16(key, 4);
    const t3 = u8to16(key, 6);
    const t4 = u8to16(key, 8);
    const t5 = u8to16(key, 10);
    const t6 = u8to16(key, 12);
    const t7 = u8to16(key, 14);
    this.r[0] = t0 & 8191;
    this.r[1] = (t0 >>> 13 | t1 << 3) & 8191;
    this.r[2] = (t1 >>> 10 | t2 << 6) & 7939;
    this.r[3] = (t2 >>> 7 | t3 << 9) & 8191;
    this.r[4] = (t3 >>> 4 | t4 << 12) & 255;
    this.r[5] = t4 >>> 1 & 8190;
    this.r[6] = (t4 >>> 14 | t5 << 2) & 8191;
    this.r[7] = (t5 >>> 11 | t6 << 5) & 8065;
    this.r[8] = (t6 >>> 8 | t7 << 8) & 8191;
    this.r[9] = t7 >>> 5 & 127;
    for (let i3 = 0; i3 < 8; i3++)
      this.pad[i3] = u8to16(key, 16 + 2 * i3);
  }
  process(data, offset, isLast = false) {
    const hibit = isLast ? 0 : 1 << 11;
    const { h, r } = this;
    const r0 = r[0];
    const r1 = r[1];
    const r2 = r[2];
    const r3 = r[3];
    const r4 = r[4];
    const r5 = r[5];
    const r6 = r[6];
    const r7 = r[7];
    const r8 = r[8];
    const r9 = r[9];
    const t0 = u8to16(data, offset + 0);
    const t1 = u8to16(data, offset + 2);
    const t2 = u8to16(data, offset + 4);
    const t3 = u8to16(data, offset + 6);
    const t4 = u8to16(data, offset + 8);
    const t5 = u8to16(data, offset + 10);
    const t6 = u8to16(data, offset + 12);
    const t7 = u8to16(data, offset + 14);
    let h0 = h[0] + (t0 & 8191);
    let h1 = h[1] + ((t0 >>> 13 | t1 << 3) & 8191);
    let h2 = h[2] + ((t1 >>> 10 | t2 << 6) & 8191);
    let h3 = h[3] + ((t2 >>> 7 | t3 << 9) & 8191);
    let h4 = h[4] + ((t3 >>> 4 | t4 << 12) & 8191);
    let h5 = h[5] + (t4 >>> 1 & 8191);
    let h6 = h[6] + ((t4 >>> 14 | t5 << 2) & 8191);
    let h7 = h[7] + ((t5 >>> 11 | t6 << 5) & 8191);
    let h8 = h[8] + ((t6 >>> 8 | t7 << 8) & 8191);
    let h9 = h[9] + (t7 >>> 5 | hibit);
    let c = 0;
    let d0 = c + h0 * r0 + h1 * (5 * r9) + h2 * (5 * r8) + h3 * (5 * r7) + h4 * (5 * r6);
    c = d0 >>> 13;
    d0 &= 8191;
    d0 += h5 * (5 * r5) + h6 * (5 * r4) + h7 * (5 * r3) + h8 * (5 * r2) + h9 * (5 * r1);
    c += d0 >>> 13;
    d0 &= 8191;
    let d1 = c + h0 * r1 + h1 * r0 + h2 * (5 * r9) + h3 * (5 * r8) + h4 * (5 * r7);
    c = d1 >>> 13;
    d1 &= 8191;
    d1 += h5 * (5 * r6) + h6 * (5 * r5) + h7 * (5 * r4) + h8 * (5 * r3) + h9 * (5 * r2);
    c += d1 >>> 13;
    d1 &= 8191;
    let d2 = c + h0 * r2 + h1 * r1 + h2 * r0 + h3 * (5 * r9) + h4 * (5 * r8);
    c = d2 >>> 13;
    d2 &= 8191;
    d2 += h5 * (5 * r7) + h6 * (5 * r6) + h7 * (5 * r5) + h8 * (5 * r4) + h9 * (5 * r3);
    c += d2 >>> 13;
    d2 &= 8191;
    let d3 = c + h0 * r3 + h1 * r2 + h2 * r1 + h3 * r0 + h4 * (5 * r9);
    c = d3 >>> 13;
    d3 &= 8191;
    d3 += h5 * (5 * r8) + h6 * (5 * r7) + h7 * (5 * r6) + h8 * (5 * r5) + h9 * (5 * r4);
    c += d3 >>> 13;
    d3 &= 8191;
    let d4 = c + h0 * r4 + h1 * r3 + h2 * r2 + h3 * r1 + h4 * r0;
    c = d4 >>> 13;
    d4 &= 8191;
    d4 += h5 * (5 * r9) + h6 * (5 * r8) + h7 * (5 * r7) + h8 * (5 * r6) + h9 * (5 * r5);
    c += d4 >>> 13;
    d4 &= 8191;
    let d5 = c + h0 * r5 + h1 * r4 + h2 * r3 + h3 * r2 + h4 * r1;
    c = d5 >>> 13;
    d5 &= 8191;
    d5 += h5 * r0 + h6 * (5 * r9) + h7 * (5 * r8) + h8 * (5 * r7) + h9 * (5 * r6);
    c += d5 >>> 13;
    d5 &= 8191;
    let d6 = c + h0 * r6 + h1 * r5 + h2 * r4 + h3 * r3 + h4 * r2;
    c = d6 >>> 13;
    d6 &= 8191;
    d6 += h5 * r1 + h6 * r0 + h7 * (5 * r9) + h8 * (5 * r8) + h9 * (5 * r7);
    c += d6 >>> 13;
    d6 &= 8191;
    let d7 = c + h0 * r7 + h1 * r6 + h2 * r5 + h3 * r4 + h4 * r3;
    c = d7 >>> 13;
    d7 &= 8191;
    d7 += h5 * r2 + h6 * r1 + h7 * r0 + h8 * (5 * r9) + h9 * (5 * r8);
    c += d7 >>> 13;
    d7 &= 8191;
    let d8 = c + h0 * r8 + h1 * r7 + h2 * r6 + h3 * r5 + h4 * r4;
    c = d8 >>> 13;
    d8 &= 8191;
    d8 += h5 * r3 + h6 * r2 + h7 * r1 + h8 * r0 + h9 * (5 * r9);
    c += d8 >>> 13;
    d8 &= 8191;
    let d9 = c + h0 * r9 + h1 * r8 + h2 * r7 + h3 * r6 + h4 * r5;
    c = d9 >>> 13;
    d9 &= 8191;
    d9 += h5 * r4 + h6 * r3 + h7 * r2 + h8 * r1 + h9 * r0;
    c += d9 >>> 13;
    d9 &= 8191;
    c = (c << 2) + c | 0;
    c = c + d0 | 0;
    d0 = c & 8191;
    c = c >>> 13;
    d1 += c;
    h[0] = d0;
    h[1] = d1;
    h[2] = d2;
    h[3] = d3;
    h[4] = d4;
    h[5] = d5;
    h[6] = d6;
    h[7] = d7;
    h[8] = d8;
    h[9] = d9;
  }
  finalize() {
    const { h, pad: pad2 } = this;
    const g = new Uint16Array(10);
    let c = h[1] >>> 13;
    h[1] &= 8191;
    for (let i3 = 2; i3 < 10; i3++) {
      h[i3] += c;
      c = h[i3] >>> 13;
      h[i3] &= 8191;
    }
    h[0] += c * 5;
    c = h[0] >>> 13;
    h[0] &= 8191;
    h[1] += c;
    c = h[1] >>> 13;
    h[1] &= 8191;
    h[2] += c;
    g[0] = h[0] + 5;
    c = g[0] >>> 13;
    g[0] &= 8191;
    for (let i3 = 1; i3 < 10; i3++) {
      g[i3] = h[i3] + c;
      c = g[i3] >>> 13;
      g[i3] &= 8191;
    }
    g[9] -= 1 << 13;
    let mask = (c ^ 1) - 1;
    for (let i3 = 0; i3 < 10; i3++)
      g[i3] &= mask;
    mask = ~mask;
    for (let i3 = 0; i3 < 10; i3++)
      h[i3] = h[i3] & mask | g[i3];
    h[0] = (h[0] | h[1] << 13) & 65535;
    h[1] = (h[1] >>> 3 | h[2] << 10) & 65535;
    h[2] = (h[2] >>> 6 | h[3] << 7) & 65535;
    h[3] = (h[3] >>> 9 | h[4] << 4) & 65535;
    h[4] = (h[4] >>> 12 | h[5] << 1 | h[6] << 14) & 65535;
    h[5] = (h[6] >>> 2 | h[7] << 11) & 65535;
    h[6] = (h[7] >>> 5 | h[8] << 8) & 65535;
    h[7] = (h[8] >>> 8 | h[9] << 5) & 65535;
    let f = h[0] + pad2[0];
    h[0] = f & 65535;
    for (let i3 = 1; i3 < 8; i3++) {
      f = (h[i3] + pad2[i3] | 0) + (f >>> 16) | 0;
      h[i3] = f & 65535;
    }
    clean2(g);
  }
  update(data) {
    aexists2(this);
    abytes2(data);
    data = copyBytes2(data);
    const { buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(data, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(buffer, 0, false);
        this.pos = 0;
      }
    }
    return this;
  }
  destroy() {
    clean2(this.h, this.r, this.buffer, this.pad);
  }
  digestInto(out) {
    aexists2(this);
    aoutput2(out, this);
    this.finished = true;
    const { buffer, h } = this;
    let { pos } = this;
    if (pos) {
      buffer[pos++] = 1;
      for (; pos < 16; pos++)
        buffer[pos] = 0;
      this.process(buffer, 0, true);
    }
    this.finalize();
    let opos = 0;
    for (let i3 = 0; i3 < 8; i3++) {
      out[opos++] = h[i3] >>> 0;
      out[opos++] = h[i3] >>> 8;
    }
    return out;
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
};
function wrapConstructorWithKey(hashCons) {
  const hashC = (msg, key) => hashCons(key).update(msg).digest();
  const tmp = hashCons(new Uint8Array(32));
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (key) => hashCons(key);
  return hashC;
}
var poly1305 = /* @__PURE__ */ (() => wrapConstructorWithKey((key) => new Poly1305(key)))();

// node_modules/nostr-tools/node_modules/@noble/ciphers/chacha.js
function chachaCore(s, k, n, out, cnt, rounds = 20) {
  let y00 = s[0], y01 = s[1], y02 = s[2], y03 = s[3], y04 = k[0], y05 = k[1], y06 = k[2], y07 = k[3], y08 = k[4], y09 = k[5], y10 = k[6], y11 = k[7], y12 = cnt, y13 = n[0], y14 = n[1], y15 = n[2];
  let x00 = y00, x01 = y01, x02 = y02, x03 = y03, x04 = y04, x05 = y05, x06 = y06, x07 = y07, x08 = y08, x09 = y09, x10 = y10, x11 = y11, x12 = y12, x13 = y13, x14 = y14, x15 = y15;
  for (let r = 0; r < rounds; r += 2) {
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 16);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 12);
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 8);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 7);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 16);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 12);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 8);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 7);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 16);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 12);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 8);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 7);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 16);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 12);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 8);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 7);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 16);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 12);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 8);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 7);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 16);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 12);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 8);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 7);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 16);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 12);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 8);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 7);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 16);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 12);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 8);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 7);
  }
  let oi = 0;
  out[oi++] = y00 + x00 | 0;
  out[oi++] = y01 + x01 | 0;
  out[oi++] = y02 + x02 | 0;
  out[oi++] = y03 + x03 | 0;
  out[oi++] = y04 + x04 | 0;
  out[oi++] = y05 + x05 | 0;
  out[oi++] = y06 + x06 | 0;
  out[oi++] = y07 + x07 | 0;
  out[oi++] = y08 + x08 | 0;
  out[oi++] = y09 + x09 | 0;
  out[oi++] = y10 + x10 | 0;
  out[oi++] = y11 + x11 | 0;
  out[oi++] = y12 + x12 | 0;
  out[oi++] = y13 + x13 | 0;
  out[oi++] = y14 + x14 | 0;
  out[oi++] = y15 + x15 | 0;
}
function hchacha(s, k, i3, out) {
  let x00 = s[0], x01 = s[1], x02 = s[2], x03 = s[3], x04 = k[0], x05 = k[1], x06 = k[2], x07 = k[3], x08 = k[4], x09 = k[5], x10 = k[6], x11 = k[7], x12 = i3[0], x13 = i3[1], x14 = i3[2], x15 = i3[3];
  for (let r = 0; r < 20; r += 2) {
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 16);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 12);
    x00 = x00 + x04 | 0;
    x12 = rotl(x12 ^ x00, 8);
    x08 = x08 + x12 | 0;
    x04 = rotl(x04 ^ x08, 7);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 16);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 12);
    x01 = x01 + x05 | 0;
    x13 = rotl(x13 ^ x01, 8);
    x09 = x09 + x13 | 0;
    x05 = rotl(x05 ^ x09, 7);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 16);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 12);
    x02 = x02 + x06 | 0;
    x14 = rotl(x14 ^ x02, 8);
    x10 = x10 + x14 | 0;
    x06 = rotl(x06 ^ x10, 7);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 16);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 12);
    x03 = x03 + x07 | 0;
    x15 = rotl(x15 ^ x03, 8);
    x11 = x11 + x15 | 0;
    x07 = rotl(x07 ^ x11, 7);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 16);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 12);
    x00 = x00 + x05 | 0;
    x15 = rotl(x15 ^ x00, 8);
    x10 = x10 + x15 | 0;
    x05 = rotl(x05 ^ x10, 7);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 16);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 12);
    x01 = x01 + x06 | 0;
    x12 = rotl(x12 ^ x01, 8);
    x11 = x11 + x12 | 0;
    x06 = rotl(x06 ^ x11, 7);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 16);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 12);
    x02 = x02 + x07 | 0;
    x13 = rotl(x13 ^ x02, 8);
    x08 = x08 + x13 | 0;
    x07 = rotl(x07 ^ x08, 7);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 16);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 12);
    x03 = x03 + x04 | 0;
    x14 = rotl(x14 ^ x03, 8);
    x09 = x09 + x14 | 0;
    x04 = rotl(x04 ^ x09, 7);
  }
  let oi = 0;
  out[oi++] = x00;
  out[oi++] = x01;
  out[oi++] = x02;
  out[oi++] = x03;
  out[oi++] = x12;
  out[oi++] = x13;
  out[oi++] = x14;
  out[oi++] = x15;
}
var chacha20 = /* @__PURE__ */ createCipher(chachaCore, {
  counterRight: false,
  counterLength: 4,
  allowShortKeys: false
});
var xchacha20 = /* @__PURE__ */ createCipher(chachaCore, {
  counterRight: false,
  counterLength: 8,
  extendNonceFn: hchacha,
  allowShortKeys: false
});
var ZEROS16 = /* @__PURE__ */ new Uint8Array(16);
var updatePadded = (h, msg) => {
  h.update(msg);
  const leftover = msg.length % 16;
  if (leftover)
    h.update(ZEROS16.subarray(leftover));
};
var ZEROS32 = /* @__PURE__ */ new Uint8Array(32);
function computeTag(fn, key, nonce, ciphertext, AAD) {
  if (AAD !== void 0)
    abytes2(AAD, void 0, "AAD");
  const authKey = fn(key, nonce, ZEROS32);
  const lengths = u64Lengths(ciphertext.length, AAD ? AAD.length : 0, true);
  const h = poly1305.create(authKey);
  if (AAD)
    updatePadded(h, AAD);
  updatePadded(h, ciphertext);
  h.update(lengths);
  const res = h.digest();
  clean2(authKey, lengths);
  return res;
}
var _poly1305_aead = (xorStream) => (key, nonce, AAD) => {
  const tagLength = 16;
  return {
    encrypt(plaintext, output) {
      const plength = plaintext.length;
      output = getOutput(plength + tagLength, output, false);
      output.set(plaintext);
      const oPlain = output.subarray(0, -tagLength);
      xorStream(key, nonce, oPlain, oPlain, 1);
      const tag = computeTag(xorStream, key, nonce, oPlain, AAD);
      output.set(tag, plength);
      clean2(tag);
      return output;
    },
    decrypt(ciphertext, output) {
      output = getOutput(ciphertext.length - tagLength, output, false);
      const data = ciphertext.subarray(0, -tagLength);
      const passedTag = ciphertext.subarray(-tagLength);
      const tag = computeTag(xorStream, key, nonce, data, AAD);
      if (!equalBytes(passedTag, tag))
        throw new Error("invalid tag");
      output.set(ciphertext.subarray(0, -tagLength));
      xorStream(key, nonce, output, output, 1);
      clean2(tag);
      return output;
    }
  };
};
var chacha20poly1305 = /* @__PURE__ */ wrapCipher({ blockSize: 64, nonceLength: 12, tagLength: 16 }, _poly1305_aead(chacha20));
var xchacha20poly1305 = /* @__PURE__ */ wrapCipher({ blockSize: 64, nonceLength: 24, tagLength: 16 }, _poly1305_aead(xchacha20));

// node_modules/nostr-tools/node_modules/@noble/hashes/hkdf.js
function extract(hash, ikm, salt) {
  ahash(hash);
  if (salt === void 0)
    salt = new Uint8Array(hash.outputLen);
  return hmac(hash, salt, ikm);
}
var HKDF_COUNTER = /* @__PURE__ */ Uint8Array.of(0);
var EMPTY_BUFFER = /* @__PURE__ */ Uint8Array.of();
function expand(hash, prk, info, length = 32) {
  ahash(hash);
  anumber(length, "length");
  const olen = hash.outputLen;
  if (length > 255 * olen)
    throw new Error("Length must be <= 255*HashLen");
  const blocks = Math.ceil(length / olen);
  if (info === void 0)
    info = EMPTY_BUFFER;
  else
    abytes(info, void 0, "info");
  const okm = new Uint8Array(blocks * olen);
  const HMAC = hmac.create(hash, prk);
  const HMACTmp = HMAC._cloneInto();
  const T = new Uint8Array(HMAC.outputLen);
  for (let counter = 0; counter < blocks; counter++) {
    HKDF_COUNTER[0] = counter + 1;
    HMACTmp.update(counter === 0 ? EMPTY_BUFFER : T).update(info).update(HKDF_COUNTER).digestInto(T);
    okm.set(T, olen * counter);
    HMAC._cloneInto(HMACTmp);
  }
  HMAC.destroy();
  HMACTmp.destroy();
  clean(T, HKDF_COUNTER);
  return okm.slice(0, length);
}

// node_modules/@scure/base/index.js
function isBytes3(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes3(b) {
  if (!isBytes3(b))
    throw new Error("Uint8Array expected");
}
function isArrayOf(isString, arr) {
  if (!Array.isArray(arr))
    return false;
  if (arr.length === 0)
    return true;
  if (isString) {
    return arr.every((item) => typeof item === "string");
  } else {
    return arr.every((item) => Number.isSafeInteger(item));
  }
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new Error(`${label}: string expected`);
  return true;
}
function anumber3(n) {
  if (!Number.isSafeInteger(n))
    throw new Error(`invalid integer: ${n}`);
}
function aArr(input) {
  if (!Array.isArray(input))
    throw new Error("array expected");
}
function astrArr(label, input) {
  if (!isArrayOf(true, input))
    throw new Error(`${label}: array of strings expected`);
}
function anumArr(label, input) {
  if (!isArrayOf(false, input))
    throw new Error(`${label}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function chain(...args) {
  const id = (a) => a;
  const wrap = (a, b) => (c) => a(b(c));
  const encode = args.map((x) => x.encode).reduceRight(wrap, id);
  const decode = args.map((x) => x.decode).reduce(wrap, id);
  return { encode, decode };
}
// @__NO_SIDE_EFFECTS__
function alphabet(letters) {
  const lettersA = typeof letters === "string" ? letters.split("") : letters;
  const len = lettersA.length;
  astrArr("alphabet", lettersA);
  const indexes = new Map(lettersA.map((l, i3) => [l, i3]));
  return {
    encode: (digits) => {
      aArr(digits);
      return digits.map((i3) => {
        if (!Number.isSafeInteger(i3) || i3 < 0 || i3 >= len)
          throw new Error(`alphabet.encode: digit index outside alphabet "${i3}". Allowed: ${letters}`);
        return lettersA[i3];
      });
    },
    decode: (input) => {
      aArr(input);
      return input.map((letter) => {
        astr("alphabet.decode", letter);
        const i3 = indexes.get(letter);
        if (i3 === void 0)
          throw new Error(`Unknown letter: "${letter}". Allowed: ${letters}`);
        return i3;
      });
    }
  };
}
// @__NO_SIDE_EFFECTS__
function join(separator = "") {
  astr("join", separator);
  return {
    encode: (from) => {
      astrArr("join.decode", from);
      return from.join(separator);
    },
    decode: (to) => {
      astr("join.decode", to);
      return to.split(separator);
    }
  };
}
// @__NO_SIDE_EFFECTS__
function padding(bits, chr = "=") {
  anumber3(bits);
  astr("padding", chr);
  return {
    encode(data) {
      astrArr("padding.encode", data);
      while (data.length * bits % 8)
        data.push(chr);
      return data;
    },
    decode(input) {
      astrArr("padding.decode", input);
      let end = input.length;
      if (end * bits % 8)
        throw new Error("padding: invalid, string should have whole number of bytes");
      for (; end > 0 && input[end - 1] === chr; end--) {
        const last = end - 1;
        const byte = last * bits;
        if (byte % 8 === 0)
          throw new Error("padding: invalid, string has too much padding");
      }
      return input.slice(0, end);
    }
  };
}
var gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
var radix2carry = /* @__NO_SIDE_EFFECTS__ */ (from, to) => from + (to - gcd(from, to));
var powers = /* @__PURE__ */ (() => {
  let res = [];
  for (let i3 = 0; i3 < 40; i3++)
    res.push(2 ** i3);
  return res;
})();
function convertRadix2(data, from, to, padding2) {
  aArr(data);
  if (from <= 0 || from > 32)
    throw new Error(`convertRadix2: wrong from=${from}`);
  if (to <= 0 || to > 32)
    throw new Error(`convertRadix2: wrong to=${to}`);
  if (/* @__PURE__ */ radix2carry(from, to) > 32) {
    throw new Error(`convertRadix2: carry overflow from=${from} to=${to} carryBits=${/* @__PURE__ */ radix2carry(from, to)}`);
  }
  let carry = 0;
  let pos = 0;
  const max = powers[from];
  const mask = powers[to] - 1;
  const res = [];
  for (const n of data) {
    anumber3(n);
    if (n >= max)
      throw new Error(`convertRadix2: invalid data word=${n} from=${from}`);
    carry = carry << from | n;
    if (pos + from > 32)
      throw new Error(`convertRadix2: carry overflow pos=${pos} from=${from}`);
    pos += from;
    for (; pos >= to; pos -= to)
      res.push((carry >> pos - to & mask) >>> 0);
    const pow = powers[pos];
    if (pow === void 0)
      throw new Error("invalid carry");
    carry &= pow - 1;
  }
  carry = carry << to - pos & mask;
  if (!padding2 && pos >= from)
    throw new Error("Excess padding");
  if (!padding2 && carry > 0)
    throw new Error(`Non-zero padding: ${carry}`);
  if (padding2 && pos > 0)
    res.push(carry >>> 0);
  return res;
}
// @__NO_SIDE_EFFECTS__
function radix2(bits, revPadding = false) {
  anumber3(bits);
  if (bits <= 0 || bits > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ radix2carry(8, bits) > 32 || /* @__PURE__ */ radix2carry(bits, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (bytes) => {
      if (!isBytes3(bytes))
        throw new Error("radix2.encode input should be Uint8Array");
      return convertRadix2(Array.from(bytes), 8, bits, !revPadding);
    },
    decode: (digits) => {
      anumArr("radix2.decode", digits);
      return Uint8Array.from(convertRadix2(digits, bits, 8, revPadding));
    }
  };
}
var hasBase64Builtin = /* @__PURE__ */ (() => typeof Uint8Array.from([]).toBase64 === "function" && typeof Uint8Array.fromBase64 === "function")();
var decodeBase64Builtin = (s, isUrl) => {
  astr("base64", s);
  const re = isUrl ? /^[A-Za-z0-9=_-]+$/ : /^[A-Za-z0-9=+/]+$/;
  const alphabet2 = isUrl ? "base64url" : "base64";
  if (s.length > 0 && !re.test(s))
    throw new Error("invalid base64");
  return Uint8Array.fromBase64(s, { alphabet: alphabet2, lastChunkHandling: "strict" });
};
var base64 = hasBase64Builtin ? {
  encode(b) {
    abytes3(b);
    return b.toBase64();
  },
  decode(s) {
    return decodeBase64Builtin(s, false);
  }
} : /* @__PURE__ */ chain(/* @__PURE__ */ radix2(6), /* @__PURE__ */ alphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"), /* @__PURE__ */ padding(6), /* @__PURE__ */ join(""));

// node_modules/nostr-tools/lib/esm/nip59.js
var utf8Decoder2 = new TextDecoder("utf-8");
var utf8Encoder2 = new TextEncoder();
var minPlaintextSize = 1;
var maxPlaintextSize = 65535;
function getConversationKey(privkeyA, pubkeyB) {
  const sharedX = secp256k1.getSharedSecret(privkeyA, hexToBytes("02" + pubkeyB)).subarray(1, 33);
  return extract(sha256, sharedX, utf8Encoder2.encode("nip44-v2"));
}
function getMessageKeys(conversationKey, nonce) {
  const keys = expand(sha256, conversationKey, nonce, 76);
  return {
    chacha_key: keys.subarray(0, 32),
    chacha_nonce: keys.subarray(32, 44),
    hmac_key: keys.subarray(44, 76)
  };
}
function calcPaddedLen(len) {
  if (!Number.isSafeInteger(len) || len < 1)
    throw new Error("expected positive integer");
  if (len <= 32)
    return 32;
  const nextPower = 1 << Math.floor(Math.log2(len - 1)) + 1;
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((len - 1) / chunk) + 1);
}
function writeU16BE(num2) {
  if (!Number.isSafeInteger(num2) || num2 < minPlaintextSize || num2 > maxPlaintextSize)
    throw new Error("invalid plaintext size: must be between 1 and 65535 bytes");
  const arr = new Uint8Array(2);
  new DataView(arr.buffer).setUint16(0, num2, false);
  return arr;
}
function pad(plaintext) {
  const unpadded = utf8Encoder2.encode(plaintext);
  const unpaddedLen = unpadded.length;
  const prefix = writeU16BE(unpaddedLen);
  const suffix = new Uint8Array(calcPaddedLen(unpaddedLen) - unpaddedLen);
  return concatBytes(prefix, unpadded, suffix);
}
function unpad(padded) {
  const unpaddedLen = new DataView(padded.buffer).getUint16(0);
  const unpadded = padded.subarray(2, 2 + unpaddedLen);
  if (unpaddedLen < minPlaintextSize || unpaddedLen > maxPlaintextSize || unpadded.length !== unpaddedLen || padded.length !== 2 + calcPaddedLen(unpaddedLen))
    throw new Error("invalid padding");
  return utf8Decoder2.decode(unpadded);
}
function hmacAad(key, message, aad) {
  if (aad.length !== 32)
    throw new Error("AAD associated data must be 32 bytes");
  const combined = concatBytes(aad, message);
  return hmac(sha256, key, combined);
}
function decodePayload(payload) {
  if (typeof payload !== "string")
    throw new Error("payload must be a valid string");
  const plen = payload.length;
  if (plen < 132 || plen > 87472)
    throw new Error("invalid payload length: " + plen);
  if (payload[0] === "#")
    throw new Error("unknown encryption version");
  let data;
  try {
    data = base64.decode(payload);
  } catch (error2) {
    throw new Error("invalid base64: " + error2.message);
  }
  const dlen = data.length;
  if (dlen < 99 || dlen > 65603)
    throw new Error("invalid data length: " + dlen);
  const vers = data[0];
  if (vers !== 2)
    throw new Error("unknown encryption version " + vers);
  return {
    nonce: data.subarray(1, 33),
    ciphertext: data.subarray(33, -32),
    mac: data.subarray(-32)
  };
}
function encrypt(plaintext, conversationKey, nonce = randomBytes(32)) {
  const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce);
  const padded = pad(plaintext);
  const ciphertext = chacha20(chacha_key, chacha_nonce, padded);
  const mac = hmacAad(hmac_key, ciphertext, nonce);
  return base64.encode(concatBytes(new Uint8Array([2]), nonce, ciphertext, mac));
}
function decrypt(payload, conversationKey) {
  const { nonce, ciphertext, mac } = decodePayload(payload);
  const { chacha_key, chacha_nonce, hmac_key } = getMessageKeys(conversationKey, nonce);
  const calculatedMac = hmacAad(hmac_key, ciphertext, nonce);
  if (!equalBytes(calculatedMac, mac))
    throw new Error("invalid MAC");
  const padded = chacha20(chacha_key, chacha_nonce, ciphertext);
  return unpad(padded);
}
var verifiedSymbol2 = /* @__PURE__ */ Symbol("verified");
var isRecord2 = (obj) => obj instanceof Object;
function validateEvent2(event) {
  if (!isRecord2(event))
    return false;
  if (typeof event.kind !== "number")
    return false;
  if (typeof event.content !== "string")
    return false;
  if (typeof event.created_at !== "number")
    return false;
  if (typeof event.pubkey !== "string")
    return false;
  if (!event.pubkey.match(/^[a-f0-9]{64}$/))
    return false;
  if (!Array.isArray(event.tags))
    return false;
  for (let i22 = 0; i22 < event.tags.length; i22++) {
    let tag = event.tags[i22];
    if (!Array.isArray(tag))
      return false;
    for (let j = 0; j < tag.length; j++) {
      if (typeof tag[j] !== "string")
        return false;
    }
  }
  return true;
}
var JS2 = class {
  generateSecretKey() {
    return schnorr.utils.randomSecretKey();
  }
  getPublicKey(secretKey) {
    return bytesToHex(schnorr.getPublicKey(secretKey));
  }
  finalizeEvent(t, secretKey) {
    const event = t;
    event.pubkey = bytesToHex(schnorr.getPublicKey(secretKey));
    event.id = getEventHash2(event);
    event.sig = bytesToHex(schnorr.sign(hexToBytes(getEventHash2(event)), secretKey));
    event[verifiedSymbol2] = true;
    return event;
  }
  verifyEvent(event) {
    if (typeof event[verifiedSymbol2] === "boolean")
      return event[verifiedSymbol2];
    try {
      const hash = getEventHash2(event);
      if (hash !== event.id) {
        event[verifiedSymbol2] = false;
        return false;
      }
      const valid = schnorr.verify(hexToBytes(event.sig), hexToBytes(hash), hexToBytes(event.pubkey));
      event[verifiedSymbol2] = valid;
      return valid;
    } catch (err) {
      event[verifiedSymbol2] = false;
      return false;
    }
  }
};
function serializeEvent2(evt) {
  if (!validateEvent2(evt))
    throw new Error("can't serialize event with wrong or missing properties");
  return JSON.stringify([0, evt.pubkey, evt.created_at, evt.kind, evt.tags, evt.content]);
}
function getEventHash2(event) {
  let eventHash = sha256(utf8Encoder2.encode(serializeEvent2(event)));
  return bytesToHex(eventHash);
}
var i2 = new JS2();
var generateSecretKey2 = i2.generateSecretKey;
var getPublicKey2 = i2.getPublicKey;
var finalizeEvent2 = i2.finalizeEvent;
var verifyEvent2 = i2.verifyEvent;
var Seal = 13;
var GiftWrap = 1059;
var TWO_DAYS = 2 * 24 * 60 * 60;
var now = () => Math.round(Date.now() / 1e3);
var randomNow = () => Math.round(now() - Math.random() * TWO_DAYS);
var nip44ConversationKey = (privateKey, publicKey) => getConversationKey(privateKey, publicKey);
var nip44Encrypt = (data, privateKey, publicKey) => encrypt(JSON.stringify(data), nip44ConversationKey(privateKey, publicKey));
var nip44Decrypt = (data, privateKey) => JSON.parse(decrypt(data.content, nip44ConversationKey(privateKey, data.pubkey)));
function createRumor(event, privateKey) {
  const rumor = {
    created_at: now(),
    content: "",
    tags: [],
    ...event,
    pubkey: getPublicKey2(privateKey)
  };
  rumor.id = getEventHash2(rumor);
  return rumor;
}
function createSeal(rumor, privateKey, recipientPublicKey) {
  return finalizeEvent2(
    {
      kind: Seal,
      content: nip44Encrypt(rumor, privateKey, recipientPublicKey),
      created_at: randomNow(),
      tags: []
    },
    privateKey
  );
}
function createWrap(seal, recipientPublicKey) {
  const randomKey = generateSecretKey2();
  return finalizeEvent2(
    {
      kind: GiftWrap,
      content: nip44Encrypt(seal, randomKey, recipientPublicKey),
      created_at: randomNow(),
      tags: [["p", recipientPublicKey]]
    },
    randomKey
  );
}
function wrapEvent(event, senderPrivateKey, recipientPublicKey) {
  const rumor = createRumor(event, senderPrivateKey);
  const seal = createSeal(rumor, senderPrivateKey, recipientPublicKey);
  return createWrap(seal, recipientPublicKey);
}
function unwrapEvent(wrap, recipientPrivateKey) {
  const unwrappedSeal = nip44Decrypt(wrap, recipientPrivateKey);
  return nip44Decrypt(unwrappedSeal, recipientPrivateKey);
}

// node_modules/isomorphic-ws/browser.js
var ws = null;
if (typeof WebSocket !== "undefined") {
  ws = WebSocket;
} else if (typeof MozWebSocket !== "undefined") {
  ws = MozWebSocket;
} else if (typeof global !== "undefined") {
  ws = global.WebSocket || global.MozWebSocket;
} else if (typeof window !== "undefined") {
  ws = window.WebSocket || window.MozWebSocket;
} else if (typeof self !== "undefined") {
  ws = self.WebSocket || self.MozWebSocket;
}
var browser_default = ws;

// node_modules/@bitauth/libauth/build/lib/format/error.js
var formatError = (errorType, errorDetails, throwError = false) => {
  const message = `${errorType}${errorDetails === void 0 ? "" : ` ${errorDetails}`}`;
  if (throwError) {
    throw new Error(message);
  }
  return message;
};

// node_modules/@bitauth/libauth/build/lib/format/base-convert.js
var BaseConverterCreationError;
(function(BaseConverterCreationError2) {
  BaseConverterCreationError2["tooLong"] = "Base converter creation error: an alphabet may be no longer than 254 characters.";
  BaseConverterCreationError2["ambiguousCharacter"] = "Base converter creation error: a character code may only appear once in a single alphabet.";
})(BaseConverterCreationError || (BaseConverterCreationError = {}));
var BaseConversionError;
(function(BaseConversionError2) {
  BaseConversionError2["unknownCharacter"] = "Base conversion error: encountered an unknown character for this alphabet.";
})(BaseConversionError || (BaseConversionError = {}));
var createBaseConverter = (alphabet2) => {
  const undefinedValue = 255;
  const uint8ArrayBase = 256;
  if (alphabet2.length >= undefinedValue)
    return formatError(BaseConverterCreationError.tooLong, `Alphabet length: ${alphabet2.length}`);
  const alphabetMap = new Uint8Array(uint8ArrayBase).fill(undefinedValue);
  for (let index = 0; index < alphabet2.length; index++) {
    const characterCode = alphabet2.charCodeAt(index);
    if (alphabetMap[characterCode] !== undefinedValue) {
      return formatError(BaseConverterCreationError.ambiguousCharacter, `Ambiguous character: ${alphabetMap[characterCode]}`);
    }
    alphabetMap[characterCode] = index;
  }
  const base = alphabet2.length;
  const paddingCharacter = alphabet2.charAt(0);
  const factor = Math.log(base) / Math.log(uint8ArrayBase);
  const inverseFactor = Math.log(uint8ArrayBase) / Math.log(base);
  return {
    // eslint-disable-next-line complexity
    decode: (input) => {
      if (input.length === 0)
        return Uint8Array.of();
      const firstNonZeroIndex = input.split("").findIndex((character) => character !== paddingCharacter);
      if (firstNonZeroIndex === -1) {
        return new Uint8Array(input.length);
      }
      const requiredLength = Math.floor((input.length - firstNonZeroIndex) * factor + 1);
      const decoded = new Uint8Array(requiredLength);
      let nextByte = firstNonZeroIndex;
      let remainingBytes = 0;
      while (input[nextByte] !== void 0) {
        let carry = alphabetMap[input.charCodeAt(nextByte)];
        if (carry === undefinedValue)
          return formatError(BaseConversionError.unknownCharacter, `Unknown character: "${input[nextByte]}".`);
        let digit = 0;
        for (
          let steps = requiredLength - 1;
          (carry !== 0 || digit < remainingBytes) && steps !== -1;
          // eslint-disable-next-line no-plusplus
          steps--, digit++
        ) {
          carry += Math.floor(base * decoded[steps]);
          decoded[steps] = Math.floor(carry % uint8ArrayBase);
          carry = Math.floor(carry / uint8ArrayBase);
        }
        remainingBytes = digit;
        nextByte++;
      }
      const firstNonZeroResultDigit = decoded.findIndex((value) => value !== 0);
      const bin = new Uint8Array(firstNonZeroIndex + (requiredLength - firstNonZeroResultDigit));
      bin.set(decoded.slice(firstNonZeroResultDigit), firstNonZeroIndex);
      return bin;
    },
    // eslint-disable-next-line complexity
    encode: (input) => {
      if (input.length === 0)
        return "";
      const firstNonZeroIndex = input.findIndex((byte) => byte !== 0);
      if (firstNonZeroIndex === -1) {
        return paddingCharacter.repeat(input.length);
      }
      const requiredLength = Math.floor((input.length - firstNonZeroIndex) * inverseFactor + 1);
      const encoded = new Uint8Array(requiredLength);
      let nextByte = firstNonZeroIndex;
      let remainingBytes = 0;
      while (nextByte !== input.length) {
        let carry = input[nextByte];
        let digit = 0;
        for (
          let steps = requiredLength - 1;
          (carry !== 0 || digit < remainingBytes) && steps !== -1;
          // eslint-disable-next-line no-plusplus
          steps--, digit++
        ) {
          carry += Math.floor(uint8ArrayBase * encoded[steps]);
          encoded[steps] = Math.floor(carry % base);
          carry = Math.floor(carry / base);
        }
        remainingBytes = digit;
        nextByte++;
      }
      const firstNonZeroResultDigit = encoded.findIndex((value) => value !== 0);
      const padding2 = paddingCharacter.repeat(firstNonZeroIndex);
      return encoded.slice(firstNonZeroResultDigit).reduce((all, digit) => all + alphabet2.charAt(digit), padding2);
    }
  };
};
var bitcoinBase58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
var base58 = createBaseConverter(bitcoinBase58Alphabet);
var base58ToBin = base58.decode;
var binToBase58 = base58.encode;

// node_modules/@bitauth/libauth/build/lib/format/base64.js
var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var nonBase64Chars = new RegExp(`[^${chars}=]`, "u");
var base64ToBin = (validBase64) => {
  const lookup = new Uint8Array(123);
  for (let i3 = 0; i3 < chars.length; i3++) {
    lookup[chars.charCodeAt(i3)] = i3;
  }
  const bufferLengthEstimate = validBase64.length * 0.75;
  const stringLength = validBase64.length;
  const bufferLength = validBase64[validBase64.length - 1] === "=" ? validBase64[validBase64.length - 2] === "=" ? bufferLengthEstimate - 2 : bufferLengthEstimate - 1 : bufferLengthEstimate;
  const buffer = new ArrayBuffer(bufferLength);
  const bytes = new Uint8Array(buffer);
  let p = 0;
  for (let i3 = 0; i3 < stringLength; i3 += 4) {
    const encoded1 = lookup[validBase64.charCodeAt(i3)];
    const encoded2 = lookup[validBase64.charCodeAt(i3 + 1)];
    const encoded3 = lookup[validBase64.charCodeAt(i3 + 2)];
    const encoded4 = lookup[validBase64.charCodeAt(i3 + 3)];
    bytes[p++] = encoded1 << 2 | encoded2 >> 4;
    bytes[p++] = (encoded2 & 15) << 4 | encoded3 >> 2;
    bytes[p++] = (encoded3 & 3) << 6 | encoded4 & 63;
  }
  return bytes;
};

// node_modules/@bitauth/libauth/build/lib/format/hex.js
var range = (length, begin = 0) => Array.from({ length }, (_, index) => begin + index);
var splitEvery = (input, chunkLength) => range(Math.ceil(input.length / chunkLength)).map((index) => index * chunkLength).map((begin) => input.slice(begin, begin + chunkLength));
var hexByteWidth = 2;
var hexadecimal = 16;
var hexToBin = (validHex) => Uint8Array.from(splitEvery(validHex, hexByteWidth).map((byte) => parseInt(byte, hexadecimal)));
var binToHex = (bytes) => bytes.reduce((str, byte) => str + byte.toString(hexadecimal).padStart(hexByteWidth, "0"), "");
var flattenBinArray = (array) => {
  const totalLength = array.reduce((total, bin) => total + bin.length, 0);
  const flattened = new Uint8Array(totalLength);
  array.reduce((index, bin) => {
    flattened.set(bin, index);
    return index + bin.length;
  }, 0);
  return flattened;
};
var binsAreEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i3 = 0; i3 < a.length; i3++) {
    if (a[i3] !== b[i3]) {
      return false;
    }
  }
  return true;
};

// node_modules/@bitauth/libauth/build/lib/format/number.js
var numberToBinUint32BE = (value) => {
  const uint32Length = 4;
  const bin = new Uint8Array(uint32Length);
  const writeAsLittleEndian = false;
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  view.setUint32(0, value, writeAsLittleEndian);
  return bin;
};
var CompactUintError;
(function(CompactUintError2) {
  CompactUintError2["noPrefix"] = "Error reading CompactUint: requires at least one byte.";
  CompactUintError2["insufficientBytes"] = "Error reading CompactUint: insufficient bytes.";
  CompactUintError2["nonMinimal"] = "Error reading CompactUint: CompactUint is not minimally encoded.";
  CompactUintError2["excessiveBytes"] = "Error decoding CompactUint: unexpected bytes after CompactUint.";
})(CompactUintError || (CompactUintError = {}));

// node_modules/@bitauth/libauth/build/lib/format/utf8.js
var utf8Encoder3 = new TextEncoder();
var utf8ToBin = (utf8) => utf8Encoder3.encode(utf8);
var utf8Decoder3 = new TextDecoder();

// node_modules/@bitauth/libauth/build/lib/bin/hashes.js
var instantiateRustWasm = async (webassemblyBytes, expectedImportModuleName, hashExportName, initExportName, updateExportName, finalExportName) => {
  const wasm = (await WebAssembly.instantiate(webassemblyBytes, {
    [expectedImportModuleName]: {
      /**
       * This would only be called in cases where a `__wbindgen_malloc` failed.
       * Since `__wbindgen_malloc` isn't exposed to consumers, this error
       * can only be encountered if the code below is broken.
       */
      /* c8 ignore next 10 */
      // eslint-disable-next-line camelcase, @typescript-eslint/naming-convention
      __wbindgen_throw: (ptr, len) => {
        throw new Error(
          // eslint-disable-next-line @typescript-eslint/no-use-before-define
          Array.from(getUint8Memory().subarray(ptr, ptr + len)).map((num2) => String.fromCharCode(num2)).join("")
        );
      }
    }
  })).instance.exports;
  let cachedUint8Memory;
  let cachedUint32Memory;
  let cachedGlobalArgumentPtr;
  const globalArgumentPtr = () => {
    if (cachedGlobalArgumentPtr === void 0) {
      cachedGlobalArgumentPtr = wasm.__wbindgen_global_argument_ptr();
    }
    return cachedGlobalArgumentPtr;
  };
  function getUint8Memory() {
    if (cachedUint8Memory === void 0 || cachedUint8Memory.buffer !== wasm.memory.buffer) {
      cachedUint8Memory = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8Memory;
  }
  const getUint32Memory = () => {
    if (cachedUint32Memory === void 0 || cachedUint32Memory.buffer !== wasm.memory.buffer) {
      cachedUint32Memory = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32Memory;
  };
  const passArray8ToWasm = (array) => {
    const ptr = wasm.__wbindgen_malloc(array.length);
    getUint8Memory().set(array, ptr);
    return [ptr, array.length];
  };
  const getArrayU8FromWasm = (ptr, len) => getUint8Memory().subarray(ptr, ptr + len);
  const hash = (input) => {
    const [ptr0, len0] = passArray8ToWasm(input);
    const retPtr = globalArgumentPtr();
    try {
      wasm[hashExportName](retPtr, ptr0, len0);
      const mem = getUint32Memory();
      const ptr = mem[retPtr / 4];
      const len = mem[retPtr / 4 + 1];
      const realRet = getArrayU8FromWasm(ptr, len).slice();
      wasm.__wbindgen_free(ptr, len);
      return realRet;
    } finally {
      wasm.__wbindgen_free(ptr0, len0);
    }
  };
  const init = () => {
    const retPtr = globalArgumentPtr();
    wasm[initExportName](retPtr);
    const mem = getUint32Memory();
    const ptr = mem[retPtr / 4];
    const len = mem[retPtr / 4 + 1];
    const realRet = getArrayU8FromWasm(ptr, len).slice();
    wasm.__wbindgen_free(ptr, len);
    return realRet;
  };
  const update = (rawState, input) => {
    const [ptr0, len0] = passArray8ToWasm(rawState);
    const [ptr1, len1] = passArray8ToWasm(input);
    const retPtr = globalArgumentPtr();
    try {
      wasm[updateExportName](retPtr, ptr0, len0, ptr1, len1);
      const mem = getUint32Memory();
      const ptr = mem[retPtr / 4];
      const len = mem[retPtr / 4 + 1];
      const realRet = getArrayU8FromWasm(ptr, len).slice();
      wasm.__wbindgen_free(ptr, len);
      return realRet;
    } finally {
      rawState.set(getUint8Memory().subarray(ptr0 / 1, ptr0 / 1 + len0));
      wasm.__wbindgen_free(ptr0, len0);
      wasm.__wbindgen_free(ptr1, len1);
    }
  };
  const final = (rawState) => {
    const [ptr0, len0] = passArray8ToWasm(rawState);
    const retPtr = globalArgumentPtr();
    try {
      wasm[finalExportName](retPtr, ptr0, len0);
      const mem = getUint32Memory();
      const ptr = mem[retPtr / 4];
      const len = mem[retPtr / 4 + 1];
      const realRet = getArrayU8FromWasm(ptr, len).slice();
      wasm.__wbindgen_free(ptr, len);
      return realRet;
    } finally {
      rawState.set(getUint8Memory().subarray(ptr0 / 1, ptr0 / 1 + len0));
      wasm.__wbindgen_free(ptr0, len0);
    }
  };
  return {
    final,
    hash,
    init,
    update
  };
};

// node_modules/@bitauth/libauth/build/lib/bin/ripemd160/ripemd160.base64.js
var ripemd160Base64Bytes = "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AgQMBQsgAEH8EigCACACaiICQQFyNgIEQYQTIAA2AgBB/BIgAjYCACAAIAJqIAI2AgAMBAsgAxAgDAELQewPQewPKAIAQX4gAUEDdndxNgIACyAEIAJqIQIgAyAEaiEDCyADIAMoAgRBfnE2AgQgACACQQFyNgIEIAAgAmogAjYCAAJ/AkAgAkH/AU0EQCACQQN2IgFBA3RB9A9qIQJB7A8oAgAiA0EBIAFBH3F0IgFxRQ0BIAJBCGohAyACKAIIDAILIAAgAhAhDAILQewPIAMgAXI2AgAgAkEIaiEDIAILIQEgAyAANgIAIAEgADYCDCAAIAI2AgwgACABNgIICyAFQQhqDwtBgBMgACACayIBNgIAQYgTQYgTKAIAIgAgAmoiAzYCACADIAFBAXI2AgQgACACQQNyNgIEIABBCGoLpQEBAn9BAiEFAkACQAJAAkACQCAAKAIEIgYgAWsgAk8NACABIAJqIgIgAUkhAQJAIAQEQEEAIQUgAQ0CIAZBAXQiASACIAIgAUkbIQIMAQtBACEFIAENAQsgAkEASA0AIAZFDQEgACgCACACEBMiAUUNAgwDCyAFDwsgAhAEIgENAQsgAw0BCyABBEAgACABNgIAIABBBGogAjYCAEECDwtBAQ8LAAsIAEGMFBAHAAtmAgF/A34jAEEwayIBJAAgACkCECECIAApAgghAyAAKQIAIQQgAUEUakEANgIAIAEgBDcDGCABQgE3AgQgAUH0DDYCECABIAFBGGo2AgAgASADNwMgIAEgAjcDKCABIAFBIGoQJQALuAEBAX8jAEHgAWsiAyQAIANBOGpBzAgoAgA2AgAgA0EwakHECCkCADcDACADQgA3AyAgA0G8CCkCADcDKCADQTxqQQBBxAAQKhogA0EgaiABIAIQCSADQYABaiADQSBqQeAAECgaIANBCGogA0GAAWoQCiADQSBqIANBCGpBFBADIANBiAFqIANBKGooAgA2AgAgAyADKQMgNwOAASADIANBgAFqEAsgACADKQMANwIAIANB4AFqJAALlwMBBH8jAEFAaiIDJAAgACAAKQMAIAKtfDcDACADIABBCGo2AiggAyADQShqNgIsAkACQAJAAkACQAJAIAAoAhwiBQRAQcAAIAVrIgQgAk0NASADQRhqIAUgBSACaiIEIABBIGoQFiADKAIcIAJHDQUgAygCGCABIAIQKBoMAwsgAiEEDAELIANBMGogASACIAQQFyADQTxqKAIAIQQgAygCOCEBIAMoAjAhBSADKAI0IQIgA0EgaiAAQSBqIgYgACgCHBAYIAIgAygCJEcNBCADKAIgIAUgAhAoGiAAQRxqQQA2AgAgA0EsaiAGEBkLIANBPGohAiADQThqIQUCQANAIARBP00NASADQTBqIAEgBEHAABAXIAIoAgAhBCAFKAIAIQEgA0EIakEAQcAAIAMoAjAgAygCNBAaIANBLGogAygCCBAZDAALAAsgA0EQaiAAQSBqIAQQGyADKAIUIARHDQEgAygCECABIAQQKBoLIABBHGogBDYCACADQUBrJAAPC0H0ExAHAAtB9BMQBwALQfQTEAcAC+MCAgR/AX4jAEFAaiICJAAgAiABQQhqIgU2AiQgASkDACEGIAEoAhwhAyACIAJBJGo2AigCQCADQT9NBEAgAUEgaiIEIANqQYABOgAAIAEgASgCHEEBaiIDNgIcIAJBGGogBCADEBggAigCGEEAIAIoAhwQKhpBwAAgASgCHGtBB00EQCACQShqIAQQGSACQRBqIAQgAUEcaigCABAbIAIoAhBBACACKAIUECoaCyACQQhqIARBOBAYIAIoAgxBCEcNASACKAIIIAZCA4Y3AAAgAkEoaiAEEBkgAUEcakEANgIAIAJBADYCKEEEIQECQANAIAFBGEYNASACQShqIAFqQQA6AAAgAiACKAIoQQFqNgIoIAFBAWohAQwACwALIAAgBSkAADcAACAAQRBqIAVBEGooAAA2AAAgAEEIaiAFQQhqKQAANwAAIAJBQGskAA8LQcwTIANBwAAQHQALQdwTEAcAC2MBAn8gASgCACECAkACQCABKAIEIgMgASgCCCIBRgRAIAMhAQwBCyADIAFJDQEgAQRAIAIgARATIgINAQALIAIgAxARQQEhAkEAIQELIAAgATYCBCAAIAI2AgAPC0G0ExAHAAuQAQEBfyMAQYABayIBJAAgAUEwakHECCkCADcDACABQThqQcwIKAIANgIAIAFCADcDICABQbwIKQIANwMoIAFBPGpBAEHEABAqGiABQRBqIAFBIGpB4AAQAyABQShqIAFBGGooAgA2AgAgASABKQMQNwMgIAFBCGogAUEgahALIAAgASkDCDcCACABQYABaiQAC4YB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";

// node_modules/@bitauth/libauth/build/lib/bin/secp256k1/secp256k1-wasm-types.js
var SECP256K1_FLAGS_TYPE_CONTEXT = 1 << 0;
var SECP256K1_FLAGS_TYPE_COMPRESSION = 1 << 1;
var SECP256K1_FLAGS_BIT_CONTEXT_VERIFY = 1 << 8;
var SECP256K1_FLAGS_BIT_CONTEXT_SIGN = 1 << 9;
var SECP256K1_FLAGS_BIT_COMPRESSION = 1 << 8;
var SECP256K1_CONTEXT_VERIFY = SECP256K1_FLAGS_TYPE_CONTEXT | SECP256K1_FLAGS_BIT_CONTEXT_VERIFY;
var SECP256K1_CONTEXT_SIGN = SECP256K1_FLAGS_TYPE_CONTEXT | SECP256K1_FLAGS_BIT_CONTEXT_SIGN;
var SECP256K1_CONTEXT_NONE = SECP256K1_FLAGS_TYPE_CONTEXT;
var SECP256K1_EC_COMPRESSED = SECP256K1_FLAGS_TYPE_COMPRESSION | SECP256K1_FLAGS_BIT_COMPRESSION;
var SECP256K1_EC_UNCOMPRESSED = SECP256K1_FLAGS_TYPE_COMPRESSION;
var ContextFlag;
(function(ContextFlag2) {
  ContextFlag2[ContextFlag2["NONE"] = SECP256K1_CONTEXT_NONE] = "NONE";
  ContextFlag2[ContextFlag2["VERIFY"] = SECP256K1_CONTEXT_VERIFY] = "VERIFY";
  ContextFlag2[ContextFlag2["SIGN"] = SECP256K1_CONTEXT_SIGN] = "SIGN";
  ContextFlag2[ContextFlag2["BOTH"] = SECP256K1_CONTEXT_SIGN | SECP256K1_CONTEXT_VERIFY] = "BOTH";
})(ContextFlag || (ContextFlag = {}));
var CompressionFlag;
(function(CompressionFlag2) {
  CompressionFlag2[CompressionFlag2["COMPRESSED"] = SECP256K1_EC_COMPRESSED] = "COMPRESSED";
  CompressionFlag2[CompressionFlag2["UNCOMPRESSED"] = SECP256K1_EC_UNCOMPRESSED] = "UNCOMPRESSED";
})(CompressionFlag || (CompressionFlag = {}));

// node_modules/@bitauth/libauth/build/lib/bin/secp256k1/secp256k1.base64.js
var secp256k1Base64Bytes = "AGFzbQEAAAABXg5gAn9/AGAGf39/f39/AX9gAX8AYAABf2AAAGADf39/AX9gAX8Bf2ACf38Bf2AEf39/fwF/YAV/f39/fwF/YAN/f38AYAd/f39/f39/AX9gBH9/f38AYAV/f39/fwAC5wEMA2VudgZtZW1vcnkCAYACgAIDZW52BXRhYmxlAXABBgYDZW52CXRhYmxlQmFzZQN/AANlbnYORFlOQU1JQ1RPUF9QVFIDfwADZW52CFNUQUNLVE9QA38AA2VudgVhYm9ydAACA2Vudg1lbmxhcmdlTWVtb3J5AAMDZW52DmdldFRvdGFsTWVtb3J5AAMDZW52F2Fib3J0T25DYW5ub3RHcm93TWVtb3J5AAMDZW52C19fX3NldEVyck5vAAIDZW52Bl9hYm9ydAAEA2VudhZfZW1zY3JpcHRlbl9tZW1jcHlfYmlnAAUDSUgAAAYKBQAKCgIMAAYABwACBgUNCgAKAAoAAAcHAAAAAgYMCgoFAAUFAAULAQYFAwcBCAgBCAgKBwUFBQUHAQEIBQUFCAUICQgGCwJ/ASMBC38BIwILB/QGGxFfX19lcnJub19sb2NhdGlvbgA1BV9mcmVlACYHX21hbGxvYwAnGV9zZWNwMjU2azFfY29udGV4dF9jcmVhdGUAMxxfc2VjcDI1NmsxX2NvbnRleHRfcmFuZG9taXplAD4fX3NlY3AyNTZrMV9lY19wcml2a2V5X3R3ZWFrX2FkZABCH19zZWNwMjU2azFfZWNfcHJpdmtleV90d2Vha19tdWwAQBtfc2VjcDI1NmsxX2VjX3B1YmtleV9jcmVhdGUAMBpfc2VjcDI1NmsxX2VjX3B1YmtleV9wYXJzZQBOHl9zZWNwMjU2azFfZWNfcHVia2V5X3NlcmlhbGl6ZQBNHl9zZWNwMjU2azFfZWNfcHVia2V5X3R3ZWFrX2FkZABBHl9zZWNwMjU2azFfZWNfcHVia2V5X3R3ZWFrX211bAA/G19zZWNwMjU2azFfZWNfc2Vja2V5X3ZlcmlmeQBDGF9zZWNwMjU2azFfZWNkc2FfcmVjb3ZlcgA5NF9zZWNwMjU2azFfZWNkc2FfcmVjb3ZlcmFibGVfc2lnbmF0dXJlX3BhcnNlX2NvbXBhY3QAPDhfc2VjcDI1NmsxX2VjZHNhX3JlY292ZXJhYmxlX3NpZ25h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iCEuIAogLadJIAkgLKdJaiALICinSWogISAbRXFqIBkgE0VxaiAaIBRFcWogDiAbSWogByATSWogBSAUSWogECAISWogESAGSSAqQgGGpyIJciAiaiITaiIOIBIgBEkgK0IBhqciCnIgF2oiFGoiByAMIANJICVCAYanIgtyIBVqIhBqIgUgDSACSSAkQgGGpyIIciAWaiIRaiIGICOnIgRBAXQiEmoiASASSSEZIB8oAgCtICd+IiNCIIghLCABICOnIgNBAXQiDGoiASAMSSEaIBgoAgCtICZ+IiNCIIghKCABICOnIgJBAXQiDWoiASANSSEbIAogK6dJIAkgKqdJaiALICWnSWogCCAkp0lqICIgE0VxaiAOIBNJaiAXIBRFcWogByAUSWogFSAQRXFqIAUgEElqIBYgEUVxaiAGIBFJaiASIARJIC5CAYanIg5yIBlqIhVqIgogDCADSSAsQgGGpyIHciAaaiIWaiILIA0gAkkgKEIBhqciBXIgG2oiEGoiCCABIB4oAgCtIiQgJH4iI6ciAmoiASACSSAjQiCIp2oiBmohESAPIAE2AiAgICgCAK0iKSAcKAIArX4iI0IgiCEtIBEgI6ciBEEBdCIMaiIBIAxJIRMgHygCAK0iJyAdKAIArSImfiIjQiCIISogASAjpyIDQQF0Ig1qIgEgDUkhFCAYKAIArSIlICR+IiNCIIghJCABICOnIgJBAXQiCWoiASAJSSESIA8gATYCJCApICZ+IiNCIIghKyAHICynSSAOIC6nSWogBSAop0lqIBkgFUVxaiAaIBZFcWogGyAQRXFqIAogFUlqIAsgFklqIAggEElqIBEgBklqIAwgBEkgLUIBhqciB3IgE2oiDGoiCyANIANJICpCAYanIgVyIBRqIg1qIgggCSACSSAkQgGGpyIGciASaiIJaiIEICOnIgNBAXQiDmoiASAOSSEQICcgHigCAK0iJn4iI0IgiCEoIAEgI6ciAkEBdCIKaiIBIApJIREgBSAqp0kgByAtp0lqIAYgJKdJaiATIAxFcWogCyAMSWogFCANRXFqIAggDUlqIBIgCUVxaiAEIAlJaiAOIANJICtCAYanIgtyIBBqIhJqIgUgCiACSSAoQgGGpyIIciARaiIMaiIGIAEgJSAlfiIjpyICaiIBIAJJICNCIIinaiIEaiENIA8g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QUBrIAJB////H3EiAkHRB2pBGnZqQf///x9LIAYgAXEgB3EgCHEgBEH///8fcSIEcSAJcSALcUH///8fRiAFQf///wFGcXFyIgprQdEHcSACaiECIApBBnQgA2ogAkEadmoiA0EadiABQf///x9xaiIKQRp2IAZB////H3FqIgZBGnYgB0H///8fcWoiB0EadiAIQf///x9xaiIIQRp2IARqIgRBGnYgCUH///8fcWoiCUEadiALQf///x9xaiEBIAAgAkH///8fcTYCACANIANB////H3E2AgAgDiAKQf///x9xNgIAIA8gBkH///8fcTYCACAQIAdB////H3E2AgAgESAIQf///x9xNgIAIBIgBEH///8fcTYCACATIAlB////H3E2AgAgFCABQf///x9xNgIAIAwgAUEadiAFakH///8BcTYCAAuhFwEnfyMEIQQjBEHAA2okBCACKAJQIQYgASgCeARAIAAgBjYCeCAAIAIpAgA3AgAgACACKQIINwIIIAAgAikCEDcCECAAIAIpAhg3AhggACACKQIgNwIgIABBKGoiAyACQShqIgEpAgA3AgAgAyABKQIINwIIIAMgASkCEDcCECADIAEpAhg3AhggAyABKQIgNwIgIABBATYCUCAAQdQAaiIAQgA3AgAgAEIANwIIIABCADcCECAAQgA3AhggAEEANgIgIAQkBA8LIAYEQCADBEAgA0EBNgIAIANBBGoiAkIANwIAIAJCADcCCCACQgA3AhAgAkIANwIYIAJBADYCIAsgACABKQIANwIAIAAgASkCCDcCCCAAIAEpAhA3AhAgACABKQIYNwIYIAAgASkCIDcCICAAIAEpAig3AiggACABKQIwNwIwIAAgASkCODcCOCAAQUBrIAFBQGspAgA3AgAgACABKQJINwJIIAAgASkCUDcCUCAAIAEpAlg3AlggACABKQJgNwJgIAAgASkCaDcCaCAAIAEpAnA3AnAgACABKAJ4NgJ4IAQkBA8LIARB+ABqIQwgBEHQAGohJCAEQShqIQogAEH4AGoiKUEANgIAIARBkANqIiUgAUHQAGoiJhAHIARB6AJqIgggASkCADcCACAIIAEpAgg3AgggCCABKQIQNwIQIAggASkCGDcCGCAIIAEpAiA3AiAgCEEkaiIdKAIAIhNBFnYiBkHRB2wgCCgCAGohGyAGQQZ0IAhBBGoiFygCAGogG0EadmoiGEEadiAIQQhqIhkoAgBqIhpBGnYgCEEMaiIFKAIAaiIHQRp2IAhBEGoiDSgCAGoiFEEadiAIQRRqIhUoAgBqIg5BGnYgCEEYaiIPKAIAaiIQQRp2IAhBHGoiESgCAGoiEkEadiAIQSBqIgYoAgBqIRwgCCAbQf///x9xIio2AgAgFyAYQf///x9xIgs2AgAgGSAaQf///x9xIh42AgAgBSAHQf///x9xIh82AgAgDSAUQf///x9xIiA2AgAgFSAOQf///x9xIiE2AgAgDyAQQf///x9xIiI2AgAgESASQf///x9xIiM2AgAgBiAcQf///x9xIhs2AgAgHSAcQRp2IBNB////AXFqIhw2AgAgBEHAAmoiFiACICUQCiAEQZgCaiIJIAFBKGoiBikCADcCACAJIAYpAgg3AgggCSAGKQIQNwIQIAkgBikCGDcCGCAJIAYpAiA3AiAgCUEkaiInKAIAIh1BFnYiBkHRB2wgCSgCAGohDSAGQQZ0IAlBBGoiEygCAGogDUEadmoiFEEadiAJQQhqIhcoAgBqIhVBGnYgCUEMaiIYKAIAaiIOQRp2IAlBEGoiGSgCAGoiD0EadiAJQRRqIhooAgBqIhBBGnYgCUEYaiIFKAIAaiIRQRp2IAlBHGoiBygCAGoiEkEadiAJQSBqIgYoAgBqISggCSANQf///x9xIg02AgAgEyAUQf///x9xIhQ2AgAgFyAVQf///x9xIhU2AgAgGCAOQf///x9xIg42AgAgGSAPQf///x9xIg82AgAgGiAQQf///x9xIhA2AgAgBSARQf///x9xIhE2AgAgByASQf///x9xIhI2AgAgBiAoQf///x9xIgY2AgAgJyAoQRp2IB1B////AXFqNgIAIARB8AFqIgcgAkEoaiAlEAogByAHICYQCiAEQcgBaiIFQbzh//8AICprIBYoAgBqNgIAIAVB/P3//wAgC2sgFigCBGo2AgQgBUH8////ACAeayAWKAIIajYCCCAFQfz///8AIB9rIBYoAgxqNgIMIAVB/P///wAgIGsgFigCEGo2AhAgBUH8////ACAhayAWKAIUajYCFCAFQfz///8AICJrIBYoAhhqNgIYIAVB/P///wAgI2sgFigCHGo2AhwgBUH8////ACAbayAWKAIgajYCICAFQfz//wcgHGsgFigCJGo2AiRB/P//ByAnKAIAayECIARBoAFqIgtBvOH//wAgDWsgBygCAGo2AgAgC0H8/f//ACAUayAHKAIEajYCBCALQfz///8AIBVrIAcoAghqNgIIIAtB/P///wAgDmsgBygCDGo2AgwgC0H8////ACAPayAHKAIQajYCECALQfz///8AIBBrIAcoAhRqNgIUIAtB/P///wAgEWsgBygCGGo2AhggC0H8////ACASayAHKAIcajYCHCALQfz///8AIAZrIAcoAiBqNgIgIAsgAiAHKAIkajYCJCAFEBdFBEAgDCALEAcgJCAFEAcgCiAFICQQCiADBEAgAyAFKQIANwIAIAMgBSkCCDcCCCADIAUpAhA3AhAgAyAFKQIYNwIYIAMgBSkCIDcCIAsgAEHQAGogJiAFEAogBCAIICQQCiAAIAQpAgA3AgAgACAEKQIINwIIIAAgBCkCEDcCECAAIAQpAhg3AhggACAEKQIgNwIgQfj7//8BIABBBGoiEygCAEEBdCAKQQRqIh4oAgBqayEOQfj///8BIABBCGoiFygCAEEBdCAKQQhqIh8oAgBqayEPQfj///8BIABBDGoiGCgCAEEBdCAKQQxqIiAoAgBqayEQQfj///8BIABBEGoiGSgCAEEBdCAKQRBqIiEoAgBqayERQfj///8BIABBFGoiGigCAEEBdCAKQRRqIiIoAgBqayESQfj///8BIABBGGoiBSgCAEEBdCAKQRhqIiMoAgBqayEGQfj///8BIABBHGoiBygCAEEBdCAKQRxqIhsoAgBqayEDQfj///8BIABBIGoiDSgCAEEBdCAKQSBqIhwoAgBqayECQfj//w8gAEEkaiIUKAIAQQF0IApBJGoiHSgCAGprIQEgAEH4wv//ASAAKAIAQQF0IAooAgBqayAMKAIAaiIVNgIAIBMgDiAMKAIEaiIONgIAIBcgDyAMKAIIaiIPNgIAIBggECAMKAIMaiIQNgIAIBkgESAMKAIQaiIRNgIAIBogEiAMKAIUaiISNgIAIAUgBiAMKAIYaiIGNgIAIAcgAyAMKAIcaiIDNgIAIA0gAiAMKAIgaiICNgIAIBQgASAMKAIkaiIBNgIAIABBKGoiE0G0pP//AiAVayAEKAIAajYCACAAQSxqIhdB9Pn//wIgDmsgBCgCBGo2AgAgAEEwaiIYQfT///8CIA9rIAQoAghqNgIAIABBNGoiGUH0////AiAQayAEKAIMajYCACAAQThqIhpB9P///wIgEWsgBCgCEGo2AgAgAEE8aiIFQfT///8CIBJrIAQoAhRqNgIAIABBQGsiB0H0////AiAGayAEKAIYajYCACAAQcQAaiINQfT///8CIANrIAQoAhxqNgIAIABByABqIhRB9P///wIgAmsgBCgCIGo2AgAgAEHMAGoiFUH0//8XIAFrIAQoAiRqNgIAIBMgEyALEAogCiAKIAkQCiAKQbzh//8AIAooAgBrIg42AgAgHkH8/f//ACAeKAIAayIPNgIAIB9B/P///wAgHygCAGsiEDYCACAgQfz///8AICAoAgBrIhE2AgAgIUH8////ACAhKAIAayISNgIAICJB/P///wAgIigCAGsiBjYCACAjQfz///8AICMoAgBrIgM2AgAgG0H8////ACAbKAIAayICNgIAIBxB/P///wAgHCgCAGsiATYCACAdQfz//wcgHSgCAGsiADYCACATIBMoAgAgDmo2AgAgFyAXKAIAIA9qNgIAIBggGCgCACAQajYCACAZIBkoAgAgEWo2AgAgGiAaKAIAIBJqNgIAIAUgBSgCACAGajYCACAHIAcoAgAgA2o2AgAgDSANKAIAIAJqNgIAIBQgFCgCACABajYCACAVIBUoAgAgAGo2AgAgBCQEDwsgCxAXBEAgACABIAMQGiAEJAQPCyADBEAgA0IANwIAIANCADcCCCADQgA3AhAgA0IANwIYIANCADcCIAsgKUEBNgIAIAQkBAuvAwEBfyAAIAFBHGoiAigCAEEYdjoAACAAIAIoAgBBEHY6AAEgACACKAIAQQh2OgACIAAgAigCADoAAyAAIAFBGGoiAigCAEEYdjoABCAAIAIoAgBBEHY6AAUgACACKAIAQQh2OgAGIAAgAigCADoAByAAIAFBFGoiAigCAEEYdjoACCAAIAIoAgBBEHY6AAkgACACKAIAQQh2OgAKIAAgAigCADoACyAAIAFBEGoiAigCAEEYdjoADCAAIAIoAgBBEHY6AA0gACACKAIAQQh2OgAOIAAgAigCADoADyAAIAFBDGoiAigCAEEYdjoAECAAIAIoAgBBEHY6ABEgACACKAIAQQh2OgASIAAgAigCADoAEyAAIAFBCGoiAigCAEEYdjoA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BxAHIAcgBxAHIAcgBxAHIAcgBxAHIAcgBxAHIAcgByAGEAogBEHIAWoiBSAHKQIANwIAIAUgBykCCDcCCCAFIAcpAhA3AhAgBSAHKQIYNwIYIAUgBykCIDcCICAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUQByAFIAUgBxAKIARBoAFqIgIgBSkCADcCACACIAUpAgg3AgggAiAFKQIQNwIQIAIgBSkCGDcCGCACIAUpAiA3AiAgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACEAcgAiACIAUQCiAEQfgAaiIJIAIpAgA3AgAgCSACKQIINwIIIAkgAikCEDcCECAJIAIpAhg3AhggCSACKQIgNwIgQQAhBgNAIAkgCRAHIAZBAWoiBkHYAEcNAAsgCSAJIAIQCiADIAkpAgA3AgAgAyAJKQIINwIIIAMgCSkCEDcCECADIAkpAhg3AhggAyAJKQIgNwIgIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAxAHIAMgAyAFEAogCCADKQIANwIAIAggAykCCDcCCCAIIAMpAhA3AhAgCCADKQIYNwIYIAggAykCIDcCICAIIAgQByAIIAgQByAIIAgQByAIIAggChAKIAQgCCkCADcCACAEIAgpAgg3AgggBCAIKQIQNwIQIAQgCCkCGDcCGCAEIAgpAiA3AiAgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEIAcQCiAEIAQQByAEIAQQByAEIAQQByAEIAQQByAEIAQQByAEIAQgARAKIAQgBBAHIAQgBBAHIAQgBBAHIAQgBCALEAogBCAEEAcgBCAEEAcgACABIAQQCiAEJAQL7gQBG38gAEEkaiILKAIAIgJBFnYiAUHRB2wgACgCAGohBCABQQZ0IABBBGoiDCgCAGogBEEadmoiBUEadiAAQQhqIg0oAgBqIgZB////H3EhByAGQRp2IABBDGoiDigCAGoiCEEadiAAQRBqIg8oAgBqIQEgCEH///8fcSEJIAFB////H3EhCiABQRp2IABBFGoiECgCAGoiEUEadiAAQRhqIhIoAgBqIRMgEUH///8fcSEUIBNBGnYgAEEcaiIVKAIAaiIWQRp2IABBIGoiFygCAGohAyAWQf///x9xIRggA0H///8fcSEZIANBGnYgAkH///8BcWoiAkEWdiAFQf///x9xIgVBQGsgBEH///8fcSIEQdEHaiIaQRp2IhtqQf///x9LIAggBnEgAXEgEXEgE0H///8fcSIBcSAWcSADcUH///8fRiACQf///wFGcXFyIgNFBEAgACAENgIAIAwgBTYCACANIAc2AgAgDiAJNgIAIA8gCjYCACAQIBQ2AgAgEiABNgIAIBUgGDYCACAXIBk2AgAgCyACNgIADwsgGyAFaiADQQZ0aiIDQRp2IAdqIgRBGnYgCWoiBkEadiAKaiIHQRp2IBRqIghBGnYgAWoiAUEadiAYaiIJQRp2IBlqIgpBGnYgAmpB////AXEhAiAAIBpB////H3E2AgAgDCADQf///x9xNgIAIA0gBEH///8fcTYCACAOIAZB////H3E2AgAgDyAHQf///x9xNgIAIBAgCEH///8fcTYCACASIAFB////H3E2AgAgFSAJQf///x9xNgIAIBcgCkH///8fcTYCACALIAI2AgALsAIBCn8gACgCJCIBQRZ2IgJB0QdsIAAoAgBqIgNB////H3EiBEHQB3MhBSAEQQBHIAVB////H0dxBEBBAA8LIANBGnYgAkEGdHIgACgCBGoiAkEadiAAKAIIaiIDQRp2IAAoAgxqIgZBGnYgACgCEGoiB0EadiAAKAIUaiIIQRp2IAAoAhhqIglBGnYgACgCHGoiCkEadiAAKAIgaiIAQRp2IAFB////AXFqIQEgAkHAAHMgBXEgA3EgBnEgB3EgCHEgCXEgCnEgAHEgAUGAgIAec3FB////H0YEf0EBBSACQf///x9xIARyIANB////H3FyIAZB////H3FyIAdB////H3FyIAhB////H3FyIAlB////H3FyIApB////H3FyIABB////H3FyIAFyRQtBAXELmAIBBH8gACACaiEEIAFB/wFxIQEgAkHDAE4EQANAIABBA3EEQCAAIAE6AAAgAEEBaiEADAELCyAEQXxxIgVBQGohBiABIAFBCHRyIAFBEHRyIAFBGHRyIQMDQCAAIAZMBEAgACADNgIAIAAgAzYCBCAAIAM2AgggACADNgIMIAAgAzYCECAAIAM2AhQgACADNgIYIAAgAzYCHCAAIAM2AiAgACADNgIkIAAgAzYCKCAAIAM2AiwgACADNgIwIAAgAzYCNCAAIAM2AjggACADNgI8IABBQGshAAwBCwsDQCAAIAVIBEAgACADNgIAIABBBGohAAwBCwsLA0AgACAESARAIAAgAToAACAAQQFqIQAMAQsLIAQgAmsLqy8BnwF/IwQhDSMEQbAmaiQEIA1BgCZqIQ4gDUHYJWohESANQdgkaiEGIA1BhCRqIRIgDUGwI2ohDCANQcgfaiEWIA1ByBdqIUkgDUHoD2ohBSANQagNaiEJIA1BiAhqIQsCfwJAIAMoAgQgAygCAHIgAygCCHIgAygCDHIgAygCEHIgAygCFHIgAygCGHIgAygCHHJFDQAgAigCeA0AIA1BhAhqIgpBADYCACANQYAIaiANIANBBRArIgM2AgAgBiACIAooAgAiD0H8AGxqIhBBABAaIAwgBikCADcCACAMIAYpAgg3AgggDCAGKQIQNwIQIAwgBikCGDcCGCAMIAYpAiA3AiAgDEEoaiIKIAZBKGoiCCkCADcCACAKIAgpAgg3AgggCiAIKQIQNwIQIAogCCkCGDcCGCAKIAgpAiA3AiAgDEEANgJQIA4gBkHQAGoiChAHIBEgDiAKEAogEiAQIA4QCiASQShqIgggAiAPQfwAbGpBKGogERAKIBIgAiAPQfwAbGooAng2AlAgBSASKQIANwIAIAUgEikCCDcCCCAFIBIpAhA3AhAgBSASKQIYNwIYIAUgEikCIDcCICAFQShqIhAgCCkCADcCACAQIAgpAgg3AgggECAIKQIQNwIQIBAgCCkCGDcCGCAQIAgpAiA3AiAgBUHQAGoiCCACIA9B/ABsakHQAGoiAikCADcCACAIIAIpAgg3AgggCCACKQIQNwIQIAggAikCGDcCGCAIIAIpAiA3AiAgBUH4AGoiE0EANgIAIAkgCikCADcCACAJIAopAgg3AgggCSAKKQIQNwIQIAkgCikCGDcCGCAJIAopAiA3AiAgBUH8AGoiAiAFIAwgCUEoaiIUEBAgBUH4AWoiCCACIAwgCUHQAGoiBxAQIAVB9AJqIgIgCCAMIAlB+ABqIh0QECAFQfADaiIIIAIgDCAJQaABaiIeEBAgBUHsBGoiAiAIIAwgCUHIAWoiHxAQIAVB6AVqIg8gAiAMIAlB8AFqIiEQECAFQeQGaiIIIA8gDCAJQZgCaiIPEBAgBUG0B2oiAiACIAoQCiALQcwEaiIJIAgpAgA3AgAgCSAIKQIINwIIIAkgCCkCEDcCECAJIAgpAhg3AhggCSAIKQIgNwIgIAtB9ARqIgkgBUGMB2oiCikCADcCACAJIAopAgg3AgggCSAKKQIQNwIQIAkgCikCGDcCGCAJIAopAiA3AiAgC0GYBWoiIigCACIjQRZ2IghB0QdsIAkoAgBqIQogCEEGdCALQfgEaiIkKAIAaiAKQRp2aiIlQRp2IAtB/ARqIiYoAgBqIidBGnYgC0GABWoiKCgCAGoiKUEadiALQYQFaiIqKAIAaiIrQRp2IAtBiAVqIiwoAgBqIi1BGnYgC0GMBWoiLigCAGoiL0EadiALQZAFaiIwKAIAaiIxQRp2IAtBlAVqIjIoAgBqIQggCSAKQf///x9xNgIAICQgJUH///8fcTYCACAmICdB////H3E2AgAgKCApQf///x9xNgIAICogK0H///8fcTYCACAsIC1B////H3E2AgAgLiAvQf///x9xNgIAIDAgMUH///8fcTYCACAyIAhB////H3E2AgAgIiAIQRp2ICNB////AXFqNgIAIBYgAikCADcCACAWIAIpAgg3AgggFiACKQIQNwIQIBYgAikCGDcCGCAWIAIpAiA3AiAgC0EANgKcBSAGIA8pAgA3AgAgBiAPKQIINwIIIAYgDykCEDcCECAGIA8pAhg3AhggBiAPKQIgNwIgIA4gBhAHIBEgDiAGEAogC0H4A2ogBUHoBWogDhAKIAtBoARqIAVBkAZqIBEQCiALIAUoAuAGNgLIBCAGIAYgIRAKIA4gBhAHIBEgDiAGEAogC0GkA2ogBUHsBGogDhAKIAtBzANqIAVBlAVqIBEQCiALIAUoAuQFNgL0AyAGIAYgHxAKIA4gBhAHIBEgDiAGEAogC0HQAmogBUHwA2ogDhAKIAtB+AJqIAVBmARqIBEQCiALIAUoAugENgKgAyAGIAYgHhAKIA4gBhAHIBEgDiAGEAogC0H8AWogBUH0AmogDhAKIAtBpAJqIAVBnANqIBEQCiALIAUoAuwDNgLMAiAGIAYgHRAKIA4gBhAHIBEgDiAGEAogC0GoAWogBUH4AWogDhAKIAtB0AFqIAVBoAJqIBEQCiALIAUoAvACNgL4ASAGIAYgBxAKIA4gBhAHIBEgDiAGEAogC0HUAGogBUH8AGogDhAKIAtB/ABqIAVBpAFqIBEQCiALIAUoAvQBNgKkASAGIAYgFBAKIA4gBhAHIBEgDiAGEAogCyAFIA4QCiALQShqIBAgERAKIAsgEygCADYCUEEBIUogA0EASgR/IAMFQQALDAELIBZBATYCACAWQQRqIgJCADcCACACQgA3AgggAkIANwIQIAJCADcCGCACQQA2AiBBASFLQQALIQIgBARAIEkgBEEPECsiAyFMIAMgAkoEQCADIQILCyABQfgAaiIdQQE2AgAgAUIANwIAIAFCADcCCCABQgA3AhAgAUIANwIYIAFCADcCICABQgA3AiggAUIANwIwIAFCADcCOCABQUBrQgA3AgAgAUIANwJIIAFCADcCUCABQgA3AlggAUIANwJgIAFCADcCaCABQgA3AnAgAkEATARAIA0kBA8LIA1B6CFqISsgDUHwIGohLCANQcggaiFNIA1B8B9qIgVB0ABqIWogAUHQAGohHiAGQQRqIU4gBkEIaiFPIAZBDGohUCAGQRBqIVEgBkEUaiFSIAZBGGohUyAGQRxqIVQgBkEgaiFVIAZBJGohViABQShqIRMgDEEEaiFXIAxBCGohWCAMQQxqIVkgDEEQaiFaIAxBFGohWyAMQRhqIVwgDEEcaiFdIAxBIGohXiAMQSRqIV8gBUEoaiFgIA1B4CJqIghBBGohayAIQQhqIWwgCEEMaiFtIAhBEGohbiAIQRRqIW8gCEEYaiFwIAhBHGohcSAIQSBqIXIgCEEkaiFzIBJBBGohdCASQQhqIXUgEkEMaiF2IBJBEGohdyASQRRqIXggEkEYaiF5IBJBHGoheiASQSBqIXsgEkEkaiF8IA1BuCJqIhBBBGohfSAQQQhqIX4gEEEMaiF/IBBBEGohgAEgEEEUaiGBASAQQRhqIYIBIBBBHGohgwEgEEEgaiGEASAQQSRqIYUBIA1BiCNqIg9BBGohhgEgD0EIaiGHASAPQQxqIYgBIA9BEGohiQEgD0EUaiGKASAPQRhqIYsBIA9BHGohjAEgD0EgaiGNASAPQSRqIY4BIAFBBGohYSABQQhqIWIgAUEMaiFjIAFBEGohZCABQRRqIWUgAUEYaiFmIAFBHGohZyABQSBqIWggAUEkaiFpIA1BwCFqIgpBBGohLSAKQQhqIS4gCkEMaiEvIApBEGohMCAKQRRqITEgCkEYaiEyIApBHGohOSAKQSBqITogCkEkaiE7IA1BkCJqIhRBBGohjwEgFEEIaiGQASAUQQxqIZEBIBRBEGohkgEgFEEUaiGTASAUQRhqIZQBIBRBHGohlQEgFEEgaiGWASAUQSRqIZcBIAFBLGohPCABQTBqIT0gAUE0aiE+IAFBOGohPyABQTxqIUAgAUFAayFBIAFBxABqIUIgAUHIAGohQyABQcwAaiFEIA1BmCFqIglBBGohmAEgCUEIaiGZASAJQQxqIZoBIAlBEGohmwEgCUEUaiGcASAJQRhqIZ0BIAlBHGohngEgCUEgaiGfASAJQSRqIaABIAFB0ABqIaEBIAFB1ABqIR8gBUEoaiEhIAVBLGohIiAFQTBqISMgBUE0aiEkIAVBOGohJSAFQTxqISYgBUFAayEnIAVBxABqISggBUHIAGohKSAFQcwAaiEqIA1BgAhqKAIAIaIBA0AgAkF/aiEEIAEgAUEAEBogSyACIKIBSnJFBEBBACEDA0AgDSADQYgIbGogBEECdGooAgAiBwRAIAsgA0EDdEHUAGxqIRUgB0EASgRAIAUgFSAHQX9qQQJtQdQAbGoiBykCADcCACAFIAcpAgg3AgggBSAHKQIQNwIQIAUgBykCGDcCGCAFIAcpAiA3AiAgBSAHKQIoNwIoIAUgBykCMDcCMCAFIAcpAjg3AjggBUFAayAHQUBrKQIANwIAIAUgBykCSDcCSCAFIAcoAlA2AlAFIAUgFSAHQX9zQQJtQdQAbGoiBykCADcCACAFIAcpAgg3AgggBSAHKQIQNwIQIAUgBykCGDcCGCAFIAcpAiA3AiAgBSAHKQIoNwIoIAUgBykCMDcCMCAFIAcpAjg3AjggBUFAayAHQUBrKQIANwIAIAUgBykCSDcCSCAFIAcoAlA2AlAgIUG84f//ACAhKAIAazYCACAiQfz9//8AICIoAgBrNgIAICNB/P///wAgIygCAGs2AgAgJEH8////ACAkKAIAazYCACAlQfz///8AICUoAgBrNgIAICZB/P///wAgJigCAGs2AgAgJ0H8////ACAnKAIAazYCACAoQfz///8AICgoAgBrNgIAIClB/P///wAgKSgCAGs2AgAgKkH8//8HICooAgBrNgIACyABIAEgBUEAEBALIANBAWoiAyBKRw0ACwsgAiBMTARAIEkgBEECdGooAgAiAwRAIAAoAgAhByADQQBKBEAgBSAHIANBf2pBAm1BBnRqECMFIAUgByADQX9zQQJtQQZ0ahAjICFBvOH//wAgISgCAGs2AgAgIkH8/f//ACAiKAIAazYCACAjQfz///8AICMoAgBrNgIAICRB/P///wAgJCgCAGs2AgAgJUH8////ACAlKAIAazYCACAmQfz///8AICYoAgBrNgIAICdB/P///wAgJygCAGs2AgAgKEH8////ACAoKAIAazYCACApQfz///8AICkoAgBrNgIAICpB/P//ByAqKAIAazYCAAsCQCBqKAIARQRAIB0oAgAEQCAdQQA2AgAgLCAWEAcgTSAsIBYQCiABIAUgLBAKIBMgYCBNEAogoQFBATYCACAfQgA3AgAgH0IANwIIIB9CADcCECAfQgA3AhggH0EANgIgDAILIB1BADYCACAOIB4gFhAKIBEgDhAHIAYgASkCADcCACAGIAEpAgg3AgggBiABKQIQNwIQIAYgASkCGDcCGCAGIAEpAiA3AiAgVigCACIVQRZ2IgdB0QdsIAYoAgBqIQMgB0EGdCBOKAIAaiADQRp2aiIXQRp2IE8oAgBqIhhBGnYgUCgCAGoiGUEadiBRKAIAaiIaQRp2IFIoAgBqIhtBGnYgUygCAGoiHEEadiBUKAIAaiIgQRp2IFUoAgBqIQcgBiADQf///x9xIkU2AgAgTiAXQf///x9xIhc2AgAgTyAYQf///x9xIhg2AgAgUCAZQf///x9xIhk2AgAgUSAaQf///x9xIho2AgAgUiAbQf///x9xIhs2AgAgUyAcQf///x9xIhw2AgAgVCAgQf///x9xIiA2AgAgVSAHQf///x9xIkY2AgAgViAHQRp2IBVB////AXFqIhU2AgAgEiAFIBEQCiAMIBMpAgA3AgAgDCATKQIINwIIIAwgEykCEDcCECAMIBMpAhg3AhggDCATKQIgNwIgIF8oAgAiR0EWdiIHQdEHbCAMKAIAaiEDIAdBBnQgVygCAGogA0EadmoiM0EadiBYKAIAaiI0QRp2IFkoAgBqIjVBGnYgWigCAGoiNkEadiBbKAIAaiI3QRp2IFwoAgBqIjhBGnYgXSgCAGoiSEEadiBeKAIAaiEHIAwgA0H///8fcSIDNgIAIFcgM0H///8fcSIzNgIAIFggNEH///8fcSI0NgIAIFkgNUH///8fcSI1NgIAIFogNkH///8fcSI2NgIAIFsgN0H///8fcSI3NgIAIFwgOEH///8fcSI4NgIAIF0gSEH///8fcSJINgIAIF4gB0H///8fcSKjATYCACBfIAdBGnYgR0H///8BcWoiBzYCACAPIGAgERAKIA8gDyAOEAogCEG84f//ACBFayASKAIAajYCACBrQfz9//8AIBdrIHQoAgBqNgIAIGxB/P///wAgGGsgdSgCAGo2AgAgbUH8////ACAZayB2KAIAajYCACBuQfz///8AIBprIHcoAgBqNgIAIG9B/P///wAgG2sgeCgCAGo2AgAgcEH8////ACAcayB5KAIAajYCACBxQfz///8AICBrIHooAgBqNgIAIHJB/P///wAgRmsgeygCAGo2AgAgc0H8//8HIBVrIHwoAgBqNgIAIBBBvOH//wAgA2sgDygCAGo2AgAgfUH8/f//ACAzayCGASgCAGo2AgAgfkH8////ACA0ayCHASgCAGo2AgAgf0H8////ACA1ayCIASgCAGo2AgAggAFB/P///wAgNmsgiQEoAgBqNgIAIIEBQfz///8AIDdrIIoBKAIAajYCACCCAUH8////ACA4ayCLASgCAGo2AgAggwFB/P///wAgSGsgjAEoAgBqNgIAIIQBQfz///8AIKMBayCNASgCAGo2AgAghQFB/P//ByAHayCOASgCAGo2AgAgCBAXRQRAIBQgEBAHICsgCBAHIAogCCArEAogHiAeIAgQCiAJIAYgKxAKIAEgCSkCADcCACABIAkpAgg3AgggASAJKQIQNwIQIAEgCSkCGDcCGCABIAkpAiA3AiAgLSgCACEDIC4oAgAhByAvKAIAIRUgMCgCACEXIDEoAgAhGCAyKAIAIRkgOSgCACEaIDooAgAhGyA7KAIAIRwgYSgCAEF+bCEgIGIoAgBBfmwhRSBjKAIAQX5sIUYgZCgCAEF+bCFHIGUoAgBBfmwhMyBmKAIAQX5sITQgZygCAEF+bCE1IGgoAgBBfmwhNiBpKAIAQX5sITcgASABKAIAQX5sQfjC//8BaiAKKAIAayAUKAIAaiI4NgIAIGEgIEH4+///AWogA2sgjwEoAgBqIgM2AgAgYiBFQfj///8BaiAHayCQASgCAGoiBzYCACBjIEZB+P///wFqIBVrIJEBKAIAaiIVNgIAIGQgR0H4////AWogF2sgkgEoAgBqIhc2AgAgZSAzQfj///8BaiAYayCTASgCAGoiGDYCACBmIDRB+P///wFqIBlrIJQBKAIAaiIZNgIAIGcgNUH4////AWogGmsglQEoAgBqIho2AgAgaCA2Qfj///8BaiAbayCWASgCAGoiGzYCACBpIDdB+P//D2ogHGsglwEoAgBqIhw2AgAgE0G0pP//AiA4ayAJKAIAajYCACA8QfT5//8CIANrIJgBKAIAajYCACA9QfT///8CIAdrIJkBKAIAajYCACA+QfT///8CIBVrIJoBKAIAajYCACA/QfT///8CIBdrIJsBKAIAajYCACBAQfT///8CIBhrIJwBKAIAajYCACBBQfT///8CIBlrIJ0BKAIAajYCACBCQfT///8CIBprIJ4BKAIAajYCACBDQfT///8CIBtrIJ8BKAIAajYCACBEQfT//xcgHGsgoAEoAgBqNgIAIBMgEyAQEAogCiAKIAwQCiAKQbzh//8AIAooAgBrIgM2AgAgLUH8/f//ACAtKAIAayIHNgIAIC5B/P///wAgLigCAGsiFTYCACAvQfz///8AIC8oAgBrIhc2AgAgMEH8////ACAwKAIAayIYNgIAIDFB/P///wAgMSgCAGsiGTYCACAyQfz///8AIDIoAgBrIho2AgAgOUH8////ACA5KAIAayIbNgIAIDpB/P///wAgOigCAGsiHDYCACA7Qfz//wcgOygCAGsiIDYCACATIBMoAgAgA2o2AgAgPCA8KAIAIAdqNgIAID0gPSgCACAVajYCACA+ID4oAgAgF2o2AgAgPyA/KAIAIBhqNgIAIEAgQCgCACAZajYCACBBIEEoAgAgGmo2AgAgQiBCKAIAIBtqNgIAIEMgQygCACAcajYCACBEIEQoAgAgIGo2AgAMAgsgEBAXBEAgASABQQAQGgUgHUEBNgIACwsLCwsgAkEBSgRAIAQhAgwBCwsgHSgCAARAIA0kBA8LIB4gHiAWEAogDSQEC84SATB/IwQhBCMEQaABaiQEIARB+ABqIQUgBEHQAGohByAEQShqIQMgACABKAJ4IgY2AnggAkEARyEIIAYEQCAIRQRAIAQkBA8LIAJBATYCACACQQRqIgBCADcCACAAQgA3AgggAEIANwIQIABCADcCGCAAQQA2AiAgBCQEBSABQShqIQYgCARAIAIgBikCADcCACACIAYpAgg3AgggAiAGKQIQNwIQIAIgBikCGDcCGCACIAYpAiA3AiAgAkEkaiIKKAIAIgtBFnYiCUHRB2wgAigCAGohCCAJQQZ0IAJBBGoiDCgCAGogCEEadmoiDUEadiACQQhqIg4oAgBqIhJBGnYgAkEMaiITKAIAaiIUQRp2IAJBEGoiFSgCAGoiFkEadiACQRRqIhcoAgBqIhhBGnYgAkEYaiIZKAIAaiIaQRp2IAJBHGoiDygCAGoiEEEadiACQSBqIhEoAgBqIQkgAiAIQQF0Qf7//z9xNgIAIAwgDUEBdEH+//8/cTYCACAOIBJBAXRB/v//P3E2AgAgEyAUQQF0Qf7//z9xNgIAIBUgFkEBdEH+//8/cTYCACAXIBhBAXRB/v//P3E2AgAgGSAaQQF0Qf7//z9xNgIAIA8gEEEBdEH+//8/cTYCACARIAlBAXRB/v//P3E2AgAgCiAJQRp2IAtB////AXFqQQF0NgIACyAAQdAAaiICIAFB0ABqIAYQCiACIAIoAgBBAXQ2AgAgAEHUAGoiAiACKAIAQQF0NgIAIABB2ABqIgIgAigCAEEBdDYCACAAQdwAaiICIAIoAgBBAXQ2AgAgAEHgAGoiAiACKAIAQQF0NgIAIABB5ABqIgIgAigCAEEBdDYCACAAQegAaiICIAIoAgBBAXQ2AgAgAEHsAGoiAiACKAIAQQF0NgIAIABB8ABqIgIgAigCAEEBdDYCACAAQfQAaiICIAIoAgBBAXQ2AgAgBSABEAcgBSAFKAIAQQNsNgIAIAVBBGoiAiACKAIAQQNsNgIAIAVBCGoiAiACKAIAQQNsNgIAIAVBDGoiAiACKAIAQQNsNgIAIAVBEGoiAiACKAIAQQNsNgIAIAVBFGoiAiACKAIAQQNsNgIAIAVBGGoiAiACKAIAQQNsNgIAIAVBHGoiAiACKAIAQQNsNgIAIAVBIGoiAiACKAIAQQNsNgIAIAVBJGoiAiACKAIAQQNsNgIAIAcgBRAHIAMgBhAHIAMgAygCAEEBdDYCACADQQRqIgIgAigCAEEBdDYCACADQQhqIgYgBigCAEEBdDYCACADQQxqIgggCCgCAEEBdDYCACADQRBqIgkgCSgCAEEBdDYCACADQRRqIgogCigCAEEBdDYCACADQRhqIgsgCygCAEEBdDYCACADQRxqIgwgDCgCAEEBdDYCACADQSBqIg0gDSgCAEEBdDYCACADQSRqIg4gDigCAEEBdDYCACAEIAMQByAEIAQoAgBBAXQ2AgAgBEEEaiISIBIoAgBBAXQ2AgAgBEEIaiITIBMoAgBBAXQ2AgAgBEEMaiIUIBQoAgBBAXQ2AgAgBEEQaiIVIBUoAgBBAXQ2AgAgBEEUaiIWIBYoAgBBAXQ2AgAgBEEYaiIXIBcoAgBBAXQ2AgAgBEEcaiIYIBgoAgBBAXQ2AgAgBEEgaiIZIBkoAgBBAXQ2AgAgBEEkaiIaIBooAgBBAXQ2AgAgAyADIAEQCiAAIAMpAgA3AgAgACADKQIINwIIIAAgAykCEDcCECAAIAMpAhg3AhggACADKQIgNwIgQfb6/78CIABBBGoiASgCAEECdGshD0H2//+/AiAAQQhqIhAoAgBBAnRrIRFB9v//vwIgAEEMaiIbKAIAQQJ0ayEcQfb//78CIABBEGoiHSgCAEECdGshHkH2//+/AiAAQRRqIh8oAgBBAnRrISBB9v//vwIgAEEYaiIhKAIAQQJ0ayEiQfb//78CIABBHGoiIygCAEECdGshJEH2//+/AiAAQSBqIiUoAgBBAnRrISZB9v//EyAAQSRqIicoAgBBAnRrISggAEHWs/+/AiAAKAIAQQJ0ayAHKAIAIilqNgIAIAEgDyAHQQRqIg8oAgAiAWo2AgAgECARIAdBCGoiECgCACIRajYCACAbIBwgB0EMaiIbKAIAIhxqNgIAIB0gHiAHQRBqIh0oAgAiHmo2AgAgHyAgIAdBFGoiHygCACIgajYCACAhICIgB0EYaiIhKAIAIiJqNgIAICMgJCAHQRxqIiMoAgAiJGo2AgAgJSAmIAdBIGoiJSgCACImajYCACAnICggB0EkaiInKAIAIihqNgIAIAIoAgBBBmwhKiAGKAIAQQZsISsgCCgCAEEGbCEsIAkoAgBBBmwhLSAKKAIAQQZsIS4gCygCAEEGbCEvIAwoAgBBBmwhMCANKAIAQQZsITEgDigCAEEGbCEyIAMgAygCAEEGbEG84f//ACApa2o2AgAgAiAqQfz9//8AIAFrajYCACAGICtB/P///wAgEWtqNgIAIAggLEH8////ACAca2o2AgAgCSAtQfz///8AIB5rajYCACAKIC5B/P///wAgIGtqNgIAIAsgL0H8////ACAia2o2AgAgDCAwQfz///8AICRrajYCACANIDFB/P///wAgJmtqNgIAIA4gMkH8//8HIChrajYCACAAQShqIgEgBSADEAogB0Ga0v+/ASAEKAIAayICNgIAIA9B+vz/vwEgEigCAGsiAzYCACAQQfr//78BIBMoAgBrIgU2AgAgG0H6//+/ASAUKAIAayIHNgIAIB1B+v//vwEgFSgCAGsiBjYCACAfQfr//78BIBYoAgBrIgg2AgAgIUH6//+/ASAXKAIAayIJNgIAICNB+v//vwEgGCgCAGsiCjYCACAlQfr//78BIBkoAgBrIgs2AgAgJ0H6//8LIBooAgBr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BGohBCAGIAgQDEEBIANrIgNBwABJBH8gBAUgAkGBf2oiDUFAcSIOIAJrQcSSBGohBSADIQIgBCEDA0AgCCADKQAANwAAIAggAykACDcACCAIIAMpABA3ABAgCCADKQAYNwAYIAggAykAIDcAICAIIAMpACg3ACggCCADKQAwNwAwIAggAykAODcAOCADQUBrIQMgBiAIEAwgAkFAaiICQcAATw0ACyANIA5rIQMgBQshAiADBEAgAiEEQQAhAgwCCwsMAQsgCCACaiAEIAMQCxoLIAogECgCACICQR12QRh0NgIAIAogAkELdEGAgPwHcSACQRt0ciACQQV2QYD+A3FyIAJBFXZB/wFxcjYCBCAQIAJBNyACa0E/cUEBaiIDajYCACAGQSBqIQUCQAJAIANBwAAgAkE/cSICayIESQRAQfmMBCEEDAEFIAUgAmpB+YwEIAQQCxogBEH5jARqIQIgBiAFEAwgAyAEayIDQcAATwRAA0AgBSACKQAANwAAIAUgAikACDcACCAFIAIpABA3ABAgBSACKQAYNwAYIAUgAikAIDcAICAFIAIpACg3ACggBSACKQAwNwAwIAUgAikAODcAOCACQUBrIQIgBiAFEAwgA0FAaiIDQcAATw0ACwsgAwRAIAIhBEEAIQIMAgsLDAELIAUgAmogBCADEAsaCyAQKAIAIgJBP3EhBCAQIAJBCGo2AgAgBkEgaiEFAkACQEHAACAEayIDQQhLBEAgCiECQQghAwwBBSAFIARqIAogAxALGiAKIANqIQIgBiAFEAxBCCADayIDQcAATwRAA0AgBSACKQAANwAAIAUgAikACDcACCAFIAIpABA3ABAgBSACKQAYNwAYIAUgAikAIDcAICAFIAIpACg3ACggBSACKQAwNwAwIAUgAikAODcAOCACQUBrIQIgBiAFEAwgA0FAaiIDQcAATw0ACwsgAwRAQQAhBAwCCwsMAQsgBSAEaiACIAMQCxoLIAYoAgAQCSESIAZBADYCACAGQQRqIh4oAgAQCSEIIB5BADYCACAGQQhqIh8oAgAQCSENIB9BADYCACAGQQxqIiAoAgAQCSEOICBBADYCACAGQRBqIiEoAgAQCSEFICFBADYCACAGQRRqIiMoAgAQCSEEICNBADYCACAGQRhqIhMoAgAQCSEDIBNBADYCACAGQRxqIh0oAgAQ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EAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADEAggAyADIAIQDSAEQaABaiICIAMQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIgBRANIAIgAhAIIAIgAhAIIAIgAhAIIAIgAiAJEA0gAiACEAggAiACEAggAiACEAggAiACEAggAiACIAYQDSACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIgCRANIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAiAKEA0gAiACEAggAiACEAggAiACEAggAiACEAggAiACIAoQDSACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIgBhANIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAiAGEA0gAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACIAQQDSACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIgCRANIAIgAhAIIAIgAhAIIAIgAhAIIAIgAiAGEA0gAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACIAsQDSACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIgCRANIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAiAGEA0gAiACEAggAiACEAggAiACEAggAiACEAggAiACIAYQDSACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIgCBANIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAiALEA0gAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACIAoQDSACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIgBBANIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAiAMEA0gAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACIAQQDSACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIgBBANIAIgAhAIIAIgAhAIIAIgAhAIIAIgAhAIIAIgAiALEA0gAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACEAggAiACIAEQDSACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCACIAIQCCAAIAIgBxANIAQkBAvYAwETfyMEIQIjBEHQAGokBCACIAFB0ABqEAcgAiACIAAQCiABKAIkIgZBFnYiAEHRB2wgASgCAGohBCAAQQZ0IAEoAgRqIARBGnZqIgdBGnYgASgCCGoiCEEadiABKAIMaiIJQRp2IAEoAhBqIgpBGnYgASgCFGoiC0EadiABKAIYaiIMQRp2IAEoAhxqIg1BGnYgASgCIGohBUH8/f//ACACKAIEayEOQfz///8AIAIoAghrIQ9B/P///wAgAigCDGshEEH8////ACACKAIQayERQfz///8AIAIoAhRrIRJB/P///wAgAigCGGshE0H8////ACACKAIcayEUQfz///8AIAIoAiBrIQEgAigCJCEAIAJBKGoiA0G84f//ACACKAIAayAEQf///x9xajYCACADIA4gB0H///8fcWo2AgQgAyAPIAhB////H3FqNgIIIAMgECAJQf///x9xajYCDCADIBEgCkH///8fcWo2AhAgAyASIAtB////H3FqNgIUIAMgEyAMQf///x9xajYCGCADIBQgDUH///8fcWo2AhwgAyABIAVB////H3FqNgIgIAMgBkH///8BcUH8//8HaiAAayAFQRp2ajYCJCADEBchACACJAQgAAuXEAEKfyMEIQQjBEHgA2okBCAEQdAAaiEDIARBKGohCCAEQbgDaiILIAEQByALIAsgARAKIARBkANqIgogCxAHIAogCiABEAogBEHoAmoiBiAKKQIANwIAIAYgCikCCDcCCCAGIAopAhA3AhAgBiAKKQIYNwIYIAYgCikCIDcCICAGIAYQByAGIAYQByAGIAYQByAGIAYgChAKIARBwAJqIgIgBikCADcCACACIAYpAgg3AgggAiAGKQIQNwIQIAIgBikCGDcCGCACIAYpAiA3AiAgAiACEAcgAiACEAcgAiACEAcgAiACIAoQCiAEQZgCaiIGIAIpAgA3AgAgBiACKQIINwIIIAYgAikCEDcCECAGIAIpAhg3AhggBiACKQIgNwIgIAYgBhAHIAYgBhAHIAYgBiALEAogBEHwAWoiByAGKQIANwIAIAcgBikCCDcCCCAHIAYpAhA3AhAgByAGKQIYNwIYIAcgBikCIDcCICAHIAcQByAHIAcQByAHIAcQByAHIAcQByAHIAcQByAHIAcQByAHIAcQByAHIAcQByAHIAcQByAHIAcQByAHIAcQByAHIAcgBhAKIARByAFqIgUgBykCADcCACAFIAcpAgg3AgggBSAHKQIQNwIQIAUgBykCGDcCGCAFIAcpAiA3AiAgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFEAcgBSAFIAcQCiAEQaABaiICIAUpAgA3AgAgAiAFKQIINwIIIAIgBSkCEDcCECACIAUpAhg3AhggAiAFKQIgNwIgIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAhAHIAIgAiAFEAogBEH4AGoiCSACKQIANwIAIAkgAikCCDcCCCAJIAIpAhA3AhAgCSACKQIYNwIYIAkgAikCIDcCIEEAIQYDQCAJIAkQByAGQQFqIgZB2ABHDQALIAkgCSACEAogAyAJKQIANwIAIAMgCSkCCDcCCCADIAkpAhA3AhAgAyAJKQIYNwIYIAMgCSkCIDcCICADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMQByADIAMgBRAKIAggAykCADcCACAIIAMpAgg3AgggCCADKQIQNwIQIAggAykCGDcCGCAIIAMpAiA3AiAgCCAIEAcgCCAIEAcgCCAIEAcgCCAIIAoQCiAEIAgpAgA3AgAgBCAIKQIINwIIIAQgCCkCEDcCECAEIAgpAhg3AhggBCAIKQIgNwIgIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBBAHIAQgBCAHEAogBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEEAcgBCAEIAsQCiAEIAQQByAAIAQQByAEIAAQB0G84f//ACAEKAIAayABKAIAaiABKAIkQfz//wcgBCgCJGtqIgpBFnYiBkHRB2xqIQBB/P///wAgBCgCIGsgASgC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ACggBCABKQAwNwAwIAQgASkAODcAOCABQUBrIQEgBiAEEAwgAkFAaiICQcAATw0ACwsgAgRAQQAhAwwCCwsMAQsgBCADaiABIAIQCxoLIAYoAgAQCSEIIAZBADYCACAKKAIAEAkhCSAKQQA2AgAgCygCABAJIQogC0EANgIAIAwoAgAQCSELIAxBADYCACANKAIAEAkhByANQQA2AgAgDigCABAJIQMgDkEANgIAIA8oAgAQCSECIA9BADYCACARKAIAEAkhASAFIAg2AgAgBSAJNgIEIAUgCjYCCCAFIAs2AgwgBSAHNgIQIAUgAzYCFCAFIAI2AhggBSABNgIcIAAgBSAQEA4gBSQEC+YBAQN/IABB4ABqIgMoAgAiBEE/cSEFIAMgBCACajYCAEHAACAFayIEIAJNBEAgAEEgaiIDIAVqIAEgBBALGiABIARqIQEgACADEAwgAiAEayICQcAASQRAQQAhBQUDQCADIAEpAAA3AAAgAyABKQAINwAIIAMgASkAEDcAECADIAEpABg3ABggAyABKQAgNwAgIAMgASkAKDcAKCADIAEpADA3ADAgAyABKQA4NwA4IAFBQGshASAAIAMQDCACQUBqIgJBwABPDQBBACEFCwsLIAJFBEAPCyAAQSBqIAVqIAEgAhALGgvASwEzfyMEIQkjBEHwAWokBCAAQoGChIiQoMCAATcCACAAQoGChIiQoMCAATcCCCAAQoGChIiQoMCAATcCECAAQoGChIiQoMCAATcCGCAAQSBqIhlCADcCACAZQgA3AgggGUIANwIQIBlCADcCGCAJIgogGRATIApB4ABqIg0oAgAiCUE/cSEEIA0gCUEgajYCACAKQSBqIQsCQAJAQcAAIARrIglBIEsEQCAAIQkgBCEDQSAhCAwBBSALIARqIAAgCRALGiAAIAlqIQMgCiALEAxBICAJayIIQcAASQR/IAMFIABB5ABqIARBoH9qIgdBQHEiBkEcciAEa2ohBCAIIQkgAyEIA0AgCyAIKQAANwAAIAsgCCkACDcACCALIAgpABA3ABAgCyAIKQAYNwAYIAsgCCkAIDcAICALIAgpACg3ACggCyAIKQAwNwAwIAsgCCkAODcAOCAIQUBrIQggCiALEAwgCUFAaiIJQcAATw0ACyAHIAZrIQggBAshCSAIBEBBACEDDAILCwwBCyAL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cXIgAUEVdkH/AXFyNgIEIA0gAUE3IAFrQT9xQQFqIgJqNgIAIApBIGohBAJAAkAgAkHAACABQT9xIgFrIgNJBEBB+YwEIQMMAQUgBCABakH5jAQgAxALGiADQfmMBGohASAKIAQQDCACIANrIgJBwABPBEADQCAEIAEpAAA3AAAgBCABKQAINwAIIAQgASkAEDcAECAEIAEpABg3ABggBCABKQAgNwAgIAQgASkAKDcAKCAEIAEpADA3ADAgBCABKQA4NwA4IAFBQGshASAKIAQQDCACQUBqIgJBwABPDQALCyACBEAgASEDQQAhAQwCCwsMAQsgBCABaiADIAIQCxoLIA0oAgAiAUE/cSEDIA0gAUEIajYCACAKQSBqIQQCQAJAQcAAIANrIgJBCEsEQCAJIQFBCCECDAEFIAQgA2ogCSACEAsaIAkgAmohASAKIAQQDEEIIAJrIgJBwABPBEADQCAEIAEpAAA3AAAgBCABKQAINwAIIAQgASkAEDcAECAEIAEpABg3ABggBCABKQAgNwAgIAQgASkAKDcAKCAEIAEpADA3ADAgBCABKQA4NwA4IAFBQGshASAKIAQQDCACQUBqIgJBwABPDQALCyACBEBBACEDDAILCwwBCyAEIANqIAEgAhALGgsgCigCABAJIQ4gCkEANgIAIBooAgAQCSELIBpBADYCACAbKAIAEAkhByAbQQA2AgAgHCgCABAJIQYgHEEANgIAIB0oAgAQCSEEIB1BADYCACAeKAIAEAkhAyAeQQA2AgAgHygCABAJIQIgH0EANgIAICAoAgAQCSEBICBBADYCACAIIA42AgAgIiALNgIAICMgBzYCACAkIAY2AgAgJSAENgIAICYgAzYCACAnIAI2AgAgKCABNgIAIBEoAgAiAUE/cSEDIBEgAUEgajYCAAJAAkBBwAAgA2siBEEgSwRAIAghASADIQJBICEDDAEFIAUgA2ogCCAEEAsaIAggBGohAiAMIAUQDEEgIARrIgFBwABJBH8gASEDIAIFIANBoH9qIgNBBnZBAXQhBiAEQUBqIQQDQCAFIAIpAAA3AAAgBSACKQAINwAIIAUgAikAEDcAECAFIAIpABg3ABggBSACKQAgNwAgIAUgAikAKDcAKCAFIAIpADA3ADAgBSACKQA4NwA4IAJBQGshAiAMIAUQDCABQUBqIgFBwABPDQALIANBP3EhAyAIIAZBBGpBBXRqIARqCyEBIAMEQEEAIQIMAgsLDAELIAUgAmogASADEAsaCyAJIBEoAgAiAUEddkEYdDYCACAJIAFBC3RBgID8B3EgAUEbdHIgAUEFdkGA/gNxciABQRV2Qf8BcXI2AgQgESABQTcgAWtBP3FBAWoiAmo2AgACQAJAIAJBwAAgAUE/cSIBayIDSQRAQfmMBCEDDAEFIAUgAWpB+YwEIAMQCxogA0H5jARqIQEgDCAFEAwgAiADayICQcAATwRAA0AgBSABKQAANwAAIAUgASkACDcACCAFIAEpABA3ABAgBSABKQAYNwAYIAUgASkAIDcAICAFIAEpACg3ACggBSABKQAwNwAwIAUgASkAODcAOCABQUBrIQEgDCAFEAwgAkFAaiICQcAATw0ACwsgAgRAIAEhA0EAIQEMAgsLDAELIAUgAWogAyACEAsaCyARKAIAIgFBP3EhAyARIAFBCGo2AgACQAJAQcAAIANrIgJBCEsEQCAJIQFBCCECDAEFIAUgA2ogCSACEAsaIAkgAmohASAMIAUQDEEIIAJrIgJBwABPBEADQCAFIAEpAAA3AAAgBSABKQAINwAIIAUgASkAEDcAECAFIAEpABg3ABggBSABKQAgNwAgIAUgASkAKDcAKCAFIAEpADA3ADAgBSABKQA4NwA4IAFBQGshASAMIAUQDCACQUBqIgJBwABPDQALCyACBEBBACEDDAILCwwBCyAFIANqIAEgAhALGgsgDCgCABAJIQ4gDEEANgIAIBMoAgAQCSELIBNBADYCACAUKAIAEAkhByAUQQA2AgAgFSgCABAJIQYgFUEANgIAIBYoAgAQCSEEIBZBADYCACAXKAIAEAkhAyAXQQA2AgAgGCgCABAJIQIgGEEANgIAICEoAgAQCSEBICFBADYCACAuIA42AAAgLyALNgAAIDAgBzYAACAxIAY2AAAgMiAENgAAIDMgAzYAACA0IAI2AAAgNSABNgAAIAogGRATIA0oAgAiAUE/cSEEIA0gAUEgajYCACAKQSBqIQsCQAJAQcAAIARrIgFBIEsEQCAAIQEgBCEDQSAhAgwBBSALIARqIAAgARALGiAAIAFqIQMgCiALEAxBICABayICQcAASQR/IAMFIABB5ABqIARBoH9qIgdBQHEiBkEcciAEa2ohBCACIQEgAyECA0AgCyACKQAANwAAIAsgAikACDcACCALIAIpABA3ABAgCyACKQAYNwAYIAsgAikAIDcAICALIAIpACg3ACggCyACKQAwNwAwIAsgAikAODcAOCACQUBrIQIgCiALEAwgAUFAaiIBQcAATw0ACyAHIAZrIQIgBAshASACBEBBACEDDAILCwwBCyALIANqIAEgAhALGgsgCSANKAIAIgFBHXZBGHQ2AgAgCSABQQt0QYCA/AdxIAFBG3RyIAFBBXZBgP4DcXIgAUEVdkH/AXFyNgIEIA0gAUE3IAFrQT9xQQFqIgJqNgIAIApBIGohBAJAAkAgAkHAACABQT9xIgFrIgNJBEBB+YwEIQMMAQUgBCABakH5jAQgAxALGiADQfmMBGohASAKIAQQDCACIANrIgJBwABPBEADQCAEIAEpAAA3AAAgBCABKQAINwAIIAQgASkAEDcAECAEIAEpABg3ABggBCABKQAgNwAgIAQgASkAKDcAKCAEIAEpADA3ADAgBCABKQA4NwA4IAFBQGshASAKIAQQDCACQUBqIgJBwABPDQALCyACBEAgASEDQQAhAQwCCwsMAQsgBCABaiADIAIQCxoLIA0oAgAiAUE/cSEDIA0gAUEIajYCACAKQSBqIQQCQAJAQcAAIANrIgJBCEsEQCAJIQFBCCECDAEFIAQgA2ogCSACEAsaIAkgAmohASAKIAQQDEEIIAJrIgJBwABPBEADQCAEIAEpAAA3AAAgBCABKQAINwAIIAQgASkAEDcAECAEIAEpABg3ABggBCABKQAgNwAgIAQgASkAKDcAKCAEIAEpADA3ADAgBCABKQA4NwA4IAFBQGshASAKIAQQDCACQUBqIgJBwABPDQALCyACBEBBACEDDAILCwwBCyAEIANqIAEgAhALGgsgCigCABAJIQ4gCkEANgIAIBooAgAQCSELIBpBADYCACAbKAIAEAkhByAbQQA2AgAgHCgCABAJIQYgHEEANgIAIB0oAgAQCSEEIB1BADYCACAeKAIAEAkhAyAeQQA2AgAgHygCABAJIQIgH0EANgIAICAoAgAQCSEBICBBADYCACAIIA42AgAgIiALNgIAICMgBzYCACAkIAY2AgAgJSAENgIAICYgAzYCACAnIAI2AgAgKCABNgIAIBEoAgAiAUE/cSEDIBEgAUEgajYC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AEIANwIQIABCADcCGAsgASABKAIAIARqNgIAIAMkBEEBC9YDAQN/IwQhAyMEQYABaiQEIAAgASkCADcCACAAIAEpAgg3AgggACABKQIQNwIQIAAgASkCGDcCGCAAIAEpAiA3AiAgA0HQAGoiBSABEAcgA0EoaiIEIAEgBRAKIABBADYCUCADIAQoAgBBB2o2AgAgAyAEKAIENgIEIAMgBCgCCDYCCCADIAQoAgw2AgwgAyAEKAIQNgIQIAMgBCgCFDYCFCADIAQoAhg2AhggAyAEKAIcNgIcIAMgBCgCIDYCICADIAQoAiQ2AiQgAEEoaiIFIAMQIkUEQCADJARBAA8LIAUQFiAFKAIAIgFBAXEgAkYEQCADJARBAQ8LIAVBvOH//wAgAWs2AgAgAEEsaiIBQfz9//8AIAEoAgBrNgIAIABBMGoiAUH8////ACABKAIAazYCACAAQTRqIgFB/P///wAgASgCAGs2AgAgAEE4aiIBQfz///8AIAEoAgBrNgIAIABBPGoiAUH8////ACABKAIAazYCACAAQUBrIgFB/P///wAgASgCAGs2AgAgAEHEAGoiAUH8////ACABKAIAazYCACAAQcgAaiIBQfz///8AIAEoAgBrNgIAIABBzABqIgBB/P//ByAAKAIAazYCACADJARBAQv2CwIRfwJ+IwQhBSMEQaADaiQEIAVBuAJqIgJCADcAACACQgA3AAggAkIANwAQIAJCADcAGCACQgA3ACAgAkIANwAoIAJCADcAMCACQgA3ADggAUUEQCAAQQA2ApwBIABBJGoiA0GQiAQpAgA3AgAgA0GYiAQpAgA3AgggA0GgiAQpAgA3AhAgA0GoiAQpAgA3AhggA0GwiAQpAgA3AiAgAEEBNgJ0IABB+ABqIgNCADcCACADQgA3AgggA0IANwIQIANCADcCGCADQQA2AiAgAEGEuLznADYCTCAAQf61r/AANgJQIABBuMz59QA2AlQgAEHny/X2ADYCWCAAQcjQi/gANgJcIABB0vvu4wA2AmAgAEG8gMHtADYCZCAAQYbVuecANgJoIABB2bKj7AA2AmwgAEHG4rcHNgJwIABBATYCBCAAQQhqIgNCADcCACADQgA3AgggA0IANwIQIANBADYCGAsgBUH4AmoiBiAAQQRqIg8QESACIAYpAAA3AAAgAiAGKQAINwAIIAIgBikAEDcAECACIAYpABg3ABggAUEARyIHBEAgAkEgaiIDIAEpAAA3AAAgAyABKQAINwAIIAMgASkAEDcAECADIAEpABg3ABgLIAVBkAJqIQggBUHwAWohBCAFQfAAaiEDIAVByABqIQEgBUEEaiIQIAIgBwR/QcAABUEgCxAqIAJCADcAACACQgA3AAggAkIANwAQIAJCADcAGCACQgA3ACAgAkIANwAoIAJCADcAMCACQgA3ADggAUEEaiECIAFBCGohByABQQxqIQkgAUEQaiEKIAFBFGohCyABQRhqIQwgAUEcaiENIAFBIGohESABQSRqIRIDQCAQIAYQHyAFIAEgBhAURSIONgIAIA4EQCAFQQE2AgAMAQUgBSACKAIAIAEoAgByIAcoAgByIAkoAgByIAooAgByIAsoAgByIAwoAgByIA0oAgByIBEoAgByIBIoAgByRSIONgIAIA4NAQsLIAggARAHIABBJGoiAiACIAgQCiAAQcwAaiIHIAcgCBAKIAcgByABEAogAEH0AGoiCCAIIAEQCiABQgA3AgAgAUIANwIIIAFCADcCECABQgA3AhggAUIANwIgIARBBGohASAEQQhqIQggBEEMaiEHIARBEGohCSAEQRRqIQogBEEYaiELIARBHGohDANAIBAgBhAfIAQgBiAFEA4gBSgCAARAIAVBATYCAAwBBSAFIAEoAgAgBCgCAHIgCCgCAHIgBygCAHIgCSgCAHIgCigCAHIgCygCAHIgDCgCAHJFIg02AgAgDQ0BCwsgBkIANwAAIAZCADcACCAGQgA3ABAgBkIANwAYIAAgAyAEEB4gBCAEKAIAIgBBf3OtQsKC2YENfCITIAEoAgAiBiAAciAIKAIAIgByIAcoAgAiEHIgCSgCACINciAKKAIAIhFyIAsoAgAiEnIgDCgCACIOckEAR0EfdEEfda0iFIM+AgAgASATQiCIQoy9yf4LhCAGQX9zrXwiEyAUgz4CACAIIABBf3OtQrvAovoKfCATQiCIfCITIBSDPgIAIAcgEEF/c61C5rm71Qt8IBNCIIh8IhMgFIM+AgAgCSANQX9zrUL+////D3wgE0IgiHwiEyAUgz4CACAKIBFBf3OtQv////8PfCATQiCIfCITIBSDPgIAIAsgEkF/c61C/////w98IBNCIIh8IhMgFIM+AgAgDCAO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KSAGQQhqISogBkEMaiErIAZBEGohLCAGQRRqIS0gBkEYaiEuIAZBHGohLyAGQSBqITAgBkEkaiExIANBBGohMiADQQhqITMgA0EMaiE0IANBEGohNSADQRRqITYgA0EYaiE3IANBHGohOCADQSBqITkgA0EkaiE6IARBBGohOyAEQQhqIQkgBEEMaiEMIARBEGohDiAEQRRqIQ8gBEEYaiERIARBHGohEiAEQSBqIRMgBEEkaiEVIA0oAgBBvOH//wBqIRYgDSgCBEH8/f//AGohFyANKAIIQfz///8AaiEYIA0oAgxB/P///wBqIRkgDSgCEEH8////AGohGiANKAIUQfz///8AaiEbIA0oAhhB/P///wBqIRwgDSgCHEH8////AGohHSANKAIgQfz///8AaiEeIA0oAiRB/P//B2ohH0H/PyEBA0AgBiAHIAFBf2oiAkEGdGoiIBAjIBAgECAGEAogFCAQEAcgKCAUIBAQCiAGIAYgFBAKICkoAgAhISAqKAIAISIgKygCACEjICwoAgAhJCAtKAIAISUgLigCACEmIC8oAgAhJyAwKAIAIQsgMSgCACEFIAYgFiAGKAIAazYCACApIBcgIWs2AgAgKiAYICJrNgIAICsgGSAjazYCACAsIBogJGs2AgAgLSAbICVrNgIAIC4gHCAmazYCACAvIB0gJ2s2AgAgMCAeIAtrNgIAIDEgHyAFazYCACAKIAogKBAKIAMgBikCADcCACADIAYpAgg3AgggAyAGKQIQNwIQIAMgBikCGDcCGCADIAYpAiA3AiAgAxAPIAQgCikCADcCACAEIAopAgg3AgggBCAKKQIQNwIQIAQgCikCGDcCGCAEIAopAiA3AiAgBBAPICAgMigCACILQRp0IAMoAgByNgIAIAcgAkEGdGogMygCACIFQRR0IAtBBnZyNgIEIAcgAkEGdGogNCgCACILQQ50IAVBDHZyNgIIIAcgAkEGdGogNSgCACIFQQh0IAtBEnZyNgIMIAcgAkEGdGogNigCAEECdCAFQRh2ciA3KAIAIgVBHHRyNgIQIAcgAkEGdGogOCgCACILQRZ0IAVBBHZyNgIUIAcgAkEGdGogOSgCACIFQRB0IAtBCnZyNgIYIAcgAkEGdGogOigCAEEKdCAFQRB2cjYCHCAHIAJBBnRqIDsoAgAiC0EadCAEKAIA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IAYoAgBFBEAgBygCBCAHKAIAciAHKAIIciAHKAIMciAHKAIQciAHKAIUciAHKAIYciAHKAIccgRAIAkgAkEAEA4CQCAMIAIgA0EAIAVBACAOQQFxEQEAIgAEQCAIQQRqIRAgCEEIaiERIAhBDGohEiAIQRBqIRMgCEEUaiEUIAhBGGohFSAIQRxqIRZBACEEA0AgCCAMIAYQDiAGKAIARQRAIBAoAgAgCCgCAHIgESgCAHIgEigCAHIgEygCAHIgFCgCAHIgFSgCAHIgFigCAHIEQCAPIAogCyAHIAkgCCANEDENBAsLIAwgAiADQQAgBSAEQQFqIgQgDkEBcREBACIADQBBACEACwVBACEACwsgCUIANwIAIAlCADcCCCAJQgA3AhAgCUIANwIYIAhCADcCACAIQgA3AgggCEIANwIQIAhCADcCGCAHQgA3AgAgB0IANwIIIAdCADcCECAHQgA3AhggAARAIA0oAgAhAyABIAopAAA3AAAgASAKKQAINwAIIAEgCikAEDcAECABIAopABg3ABggAUEgaiICIAspAAA3AAAgAiALKQAINwAIIAIgCykAEDcAECACIAspABg3ABggAUFAayADOgAAIAYkBCAADwsLCyABQgA3AAAgAUIANwAIIAFCADcAECABQgA3ABggAUIANwAgIAFCADcAKCABQgA3ADAgAUIANwA4IAFBQGtBADoAACAGJARBAAv+AQECfyMEIQQjBEFAayQEIAFFBEBByooEIAAoAqgBIAAoAqQBQQNxQQJqEQAAIAQkBEEADwsgA0UEQEGuigQgACgCqAEgACgCpAFBA3FBAmoRAAAgBCQEQQAPCyAEQSBqIQUgAgR/IAUgAykAADcAACAFIAMpAAg3AAggBSADKQAQNwAQIAUgAykAGDcAGCAEIANBIGoiACkAADcAACAEIAApAAg3AAggBCAAKQAQNwAQIAQgACkAGDcAGCACIANBQGstAAA2AgAgASAFEBEgAUEgaiAEEBEgBCQEQQEFQb6MBCAAKAKoASAAKAKkAUEDcUECahEAACAEJARBAAsL7wIBA38jBCEEIwRB0ABqJAQgBEEANgIAIAFFBEBBrooEIAAoAqgBIAAoAqQBQQNxQQJqEQAAIAQkBEEADwsgAkUEQEG6igQgACgCqAEgACgCpAFBA3FBAmoRAAAgBCQEQQAPCyADQQNLBEBBpYwEIAAoAqgBIAAoAqQBQQNxQQJqEQAAIAQkBEEADwsgBEEoaiIFIAIgBBAOIAQoAgAhACAEQQhqIgYgAkEgaiAEEA4gBCgCACAAckUiACECIAAEfyABIAUpAAA3AAAgASAFKQAINwAIIAEgBSkAEDcAECABIAUpABg3ABggAUEgaiIAIAYpAAA3AAAgACAGKQAINwAIIAAgBikAEDcAECAAIAYpABg3ABggAUFAayADOgAAIAQkBCACBSABQgA3AAAgAUIANwAIIAFCADcAECABQgA3ABggAUIANwAgIAFCADcAKCABQgA3ADAgAUIANwA4IAFBQGtBADoAACAEJAQgAgsLlCoBX38jBCEHIwRBwANqJAQgB0GgAWohCCAHQfgAaiEKIAFB+ABqIUAgB0GQA2oiBiABQdAAaiI9EAcgB0HoAmoiAyABKQIANwIAIAMgASkCCDcCCCADIAEpAhA3AhAgAyABKQIYNwIYIAMgASkCIDcCICADQSRqIiUoAgAiFEEWdiIEQdEHbCADKAIAaiEFIARBBnQgA0EEaiImKAIAaiAFQRp2aiIVQRp2IANBCGoiJygCAGoiFkEadiADQQxqIhwoAgBqIhdBGnYgA0EQaiIdKAIAaiIYQRp2IANBFGoiMSgCAGoiDkEadiADQRhqIjIoAgBqIiBBGnYgA0EcaiIzKAIAaiIhQRp2IANBIGoiNCgCAGohBCADIAVB////H3E2AgAgJiAVQf///x9xNgIAICcgFkH///8fcTYCACAcIBdB////H3E2AgAgHSAYQf///x9xNgIAIDEgDkH///8fcTYCACAyICBB////H3E2AgAgMyAhQf///x9xNgIAIDQgBEH///8fcTYCACAlIARBGnYgFEH///8BcWo2AgAgB0HAAmoiBCACIAYQCiABKAJMIhlBFnYiBUHRB2wgASgCKGohGiAFQQZ0IAEoAixqIBpBGnZqIihBGnYgASgCMGoiKUEadiABKAI0aiIqQRp2IAEoAjhqIitBGnYgASgCPGoiLEEadiABQUBrKAIAaiItQRp2IAEoAkRqIiJBGnYgASgCSGohHiAHQZgCaiIFIAJBKGoiWCAGEAogBSAFID0QCiAHQfABaiIBIAMpAgA3AgAgASADKQIINwIIIAEgAykCEDcCECABIAMpAhg3AhggASAD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aiI6KAIAayETIDogEzYCAEH8////ACAKQSBqIjsoAgBrIR8gOyAfNgIAQfz//wcgCkEkaiI/KAIAayEbID8gGzYCACAuKAIAIBtqIkJBFnYiPEHRB2wgASgCACAkamohGyA8QQZ0IBQoAgAgCWpqIBtBGnZqIiRBGnYgFSgCACALamoiC0EadiAWKAIAIA9qaiIPQRp2IBcoAgAgDGpqIgxBGnYgGCgCACANamoiDUEadiAOKAIAIBJqaiISQRp2ICAoAgAgE2pqIhNBGnYgISgCACAfamohCSABIBtB////H3EiHzYCACAUICRB////H3EiGzYCACAVIAtB////H3EiCzYCACAWIA9B////H3EiDzYCACAXIAxB////H3EiDDYCACAYIA1B////H3EiDTYCACAOIBJB////H3EiEjYCACAgIBNB////H3EiEzYCACAhIAlB////H3EiJDYCACAuIAlBGnYgQkH///8BcWoiCTYCACAAIAEpAgA3AgAgACABKQIINwIIIAAgASkCEDcCECAAIAEpAhg3AhggACABKQIgNwIgIAEgH0EBdCAKKAIAajYCACAUIBtBAXQgAygCAGo2AgAgFSALQQF0IBAoAgBqNgIAIBYgD0EBdCARKAIAajYCACAXIAxBAXQgIygCAGo2AgAgGCANQQF0IDAoAgBqNgIAIA4gEkEBdCA5KAIAajYCACAgIBNBAXQgOigCAGo2AgAgISAkQQF0IDsoAgBqNgIAIC4gCUEBdCA/KAIAajYCACABIAEgBxAKIAEgASgCACAIKAIAaiIBNgIAIBQgFCgCACAeKAIAaiIDNgIAIBUgFSgCACAZKAIAaiIINgIAIBYgFigCACAlKAIAaiIKNgIAIBcgFygCACAmKAIAaiIUNgIAIBggGCgCACAnKAIAaiIVNgIAIA4gDigCACAcKAIAaiIWNgIAICAgICgCACAdKAIAaiIXNgIAICEgISgCACAiKAIAaiIYNgIAIC4gLigCACAvKAIAaiIONgIAQfj//w8gDmsiD0EWdiIOQdEHbEH4wv//ASABa2ohASAOQQZ0Qfj7//8BIANraiABQRp2aiIcQRp2Qfj///8BIAhraiIdQRp2Qfj///8BIApraiIJQRp2Qfj///8BIBRraiIQQRp2Qfj///8BIBVraiILQRp2Qfj///8BIBZraiIR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FHZyNgIwIAIgEUESdEGAgPAfcSAQQQ52cjYCNCACIAVBGHRBgICAGHEgEUEIdnI2AjggAiAFQQJ2Qf///x9xNgI8IAJBQGsgEkEEdEHw//8fcSAFQRx2cjYCACACIBNBCnRBgPj/H3EgEkEWdnI2AkQgAiAUQRB0QYCA/B9xIBNBEHZyNgJIIAIgFEEKdjYCTCACQdAAaiINQQA2AgAgDiACKAIAciAGciAHciAIciAVciADciAKciALciAMckUEQEHajAQgACgCqAEgACgCpAFBA3FBAmoRAAAgAUIANwAAIAFCADcACCABQgA3ABAgAUIANwAYIAFCADcAICABQgA3ACggAUIANwAwIAFCADcAOCAEJARBAA8LIARBwAJqIQogBEGYAmohCyAEQfgBaiEIIARB/ABqIQMgAUIANwAAIAFCADcACCABQgA3ABAgAUIANwAYIAFCADcAICABQgA3ACggAUIANwAwIAFCADcAOCAJKAIEIAkoAgByIAkoAghyIAkoAgxyIAkoAhByIAkoAhRyIAkoAhhyIAkoAhxyBH8gCEIANwIAIAhCADcCCCAIQgA3AhAgCEIANwIYIANB+ABqIgxBADYCACADIAIpAgA3AgAgAyACKQIINwIIIAMgAikCEDcCECADIAIpAhg3AhggAyACKQIgNwIgIANBKGoiBSACQShqIgYpAgA3AgAgBSAGKQIINwIIIAUgBikCEDcCECAFIAYpAhg3AhggBSAGKQIgNwIgIANBATYCUCADQdQAaiIHQgA3AgAgB0IANwIIIAdCADcCECAHQgA3AhggB0EANgIgIAAgAyADIAkgCBAZIA0gDCgCADYCACADQdAAaiIAIAAQFSAKIAAQByALIAAgChAKIAMgAyAKEAogBSAFIAsQCiAAQQE2AgAgB0IANwIAIAdCADcCCCAHQgA3AhAgB0IANwIYIAdBADYCICACIAMpAgA3AgAgAiADKQIINwIIIAIgAykCEDcCECACIAMpAhg3AhggAiADKQIgNwIgIAYgBSkCADcCACAGIAUpAgg3AgggBiAFKQIQNwIQIAYgBSkCGDcCGCAGIAUpAiA3AiAgASACEBsgBCQEQQEFIAQkBEEACwvhAgEBfyMEIQMjBEHQAGokBCADQQA2AgAgAUUEQEGIjAQgACgCqAEgACgCpAFBA3FBAmoRAAAgAyQEQQAPCyACRQRAQZeMBCAAKAKoASAAKAKkAUEDcUECahEAACADJARBAA8LIANBKGoiACACIAMQDiADQQhqIgIgAUEAEA4gAygCAAR/IAFCADcAACABQgA3AAggAUIANwAQIAFCADcAGEEABSAAKAIEIAAoAgByIAAoAghyIAAoAgxyIAAoAhByIAAoAhRyIAAoAhhyIAAoAhxyBH8gAiACIAAQDSABQgA3AAAgAUIANwAIIAFCADcAECABQgA3ABggASACEBFBAQUgAUIANwAAIAFCADcACCABQgA3ABAgAUIANwAYQQALCyEBIAJCADcCACACQgA3AgggAkIANwIQIAJCADcCGCAAQgA3AgAgAEIANwIIIABCADcCECAAQgA3AhggAyQEIAELgAsBE38jBCEEIwRB8AJqJAQgBEEANgIAIAAoAgBFBEBB+IoEIAAoAqgBIAAoAqQBQQNxQQJqEQAAIAQkBEEADwsgAUUEQEHkiAQgACgCqAEgACgCpAFBA3FBAmoRAAAgBCQEQQAPCyACRQRAQZeMBCAAKAKoASAAKAKkAUEDcUECahEAACAEJARBAA8LIARBCGoiFCACIAQQDiAEKAIABEAgAUIANwAAIAFCADcACCABQgA3ABAgAUIANwAYIAFCADcAICABQgA3ACggAUIANwAwIAFCADcAOCAEJARBAA8LIAEoAAQhBiABKAAIIQcgASgADCEIIAEoABAhAyABKAAUIQkgASgAGCEKIAEoABwhCyABKAAgIQwgASgAJCENIAEoACghDyABKAAsIRAgASgAMCEFIAEoADQhESABKAA4IRIgASgAPCETIARBKGoiAiABKAAAIg5B////H3E2AgAgAiAGQQZ0QcD//x9xIA5BGnZyIg42AgQgAiAHQQx0QYDg/x9xIAZBFHZyIgY2AgggAiAIQRJ0QYCA8B9xIAdBDnZyIgc2AgwgAiADQRh0QYCAgBhxIAhBCHZyIgg2AhAgAiADQQJ2Qf///x9xIhU2AhQgAiAJQQR0QfD//x9xIANBHHZyIgM2AhggAiAKQQp0QYD4/x9xIAlBFnZyIgk2AhwgAiALQRB0QYCA/B9xIApBEHZyIgo2AiAgAiALQQp2Igs2AiQgAiAMQf///x9xNgIoIAIgDUEGdEHA//8fcSAMQRp2cjYCLCACIA9BDHRBgOD/H3Eg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AWoiBCANQQFxEQEAIgANAEEAIQALBUEAIQALCyAJQgA3AgAgCUIANwIIIAlCADcCECAJQgA3AhggCEIANwIAIAhCADcCCCAIQgA3AhAgCEIANwIYIAdCADcCACAHQgA3AgggB0IANwIQIAdCADcCGCAABEAgASAKKQAANwAAIAEgCikACDcACCABIAopABA3ABAgASAKKQAYNwAYIAFBIGoiASALKQAANwAAIAEgCykACDcACCABIAspABA3ABAgASALKQAYNwAYIAYkBCAADwsLCyABQgA3AAAgAUIANwAIIAFCADcAECABQgA3ABggAUIANwAgIAFCADcAKCABQgA3ADAgAUIANwA4IAYkBEEAC9cCAQJ/IwQhByMEQcABaiQEIAdByABqIgYgAikAADcAACAGIAIpAAg3AAggBiACKQAQNwAQIAYgAikAGDcAGCAGQSBqIgIgASkAADcAACACIAEpAAg3AAggAiABKQAQNwAQIAIgASkAGDcAGCAEBH8gBkFAayIBIAQpAAA3AAAgASAEKQAINwAIIAEgBCkAEDcAECABIAQpABg3ABhB4AAFQcAACyEBIAMEQCAGIAFqIgIgAykAADcAACACIAMpAAg3AAggAUEQciEBCyAHIAYgARAqIAZCADcAACAGQgA3AAggBkIANwAQIAZCADcAGCAGQgA3ACAgBkIANwAoIAZCADcAMCAGQgA3ADggBkFAa0IANwAAIAZCADcASCAGQgA3AFAgBkIANwBYIAZCADcAYCAGQgA3AGhBACEBA0AgByAAEB8gAUEBaiIBIAVNDQALIAckBEEBC90QASl/IwQhBSMEQYAEaiQEIAAoAgBFBEBB+IoEIAAoAqgBIAAoAqQBQQNxQQJqEQAAIAUkBEEADwsgAkUEQEGsiwQgACgCqAEgACgCpAFBA3FBAmoRAAAgBSQEQQAPCyABRQRAQa6KBCAAKAKoASAAKAKkAUEDcUECahEAACAFJARBAA8LIANFBEBB5IgEIAAoAqgBIAAoAqQBQQNxQQJqEQAAIAUkBEEADwsgBSACQQAQDiAFQUBrIgYgASkAADcAACAGIAEpAAg3AAggBiABKQAQNwAQIAYgASkAGDcAGCAFQSBqIgQgAUEgaiIBKQAANwAAIAQgASkACDcACCAEIAEpABA3ABAgBCABKQAYNwAYIARBGGoi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////HzYCACAGQf///x82AgAgAkH///8BNgIAIAMgBxAhQQBHCwsLCwsLCwsFQQALBUEACwshACAFJAQgAAuYBQIJfwd+IwQhBCMEQSBqJAQgAkUEQEHbigQgACgCqAEgACgCpAFBA3FBAmoRAAAgBCQEQQAPCyAEIgAgAikAADcAACAAIAIpAAg3AAggACACKQAQNwAQIAAgAikAGDcAGCACKAA4IghBf0cgAigAPCIEQR92IgVBf3MiA3EgBEH/////B0lyIAMgAigANCIJQX9HcXIgAyACKAAwIgpBf0dxciADIAIoACwiA0Hz3N3qBUlxciIGQQFzIANB89zd6gVLcSAFciIHQQFzIAIoACgiBUGdoJG9BUlxIAZyIgtBAXMgBUGdoJG9BUtxIAdyIgdBAXMgAigAJCIGQcbepP99SXEgC3JBf3MiCyAGQcbepP99S3EgB3IgCyACKAAgIgJBoMHswAZLcXIhByABRQRAIAAkBCAHDwsgBwRAIAhBf3OtQv////8PfCAJQX9zrUL/////D3wgCkF/c61C/v///w98IANBf3OtQua5u9ULfCAFQX9zrUK7wKL6CnwgBkF/c61CjL3J/gt8IAJBf3OtQsKC2YENfCIMQiCIfCIOQiCIfCIPQiCIfCIQQiCIfCIRQiCIfCISQiCIfCENIAwgBiACciAFciADciAKciAJciAIciAEckEAR0EfdEEfda0iDIOnIQIgDyAMg6chBSAQIAyDpyEDIBEgDIOnIQogEiAMg6chCSANIAyDpyEIIARBf3OtQv////8PfCANQiCIfCAMg6chBCAOIAyDpyEGCyABIAApAAA3AAAgASAAKQAINwAIIAEgACkAEDcAECABIAApABg3ABggASACNgAgIAEgBjYAJCABIAU2ACggASADNgAsIAEgCjYAMCABIAk2ADQgASAINgA4IAEgBDYAPCAAJAQgBwuDAwIGfwh+IAJFBEBB24oEIAAoAqgBIAAoAqQBQQNxQQJqEQAAQQAPCyABBH8gAigAICIAQX9zrULCgtmBDXwhCiACKAAkIgMgAHIgAigAKCIAciACKAAsIgRyIAIoADAiBXIgAigANCIGciACKAA4IgdyIAIoADwiCHJBAEdBH3RBH3WtIQkgB0F/c61C/////w98IAZBf3OtQv////8PfCAFQX9zrUL+////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";

// node_modules/@bitauth/libauth/build/lib/bin/secp256k1/secp256k1-wasm.js
var wrapSecp256k1Wasm = (instance, heapU8, heapU32) => ({
  contextCreate: (context) => instance.exports._secp256k1_context_create(context),
  contextRandomize: (contextPtr, seedPtr) => instance.exports._secp256k1_context_randomize(contextPtr, seedPtr),
  free: (pointer) => instance.exports._free(pointer),
  heapU32,
  heapU8,
  instance,
  malloc: (bytes) => instance.exports._malloc(bytes),
  mallocSizeT: (num2) => {
    const pointer = instance.exports._malloc(4);
    const pointerView32 = pointer >> 2;
    heapU32.set([num2], pointerView32);
    return pointer;
  },
  mallocUint8Array: (array) => {
    const pointer = instance.exports._malloc(array.length);
    heapU8.set(array, pointer);
    return pointer;
  },
  privkeyTweakAdd: (contextPtr, secretKeyPtr, tweakNum256Ptr) => instance.exports._secp256k1_ec_privkey_tweak_add(contextPtr, secretKeyPtr, tweakNum256Ptr),
  privkeyTweakMul: (contextPtr, secretKeyPtr, tweakNum256Ptr) => instance.exports._secp256k1_ec_privkey_tweak_mul(contextPtr, secretKeyPtr, tweakNum256Ptr),
  pubkeyCreate: (contextPtr, publicKeyPtr, secretKeyPtr) => instance.exports._secp256k1_ec_pubkey_create(contextPtr, publicKeyPtr, secretKeyPtr),
  pubkeyParse: (contextPtr, publicKeyOutPtr, publicKeyInPtr, publicKeyInLength) => instance.exports._secp256k1_ec_pubkey_parse(contextPtr, publicKeyOutPtr, publicKeyInPtr, publicKeyInLength),
  pubkeySerialize: (contextPtr, outputPtr, outputLengthPtr, publicKeyPtr, compression) => instance.exports._secp256k1_ec_pubkey_serialize(contextPtr, outputPtr, outputLengthPtr, publicKeyPtr, compression),
  pubkeyTweakAdd: (contextPtr, publicKeyPtr, tweakNum256Ptr) => instance.exports._secp256k1_ec_pubkey_tweak_add(contextPtr, publicKeyPtr, tweakNum256Ptr),
  pubkeyTweakMul: (contextPtr, publicKeyPtr, tweakNum256Ptr) => instance.exports._secp256k1_ec_pubkey_tweak_mul(contextPtr, publicKeyPtr, tweakNum256Ptr),
  readHeapU8: (pointer, bytes) => new Uint8Array(heapU8.buffer, pointer, bytes),
  readSizeT: (pointer) => {
    const pointerView32 = pointer >> 2;
    return heapU32[pointerView32];
  },
  recover: (contextPtr, outputPubkeyPointer, rSigPtr, msg32Ptr) => instance.exports._secp256k1_ecdsa_recover(contextPtr, outputPubkeyPointer, rSigPtr, msg32Ptr),
  recoverableSignatureParse: (contextPtr, outputRSigPtr, inputSigPtr, rid) => instance.exports._secp256k1_ecdsa_recoverable_signature_parse_compact(contextPtr, outputRSigPtr, inputSigPtr, rid),
  recoverableSignatureSerialize: (contextPtr, sigOutPtr, recIDOutPtr, rSigPtr) => instance.exports._secp256k1_ecdsa_recoverable_signature_serialize_compact(contextPtr, sigOutPtr, recIDOutPtr, rSigPtr),
  schnorrSign: (contextPtr, outputSigPtr, msg32Ptr, secretKeyPtr) => instance.exports._secp256k1_schnorr_sign(contextPtr, outputSigPtr, msg32Ptr, secretKeyPtr),
  schnorrVerify: (contextPtr, sigPtr, msg32Ptr, publicKeyPtr) => instance.exports._secp256k1_schnorr_verify(contextPtr, sigPtr, msg32Ptr, publicKeyPtr),
  seckeyVerify: (contextPtr, secretKeyPtr) => instance.exports._secp256k1_ec_seckey_verify(contextPtr, secretKeyPtr),
  sign: (contextPtr, outputSigPtr, msg32Ptr, secretKeyPtr) => instance.exports._secp256k1_ecdsa_sign(contextPtr, outputSigPtr, msg32Ptr, secretKeyPtr),
  signRecoverable: (contextPtr, outputRSigPtr, msg32Ptr, secretKeyPtr) => instance.exports._secp256k1_ecdsa_sign_recoverable(contextPtr, outputRSigPtr, msg32Ptr, secretKeyPtr),
  signatureMalleate: (contextPtr, outputSigPtr, inputSigPtr) => instance.exports._secp256k1_ecdsa_signature_malleate(contextPtr, outputSigPtr, inputSigPtr),
  signatureNormalize: (contextPtr, outputSigPtr, inputSigPtr) => instance.exports._secp256k1_ecdsa_signature_normalize(contextPtr, outputSigPtr, inputSigPtr),
  signatureParseCompact: (contextPtr, sigOutPtr, compactSigInPtr) => instance.exports._secp256k1_ecdsa_signature_parse_compact(contextPtr, sigOutPtr, compactSigInPtr),
  signatureParseDER: (contextPtr, sigOutPtr, sigDERInPtr, sigDERInLength) => instance.exports._secp256k1_ecdsa_signature_parse_der(contextPtr, sigOutPtr, sigDERInPtr, sigDERInLength),
  signatureSerializeCompact: (contextPtr, outputCompactSigPtr, inputSigPtr) => instance.exports._secp256k1_ecdsa_signature_serialize_compact(contextPtr, outputCompactSigPtr, inputSigPtr),
  signatureSerializeDER: (contextPtr, outputDERSigPtr, outputDERSigLengthPtr, inputSigPtr) => instance.exports._secp256k1_ecdsa_signature_serialize_der(contextPtr, outputDERSigPtr, outputDERSigLengthPtr, inputSigPtr),
  verify: (contextPtr, sigPtr, msg32Ptr, pubkeyPtr) => instance.exports._secp256k1_ecdsa_verify(contextPtr, sigPtr, msg32Ptr, pubkeyPtr)
});
var isLittleEndian = (buffer) => {
  const littleEndian = true;
  const notLittleEndian = false;
  const heap16 = new Int16Array(buffer);
  const heap32 = new Int32Array(buffer);
  const heapU8 = new Uint8Array(buffer);
  heap32[0] = 1668509029;
  heap16[1] = 25459;
  return heapU8[2] !== 115 || heapU8[3] !== 99 ? (
    /* c8 ignore next */
    notLittleEndian
  ) : littleEndian;
};
var alignMemory = (factor, size) => Math.ceil(size / factor) * factor;
var instantiateSecp256k1WasmBytes = async (webassemblyBytes) => {
  const STACK_ALIGN = 16;
  const GLOBAL_BASE = 1024;
  const WASM_PAGE_SIZE = 65536;
  const TOTAL_STACK = 5242880;
  const TOTAL_MEMORY = 16777216;
  const wasmMemory = new WebAssembly.Memory({
    initial: TOTAL_MEMORY / WASM_PAGE_SIZE,
    maximum: TOTAL_MEMORY / WASM_PAGE_SIZE
  });
  if (!isLittleEndian(wasmMemory.buffer)) {
    throw new Error("Runtime error: expected the system to be little-endian.");
  }
  const STATIC_BASE = GLOBAL_BASE;
  const STATICTOP_INITIAL = STATIC_BASE + 67696 + 16;
  const DYNAMICTOP_PTR = STATICTOP_INITIAL;
  const DYNAMICTOP_PTR_SIZE = 4;
  const STATICTOP = STATICTOP_INITIAL + DYNAMICTOP_PTR_SIZE + 15 & -16;
  const STACKTOP = alignMemory(STACK_ALIGN, STATICTOP);
  const STACK_BASE = STACKTOP;
  const STACK_MAX = STACK_BASE + TOTAL_STACK;
  const DYNAMIC_BASE = alignMemory(STACK_ALIGN, STACK_MAX);
  const heapU8 = new Uint8Array(wasmMemory.buffer);
  const heap32 = new Int32Array(wasmMemory.buffer);
  const heapU32 = new Uint32Array(wasmMemory.buffer);
  heap32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
  const TABLE_SIZE = 6;
  const MAX_TABLE_SIZE = 6;
  let getErrNoLocation;
  const env = {
    DYNAMICTOP_PTR,
    STACKTOP,
    /* c8 ignore start */
    ___setErrNo: (value) => {
      if (getErrNoLocation !== void 0) {
        heap32[getErrNoLocation() >> 2] = value;
      }
      return value;
    },
    _abort: (err = "Secp256k1 Error") => {
      throw new Error(err);
    },
    // eslint-disable-next-line camelcase
    _emscripten_memcpy_big: (dest, src, num2) => {
      heapU8.set(heapU8.subarray(src, src + num2), dest);
      return dest;
    },
    abort: (err = "Secp256k1 Error") => {
      throw new Error(err);
    },
    abortOnCannotGrowMemory: () => {
      throw new Error("Secp256k1 Error: abortOnCannotGrowMemory was called.");
    },
    enlargeMemory: () => {
      throw new Error("Secp256k1 Error: enlargeMemory was called.");
    },
    getTotalMemory: () => TOTAL_MEMORY
    /* c8 ignore stop */
  };
  const info = {
    env: {
      ...env,
      memory: wasmMemory,
      memoryBase: STATIC_BASE,
      table: new WebAssembly.Table({
        element: "anyfunc",
        initial: TABLE_SIZE,
        maximum: MAX_TABLE_SIZE
      }),
      tableBase: 0
    },
    global: { Infinity: Infinity, NaN: NaN }
  };
  return WebAssembly.instantiate(webassemblyBytes, info).then((result) => {
    getErrNoLocation = result.instance.exports["___errno_location"];
    return wrapSecp256k1Wasm(result.instance, heapU8, heapU32);
  });
};
var getEmbeddedSecp256k1Binary = () => base64ToBin(secp256k1Base64Bytes).buffer;
var instantiateSecp256k1Wasm = async () => instantiateSecp256k1WasmBytes(getEmbeddedSecp256k1Binary());

// node_modules/@bitauth/libauth/build/lib/bin/sha1/sha1.base64.js
var sha1Base64Bytes = "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cjYCBEG8FCAANgIAQbQUIAI2AgAgACACaiACNgIADAQLIAMQJQwBC0GkEUGkESgCAEF+IAFBA3Z3cTYCAAsgBCACaiECIAMgBGohAwsgAyADKAIEQX5xNgIEIAAgAkEBcjYCBCAAIAJqIAI2AgACfwJAIAJB/wFNBEAgAkEDdiIBQQN0QawRaiECQaQRKAIAIgNBASABQR9xdCIBcUUNASACQQhqIQMgAigCCAwCCyAAIAIQJgwCC0GkESADIAFyNgIAIAJBCGohAyACCyEBIAMgADYCACABIAA2AgwgACACNgIMIAAgATYCCAsgBUEIag8LQbgUIAAgAmsiATYCAEHAFEHAFCgCACIAIAJqIgM2AgAgAyABQQFyNgIEIAAgAkEDcjYCBCAAQQhqC6UBAQJ/QQIhBQJAAkACQAJAAkAgACgCBCIGIAFrIAJPDQAgASACaiICIAFJIQECQCAEBEBBACEFIAENAiAGQQF0IgEgAiACIAFJGyECDAELQQAhBSABDQELIAJBAEgNACAGRQ0BIAAoAgAgAhATIgFFDQIMAwsgBQ8LIAIQBCIBDQELIAMNAQsgAQRAIAAgATYCACAAQQRqIAI2AgBBAg8LQQEPCwALCABB5BUQBwALZgIBfwN+IwBBMGsiASQAIAApAhAhAiAAKQIIIQMgACkCACEEIAFBFGpBADYCACABIAQ3AxggAUIBNwIEIAFBrA42AhAgASABQRhqNgIAIAEgAzcDICABIAI3AyggASABQSBqECIAC7gBAQF/IwBB4AFrIgMkACADQThqQcwIKAIANgIAIANBMGpBxAgpAgA3AwAgA0IANwMgIANBvAgpAgA3AyggA0E8akEAQcQAEC4aIANBIGogASACEAkgA0GAAWogA0EgakHgABAsGiADQQhqIANBgAFqEAogA0EgaiADQQhqQRQQAyADQYgBaiADQShqKAIANgIAIAMgAykDIDcDgAEgAyADQYABahALIAAgAykDADcCACADQeABaiQAC5cDAQR/IwBBQGoiAyQAIAAgACkDACACrXw3AwAgAyAAQQhqNgIoIAMgA0EoajYCLAJAAkACQAJAAkACQCAAKAIcIgUEQEHAACAFayIEIAJNDQEgA0EYaiAFIAUgAmoiBCAAQSBqEBUgAygCHCACRw0FIAMoAhggASACECwaDAMLIAIhBAwB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QcgAaiICKQMANwMAIAEgASkDQDcDcCABIAw2AoQBIAEgFCAZQR53ajYCgAEgASAPNgKIASABIAY2AowBIAFB4ABqIAFB8ABqIAFBgAFqQQAQHiABKAJsIRYgASkCZCEfIAEoAiAhDSABKAIsIRAgASgCKCEKIAEoAiQhESABIAEoAmAiDjYCcCABIB83AnQgASAWNgJ8IAEgETYChAEgASAKNgKIASABIBA2AowBIAEgDSABKAJAQR53ajYCgAEgAUHgAGogAUHwAGogAUGAAWpBABAeIAIgAUHoAGoiFikDADcDACABIAEpA2A3A0AgASgCPCEHIAEoAjghCCABKAIwIRIgASgCNCEJIBMgAikDADcDACABIAEpA0A3A3AgASAJNgKEASABIBIgDkEed2o2AoABIAEgCDYCiAEgASAHNgKMASABQeAAaiABQfAAaiABQYABakEAEB4gASgCbCEOIAEpAmQhHyABKAJgIRcgASARIAQgC3NzNgKEASABIA0gBSADc3M2AoABIAEgCiAUIAVzczYCiAEgASAQIAwgBHNzNgKMASABQdAAaiABQYABaiAJIAggBxAfIAEgFzYCcCABIB83AnQgASAONgJ8IAEgASgCVCIDNgKEASABIAEoAlgiCzYCiAEgASABKAJcIg42AowBIAEgASgCQEEedyABKAJQIhVqNgKAASABQeAAaiABQfAAaiABQYABakEAEB4gAiAWKQMANwMAIAEgASkDYDcDQCABIAkgBiAMc3M2AoQBIAEgEiAPIBRzczYCgAEgASAIIA0gD3NzNgKIASABIAcgESAGc3M2AowBIAFB8ABqIAFBgAFqIAMgCyAOEB8gASgCfCEEIAEoAnghBSABKAJwIQ8gASgCdCEGIBMgAikDADcDACABIAEpA0A3A3AgASAGNgKEASABIA8gF0Eed2o2AoABIAEgBTYCiAEgASAENgKMASABQeAAaiABQfAAaiABQYABakEBEB4gASgCbCEMIAEpAmQhHyABKAJgIRcgASADIBAgEXNzNgKEASABIBUgCiANc3M2AoABIAEgCyASIApzczYCiAEgASAOIAkgEHNzNgKMASABQfAAaiABQYABaiAGIAUgBBAfIAEoAnAhFCABKAJ8IQ0gASgCeCEQIAEoAnQhCiABIBc2AnAgASAfNwJ0IAEgDDYCfCABIAo2AoQBIAEgEDYCiAEgASANNgKMASABIBQgASgCQEEed2o2AoABIAFB4ABqIAFB8ABqIAFBgAFqQQEQHiACIBYpAwA3AwAgASABKQNgNwNAIAEgBiAHIAlzczYChAEgASAPIAggEnNzNgKAASABIAUgFSAIc3M2AogBIAEgBCADIAdzczYCjAEgAUHwAGogAUGAAWogCiAQIA0QHyABKAJ8IQcgASgCeCEIIAEoAnAhDCABKAJ0IQkgEyACKQMANwMAIAEgASkDQDcDcCABIAk2AoQBIAEgDCAXQR53ajYCgAEgASAINgKIASABIAc2AowBIAFB4ABqIAFB8ABqIAFBgAFqQQEQHiABKAJsIRcgASkCZCEfIAEoAmAhGCABIAogDiADc3M2AoQBIAEgFCALIBVzczYCgAEgASAQIA8gC3NzNgKIASABIA0gBiAOc3M2AowBIAFB8ABqIAFBgAFqIAkgCCAHEB8gASgCcCELIAEoAnwhESABKAJ4IRIgASgCdCEDIAEgGDYCcCABIB83AnQgASAXNgJ8IAEgAzYChAEgASASNgKIASABIBE2AowBIAEgCyABKAJAQR53ajYCgAEgAUHgAGogAUHwAGogAUGAAWpBARAeIAIgFikDADcDACABIAEpA2A3A0AgASAJIAQgBnNzNgKEASABIAwgBSAPc3M2AoABIAEgCCAUIAVzczYCiAEgASAHIAogBHNzNgKMASABQdAAaiABQYABaiADIBIgERAfIBMgAikDADcDACABIAEpA0A3A3AgASABKAJUIg42AoQBIAEgASgCWCIPNgKIASABIAEoAlwiFTYCjAEgASABKAJQIhcgGEEed2o2AoABIAFB4ABqIAFB8ABqIAFBgAFqQQEQHiABKAJsIRogASkCZCEfIAEoAmAhGCABIAMgDSAKc3M2AoQBIAEgCyAQIBRzczYCgAEgASASIAwgEHNzNgKIASABIBEgCSANc3M2AowBIAFB8ABqIAFBgAFqIA4gDyAVEB8gASgCcCEUIAEoAnwhBCABKAJ4IQUgASgCdCEGIAEgGDYCcCABIB83AnQgASAaNgJ8IAEgBjYChAEgASAFNgKIASABIAQ2AowBIAEgFCABKAJAQR53ajYCgAEgAUHgAGogAUHwAGogAUGAAWpBAhAeIAIgFikDADcDACABIAEpA2A3A0AgASAOIAcgCXNzNgKEASABIBcgCCAMc3M2AoABIAEgDyALIAhzczYCiAEgASAVIAMgB3NzNgKMASABQfAAaiABQYABaiAGIAUgBBAfIAEoAnwhByABKAJ4IQggASgCcCEMIAEoAnQhCSATIAIpAwA3AwAgASABKQNANwNwIAEgCTYChAEgASAMIBhBHndqNgKAASABIAg2AogBIAEgBzYCjAEgAUHgAGogAUHwAGogAUGAAWpBAhAeIAEoAmwhGiABKQJkIR8gASgCYCEYIAEgBiARIANzczYChAEgASAUIBIgC3NzNgKAASABIAUgFyASc3M2AogBIAEgBCAOIBFzczYCjAEgAUHwAGogAUGAAWogCSAIIAcQHyABKAJwIQsgASgCfCENIAEoAnghECABKAJ0IQogASAYNgJwIAEgHzcCdCABIBo2AnwgASAKNgKEASABIBA2AogBIAEgDTYCjAEgASALIAEoAkBBHndqNgKAASABQeAAaiABQfAAaiABQYABakECEB4gAiAWKQMANwMAIAEgASkDYDcDQCABIAkgFSAOc3M2AoQBIAEgDCAPIBdzczYCgAEgASAIIBQgD3NzNgKIASABIAcgBiAVc3M2AowBIAFB8ABqIAFBgAFqIAogECANEB8gASgCfCERIAEoAnghEiABKAJwIQ4gASgCdCEDIBMgAikDADcDACABIAEpA0A3A3AgASADNgKEASABIA4gGEEed2o2AoABIAEgEjYCiAEgASARNgKMASABQeAAaiABQfAAaiABQYABakECEB4gASgCbCEPIAEpAmQhHyABKAJgIRUgASAKIAQgBnNzNgKEASABIAsgBSAUc3M2AoABIAEgECAMIAVzczYCiAEgASANIAkgBHNzNgKMASABQdAAaiABQYABaiADIBIgERAfIAEgFTYCcCABIB83AnQgASAPNgJ8IAEgASgCVCIENgKEASABIAEoAlgiBTYCiAEgASABKAJcIgY2AowBIAEgASgCQEEedyABKAJQIhRqNgKAASABQeAAaiABQfAAaiABQYABakECEB4gAiAWKQMANwMAIAEgASkDYDcDQCABIAMgByAJc3M2AoQBIAEgDiAIIAxzczYCgAEgASASIAsgCHNzNgKIASABIBEgCiAHc3M2AowBIAFB8ABqIAFBgAFqIAQgBSAGEB8gASgCfCEHIAEoAnghCCABKAJwIQ8gASgCdCEJIBMgAikDADcDACABIAEpA0A3A3AgASAJNgKEASABIA8gFUEed2o2AoABIAEgCDYCiAEgASAHNgKMASABQeAAaiABQfAAaiABQYABakEDEB4gASgCbCEVIAEpAmQhHyABKAJgIQwgASAEIA0gCnNzNgKEASABIBQgECALc3M2AoABIAEgBSAOIBBzczYCiAEgASAGIAMgDXNzNgKMASABQfAAaiABQYABaiAJIAggBxAfIAEoAnAhECABKAJ8IQogASgCeCELIAEoAnQhDSABIAw2AnAgASAfNwJ0IAEgFTYCfCABIA02AoQBIAEgCzYCiAEgASAKNgKMASABIBAgASgCQEEed2o2AoABIAFB4ABqIAFB8ABqIAFBgAFqQQMQHiACIBYpAwA3AwAgASABKQNgNwNAIAEgCSARIANzczYChAEgASAPIBIgDnNzNgKAASABIAggFCASc3M2AogBIAEgByAEIBFzczYCjAEgAUHwAGogAUGAAWogDSALIAoQHyABKAJ8IREgASgCeCESIAEoAnAhDiABKAJ0IQMgEyACKQMANwMAIAEgASkDQDcDcCABIAM2AoQBIAEgDiAMQR53ajYCgAEgASASNgKIASABIBE2AowBIAFB4ABqIAFB8ABqIAFBgAFqQQMQHiABKAJsIRUgASkCZCEfIAEoAmAhDCABIA0gBiAEc3M2AoQBIAEgECAFIBRzczYCgAEgASALIA8gBXNzNgKIASABIAogCSAGc3M2AowBIAFB8ABqIAFBgAFqIAMgEiAREB8gASgCcCEKIAEoAnwhBCABKAJ4IQUgASgCdCEGIAEgDDYCcCABIB83AnQgASAVNgJ8IAEgBjYChAEgASAFNgKIASABIAQ2AowBIAEgCiABKAJAQR53ajYCgAEgAUHgAGogAUHwAGogAUGAAWpBAxAeIAIgFikDADcDACABIAEpA2A3A0AgASADIAcgCXNzNgKEASABIA4gCCAPc3M2AoABIAEgEiAQIAhzczYCiAEgASARIA0gB3NzNgKMASABQdAAaiABQYABaiAGIAUgBBAfIBMgAikDADcDACABIAEpA0A3A3AgASABKQJUNwKEASABIAEoAlw2AowBIAEgASgCUCAMQR53ajYCgAEgAUHgAGogAUHwAGogAUGAAWpBAxAe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DSAKIABBDHZBD3FB4AFyOgAMQQMMAQsgCiAAQRJ2QfABcjoADCAKIABBP3FBgAFyOgAPIAogAEEMdkE/cUGAAXI6AA0gCiAAQQZ2QT9xQYABcjoADkEECyEIIAEoAhghAkF/IQAgAUEcaigCACIJQQxqIQECQAJAAkADQCAAQQFqIgAgBE8NASACIApBDGogCCABKAIAEQUARQ0ACwwBCyACIAcgBiAJQQxqKAIAIgERBQANAEF/IQADQCAAQQFqIgAgA08NAiACIApBDGogCCABEQUARQ0ACwtBAQwBC0EACyEAIApBEGokACAAC0YCAX8BfiMAQSBrIgIkACABKQIAIQMgAkEUaiABKQIINwIAIAJBlBY2AgQgAkGsDjYCACACIAA2AgggAiADNwIMIAIQJAALUAACQAJAQZARKAIAQQFGBEBBlBFBlBEoAgBBAWoiADYCACAAQQNJDQEMAgtBkBFCgYCAgBA3AwALQZwRKAIAIgBBf0wNAEGcESAANgIACwALPwECfyMAQRBrIgEkAAJ/IAAoAggiAiACDQAaQfwVEAcACxogASAAKQIMNwMAIAEgAEEUaikCADcDCCABECMAC7MCAQV/IAAoAhghAwJAAkACQCAAKAIMIgIgAEcEQCAAKAIIIgEgAjYCDCACIAE2AgggAw0BDAILIABBFGoiASAAQRBqIAEoAgAbIgQoAgAiAQRAAkADQCAEIQUgASICQRRqIgQoAgAiAQRAIAENAQwCCyACQRBqIQQgAigCECIBDQALCyAFQQA2AgAgAw0BDAILQQAhAiADRQ0BCwJAIAAoAhwiBEECdEG0E2oiASgCACAARwRAIANBEGogA0EUaiADKAIQIABGGyACNgIAIAINAQwCCyABIAI2AgAgAkUNAgsgAiADNgIYIAAoAhAiAQRAIAIgATYCECABIAI2AhgLIABBFGooAgAiAUUNACACQRRqIAE2AgAgASACNgIYCw8LQagRQagRKAIAQX4gBHdxNgIAC8UCAQR/IAACf0EAIAFBCHYiA0UNABpBHyICIAFB////B0sNABogAUEmIANnIgJrQR9xdkEBcUEfIAJrQQF0cgsiAjYCHCAAQgA3AhAgAkECdEG0E2ohAwJAAkACQEGoESgCACIEQQEgAkEfcXQiBXEEQCADKAIAIgQoAgRBeHEgAUcNASAEIQIMAgsgAyAANgIAQagRIAQgBXI2AgAgACADNgIYIAAgADYCCCAAIAA2AgwPCyABQQBBGSACQQF2a0EfcSACQR9GG3QhAwNAIAQgA0EddkEEcWpBEGoiBSgCACICRQ0CIANBAXQhAyACIQQgAigCBEF4cSABRw0ACwsgAigCCCIDIAA2AgwgAiAANgIIIAAgAjYCDCAAIAM2AgggAEEANgIYDwsgBSAANgIAIAAgBDYCGCAAIAA2AgwgACAANgIIC/UEAQR/IAAgAWohAgJAAkACQAJAAkACQAJAAkAgACgCBCIDQQFxDQAgA0EDcUUNASAAKAIAIgMgAWohAQJAAkBBvBQoAgAgACADayIARwRAIANB/wFLDQEgACgCDCIEIAAoAggiBUYNAiAFIAQ2AgwgBCAFNgIIDAMLIAIoAgQiA0EDcUEDRw0CQbQUIAE2AgAgAkEEaiADQX5xNgIAIAAgAUEBcjYCBCACIAE2AgAPCyAAECUMAQtBpBFBpBEoAgBBfiADQQN2d3E2AgALAkAgAigCBCIDQQJxRQRAQcAUKAIAIAJGDQFBvBQoAgAgAkYNAyADQXhxIgQgAWohASAEQf8BSw0EIAIoAgwiBCACKAIIIgJGDQYgAiAENgIMIAQgAjYCCAwHCyACQQRqIANBfnE2AgAgACABQQFyNgIEIAAgAWogATYCAAwHC0HAFCAANgIAQbgUQbgUKAIAIAFqIgE2AgAgACABQQFyNgIEIABBvBQoAgBGDQMLDwtBvBQgADYCAEG0FEG0FCgCACABaiIBNgIAIAAgAUEBcjYCBCAAIAFqIAE2AgAPCyACECUMAgtBtBRBADYCAEG8FEEANgIADwtBpBFBpBEoAgBBfiADQQN2d3E2AgALIAAgAUEBcjYCBCAAIAFqIAE2AgAgAEG8FCgCAEcNAEG0FCABNgIADwsCfwJAIAFB/wFNBEAgAUEDdiICQQN0QawRaiEBQaQRKAIAIgNBASACQR9xdCICcUUNASABKAIIDAILIAAgARAmDwtBpBEgAyACcjYCACABCyECIAFBCGogADYCACACIAA2AgwgACABNgIMIAAgAjYCCAvSAgEFfyMAQRBrIgMkAAJ/IAAoAgAoAgAiAkGAgMQARwRAIAFBHGooAgAhBCABKAIYIQUgA0EANgIMAn8gAkH/AE0EQCADIAI6AAxBAQwBCyACQf8PTQRAIAMgAkE/cUGAAXI6AA0gAyACQQZ2QR9xQcABcjoADEECDAELIAJB//8DTQRAIAMgAkE/cUGAAXI6AA4gAyACQQZ2QT9xQYABcjoADSADIAJBDHZBD3FB4AFyOgAMQQMMAQsgAyACQRJ2QfABcjoADCADIAJBP3FBgAFyOgAPIAMgAkEMdkE/cUGAAXI6AA0gAyACQQZ2QT9xQYABcjoADkEECyEGQQEiAiAFIANBDGogBiAEKAIMEQUADQEaCyAAKAIELQAABEAgASgCGCAAKAIIIgAoAgAgACgCBCABQRxqKAIAKAIMEQUADAELQQALIQIgA0EQaiQAIAILqggBCX8jAEHQAGsiAiQAQSchAwJAIAAoAgAiAEGQzgBPBEADQCACQQlqIANqIgVBfGogACAAQZDOAG4iBEHwsX9saiIHQeQAbiIGQQF0QeEMai8AADsAACAFQX5qIAcgBkGcf2xqQQF0QeEMai8AADsAACADQXxqIQMgAEH/wdcvSyEFIAQhACAFDQALDAELIAAhBAsCQCAEQeQATgRAIAJBCWogA0F+aiIDaiAEIARB5ABuIgBBnH9sakEBdEHhDGovAAA7AAAMAQsgBCEACwJAIABBCUwEQCACQQlqIANBf2oiA2oiCCAAQTBqOgAADAELIAJBCWogA0F+aiIDaiIIIABBAXRB4QxqLwAAOwAACyACQQA2AjQgAkGsDjYCMCACQYCAxAA2AjhBJyADayIGIQMgASgCACIAQQFxBEAgAkErNgI4IAZBAWohAwsgAiAAQQJ2QQFxOgA/IAEoAgghBCACIAJBP2o2AkQgAiACQThqNgJAIAIgAkEwajYCSAJ/AkACQAJ/AkACQAJAAkACQAJAAkAgBEEBRgRAIAFBDGooAgAiBCADTQ0BIABBCHENAiAEIANrIQVBASABLQAwIgAgAEEDRhtBA3EiAEUNAyAAQQJGDQQMBQsgAkFAayABECgNCCABKAIYIAggBiABQRxqKAIAKAIMEQUADAoLIAJBQGsgARAoDQcgASgCGCAIIAYgAUEcaigCACgCDBEFAAwJCyABQQE6ADAgAUEwNgIEIAJBQGsgARAoDQYgAkEwNgJMIAQgA2shAyABKAIYIQRBfyEAIAFBHGooAgAiB0EMaiEFA0AgAEEBaiIAIANPDQQgBCACQcwAakEBIAUoAgARBQBFDQALDAYLIAUhCUEAIQUMAQsgBUEBakEBdiEJIAVBAXYhBQsgAkEANgJMIAEoAgQiAEH/AE0EQCACIAA6AExBAQwDCyAAQf8PSw0BIAIgAEE/cUGAAXI6AE0gAiAAQQZ2QR9xQcABcjoATEECDAILIAQgCCAGIAdBDGooAgARBQANAgwDCyAAQf//A00EQCACIABBP3FBgAFyOgBOIAIgAEEGdkE/cUGAAXI6AE0gAiAAQQx2QQ9xQeABcjoATEEDDAELIAIgAEESdkHwAXI6AEwgAiAAQT9xQYABcjoATyACIABBDHZBP3FBgAFyOgBNIAIgAEEGdkE/cUGAAXI6AE5BBAshBCABKAIYIQNBfyEAIAFBHGooAgAiCkEMaiEHAkADQCAAQQFqIgAgBU8NASADIAJBzABqIAQgBygCABEFAEUNAAsMAQsgAkFAayABECgNACADIAggBiAKQQxqKAIAIgURBQANAEF/IQADQCAAQQFqIgAgCU8NAiADIAJBzABqIAQgBREFAEUNAAsLQQEMAQtBAAshACACQdAAaiQAIAALAwABCw0AQoiylJOYgZWM/wALMwEBfyACBEAgACEDA0AgAyABLQAAOgAAIAFBAWohASADQQFqIQMgAkF/aiICDQALCyAAC2cBAX8CQCABIABJBEAgAkUNAQNAIAAgAmpBf2ogASACakF/ai0AADoAACACQX9qIgINAAsMAQsgAkUNACAAIQMDQCADIAEtAAA6AAAgAUEBaiEBIANBAWohAyACQX9qIgINAAsLIAALKQEBfyACBEAgACEDA0AgAyABOgAAIANBAWohAyACQX9qIgINAAsLIAALC+wKAwBBgAgL5wNpbnZhbGlkIG1hbGxvYyByZXF1ZXN0VHJpZWQgdG8gc2hyaW5rIHRvIGEgbGFyZ2VyIGNhcGFjaXR5AAABI0VniavN7/7cuph2VDIQ8OHSw2Fzc2VydGlvbiBmYWlsZWQ6IDggPT0gZHN0LmxlbigpL3Jvb3QvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9naXRodWIuY29tLTFlY2M2Mjk5ZGI5ZWM4MjMvYnl0ZS10b29scy0wLjIuMC9zcmMvd3JpdGVfc2luZ2xlLnJzAAAAAAAAL3Jvb3QvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9naXRodWIuY29tLTFlY2M2Mjk5ZGI5ZWM4MjMvYmxvY2stYnVmZmVyLTAuMy4zL3NyYy9saWIucnNkZXN0aW5hdGlvbiBhbmQgc291cmNlIHNsaWNlcyBoYXZlIGRpZmZlcmVudCBsZW5ndGhzL3Jvb3QvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9naXRodWIuY29tLTFlY2M2Mjk5ZGI5ZWM4MjMvc2hhLTEtMC43LjAvc3JjL3V0aWxzLnJzaW50ZXJuYWwgZXJyb3I6IGVudGVyZWQgdW5yZWFjaGFibGUgY29kZTogdW5rbm93biBpY29zYXJvdW5kIGluZGV4AEHwCwvSBAEAAAAAAAAAIAAAAAAAAAADAAAAAAAAAAMAAAAAAAAAAwAAAGNhcGFjaXR5IG92ZXJmbG93Y2FsbGVkIGBPcHRpb246OnVud3JhcCgpYCBvbiBhIGBOb25lYCB2YWx1ZWxpYmNvcmUvb3B0aW9uLnJzMDAwMTAyMDMwNDA1MDYwNzA4MDkxMDExMTIxMzE0MTUxNjE3MTgxOTIwMjEyMjIzMjQyNTI2MjcyODI5MzAzMTMyMzMzNDM1MzYzNzM4Mzk0MDQxNDI0MzQ0NDU0NjQ3NDg0OTUwNTE1MjUzNTQ1NTU2NTc1ODU5NjA2MTYyNjM2NDY1NjY2NzY4Njk3MDcxNzI3Mzc0NzU3Njc3Nzg3OTgwODE4MjgzODQ4NTg2ODc4ODg5OTA5MTkyOTM5NDk1OTY5Nzk4OTkAAAAAaW5kZXggb3V0IG9mIGJvdW5kczogdGhlIGxlbiBpcyAgYnV0IHRoZSBpbmRleCBpcyBsaWJjb3JlL3NsaWNlL21vZC5ycwABAAAAAAAAACAAAAAAAAAAAwAAAAAAAAADAAAAAAAAAAMAAAABAAAAAQAAACAAAAAAAAAAAwAAAAAAAAADAAAAAAAAAAMAAABpbmRleCAgb3V0IG9mIHJhbmdlIGZvciBzbGljZSBvZiBsZW5ndGggc2xpY2UgaW5kZXggc3RhcnRzIGF0ICBidXQgZW5kcyBhdCBpbnRlcm5hbCBlcnJvcjogZW50ZXJlZCB1bnJlYWNoYWJsZSBjb2RlbGliYWxsb2MvcmF3X3ZlYy5ycwBB7BQLnQIWBAAAJAAAAC8IAAATAAAASAIAAAkAAADQBAAAUwAAAEsAAAARAAAAUAQAACAAAABwBAAAWgAAAB8AAAAFAAAAIwUAADQAAABfBwAAFAAAAG0GAAAJAAAAzwUAABgAAAClBQAAKgAAAFcFAABOAAAAQgAAAA4AAAAUBgAAEQAAAC8IAAATAAAA8gIAAAUAAAAlBgAAKwAAAFAGAAARAAAAWQEAABUAAAADAAAAAAAAAAEAAAAEAAAALQcAACAAAABNBwAAEgAAALwHAAAGAAAAwgcAACIAAABfBwAAFAAAAK0HAAAFAAAA5AcAABYAAAD6BwAADQAAAF8HAAAUAAAAswcAAAUAAAAHCAAAKAAAAC8IAAATAAAA9QEAAB4ADAdsaW5raW5nAwKMDw==";

// node_modules/@bitauth/libauth/build/lib/bin/sha256/sha256.base64.js
var sha256Base64Bytes = "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IAJHDQUgAygCGCABIAIQKxoMAwsgAiEEDAELIANBMGogASACIAQQFiADQTxqKAIAIQQgAygCOCEBIAMoAjAhBSADKAI0IQIgA0EgaiAAQQxqIgYgACgCCBAXIAIgAygCJEcNBCADKAIgIAUgAhArGiAAQQhqQQA2AgAgA0EsaiAGEBgLIANBPGohAiADQThqIQUCQANAIARBP00NASADQTBqIAEgBEHAABAWIAIoAgAhBCAFKAIAIQEgA0EIakEAQcAAIAMoAjAgAygCNBAZIANBLGogAygCCBAYDAALAAsgA0EQaiAAQQxqIAQQGiADKAIUIARHDQEgAygCECABIAQQKxoLIABBCGogBDYCACADQUBrJAAPC0GEFBAHAAtBhBQQBwALQYQUEAcAC98EAgN/AX4jAEHQAGsiAiQAIAIgAUHMAGo2AiQgASkDACEFIAEoAgghBCACIAJBJGo2AigCQCAEQT9NBEAgAUEMaiIDIARqQYABOgAAIAEgASgCCEEBaiIENgIIIAJBGGogAyAEEBcgAigCGEEAIAIoAhwQLRpBwAAgASgCCGtBB00EQCACQShqIAMQGCACQRBqIAMgAUEIaigCABAaIAIoAhBBACACKAIUEC0aCyACQQhqIANBOBAXIAIoAgxBCEcNASACKAIIIAVCOIYgBUIohkKAgICAgIDA/wCDhCAFQhiGQoCAgICA4D+DIAVCCIZCgICAgPAfg4SEIAVCCIhCgICA+A+DIAVCGIhCgID8B4OEIAVCKIhCgP4DgyAFQjiIhISENwAAIAJBKGogAxAYIAFBCGpBADYCACACQQA2AiggAkEoakEEciEEQQAhAwJAA0AgA0EgRg0BIAQgA2pBADoAACACIAIoAihBAWo2AiggA0EBaiEDDAALAAsgAkFAayABQeQAaikAADcDACACQThqIAFB3ABqKQAANwMAIAJBMGogAUHUAGopAAA3AwAgAiABKQBMNwMoQQAhAwJAA0AgA0EgRg0BIAJBKGogA2oiBCAEKAIAIgRBGHQgBEEIdEGAgPwHcXIgBEEIdkGA/gNxIARBGHZycjYCACADQQRqIQMMAAsACyAAIAIpAyg3AAAgAEEYaiACQUBrKQMANwAAIABBEGogAkE4aikDADcAACAAQQhqIAJBMGopAwA3AAAgAkHQAGokAA8LQdwTIARBwAAQ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KAJsIQggASAPNgJkIAEgDjYCYCABIBM2AmggASAYNgJsIAEgAjYCdCABIBc2AnAgASAQNgJ4IAEgDDYCfCABQdAAaiABQeAAaiABQfAAaiAHQevZwaJ6aiAIQfr/+4V5ahAeIAEoAlwhByABKAJYIQggASgCUCEKIAEoAlQhESABIAI2AmQgASAXNgJgIAEgEDYCaCABIAw2AmwgASARNgJ0IAEgCjYCcCABIAg2AnggASAHNgJ8IAFB0ABqIAFB4ABqIAFB8ABqIA1B8vHFs3xqIBlB98fm93tqEB4gASgCXCENIAEoAlghGCABKAJQIRMgACAeIAEoAlRqNgIEIAAgEyAdajYCACAAIAogIWo2AgggACARICJqNgIMIAAgGCAcajYCECAAIA0gG2o2AhQgACAIICBqNgIYIAAgByAfajYCHCABQYABaiQAC30BAX8jAEEwayICJAAgAiABNgIEIAIgADYCACACQSxqQQE2AgAgAkEUakECNgIAIAJBHGpBAjYCACACQQE2AiQgAkGMFTYCCCACQQI2AgwgAkHMDTYCECACIAI2AiAgAiACQQRqNgIoIAIgAkEgajYCGCACQQhqQZwVECgAC3wBAX8jAEEwayIDJAAgAyACNgIEIAMgATYCACADQSxqQQE2AgAgA0EUakECNgIAIANBHGpBAjYCACADQQE2AiQgA0HcFDYCCCADQQI2AgwgA0HMDTYCECADIANBBGo2AiAgAyADNgIoIAMgA0EgajYCGCADQQhqIAAQKAAL1gEBBn8gACABKAIAIgggAigCBCIHcyACKAIAIgVxIAggB3FzIAVBHncgBUETd3MgBUEKd3NqIAIoAggiBkEadyAGQRV3cyAGQQd3cyAEaiABKAIMaiABKAIIIgQgAigCDCIJcyAGcSAEc2oiCmoiAjYCBCAAIAogASgCBGoiATYCDCAAIAJBHncgAkETd3MgAkEKd3MgAiAHIAVzcSAHIAVxc2ogBCADaiAJIAEgCSAGc3FzaiABQRp3IAFBFXdzIAFBB3dzaiIFajYCACAAIAUgCGo2AggLeAAgACACQRl3IAJBA3ZzIAJBDndzIAEoAgAiAmo2AgAgACACQRl3IAJBA3ZzIAJBDndzIAEoAgQiAmo2AgQgACACQRl3IAJBA3ZzIAJBDndzIAEoAggiAmo2AgggACACQRl3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";

// node_modules/@bitauth/libauth/build/lib/bin/sha512/sha512.base64.js
var sha512Base64Bytes = "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AjYCACAAIAJBAXI2AgQMBQsgAEGsEygCACACaiICQQFyNgIEQbQTIAA2AgBBrBMgAjYCACAAIAJqIAI2AgAMBAsgAxAiDAELQZwQQZwQKAIAQX4gAUEDdndxNgIACyAEIAJqIQIgAyAEaiEDCyADIAMoAgRBfnE2AgQgACACQQFyNgIEIAAgAmogAjYCAAJ/AkAgAkH/AU0EQCACQQN2IgFBA3RBpBBqIQJBnBAoAgAiA0EBIAFBH3F0IgFxRQ0BIAJBCGohAyACKAIIDAILIAAgAhAjDAILQZwQIAMgAXI2AgAgAkEIaiEDIAILIQEgAyAANgIAIAEgADYCDCAAIAI2AgwgACABNgIICyAFQQhqDwtBsBMgACACayIBNgIAQbgTQbgTKAIAIgAgAmoiAzYCACADIAFBAXI2AgQgACACQQNyNgIEIABBCGoLpQEBAn9BAiEFAkACQAJAAkACQCAAKAIEIgYgAWsgAk8NACABIAJqIgIgAUkhAQJAIAQEQEEAIQUgAQ0CIAZBAXQiASACIAIgAUkbIQIMAQtBACEFIAENAQsgAkEASA0AIAZFDQEgACgCACACEBMiAUUNAgwDCyAFDwsgAhAEIgENAQsgAw0BCyABBEAgACABNgIAIABBBGogAjYCAEECDwtBAQ8LAAsIAEG8FBAHAAtmAgF/A34jAEEwayIBJAAgACkCECECIAApAgghAyAAKQIAIQQgAUEUakEANgIAIAEgBDcDGCABQgE3AgQgAUGkDTYCECABIAFBGGo2AgAgASADNwMgIAEgAjcDKCABIAFBIGoQJwALsgEBAn8jAEGABGsiAyQAIANB2ABqIgRCADcDACADQgA3A1AgA0GgAWpBAEGEARAsGiADQeAAakHICkHAABAqGiADQdAAaiABIAIQCSADQagCaiADQdAAakHYARAqGiADQRBqIANBqAJqEAogA0HQAGogA0EQakHAABADIANBsAJqIAQoAgA2AgAgAyADKQNQNwOoAiADQQhqIANBqAJqEAsgACADKQMINwIAIANBgARqJAALuwMCBH8CfiMAQUBqIgMkACAAIAApAwgiByACrUIDhnwiCDcDCCAIIAdUBEAgACAAKQMAQgF8NwMACyADIABBEGo2AiggAyADQShqNgIsAkACQAJAAkACQAJAIAAoAlAiBQRAQYABIAVrIgQg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sBMoAgAgAGoiADYCACABIABBAXI2AgQgAUG0EygCAEYEQEGsE0EANgIAQbQTQQA2AgALQdQTKAIAIABPDQcCQCAAQSlJDQBBxBMhAANAIAAoAgAiAiABTQRAIAIgACgCBGogAUsNAgsgACgCCCIADQALC0EAIQFBzBMoAgAiAEUNBANAIAFBAWohASAAKAIIIgANAAsgAUH/HyABQf8fSxsMBQtBtBMgATYCAEGsE0GsEygCACAAaiIANgIADAcLIAIQIgwBC0GcEEGcECgCAEF+IANBA3Z3cTYCAAsgASAAQQFyNgIEIAEgAGogADYCACABQbQTKAIARw0CQawTIAA2AgAPC0H/HwshAUHUE0F/NgIAQdwTIAE2AgAPC0HcEwJ/AkACfwJAIABB/wFNBEAgAEEDdiICQQN0QaQQaiEAQZwQKAIAIgNBASACQR9xdCICcUUNASAAQQhqIQMgACgCCAwCCyABIAAQI0HcE0HcEygCAEF/aiIBNgIAIAENBEHMEygCACIARQ0CQQAhAQNAIAFBAWohASAAKAIIIgANAAsgAUH/HyABQf8fSxsMAwtBnBAgAyACcjYCACAAQQhqIQMgAAshAiADIAE2AgAgAiABNgIMIAEgADYCDCABIAI2AggPC0H/HwsiATYCAAsPCyABIABBAXI2AgQgASAAaiAANgIACzkAAkAgAiABTwRAIAJBgQFPDQEgACACIAFrNgIEIAAgAyABajYCAA8LIAEgAhAcAAsgAkGAARACAAtNAgF/An4jAEEQayIEJAAgBEEIakEAIAMgASACEBkgBCkDCCEFIAQgAyACIAEgAhAZIAQpAwAhBiAAIAU3AgAgACAGNwIIIARBEGokAAssAQF/IwBBEGsiAyQAIANBCGogAkGAASABEBUgACADKQMINwIAIANBEGokAAsOACAAKAIAKAIAIAEQGws3AAJAIAIgAU8EQCAEIAJJDQEgACACIAFrNgIEIAAgAyABajYCAA8LIAEgAhAcAAsgAiAEEAIACysBAX8jAEEQayIDJAAgA0EIakEAIAIgARAVIAAgAykDCDcCACADQRBqJAALqioCAn8ifiMAQYAPayICJAAgAkGADmogAUGAARAqGkEAIQECQANAIAFBgAFGDQEgAkGADmogAWoiAyADKQMAIhxCOIYgHEIohkKAgICAgIDA/wCD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c2VydGlvbiBmYWlsZWQ6IDggPT0gZHN0LmxlbigpL3Jvb3QvLmNhcmdvL3JlZ2lzdHJ5L3NyYy9naXRodWIuY29tLTFlY2M2Mjk5ZGI5ZWM4MjMvYnl0ZS10b29scy0wLjIuMC9zcmMvd3JpdGVfc2luZ2xlLnJzAEHwCQvKBS9yb290Ly5jYXJnby9yZWdpc3RyeS9zcmMvZ2l0aHViLmNvbS0xZWNjNjI5OWRiOWVjODIzL2Jsb2NrLWJ1ZmZlci0wLjMuMy9zcmMvbGliLnJzAAAAAAAIybzzZ+YJajunyoSFrme7K/iU/nLzbjzxNh1fOvVPpdGC5q1/Ug5RH2w+K4xoBZtrvUH7q9mDH3khfhMZzeBbAAAAAABjYXBhY2l0eSBvdmVyZmxvd2NhbGxlZCBgT3B0aW9uOjp1bndyYXAoKWAgb24gYSBgTm9uZWAgdmFsdWVsaWJjb3JlL29wdGlvbi5yczAwMDEwMjAzMDQwNTA2MDcwODA5MTAxMTEyMTMxNDE1MTYxNzE4MTkyMDIxMjIyMzI0MjUyNjI3MjgyOTMwMzEzMjMzMzQzNTM2MzczODM5NDA0MTQyNDM0NDQ1NDY0NzQ4NDk1MDUxNTI1MzU0NTU1NjU3NTg1OTYwNjE2MjYzNjQ2NTY2Njc2ODY5NzA3MTcyNzM3NDc1NzY3Nzc4Nzk4MDgxODI4Mzg0ODU4Njg3ODg4OTkwOTE5MjkzOTQ5NTk2OTc5ODk5AAAAaW5kZXggb3V0IG9mIGJvdW5kczogdGhlIGxlbiBpcyAgYnV0IHRoZSBpbmRleCBpcyBsaWJjb3JlL3NsaWNlL21vZC5ycwABAAAAAAAAACAAAAAAAAAAAwAAAAAAAAADAAAAAAAAAAMAAAABAAAAAQAAACAAAAAAAAAAAwAAAAAAAAADAAAAAAAAAAMAAABpbmRleCAgb3V0IG9mIHJhbmdlIGZvciBzbGljZSBvZiBsZW5ndGggc2xpY2UgaW5kZXggc3RhcnRzIGF0ICBidXQgZW5kcyBhdCBpbnRlcm5hbCBlcnJvcjogZW50ZXJlZCB1bnJlYWNoYWJsZSBjb2RlbGliYWxsb2MvcmF3X3ZlYy5ycwBB5BML/QEWBAAAJAAAAKcHAAATAAAASAIAAAkAAAA6BAAANAAAANcGAAAUAAAAbQYAAAkAAADwBAAAUwAAAEsAAAARAAAAbgQAACAAAACOBAAAWgAAAB8AAAAFAAAAjQUAABEAAACnBwAAEwAAAPICAAAFAAAAngUAACsAAADJBQAAEQAAAFkBAAAVAAAAAgAAAAAAAAABAAAAAwAAAKUGAAAgAAAAxQYAABIAAAA0BwAABgAAADoHAAAiAAAA1wYAABQAAACtBwAABQAAAFwHAAAWAAAAcgcAAA0AAADXBgAAFAAAALMHAAAFAAAAfwcAACgAAACnBwAAEwAAAPUBAAAeAAwHbGlua2luZwMC5A0=";

// node_modules/@bitauth/libauth/build/lib/crypto/ripemd160.js
var instantiateRipemd160Bytes = async (webassemblyBytes) => {
  const wasm = await instantiateRustWasm(webassemblyBytes, "./ripemd160", "ripemd160", "ripemd160_init", "ripemd160_update", "ripemd160_final");
  return {
    final: wasm.final,
    hash: wasm.hash,
    init: wasm.init,
    update: wasm.update
  };
};
var getEmbeddedRipemd160Binary = () => base64ToBin(ripemd160Base64Bytes).buffer;
var instantiateRipemd160 = async () => instantiateRipemd160Bytes(getEmbeddedRipemd160Binary());

// node_modules/@bitauth/libauth/build/lib/crypto/secp256k1.js
var Secp256k1Error;
(function(Secp256k1Error2) {
  Secp256k1Error2["unparsableSignature"] = "Failed to parse signature.";
  Secp256k1Error2["unparsablePublicKey"] = "Failed to parse public key.";
  Secp256k1Error2["derivePublicKeyFromInvalidPrivateKey"] = "Cannot derive public key from invalid private key.";
  Secp256k1Error2["signWithInvalidPrivateKey"] = "Failed to sign message hash. The private key is not valid.";
  Secp256k1Error2["recoverPublicKeyWithUnparsableSignature"] = "Failed to recover public key. Could not parse signature.";
  Secp256k1Error2["recoverPublicKeyInvalidMaterial"] = "Failed to recover public key. The compact signature, recovery, or message hash is invalid.";
  Secp256k1Error2["addTweakPrivateKey"] = "Private key is invalid or adding failed.";
  Secp256k1Error2["mulTweakPrivateKey"] = "Private key is invalid or multiplying failed.";
  Secp256k1Error2["addTweakPublicKey"] = "Failed to tweak public key (by addition).";
  Secp256k1Error2["mulTweakPublicKey"] = "Failed to tweak public key (by multiplication).";
})(Secp256k1Error || (Secp256k1Error = {}));
var wrapSecp256k1Wasm2 = (secp256k1Wasm, randomSeed) => {
  const contextPtr = secp256k1Wasm.contextCreate(ContextFlag.BOTH);
  const sigScratch = secp256k1Wasm.malloc(
    72
    /* ByteLength.maxECDSASig */
  );
  const publicKeyScratch = secp256k1Wasm.malloc(
    65
    /* ByteLength.maxPublicKey */
  );
  const messageHashScratch = secp256k1Wasm.malloc(
    32
    /* ByteLength.messageHash */
  );
  const internalPublicKeyPtr = secp256k1Wasm.malloc(
    64
    /* ByteLength.internalPublicKey */
  );
  const internalSigPtr = secp256k1Wasm.malloc(
    64
    /* ByteLength.internalSig */
  );
  const schnorrSigPtr = secp256k1Wasm.malloc(
    64
    /* ByteLength.schnorrSig */
  );
  const privateKeyPtr = secp256k1Wasm.malloc(
    32
    /* ByteLength.privateKey */
  );
  const internalRSigPtr = secp256k1Wasm.malloc(
    65
    /* ByteLength.recoverableSig */
  );
  const recoveryNumPtr = secp256k1Wasm.malloc(4);
  const recoveryNumPtrView32 = recoveryNumPtr >> 2;
  const getRecoveryNumPtr = () => secp256k1Wasm.heapU32[recoveryNumPtrView32];
  const lengthPtr = secp256k1Wasm.malloc(4);
  const lengthPtrView32 = lengthPtr >> 2;
  const cloneAndPad = (value, expectedLength) => {
    const zeroPaddedValue = new Uint8Array(expectedLength);
    zeroPaddedValue.set(value);
    return zeroPaddedValue;
  };
  const parsePublicKey = (publicKey) => {
    const paddedPublicKey = cloneAndPad(
      publicKey,
      65
      /* ByteLength.maxPublicKey */
    );
    secp256k1Wasm.heapU8.set(paddedPublicKey, publicKeyScratch);
    return secp256k1Wasm.pubkeyParse(
      contextPtr,
      internalPublicKeyPtr,
      publicKeyScratch,
      // eslint-disable-next-line @typescript-eslint/no-magic-numbers
      publicKey.length
    ) === 1;
  };
  const setLengthPtr = (value) => {
    secp256k1Wasm.heapU32.set([value], lengthPtrView32);
  };
  const getLengthPtr = () => secp256k1Wasm.heapU32[lengthPtrView32];
  const serializePublicKey = (length, flag) => {
    setLengthPtr(length);
    secp256k1Wasm.pubkeySerialize(contextPtr, publicKeyScratch, lengthPtr, internalPublicKeyPtr, flag);
    return secp256k1Wasm.readHeapU8(publicKeyScratch, getLengthPtr()).slice();
  };
  const getSerializedPublicKey = (compressed) => compressed ? serializePublicKey(33, CompressionFlag.COMPRESSED) : serializePublicKey(65, CompressionFlag.UNCOMPRESSED);
  const convertPublicKey = (compressed) => (publicKey) => {
    if (!parsePublicKey(publicKey)) {
      return Secp256k1Error.unparsablePublicKey;
    }
    return getSerializedPublicKey(compressed);
  };
  const parseSignature = (signature, isDer) => {
    const paddedSignature = cloneAndPad(
      signature,
      72
      /* ByteLength.maxECDSASig */
    );
    secp256k1Wasm.heapU8.set(paddedSignature, sigScratch);
    return isDer ? secp256k1Wasm.signatureParseDER(contextPtr, internalSigPtr, sigScratch, signature.length) === 1 : secp256k1Wasm.signatureParseCompact(contextPtr, internalSigPtr, sigScratch) === 1;
  };
  const getCompactSig = () => {
    secp256k1Wasm.signatureSerializeCompact(contextPtr, sigScratch, internalSigPtr);
    return secp256k1Wasm.readHeapU8(
      sigScratch,
      64
      /* ByteLength.compactSig */
    ).slice();
  };
  const getDERSig = () => {
    setLengthPtr(
      72
      /* ByteLength.maxECDSASig */
    );
    secp256k1Wasm.signatureSerializeDER(contextPtr, sigScratch, lengthPtr, internalSigPtr);
    return secp256k1Wasm.readHeapU8(sigScratch, getLengthPtr()).slice();
  };
  const convertSignature = (wasDER) => (signature) => {
    if (!parseSignature(signature, wasDER)) {
      return Secp256k1Error.unparsableSignature;
    }
    return wasDER ? getCompactSig() : getDERSig();
  };
  const fillPrivateKeyPtr = (privateKey) => {
    const paddedPrivateKey = cloneAndPad(
      privateKey,
      32
      /* ByteLength.privateKey */
    );
    secp256k1Wasm.heapU8.set(paddedPrivateKey, privateKeyPtr);
  };
  const zeroOutPtr = (pointer, bytes) => {
    secp256k1Wasm.heapU8.fill(0, pointer, pointer + bytes);
  };
  const zeroOutPrivateKeyPtr = () => {
    zeroOutPtr(
      privateKeyPtr,
      32
      /* ByteLength.privateKey */
    );
  };
  const withPrivateKey = (privateKey, instructions) => {
    fillPrivateKeyPtr(privateKey);
    const ret = instructions();
    zeroOutPrivateKeyPtr();
    return ret;
  };
  const derivePublicKey = (compressed) => (privateKey) => {
    const invalid = withPrivateKey(privateKey, () => secp256k1Wasm.pubkeyCreate(contextPtr, internalPublicKeyPtr, privateKeyPtr) !== 1);
    if (invalid) {
      return Secp256k1Error.derivePublicKeyFromInvalidPrivateKey;
    }
    return getSerializedPublicKey(compressed);
  };
  const fillMessageHashScratch = (messageHash) => {
    const paddedMessageHash = cloneAndPad(
      messageHash,
      32
      /* ByteLength.messageHash */
    );
    secp256k1Wasm.heapU8.set(paddedMessageHash, messageHashScratch);
  };
  const normalizeSignature = () => {
    secp256k1Wasm.signatureNormalize(contextPtr, internalSigPtr, internalSigPtr);
  };
  const modifySignature = (isDer, normalize) => (signature) => {
    if (!parseSignature(signature, isDer)) {
      return Secp256k1Error.unparsableSignature;
    }
    if (normalize) {
      normalizeSignature();
    } else {
      secp256k1Wasm.signatureMalleate(contextPtr, internalSigPtr, internalSigPtr);
    }
    return isDer ? getDERSig() : getCompactSig();
  };
  const parseAndNormalizeSignature = (signature, isDer, normalize) => {
    const ret = parseSignature(signature, isDer);
    if (normalize) {
      normalizeSignature();
    }
    return ret;
  };
  const signMessageHash = (isDer) => (privateKey, messageHash) => {
    fillMessageHashScratch(messageHash);
    return withPrivateKey(privateKey, () => {
      const failed = secp256k1Wasm.sign(contextPtr, internalSigPtr, messageHashScratch, privateKeyPtr) !== 1;
      if (failed) {
        return Secp256k1Error.signWithInvalidPrivateKey;
      }
      if (isDer) {
        setLengthPtr(
          72
          /* ByteLength.maxECDSASig */
        );
        secp256k1Wasm.signatureSerializeDER(contextPtr, sigScratch, lengthPtr, internalSigPtr);
        return secp256k1Wasm.readHeapU8(sigScratch, getLengthPtr()).slice();
      }
      secp256k1Wasm.signatureSerializeCompact(contextPtr, sigScratch, internalSigPtr);
      return secp256k1Wasm.readHeapU8(
        sigScratch,
        64
        /* ByteLength.compactSig */
      ).slice();
    });
  };
  const signMessageHashSchnorr = () => (privateKey, messageHash) => {
    fillMessageHashScratch(messageHash);
    return withPrivateKey(privateKey, () => {
      const failed = secp256k1Wasm.schnorrSign(contextPtr, schnorrSigPtr, messageHashScratch, privateKeyPtr) !== 1;
      if (failed) {
        return Secp256k1Error.signWithInvalidPrivateKey;
      }
      return secp256k1Wasm.readHeapU8(
        schnorrSigPtr,
        64
        /* ByteLength.schnorrSig */
      ).slice();
    });
  };
  const verifyMessage = (messageHash) => {
    fillMessageHashScratch(messageHash);
    return secp256k1Wasm.verify(contextPtr, internalSigPtr, messageHashScratch, internalPublicKeyPtr) === 1;
  };
  const verifySignature = (isDer, normalize) => (signature, publicKey, messageHash) => parsePublicKey(publicKey) && parseAndNormalizeSignature(signature, isDer, normalize) && verifyMessage(messageHash);
  const verifyMessageSchnorr = (messageHash, signature) => {
    fillMessageHashScratch(messageHash);
    const paddedSignature = cloneAndPad(
      signature,
      64
      /* ByteLength.schnorrSig */
    );
    secp256k1Wasm.heapU8.set(paddedSignature, schnorrSigPtr);
    return secp256k1Wasm.schnorrVerify(contextPtr, schnorrSigPtr, messageHashScratch, internalPublicKeyPtr) === 1;
  };
  const verifySignatureSchnorr = () => (signature, publicKey, messageHash) => parsePublicKey(publicKey) ? verifyMessageSchnorr(messageHash, signature) : false;
  const signMessageHashRecoverable = (privateKey, messageHash) => {
    fillMessageHashScratch(messageHash);
    return withPrivateKey(privateKey, () => {
      if (secp256k1Wasm.signRecoverable(contextPtr, internalRSigPtr, messageHashScratch, privateKeyPtr) !== 1) {
        return Secp256k1Error.signWithInvalidPrivateKey;
      }
      secp256k1Wasm.recoverableSignatureSerialize(contextPtr, sigScratch, recoveryNumPtr, internalRSigPtr);
      return {
        recoveryId: getRecoveryNumPtr(),
        signature: secp256k1Wasm.readHeapU8(
          sigScratch,
          64
          /* ByteLength.compactSig */
        ).slice()
      };
    });
  };
  const recoverPublicKey = (compressed) => (signature, recoveryId, messageHash) => {
    fillMessageHashScratch(messageHash);
    const paddedSignature = cloneAndPad(
      signature,
      72
      /* ByteLength.maxECDSASig */
    );
    secp256k1Wasm.heapU8.set(paddedSignature, sigScratch);
    if (secp256k1Wasm.recoverableSignatureParse(contextPtr, internalRSigPtr, sigScratch, recoveryId) !== 1) {
      return Secp256k1Error.recoverPublicKeyWithUnparsableSignature;
    }
    if (secp256k1Wasm.recover(contextPtr, internalPublicKeyPtr, internalRSigPtr, messageHashScratch) !== 1) {
      return Secp256k1Error.recoverPublicKeyInvalidMaterial;
    }
    return getSerializedPublicKey(compressed);
  };
  const addTweakPrivateKey = (privateKey, tweakValue) => {
    fillMessageHashScratch(tweakValue);
    return withPrivateKey(privateKey, () => {
      if (secp256k1Wasm.privkeyTweakAdd(contextPtr, privateKeyPtr, messageHashScratch) !== 1) {
        return Secp256k1Error.addTweakPrivateKey;
      }
      return secp256k1Wasm.readHeapU8(
        privateKeyPtr,
        32
        /* ByteLength.privateKey */
      ).slice();
    });
  };
  const mulTweakPrivateKey = (privateKey, tweakValue) => {
    fillMessageHashScratch(tweakValue);
    return withPrivateKey(privateKey, () => {
      if (secp256k1Wasm.privkeyTweakMul(contextPtr, privateKeyPtr, messageHashScratch) !== 1) {
        return Secp256k1Error.mulTweakPrivateKey;
      }
      return secp256k1Wasm.readHeapU8(
        privateKeyPtr,
        32
        /* ByteLength.privateKey */
      ).slice();
    });
  };
  const addTweakPublicKey = (compressed) => (publicKey, tweakValue) => {
    if (!parsePublicKey(publicKey)) {
      return Secp256k1Error.unparsablePublicKey;
    }
    fillMessageHashScratch(tweakValue);
    if (secp256k1Wasm.pubkeyTweakAdd(contextPtr, internalPublicKeyPtr, messageHashScratch) !== 1) {
      return Secp256k1Error.addTweakPublicKey;
    }
    return getSerializedPublicKey(compressed);
  };
  const mulTweakPublicKey = (compressed) => (publicKey, tweakValue) => {
    if (!parsePublicKey(publicKey)) {
      return Secp256k1Error.unparsablePublicKey;
    }
    fillMessageHashScratch(tweakValue);
    if (secp256k1Wasm.pubkeyTweakMul(contextPtr, internalPublicKeyPtr, messageHashScratch) !== 1) {
      return Secp256k1Error.mulTweakPublicKey;
    }
    return getSerializedPublicKey(compressed);
  };
  if (randomSeed !== void 0) {
    const randomSeedPtr = messageHashScratch;
    const paddedRandomSeed = cloneAndPad(
      randomSeed,
      32
      /* ByteLength.randomSeed */
    );
    secp256k1Wasm.heapU8.set(paddedRandomSeed, randomSeedPtr);
    secp256k1Wasm.contextRandomize(contextPtr, randomSeedPtr);
    zeroOutPtr(
      randomSeedPtr,
      32
      /* ByteLength.randomSeed */
    );
  }
  return {
    addTweakPrivateKey,
    addTweakPublicKeyCompressed: addTweakPublicKey(true),
    addTweakPublicKeyUncompressed: addTweakPublicKey(false),
    compressPublicKey: convertPublicKey(true),
    derivePublicKeyCompressed: derivePublicKey(true),
    derivePublicKeyUncompressed: derivePublicKey(false),
    malleateSignatureCompact: modifySignature(false, false),
    malleateSignatureDER: modifySignature(true, false),
    mulTweakPrivateKey,
    mulTweakPublicKeyCompressed: mulTweakPublicKey(true),
    mulTweakPublicKeyUncompressed: mulTweakPublicKey(false),
    normalizeSignatureCompact: modifySignature(false, true),
    normalizeSignatureDER: modifySignature(true, true),
    recoverPublicKeyCompressed: recoverPublicKey(true),
    recoverPublicKeyUncompressed: recoverPublicKey(false),
    signMessageHashCompact: signMessageHash(false),
    signMessageHashDER: signMessageHash(true),
    signMessageHashRecoverableCompact: signMessageHashRecoverable,
    signMessageHashSchnorr: signMessageHashSchnorr(),
    signatureCompactToDER: convertSignature(false),
    signatureDERToCompact: convertSignature(true),
    uncompressPublicKey: convertPublicKey(false),
    validatePrivateKey: (privateKey) => withPrivateKey(privateKey, () => secp256k1Wasm.seckeyVerify(contextPtr, privateKeyPtr) === 1),
    validatePublicKey: parsePublicKey,
    verifySignatureCompact: verifySignature(false, true),
    verifySignatureCompactLowS: verifySignature(false, false),
    verifySignatureDER: verifySignature(true, true),
    verifySignatureDERLowS: verifySignature(true, false),
    verifySignatureSchnorr: verifySignatureSchnorr()
  };
};
var instantiateSecp256k1 = async (randomSeed) => wrapSecp256k1Wasm2(await instantiateSecp256k1Wasm(), randomSeed);

// node_modules/@bitauth/libauth/build/lib/crypto/sha1.js
var instantiateSha1Bytes = async (webassemblyBytes) => {
  const wasm = await instantiateRustWasm(webassemblyBytes, "./sha1", "sha1", "sha1_init", "sha1_update", "sha1_final");
  return {
    final: wasm.final,
    hash: wasm.hash,
    init: wasm.init,
    update: wasm.update
  };
};
var getEmbeddedSha1Binary = () => base64ToBin(sha1Base64Bytes).buffer;
var instantiateSha1 = async () => instantiateSha1Bytes(getEmbeddedSha1Binary());

// node_modules/@bitauth/libauth/build/lib/crypto/sha256.js
var instantiateSha256Bytes = async (webassemblyBytes) => {
  const wasm = await instantiateRustWasm(webassemblyBytes, "./sha256", "sha256", "sha256_init", "sha256_update", "sha256_final");
  return {
    final: wasm.final,
    hash: wasm.hash,
    init: wasm.init,
    update: wasm.update
  };
};
var getEmbeddedSha256Binary = () => base64ToBin(sha256Base64Bytes).buffer;
var instantiateSha256 = async () => instantiateSha256Bytes(getEmbeddedSha256Binary());

// node_modules/@bitauth/libauth/build/lib/crypto/sha512.js
var instantiateSha512Bytes = async (webassemblyBytes) => {
  const wasm = await instantiateRustWasm(webassemblyBytes, "./sha512", "sha512", "sha512_init", "sha512_update", "sha512_final");
  return {
    final: wasm.final,
    hash: wasm.hash,
    init: wasm.init,
    update: wasm.update
  };
};
var getEmbeddedSha512Binary = () => base64ToBin(sha512Base64Bytes).buffer;
var instantiateSha512 = async () => instantiateSha512Bytes(getEmbeddedSha512Binary());

// node_modules/@bitauth/libauth/build/lib/crypto/default-crypto-instances.js
var [sha1, sha2562, sha512, ripemd160, secp256k12] = await Promise.all([
  instantiateSha1(),
  instantiateSha256(),
  instantiateSha512(),
  instantiateRipemd160(),
  instantiateSecp256k1()
]);

// node_modules/@bitauth/libauth/build/lib/crypto/combinations.js
var hash256 = (payload, sha2563 = sha2562) => sha2563.hash(sha2563.hash(payload));

// node_modules/@bitauth/libauth/build/lib/crypto/hmac.js
var instantiateHmacFunction = (hashFunction, blockByteLength) => (secret, message) => {
  const key = new Uint8Array(blockByteLength).fill(0);
  key.set(secret.length > blockByteLength ? hashFunction(secret) : secret, 0);
  const innerPaddingFill = 54;
  const innerPadding = new Uint8Array(blockByteLength).fill(innerPaddingFill);
  const innerPrefix = innerPadding.map((pad2, index) => pad2 ^ key[index]);
  const innerContent = flattenBinArray([innerPrefix, message]);
  const innerResult = hashFunction(innerContent);
  const outerPaddingFill = 92;
  const outerPadding = new Uint8Array(blockByteLength).fill(outerPaddingFill);
  const outerPrefix = outerPadding.map((pad2, index) => pad2 ^ key[index]);
  return hashFunction(flattenBinArray([outerPrefix, innerResult]));
};
var sha512BlockByteLength = 128;
var hmacSha512 = (secret, message, sha5122 = sha512) => instantiateHmacFunction(sha5122.hash, sha512BlockByteLength)(secret, message);

// node_modules/@bitauth/libauth/build/lib/address/bech32.js
var bech32CharacterSet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
var BitRegroupingError;
(function(BitRegroupingError2) {
  BitRegroupingError2["integerOutOfRange"] = "An integer provided in the source array is out of the range of the specified source word length.";
  BitRegroupingError2["hasDisallowedPadding"] = "Encountered padding when padding was disallowed.";
  BitRegroupingError2["requiresDisallowedPadding"] = "Encoding requires padding while padding is disallowed.";
})(BitRegroupingError || (BitRegroupingError = {}));
var regroupBits = ({ bin, sourceWordLength, resultWordLength, allowPadding = true }) => {
  let accumulator = 0;
  let bits = 0;
  const result = [];
  const maxResultInt = (1 << resultWordLength) - 1;
  for (let p = 0; p < bin.length; ++p) {
    const value = bin[p];
    if (value < 0 || value >> sourceWordLength !== 0) {
      return BitRegroupingError.integerOutOfRange;
    }
    accumulator = accumulator << sourceWordLength | value;
    bits += sourceWordLength;
    while (bits >= resultWordLength) {
      bits -= resultWordLength;
      result.push(accumulator >> bits & maxResultInt);
    }
  }
  if (allowPadding) {
    if (bits > 0) {
      result.push(accumulator << resultWordLength - bits & maxResultInt);
    }
  } else if (bits >= sourceWordLength) {
    return BitRegroupingError.hasDisallowedPadding;
  } else if ((accumulator << resultWordLength - bits & maxResultInt) > 0) {
    return BitRegroupingError.requiresDisallowedPadding;
  }
  return result;
};
var encodeBech32 = (base32IntegerArray) => {
  let result = "";
  for (let i3 = 0; i3 < base32IntegerArray.length; i3++) {
    result += bech32CharacterSet[base32IntegerArray[i3]];
  }
  return result;
};
var nonBech32Characters = new RegExp(`[^${bech32CharacterSet}]`, "u");
var base32WordLength = 5;
var base256WordLength = 8;
var Bech32DecodingError;
(function(Bech32DecodingError2) {
  Bech32DecodingError2["notBech32CharacterSet"] = "Bech32 decoding error: input contains characters outside of the Bech32 character set.";
})(Bech32DecodingError || (Bech32DecodingError = {}));
var binToBech32Padded = (bytes) => encodeBech32(regroupBits({
  bin: bytes,
  resultWordLength: base32WordLength,
  sourceWordLength: base256WordLength
}));

// node_modules/@bitauth/libauth/build/lib/key/hd-key.js
var validateSecp256k1PrivateKey = (privateKey) => {
  if (privateKey.length !== 32 || privateKey.every((value) => value === 0)) {
    return false;
  }
  const maximumSecp256k1PrivateKey = [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 186, 174, 220, 230, 175, 72, 160, 59, 191, 210, 94, 140, 208, 54, 65, 64];
  const firstDifference = privateKey.findIndex((value, i3) => value !== maximumSecp256k1PrivateKey[i3]);
  if (firstDifference === -1 || // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  privateKey[firstDifference] < maximumSecp256k1PrivateKey[firstDifference]) {
    return true;
  }
  return false;
};
var HdNodeDerivationError;
(function(HdNodeDerivationError2) {
  HdNodeDerivationError2["childIndexExceedsMaximum"] = "HD node derivation error: child index exceeds maximum (4294967295).";
  HdNodeDerivationError2["requiresZeroDepthNode"] = "HD node derivation error: absolute derivation requires an HD node with a depth of 0.";
  HdNodeDerivationError2["hardenedDerivationRequiresPrivateNode"] = "HD node derivation error: derivation for hardened child indexes (indexes greater than or equal to 2147483648) requires an HD private node.";
  HdNodeDerivationError2["invalidAbsoluteDerivationPath"] = `HD node derivation error: invalid absolute derivation path; path must begin with "m" or "M" and contain only positive child index numbers, separated by forward slashes ("/"), with zero or one apostrophe ("'") after each child index number.`;
  HdNodeDerivationError2["invalidRelativeDerivationPath"] = `HD node derivation error: invalid relative derivation path; path must contain only positive child index numbers, separated by forward slashes ("/"), with zero or one apostrophe ("'") after each child index number.`;
  HdNodeDerivationError2["invalidDerivedKey"] = "HD node derivation error: an astronomically rare HMAC-SHA512 result produced an invalid Secp256k1 key.";
  HdNodeDerivationError2["invalidPrivateDerivationPrefix"] = 'HD node derivation error: private derivation paths must begin with "m".';
  HdNodeDerivationError2["invalidPublicDerivationPrefix"] = 'HD node derivation error: public derivation paths must begin with "M".';
})(HdNodeDerivationError || (HdNodeDerivationError = {}));
var HdKeyDecodingError;
(function(HdKeyDecodingError2) {
  HdKeyDecodingError2["incorrectLength"] = "HD key decoding error: length is incorrect (must encode 82 bytes).";
  HdKeyDecodingError2["invalidChecksum"] = "HD key decoding error: checksum is invalid.";
  HdKeyDecodingError2["invalidPublicKey"] = "HD key decoding error: the public key for this HD public node is not a valid Secp256k1 public key.";
  HdKeyDecodingError2["invalidPrivateKey"] = "HD key decoding error: the key for this HD private node is not a valid Secp256k1 private key.";
  HdKeyDecodingError2["missingPrivateKeyPaddingByte"] = "HD key decoding error: version indicates a private key, but the key data is missing a padding byte.";
  HdKeyDecodingError2["privateKeyExpected"] = "HD key decoding error: expected an HD private key, but encountered an HD public key.";
  HdKeyDecodingError2["publicKeyExpected"] = "HD key decoding error: expected an HD public key, but encountered an HD private key.";
  HdKeyDecodingError2["unknownCharacter"] = "HD key decoding error: key includes a non-base58 character.";
  HdKeyDecodingError2["unknownVersion"] = "HD key decoding error: key uses an unknown version.";
  HdKeyDecodingError2["zeroDepthWithNonZeroChildIndex"] = "HD key decoding error: key encodes a depth of zero with a non-zero child index.";
  HdKeyDecodingError2["zeroDepthWithNonZeroParentFingerprint"] = "HD key decoding error: key encodes a depth of zero with a non-zero parent fingerprint.";
})(HdKeyDecodingError || (HdKeyDecodingError = {}));
var HdKeyEncodingError;
(function(HdKeyEncodingError2) {
  HdKeyEncodingError2["invalidChainCodeLength"] = "HD key encoding error: invalid chain code length. Chain code must be 32 bytes.";
  HdKeyEncodingError2["invalidChildDepth"] = "HD key encoding error: invalid child depth. Child depth must be between 0 and 255 (inclusive).";
  HdKeyEncodingError2["invalidChildIndex"] = "HD key encoding error: invalid child index. Child index must be between 0 and 4294967295 (inclusive).";
  HdKeyEncodingError2["invalidParentFingerprintLength"] = "HD key encoding error: invalid parent fingerprint length. Parent fingerprint must be 4 bytes.";
  HdKeyEncodingError2["invalidPrivateKeyLength"] = "HD key encoding error: invalid private key length. Secp256k1 private keys must be 32 bytes.";
  HdKeyEncodingError2["invalidPublicKeyLength"] = "HD key encoding error: invalid public key length. Public key must be 33 bytes (compressed).";
  HdKeyEncodingError2["invalidPublicKey"] = "HD key encoding error: the public key for this HD public node is not a valid Secp256k1 public key.";
  HdKeyEncodingError2["zeroDepthWithNonZeroChildIndex"] = "HD key encoding error: attempted to encode a zero depth key with a non-zero child index.";
  HdKeyEncodingError2["zeroDepthWithNonZeroParentFingerprint"] = "HD key encoding error: attempted to encode a zero depth key with a non-zero parent fingerprint.";
})(HdKeyEncodingError || (HdKeyEncodingError = {}));
var emptyParentFingerprint = Uint8Array.from([0, 0, 0, 0]);
var bip32HmacSha512Key = utf8ToBin("Bitcoin seed");
var deriveHdPublicNodeIdentifier = (node, { crypto: crypto2 = { ripemd160, sha256: sha2562 } } = {}) => crypto2.ripemd160.hash(crypto2.sha256.hash(node.publicKey));
var HdKeyVersion;
(function(HdKeyVersion2) {
  HdKeyVersion2[HdKeyVersion2["mainnetPrivateKey"] = 76066276] = "mainnetPrivateKey";
  HdKeyVersion2[HdKeyVersion2["mainnetPublicKey"] = 76067358] = "mainnetPublicKey";
  HdKeyVersion2[HdKeyVersion2["testnetPrivateKey"] = 70615956] = "testnetPrivateKey";
  HdKeyVersion2[HdKeyVersion2["testnetPublicKey"] = 70617039] = "testnetPublicKey";
})(HdKeyVersion || (HdKeyVersion = {}));
var hdKeyVersionIsPublicKey = (version) => version === HdKeyVersion.mainnetPublicKey || version === HdKeyVersion.testnetPublicKey;
var hdKeyVersionIsPrivateKey = (version) => version === HdKeyVersion.mainnetPrivateKey || version === HdKeyVersion.testnetPrivateKey;
var decodeHdKeyUnchecked = (hdKey, { crypto: crypto2 = { secp256k1: secp256k12, sha256: sha2562 } } = {}) => {
  const decoded = base58ToBin(hdKey);
  if (typeof decoded === "string")
    return formatError(HdKeyDecodingError.unknownCharacter, decoded);
  if (decoded.length !== 82)
    return formatError(HdKeyDecodingError.incorrectLength, `Length: ${decoded.length}.`);
  const payload = decoded.slice(
    0,
    78
    /* Bip32Constants.hdKeyChecksumIndex */
  );
  const checksumBits = decoded.slice(
    78
    /* Bip32Constants.hdKeyChecksumIndex */
  );
  const checksum = crypto2.sha256.hash(crypto2.sha256.hash(payload));
  if (!checksumBits.every((value, i3) => value === checksum[i3])) {
    return formatError(HdKeyDecodingError.invalidChecksum, `Encoded: ${binToHex(checksumBits)}; computed: ${binToHex(checksum.slice(
      0,
      4
      /* Bip32Constants.hdKeyChecksumLength */
    ))}.`);
  }
  const depthIndex = 4;
  const fingerprintIndex = 5;
  const childIndexIndex = 9;
  const chainCodeIndex = 13;
  const keyDataIndex = 45;
  const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
  const version = view.getUint32(0, false);
  const depth = view.getUint8(depthIndex);
  const parentFingerprint = decoded.slice(fingerprintIndex, childIndexIndex);
  const childIndex = view.getUint32(childIndexIndex, false);
  const chainCode = decoded.slice(chainCodeIndex, keyDataIndex);
  const keyData = decoded.slice(
    keyDataIndex,
    78
    /* Bip32Constants.hdKeyChecksumIndex */
  );
  const isPrivateKey = hdKeyVersionIsPrivateKey(version);
  if (isPrivateKey && keyData[0] !== 0) {
    return HdKeyDecodingError.missingPrivateKeyPaddingByte;
  }
  if (isPrivateKey) {
    const privateKey = keyData.slice(1);
    const valid2 = validateSecp256k1PrivateKey(privateKey);
    return {
      node: valid2 ? {
        chainCode,
        childIndex,
        depth,
        parentFingerprint,
        privateKey
      } : {
        chainCode,
        childIndex,
        depth,
        invalidMaterial: privateKey,
        parentFingerprint
      },
      version
    };
  }
  const isPublicKey = hdKeyVersionIsPublicKey(version);
  if (!isPublicKey) {
    return formatError(HdKeyDecodingError.unknownVersion, `Version: ${version}`);
  }
  const publicKey = keyData;
  const valid = crypto2.secp256k1.validatePublicKey(publicKey);
  return {
    node: valid ? {
      chainCode,
      childIndex,
      depth,
      parentFingerprint,
      publicKey
    } : {
      chainCode,
      childIndex,
      depth,
      invalidMaterial: publicKey,
      parentFingerprint
    },
    version
  };
};
var decodeHdKey = (hdKey, { crypto: crypto2 = { secp256k1: secp256k12, sha256: sha2562 } } = {}) => {
  const decoded = decodeHdKeyUnchecked(hdKey, { crypto: crypto2 });
  if (typeof decoded === "string")
    return decoded;
  const { node, version } = decoded;
  if (node.depth === 0) {
    if (node.childIndex !== 0) {
      return formatError(HdKeyDecodingError.zeroDepthWithNonZeroChildIndex, `Child index: ${node.childIndex}.`);
    }
    if (!binsAreEqual(node.parentFingerprint, emptyParentFingerprint)) {
      return formatError(HdKeyDecodingError.zeroDepthWithNonZeroParentFingerprint, `Parent fingerprint: ${node.parentFingerprint.join(",")}.`);
    }
  }
  const isPublicKey = hdKeyVersionIsPublicKey(version);
  if ("invalidMaterial" in node) {
    return isPublicKey ? formatError(HdKeyDecodingError.invalidPublicKey, `Invalid public key: ${binToHex(node.invalidMaterial)}.`) : formatError(HdKeyDecodingError.invalidPrivateKey);
  }
  const network = version === HdKeyVersion.mainnetPrivateKey || version === HdKeyVersion.mainnetPublicKey ? "mainnet" : "testnet";
  return { network, node };
};
var decodeHdPublicKey = (hdPublicKey, { crypto: crypto2 = { secp256k1: secp256k12, sha256: sha2562 } } = {}) => {
  const decoded = decodeHdKey(hdPublicKey, { crypto: crypto2 });
  if (typeof decoded === "string")
    return decoded;
  const { network, node } = decoded;
  if ("privateKey" in node) {
    return HdKeyDecodingError.publicKeyExpected;
  }
  return { network, node };
};
var deriveHdPublicNodeChild = (node, index, { crypto: crypto2 = {
  ripemd160,
  secp256k1: secp256k12,
  sha256: sha2562,
  sha512
}, returnInvalidNodes = false, throwErrors = true } = {}) => {
  const hardenedIndexOffset = 2147483648;
  if (index >= hardenedIndexOffset) {
    return formatError(HdNodeDerivationError.hardenedDerivationRequiresPrivateNode, `Requested index: ${index}.`, throwErrors);
  }
  const parentIdentifier = deriveHdPublicNodeIdentifier(node, { crypto: crypto2 });
  const parentFingerprint = parentIdentifier.slice(
    0,
    4
    /* Bip32Constants.parentFingerprintLength */
  );
  const depth = node.depth + 1;
  const serialization = Uint8Array.from([
    ...node.publicKey,
    ...numberToBinUint32BE(index)
  ]);
  const derivation = hmacSha512(node.chainCode, serialization, crypto2.sha512);
  const tweakValueLength = 32;
  const tweakValue = derivation.slice(0, tweakValueLength);
  const nextChainCode = derivation.slice(tweakValueLength);
  const nextPublicKey = crypto2.secp256k1.addTweakPublicKeyCompressed(node.publicKey, tweakValue);
  if (typeof nextPublicKey === "string") {
    const error2 = formatError(HdNodeDerivationError.invalidDerivedKey, `Invalid child index: ${index}.`, throwErrors);
    if (returnInvalidNodes) {
      return {
        chainCode: nextChainCode,
        childIndex: index,
        depth,
        invalidMaterial: tweakValue,
        parentFingerprint,
        parentIdentifier
      };
    }
    return error2;
  }
  return {
    chainCode: nextChainCode,
    childIndex: index,
    depth,
    parentFingerprint,
    parentIdentifier,
    publicKey: nextPublicKey
  };
};
var HdNodeCrackingError;
(function(HdNodeCrackingError2) {
  HdNodeCrackingError2["cannotCrackHardenedDerivation"] = "HD node cracking error: cannot crack an HD parent node using hardened child node.";
})(HdNodeCrackingError || (HdNodeCrackingError = {}));

// node_modules/@bitauth/libauth/build/lib/key/key-utils.js
var EntropyGenerationError;
(function(EntropyGenerationError2) {
  EntropyGenerationError2["duplicateResults"] = 'Entropy generation error: the "getRandomValues" function provided by this JavaScript environment returned duplicate results across two evaluations; entropy generation was halted for safety.';
  EntropyGenerationError2["insufficientEntropy"] = "Entropy generation error: the provided list of events contains insufficient entropy.";
})(EntropyGenerationError || (EntropyGenerationError = {}));
var generateRandomBytesUnchecked = (length, cryptoInstance = crypto) => cryptoInstance.getRandomValues(new Uint8Array(length));
var generateRandomBytes = (length, generate = generateRandomBytesUnchecked) => {
  const firstRun = generate(length);
  const secondRun = generate(length);
  if (firstRun === secondRun || binsAreEqual(firstRun, secondRun))
    return formatError(EntropyGenerationError.duplicateResults, `First result: [${String(firstRun)}]; second result: [${String(secondRun)}].`, true);
  return firstRun;
};
var generateRandomSeed = () => generateRandomBytes(
  32
  /* KeyUtilConstants.privateKeyLength */
);
var generatePrivateKey = (secureRandom = generateRandomSeed) => {
  let maybeKey;
  do {
    maybeKey = secureRandom();
  } while (!validateSecp256k1PrivateKey(maybeKey));
  return maybeKey;
};

// node_modules/eventemitter3/index.mjs
var import_index = __toESM(require_eventemitter3(), 1);

// node_modules/@wizardconnect/core/dist/protocols/hdwalletv1.js
var PROTOCOL_NAME = "hdwalletv1";
var RelayMsgAction;
(function(RelayMsgAction2) {
  RelayMsgAction2["DappReady"] = "dapp_ready";
  RelayMsgAction2["WalletReady"] = "wallet_ready";
  RelayMsgAction2["SignTransactionRequest"] = "sign_transaction_request";
  RelayMsgAction2["SignTransactionResponse"] = "sign_transaction_response";
  RelayMsgAction2["SignCancel"] = "sign_cancel";
  RelayMsgAction2["Disconnect"] = "disconnect";
  RelayMsgAction2["Chunk"] = "chunk";
  RelayMsgAction2["Ping"] = "ping";
  RelayMsgAction2["Pong"] = "pong";
})(RelayMsgAction || (RelayMsgAction = {}));
var PATH_RECEIVE = "receive";
var PATH_CHANGE = "change";
var PATH_DEFI = "defi";
function isPathXpub(obj) {
  return obj && typeof obj === "object" && typeof obj.name === "string" && typeof obj.xpub === "string";
}
function childIndexOfPathName(name) {
  switch (name) {
    case PATH_RECEIVE:
      return 0;
    case PATH_CHANGE:
      return 1;
    case PATH_DEFI:
      return 7;
    default:
      return void 0;
  }
}
function isHdwalletv1Session(obj) {
  const s = obj;
  return obj !== null && typeof obj === "object" && Array.isArray(s.paths) && s.paths.every((p) => isPathXpub(p)) && (s.extensions === void 0 || typeof s.extensions === "object" && s.extensions !== null);
}
function isProtocolMessage(payload) {
  return payload && typeof payload === "object" && typeof payload.action === "string" && typeof payload.time === "number";
}
function isChunkMessage(msg) {
  return msg && typeof msg === "object" && msg.action === RelayMsgAction.Chunk && typeof msg.msgId === "string" && typeof msg.index === "number" && typeof msg.total === "number" && typeof msg.data === "string" && Number.isInteger(msg.index) && Number.isInteger(msg.total) && msg.total >= 1 && msg.index >= 0 && msg.index < msg.total;
}

// node_modules/@wizardconnect/core/dist/utilnostr.js
function deriveNostrPublicKey(privateKey) {
  const publicKeyCompressed = unwrap(secp256k12.derivePublicKeyCompressed(privateKey));
  const publicKeyNostr = publicKeyCompressed.slice(1);
  return binToHex(publicKeyNostr);
}

// node_modules/@wizardconnect/core/dist/log.js
var Scope;
(function(Scope2) {
  Scope2["Relay"] = "relay";
  Scope2["Network"] = "network";
  Scope2["Misc"] = "misc";
})(Scope || (Scope = {}));
function debug(scope, ...args) {
  console.log(`[${scope}]`, ...args);
}
function warn(scope, ...args) {
  console.warn(`[${scope}]`, ...args);
}
function error(scope, ...args) {
  console.error(`[${scope}]`, ...args);
}

// node_modules/@wizardconnect/core/dist/message-queue.js
var MessageQueue = class {
  queue = [];
  isReady = false;
  logActivity = false;
  constructor(options) {
    this.logActivity = options?.logActivity ?? false;
  }
  getReady() {
    return this.isReady;
  }
  getQueueLength() {
    return this.queue.length;
  }
  enqueue(message) {
    if (this.isReady) {
      return Promise.resolve();
    }
    if (this.logActivity) {
      debug(Scope.Relay, `net: Relays not ready, queuing message ${message.action}`);
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ message, resolve, reject });
    });
  }
  async setReady(publishFn) {
    this.isReady = true;
    const queuedMessages = [...this.queue];
    this.queue = [];
    if (queuedMessages.length > 0 && this.logActivity) {
      debug(Scope.Relay, `Processing ${queuedMessages.length} queued messages`);
    }
    for (const queued of queuedMessages) {
      try {
        await publishFn(queued.message);
        queued.resolve();
      } catch (error2) {
        queued.reject(error2);
      }
    }
  }
  setNotReady(errorMessage = "Connection closed before message could be sent") {
    this.isReady = false;
    const queuedMessages = [...this.queue];
    this.queue = [];
    for (const queued of queuedMessages) {
      queued.reject(new Error(errorMessage));
    }
  }
  clear() {
    const queuedMessages = [...this.queue];
    this.queue = [];
    for (const queued of queuedMessages) {
      queued.reject(new Error("Queue cleared"));
    }
  }
};

// node_modules/@wizardconnect/core/dist/transforms/chunk.js
var CHUNK_EXTENSION_NAME = "chunk";
var CHUNK_EXTENSION_VERSION = 1;
var CHUNK_RAW_BYTES = 3e4;
var CHUNK_REQUIRED_BYTES = 4e4;
var REASSEMBLY_TTL_MS = 12e4;
var SWEEP_INTERVAL_MS = 1e4;
function chunkExtensionAdvertisement() {
  return { version: CHUNK_EXTENSION_VERSION };
}
function peerSupportsChunk(extensions) {
  return !!extensions && extensions[CHUNK_EXTENSION_NAME] !== void 0;
}
function utf8ByteLength(s) {
  return new TextEncoder().encode(s).length;
}
function needsChunking(serialized) {
  return utf8ByteLength(serialized) > CHUNK_REQUIRED_BYTES;
}
function splitIntoChunks(serialized, opts) {
  const msgId = opts?.msgId ?? newMsgId();
  const time = opts?.time ?? Math.floor(Date.now() / 1e3);
  const utf8 = new TextEncoder().encode(serialized);
  const b64 = bytesToBase64(utf8);
  const sliceChars = Math.ceil(CHUNK_RAW_BYTES * 4 / 3);
  const total = Math.max(1, Math.ceil(b64.length / sliceChars));
  const chunks = [];
  for (let i3 = 0; i3 < total; i3++) {
    chunks.push({
      action: RelayMsgAction.Chunk,
      time,
      msgId,
      index: i3,
      total,
      data: b64.slice(i3 * sliceChars, (i3 + 1) * sliceChars)
    });
  }
  return chunks;
}
var ChunkReassembler = class {
  onComplete;
  logActivity;
  now;
  buffers = /* @__PURE__ */ new Map();
  /// msgIds that have already been delivered, kept for a short grace period
  /// so late-arriving duplicate chunks (e.g. cross-subscription replay after
  /// reconnect) don't spawn a second reassembly and double-deliver.
  completed = /* @__PURE__ */ new Map();
  sweeperId = null;
  constructor(onComplete, logActivity = true, now2 = () => Date.now()) {
    this.onComplete = onComplete;
    this.logActivity = logActivity;
    this.now = now2;
  }
  start() {
    if (this.sweeperId !== null)
      return;
    this.sweeperId = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }
  stop() {
    if (this.sweeperId !== null) {
      clearInterval(this.sweeperId);
      this.sweeperId = null;
    }
    this.buffers.clear();
    this.completed.clear();
  }
  /// For tests. Otherwise start() schedules this automatically.
  sweep() {
    const now2 = this.now();
    for (const [id, entry] of this.buffers) {
      if (entry.expiresAt <= now2) {
        this.buffers.delete(id);
        if (this.logActivity) {
          debug(Scope.Relay, `Chunk reassembly timeout: ${id} (${entry.received}/${entry.total} received)`);
        }
      }
    }
    for (const [id, expiresAt] of this.completed) {
      if (expiresAt <= now2)
        this.completed.delete(id);
    }
  }
  /// Ingest one chunk. If this completes the message, onComplete fires.
  /// Duplicate chunks (same msgId/index) are idempotent. Malformed chunks
  /// are dropped silently.
  ingest(chunk) {
    if (this.completed.has(chunk.msgId)) {
      return;
    }
    let entry = this.buffers.get(chunk.msgId);
    if (!entry) {
      entry = {
        total: chunk.total,
        chunks: new Array(chunk.total),
        received: 0,
        expiresAt: this.now() + REASSEMBLY_TTL_MS
      };
      this.buffers.set(chunk.msgId, entry);
    } else if (entry.total !== chunk.total) {
      if (this.logActivity) {
        error(Scope.Relay, `Chunk total mismatch for ${chunk.msgId}: ${chunk.total} vs expected ${entry.total}`);
      }
      return;
    }
    if (entry.chunks[chunk.index] !== void 0) {
      return;
    }
    entry.chunks[chunk.index] = chunk.data;
    entry.received++;
    if (entry.received !== entry.total)
      return;
    this.buffers.delete(chunk.msgId);
    this.completed.set(chunk.msgId, this.now() + REASSEMBLY_TTL_MS);
    let reassembled;
    try {
      const fullB64 = entry.chunks.join("");
      const bytes = base64ToBytes(fullB64);
      const json = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(json);
      if (!isProtocolMessage(parsed)) {
        if (this.logActivity) {
          error(Scope.Relay, `Reassembled chunk msgId=${chunk.msgId} is not a valid ProtocolMessage`);
        }
        return;
      }
      reassembled = parsed;
    } catch (e) {
      if (this.logActivity) {
        error(Scope.Relay, `Chunk reassembly failed for msgId=${chunk.msgId}:`, e);
      }
      return;
    }
    if (this.logActivity) {
      debug(Scope.Relay, `Reassembled chunked message: action=${reassembled.action} chunks=${entry.total}`);
    }
    this.onComplete(reassembled);
  }
  /// Test helper: number of in-flight partial messages.
  get bufferCount() {
    return this.buffers.size;
  }
};
function bytesToBase64(bytes) {
  const CHUNK = 32768;
  let binary = "";
  for (let i3 = 0; i3 < bytes.length; i3 += CHUNK) {
    const slice = bytes.subarray(i3, i3 + CHUNK);
    binary += String.fromCharCode.apply(null, slice);
  }
  return btoa(binary);
}
function base64ToBytes(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i3 = 0; i3 < binary.length; i3++) {
    out[i3] = binary.charCodeAt(i3);
  }
  return out;
}
function newMsgId() {
  const g = globalThis;
  if (g.crypto?.randomUUID)
    return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues)
    cryptoObj.getRandomValues(bytes);
  else
    for (let i3 = 0; i3 < 16; i3++)
      bytes[i3] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// node_modules/@wizardconnect/core/dist/relay-client.js
useWebSocketImplementation(browser_default);
var KIND_GIFT_WRAP = 1059;
var KIND_PRIVATE_DIRECT_MESSAGE = 14;
var RelayClient = class _RelayClient extends import_index.default {
  // Keyed by "walletPubkeyHex:dappPubkeyHex". Persists the high-water mark
  // across RelayClient instance teardowns within the same JS session so that
  // reconnects after an explicit disconnect()+connect() still filter
  // relay-replayed messages from the prior session.
  static sessionTimestamps = /* @__PURE__ */ new Map();
  pool;
  sharedPool;
  pairedPubkeyHex;
  config;
  subscription = null;
  myPubkey;
  myPubkeyHex;
  lastProcessedTimestamp = 0;
  messageQueue;
  readyTimeoutId = null;
  disconnecting = false;
  /// Capability flag: peer advertised support for the `chunk` transport
  /// extension in its dapp_ready / wallet_ready. Set via setPeerCapabilities.
  peerSupportsChunk = false;
  /// Receiver-side reassembly buffer. Always active — if no chunks arrive it
  /// stays empty. Started in connect(), stopped in disconnect().
  reassembler;
  sequence = Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 5e5));
  pendingCalls = /* @__PURE__ */ new Map();
  pendingDeliveries = /* @__PURE__ */ new Map();
  get sessionKey() {
    return this.pairedPubkeyHex ? `${this.myPubkeyHex}:${this.pairedPubkeyHex}` : null;
  }
  constructor(config, pool) {
    super();
    this.config = {
      logNetworkActivity: true,
      ...config
    };
    this.pool = pool ?? new SimplePool({ enablePing: true });
    this.sharedPool = pool !== void 0;
    this.messageQueue = new MessageQueue({
      logActivity: this.config.logNetworkActivity
    });
    this.reassembler = new ChunkReassembler((msg) => this.handleRelayMessage(msg), !!this.config.logNetworkActivity);
    this.myPubkey = unwrap(secp256k12.derivePublicKeyCompressed(this.config.signerPrivateKey));
    this.myPubkeyHex = deriveNostrPublicKey(this.config.signerPrivateKey);
    if (this.config.pairedPublicKey) {
      const pairedNostrPubkey = this.config.pairedPublicKey.length === 33 ? this.config.pairedPublicKey.slice(1) : this.config.pairedPublicKey;
      this.pairedPubkeyHex = binToHex(pairedNostrPubkey);
    } else {
      this.pairedPubkeyHex = "";
    }
    const saved = this.sessionKey ? _RelayClient.sessionTimestamps.get(this.sessionKey) : void 0;
    if (saved)
      this.lastProcessedTimestamp = saved;
  }
  setPairedPublicKey(pairedPublicKey) {
    this.config.pairedPublicKey = pairedPublicKey;
    const pairedNostrPubkey = pairedPublicKey.length === 33 ? pairedPublicKey.slice(1) : pairedPublicKey;
    this.pairedPubkeyHex = binToHex(pairedNostrPubkey);
    const saved = _RelayClient.sessionTimestamps.get(this.sessionKey);
    if (saved && saved > this.lastProcessedTimestamp) {
      this.lastProcessedTimestamp = saved;
    }
    this.emit("paired");
  }
  /// Set transport-level capability flags based on the peer's advertisement in
  /// its dapp_ready / wallet_ready `extensions` field. Called by the connection
  /// manager after the handshake. New capability keys are additive — callers
  /// may omit any they don't set.
  setPeerCapabilities(caps) {
    if (caps.chunk !== void 0) {
      this.peerSupportsChunk = caps.chunk;
    }
  }
  getPublicKey() {
    return this.myPubkey;
  }
  getPublicKeyHex() {
    return this.myPubkeyHex;
  }
  isKeyExchangeComplete() {
    if (!this.config.pairedPublicKey) {
      return false;
    }
    return !this.config.pairedPublicKey.every((byte) => byte === 0);
  }
  emitDisconnect(error2) {
    if (this.disconnecting)
      return;
    this.disconnecting = true;
    this.emit("disconnect", error2);
  }
  async connect() {
    if (this.config.logNetworkActivity) {
      debug(Scope.Relay, `Connecting to relay...`);
    }
    this.disconnecting = false;
    this.reassembler.start();
    if (this.lastProcessedTimestamp === 0) {
      this.lastProcessedTimestamp = Math.floor(Date.now() / 1e3) - 2;
    }
    try {
      this.subscription = this.pool.subscribeMany(this.config.explicitRelayUrls, { kinds: [KIND_GIFT_WRAP], "#p": [this.myPubkeyHex] }, {
        onevent: (event) => this.handleWrappedEvent(event),
        oneose: () => {
          if (this.readyTimeoutId) {
            clearTimeout(this.readyTimeoutId);
            this.readyTimeoutId = null;
          }
          if (this.config.logNetworkActivity) {
            debug(Scope.Relay, `EOSE received, relay connected`);
          }
          this.messageQueue.setReady((msg) => this.publishMessage(msg));
          this.emit("connection");
        },
        onclose: (reasons) => {
          if (this.config.logNetworkActivity) {
            debug(Scope.Relay, `Subscription closed: ${reasons.join(", ")}`);
          }
          this.emitDisconnect(new Error("Subscription closed"));
        }
      });
      this.readyTimeoutId = setTimeout(() => {
        if (!this.messageQueue.getReady()) {
          if (this.config.logNetworkActivity) {
            debug(Scope.Relay, `EOSE timeout, assuming ready`);
          }
          this.messageQueue.setReady((msg) => this.publishMessage(msg));
          this.emit("connection");
        }
        this.readyTimeoutId = null;
      }, 5e3);
      if (this.config.logNetworkActivity) {
        debug(Scope.Relay, `Subscription created, waiting for relay connection`);
      }
    } catch (error2) {
      if (this.config.logNetworkActivity) {
        error(Scope.Relay, `Connection failed:`, error2);
      }
      throw error2;
    }
  }
  async disconnect() {
    this.lastProcessedTimestamp = Math.floor(Date.now() / 1e3);
    const key = this.sessionKey;
    if (key)
      _RelayClient.sessionTimestamps.set(key, this.lastProcessedTimestamp);
    this.messageQueue.setNotReady();
    this.reassembler.stop();
    if (this.readyTimeoutId) {
      clearTimeout(this.readyTimeoutId);
      this.readyTimeoutId = null;
    }
    if (this.subscription) {
      this.subscription.close();
      this.subscription = null;
    }
    if (!this.sharedPool) {
      this.pool.close(this.config.explicitRelayUrls);
    }
  }
  getLastProcessedTimestamp() {
    return this.lastProcessedTimestamp;
  }
  setLastProcessedTimestamp(timestamp) {
    this.lastProcessedTimestamp = timestamp;
  }
  async relay(message) {
    if (!this.config.pairedPublicKey) {
      throw new Error("Cannot relay message: paired public key not set. Call setPairedPublicKey() first.");
    }
    if (!this.messageQueue.getReady()) {
      return this.messageQueue.enqueue(message);
    }
    return this.publishMessage(message);
  }
  async publishMessage(message) {
    const serialized = JSON.stringify(message);
    if (!needsChunking(serialized)) {
      return this.publishSerialized(message.action, serialized);
    }
    if (!this.peerSupportsChunk) {
      const err = new Error(`Cannot send ${message.action}: message is larger than NIP-44's 65,535-byte ceiling and the peer does not advertise the 'chunk' transport extension. Please update the connected wallet/dapp to a version that supports chunked messages.`);
      if (this.config.logNetworkActivity) {
        error(Scope.Relay, err.message);
      }
      throw err;
    }
    const chunks = splitIntoChunks(serialized);
    if (this.config.logNetworkActivity) {
      debug(Scope.Relay, `Chunking ${message.action}: ${chunks.length} chunks (serialized ~${serialized.length} bytes)`);
    }
    for (const chunk of chunks) {
      await this.publishSerialized(`${message.action}[chunk ${chunk.index + 1}/${chunk.total}]`, JSON.stringify(chunk));
    }
  }
  /// Wrap and publish one gift-wrap event. Used for both unchunked messages
  /// and individual chunks. `displayAction` is only used for logs.
  async publishSerialized(displayAction, serialized) {
    this.netlog("send", displayAction);
    const wrapped = wrapEvent({
      kind: KIND_PRIVATE_DIRECT_MESSAGE,
      content: serialized,
      created_at: Math.floor(Date.now() / 1e3),
      tags: [["p", this.pairedPubkeyHex]]
    }, this.config.signerPrivateKey, this.pairedPubkeyHex);
    const results = await Promise.allSettled(this.pool.publish(this.config.explicitRelayUrls, wrapped));
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    if (rejected.length > 0 && this.config.logNetworkActivity) {
      for (const r of rejected) {
        error(Scope.Relay, `Failed to publish ${displayAction} to a relay:`, r.reason);
      }
    }
    if (fulfilled.length === 0) {
      const error2 = new Error(`Failed to publish ${displayAction} to all relays`);
      if (this.config.logNetworkActivity) {
        error(Scope.Relay, error2.message);
      }
      this.emitDisconnect(error2);
      throw error2;
    }
    if (this.config.logNetworkActivity) {
      debug(Scope.Relay, `Published message ${displayAction} to ${fulfilled.length}/${results.length} relay(s)`);
    }
  }
  handleWrappedEvent(wrappedEvent) {
    try {
      const rumor = unwrapEvent(wrappedEvent, this.config.signerPrivateKey);
      if (rumor.kind !== KIND_PRIVATE_DIRECT_MESSAGE) {
        if (this.config.logNetworkActivity) {
          debug(Scope.Relay, `Ignoring non-PrivateDirectMessage, kind: ${rumor.kind}`);
        }
        return;
      }
      let payload;
      try {
        payload = JSON.parse(rumor.content);
      } catch (e) {
        if (this.config.logNetworkActivity) {
          error(Scope.Relay, "Failed to parse message content as JSON:", e);
        }
        return;
      }
      this.routeIncoming(payload, rumor.pubkey);
    } catch (error2) {
      if (this.config.logNetworkActivity) {
        error(Scope.Relay, "Error handling incoming message:", error2);
      }
      this.emitError(error2);
    }
  }
  /// Apply timestamp dedup + peer filter, then dispatch to chunk reassembly
  /// or the application-level handler. Called from handleWrappedEvent (one
  /// path: unwrap → route). Kept separate to keep handleWrappedEvent focused
  /// on decryption and to allow future transport-layer transforms to invoke
  /// this path with already-decoded payloads.
  routeIncoming(payload, fromPubkey) {
    if (!payload.time || this.lastProcessedTimestamp > 0 && payload.time < this.lastProcessedTimestamp) {
      if (this.config.logNetworkActivity) {
        debug(Scope.Relay, `Ignoring already-processed message (time: ${payload.time}, action: ${payload.action}, last processed: ${this.lastProcessedTimestamp})`);
      }
      return;
    }
    if (payload.time > this.lastProcessedTimestamp) {
      this.lastProcessedTimestamp = payload.time;
      const key = this.sessionKey;
      if (key)
        _RelayClient.sessionTimestamps.set(key, this.lastProcessedTimestamp);
    }
    const isKeyExchangeMessage = payload.action === RelayMsgAction.WalletReady;
    if (!isKeyExchangeMessage && this.config.pairedPublicKey) {
      const pairedNostrPubkey = this.config.pairedPublicKey.length === 33 ? binToHex(this.config.pairedPublicKey.slice(1)) : binToHex(this.config.pairedPublicKey);
      if (fromPubkey !== pairedNostrPubkey) {
        if (this.config.logNetworkActivity) {
          debug(Scope.Relay, `Ignoring '${payload.action}' message from unknown peer: ${fromPubkey} (expected: ${pairedNostrPubkey})`);
        }
        return;
      }
    }
    if (isChunkMessage(payload)) {
      if (this.config.logNetworkActivity) {
        debug(Scope.Relay, `Received chunk ${payload.index + 1}/${payload.total} (msgId=${payload.msgId})`);
      }
      this.reassembler.ingest(payload);
      return;
    }
    if (this.config.logNetworkActivity) {
      debug(Scope.Relay, `Received message ${payload.action} from relay`);
    }
    this.handleRelayMessage(payload);
  }
  isConnected() {
    return this.subscription !== null;
  }
  netlog(direction, what, sequence) {
    if (!this.config.logNetworkActivity) {
      return;
    }
    const us = binToHex(hash256(this.config.signerPrivateKey)).slice(-6);
    const them = this.config.pairedPublicKey ? binToHex(this.config.pairedPublicKey).slice(-6) : "??????";
    const pending = `c${this.pendingCalls.size} d${this.pendingDeliveries.size}`;
    if (direction === "send") {
      debug(Scope.Relay, `net [${sequence ?? "?"} ${pending}] ${us} -> ${them}: ${what}`);
    } else {
      debug(Scope.Relay, `net [${sequence ?? "?"} ${pending}] ${us} <- ${them}: ${what}`);
    }
  }
  async handleRelayMessage(message) {
    throwUnless(isProtocolMessage(message), `Invalid protocol message: ${message}`);
    this.emit("message", message);
  }
  nextSequence() {
    const current = this.sequence;
    this.sequence += 2;
    return current;
  }
  emitError(error2) {
    this.emit("error", error2);
  }
};

// node_modules/@wizardconnect/core/dist/connection-manager.js
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var createConnectionManager = (client, callbacks, events, options = {}) => {
  const { reconnectInterval = 5e3, maxReconnectAttempts = Infinity, enableVisibilityHandling = true, scope = Scope.Network, onVisibilityChange } = options;
  let isPaused = false;
  let reconnectLoop = null;
  let visibilityChangeHandler = null;
  const triggerReconnect = (reason) => {
    if (!isPaused) {
      callbacks.onReconnecting(client, reason);
      reconnectLoop = null;
      startConnectionLoop();
    }
  };
  const onConnected = () => callbacks.onConnected(client);
  client.on(events.connected, onConnected);
  const onDisconnected = (...args) => {
    const err = args[0] instanceof Error ? args[0].message : null;
    debug(scope, "Disconnected event received", err);
    triggerReconnect(err);
  };
  const onError = (err) => {
    const errorMsg = err?.message || String(err);
    debug(scope, "Error event received", errorMsg);
    triggerReconnect(errorMsg);
    if (callbacks.onError) {
      callbacks.onError(client, err);
    }
  };
  client.on(events.disconnected, onDisconnected);
  if (events.error) {
    client.on(events.error, onError);
  }
  const setupVisibilityHandling = () => {
    if (typeof document === "undefined") {
      return;
    }
    visibilityChangeHandler = () => {
      const state = document.visibilityState;
      if (onVisibilityChange) {
        const context = {
          client,
          state,
          setPaused: (value) => {
            isPaused = value;
          },
          isPaused: () => isPaused,
          startConnectionLoop
        };
        (async () => {
          try {
            await onVisibilityChange(context);
          } catch (err) {
            debug(scope, "Error in custom visibility change handler:", err);
          }
        })();
        return;
      }
      if (state === "hidden") {
        isPaused = true;
        (async () => {
          try {
            await client.disconnect();
            callbacks.onDisconnected(client);
          } catch (err) {
            debug(scope, "Error disconnecting on visibility change:", err);
          }
        })();
      } else if (state === "visible") {
        if (isPaused) {
          isPaused = false;
          startConnectionLoop();
        }
      }
    };
    document.addEventListener("visibilitychange", visibilityChangeHandler);
  };
  const startConnectionLoop = () => {
    if (reconnectLoop) {
      return;
    }
    reconnectLoop = (async () => {
      let reconnectAttempts = 0;
      let wasConnected = false;
      while (true) {
        if (isPaused) {
          await sleep(1e3);
          continue;
        }
        try {
          await client.connect();
          reconnectAttempts = 0;
          wasConnected = true;
          reconnectLoop = null;
          return;
        } catch (e) {
          reconnectAttempts++;
          if (wasConnected || reconnectAttempts === 1) {
            callbacks.onReconnecting(client, `${e}`);
            wasConnected = false;
          }
          if (reconnectAttempts > maxReconnectAttempts) {
            callbacks.onDisconnected(client);
            reconnectLoop = null;
            return;
          }
          try {
            await client.disconnect();
          } catch (disconnectError) {
            debug(scope, "Failed to disconnect client", disconnectError);
          }
          await sleep(reconnectInterval);
        }
      }
    })();
  };
  if (enableVisibilityHandling) {
    setupVisibilityHandling();
  }
  const cleanup = async () => {
    isPaused = true;
    if (typeof document !== "undefined" && visibilityChangeHandler !== null) {
      document.removeEventListener("visibilitychange", visibilityChangeHandler);
    }
    client.off(events.connected, onConnected);
    client.off(events.disconnected, onDisconnected);
    if (events.error) {
      client.off(events.error, onError);
    }
    callbacks.onDisconnected(client);
    try {
      await client.disconnect();
    } catch (e) {
      debug(scope, "Failed to disconnect client during cleanup", e);
    }
  };
  return {
    cleanup,
    startConnectionLoop
  };
};

// node_modules/@wizardconnect/core/dist/relay-handler.js
var RelayStatus = class _RelayStatus {
  status;
  error;
  sessionId;
  constructor(status, error2, sessionId = null) {
    this.status = status;
    this.error = error2;
    this.sessionId = sessionId;
  }
  static connected(sessionId) {
    return new _RelayStatus("connected", null, sessionId || null);
  }
  static reconnecting(reason, sessionId) {
    return new _RelayStatus("reconnecting", reason, sessionId || null);
  }
  static disconnected() {
    return new _RelayStatus("disconnected", null, null);
  }
  static sessionDeleted() {
    return new _RelayStatus("session_deleted", null, null);
  }
};
var initiateRelay = (dispatchCallback, signerPrivateKey, pairPublicKey, options) => {
  const client = new RelayClient({
    explicitRelayUrls: options?.explicitRelayUrls ?? [],
    signerPrivateKey,
    pairedPublicKey: pairPublicKey
  });
  let lastProcessedTimestamp = 0;
  const connectionManager = createConnectionManager(client, {
    onConnected: () => {
      if (lastProcessedTimestamp > 0) {
        client.setLastProcessedTimestamp(lastProcessedTimestamp);
      } else {
        lastProcessedTimestamp = client.getLastProcessedTimestamp();
      }
      dispatchCallback({
        client,
        status: RelayStatus.connected()
      });
    },
    onReconnecting: (_client, reason) => {
      dispatchCallback({
        client,
        status: RelayStatus.reconnecting(reason)
      });
    },
    onDisconnected: () => {
      dispatchCallback({
        client,
        status: RelayStatus.disconnected()
      });
    },
    onError: (_client, _error) => {
    }
  }, {
    connected: "connection",
    disconnected: "disconnect",
    error: "error"
  }, {
    reconnectInterval: options?.reconnectInterval,
    maxReconnectAttempts: options?.maxReconnectAttempts,
    enableVisibilityHandling: options?.enableVisibilityHandling ?? true,
    scope: Scope.Relay,
    onVisibilityChange: async (context) => {
      if (context.state === "hidden") {
        debug(Scope.Relay, "Page hidden, disconnecting relay");
        context.setPaused(true);
        try {
          await client.disconnect();
          lastProcessedTimestamp = client.getLastProcessedTimestamp();
          debug(Scope.Relay, `Disconnected, last processed timestamp: ${lastProcessedTimestamp}`);
          dispatchCallback({
            client,
            status: RelayStatus.disconnected()
          });
        } catch (error2) {
          error(Scope.Relay, "Error disconnecting on visibility change:", error2);
        }
      } else if (context.state === "visible") {
        if (context.isPaused()) {
          debug(Scope.Relay, "Page visible, reconnecting relay");
          context.setPaused(false);
          context.startConnectionLoop();
        }
      }
    }
  });
  connectionManager.startConnectionLoop();
  return () => {
    dispatchCallback({
      client,
      status: RelayStatus.disconnected()
    });
    (async () => {
      try {
        await connectionManager.cleanup();
      } catch {
      }
    })();
  };
};

// node_modules/@wizardconnect/core/dist/key-exchange.js
var DEFAULT_RELAY_HOSTNAME = "relay.riften.net";
var DEFAULT_RELAY_PORT = 443;
var DEFAULT_RELAY_PROTOCOL = "wss";
var DEFAULT_RELAY_URLS = [
  "wss://relay.riften.net:443",
  "wss://relay.cauldron.quest:443"
];
function generateKeyExchangeCredentials() {
  const privateKey = generatePrivateKey();
  const privateKeyHex = binToHex(privateKey);
  const publicKeyHex = deriveNostrPublicKey(privateKey);
  const secretBytes = generatePrivateKey();
  const secretShort = secretBytes.slice(0, 8);
  const secret = binToHex(secretShort);
  return {
    privateKey: privateKeyHex,
    publicKey: publicKeyHex,
    secret
  };
}
function encodeKeyExchangeURI(publicKey, secret, options = {}) {
  const publicKeyBin = hexToBin(publicKey);
  const secretBin = hexToBin(secret);
  if (publicKeyBin.length !== 32) {
    throw new Error(`Invalid public key length: expected 32 bytes, got ${publicKeyBin.length}`);
  }
  if (secretBin.length !== 8) {
    throw new Error(`Invalid secret length: expected 8 bytes, got ${secretBin.length}`);
  }
  const publicKeyBech32 = binToBech32Padded(publicKeyBin).toLowerCase();
  const secretBech32 = binToBech32Padded(secretBin).toLowerCase();
  const hostname = options.hostname || DEFAULT_RELAY_HOSTNAME;
  const port = options.port ?? DEFAULT_RELAY_PORT;
  const protocol = options.protocol || DEFAULT_RELAY_PROTOCOL;
  const isDefaultHostname = hostname === DEFAULT_RELAY_HOSTNAME;
  const defaultPort = protocol === "wss" ? 443 : 80;
  const isDefaultPort = port === defaultPort;
  const isDefaultProtocol = protocol === DEFAULT_RELAY_PROTOCOL;
  let uri;
  if (isDefaultHostname && isDefaultPort && isDefaultProtocol) {
    uri = `wiz://?p=${publicKeyBech32}&s=${secretBech32}`;
  } else {
    const portPart = isDefaultPort ? "" : `:${port}`;
    const authority = `${hostname}${portPart}`;
    uri = `wiz://${authority}?p=${publicKeyBech32}&s=${secretBech32}`;
    if (!isDefaultProtocol) {
      uri += `&pr=${protocol}`;
    }
  }
  const qrUri = uri.toUpperCase().replace("?", "%3F").replace(/=/g, "%3D").replace(/&/g, "%26");
  return { uri, qrUri };
}

// node_modules/@wizardconnect/core/dist/dapp-relay.js
function initiateDappRelay(statusCallback, options = {}) {
  const events = new import_index.default();
  let credentials;
  let dappPrivateKey;
  if (options.existingCredentials) {
    const privateKeyHex = options.existingCredentials.privateKey;
    if (privateKeyHex.length !== 64) {
      throw new Error("Private key must be 64 hex characters (32 bytes)");
    }
    dappPrivateKey = hexToBin(privateKeyHex);
    const dappPublicKeyHex = deriveNostrPublicKey(dappPrivateKey);
    credentials = {
      privateKey: privateKeyHex,
      publicKey: dappPublicKeyHex,
      secret: options.existingCredentials.secret
    };
  } else {
    credentials = generateKeyExchangeCredentials();
    dappPrivateKey = hexToBin(credentials.privateKey);
  }
  let uriOptions = {};
  if (options.explicitRelayUrls && options.explicitRelayUrls.length > 0) {
    const relayUrl = options.explicitRelayUrls[0];
    const hostMatch = relayUrl.match(/^wss?:\/\/([^:/]+)/);
    const portMatch = relayUrl.match(/:(\d+)/);
    if (hostMatch) {
      uriOptions.hostname = hostMatch[1];
    }
    if (portMatch) {
      uriOptions.port = parseInt(portMatch[1], 10);
    }
    if (relayUrl.startsWith("wss://")) {
      uriOptions.protocol = "wss";
    } else if (relayUrl.startsWith("ws://")) {
      uriOptions.protocol = "ws";
    }
  }
  const { uri, qrUri } = encodeKeyExchangeURI(credentials.publicKey, credentials.secret, uriOptions);
  let relayClient = null;
  let keyExchanged = false;
  let walletPublicKeyNostr = null;
  if (options.existingCredentials) {
    walletPublicKeyNostr = hexToBin(options.existingCredentials.walletPublicKey);
    keyExchanged = true;
  }
  const wrappedCallback = (payload) => {
    if (!relayClient) {
      relayClient = payload.client;
      relayClient.on("message", async (message) => {
        if (message.action === RelayMsgAction.WalletReady) {
          const walletReady = message;
          if (walletReady.secret !== credentials.secret) {
            if (!keyExchanged) {
              error(Scope.Relay, "Key exchange failed: secret mismatch");
            }
            return;
          }
          const receivedWalletKey = hexToBin(walletReady.public_key);
          if (receivedWalletKey.length !== 32) {
            error(Scope.Relay, "Invalid wallet public key length");
            return;
          }
          if (keyExchanged && walletPublicKeyNostr) {
            if (binToHex(receivedWalletKey) !== binToHex(walletPublicKeyNostr)) {
              warn(Scope.Relay, "Different wallet connected (different public key)");
            }
          }
          walletPublicKeyNostr = receivedWalletKey;
          relayClient.setPairedPublicKey(receivedWalletKey);
          if (!keyExchanged) {
            keyExchanged = true;
            events.emit("keyexchangecomplete", receivedWalletKey);
          }
        }
      });
    }
    if (payload.status.status === "connected") {
      if (walletPublicKeyNostr && relayClient) {
        relayClient.setPairedPublicKey(walletPublicKeyNostr);
        keyExchanged = true;
      }
    }
    statusCallback(payload);
  };
  const relayUrls = options.explicitRelayUrls && options.explicitRelayUrls.length > 0 ? options.explicitRelayUrls : [...DEFAULT_RELAY_URLS];
  const cleanup = initiateRelay(wrappedCallback, dappPrivateKey, walletPublicKeyNostr ?? new Uint8Array(33), {
    explicitRelayUrls: relayUrls,
    reconnectInterval: options.reconnectInterval,
    maxReconnectAttempts: options.maxReconnectAttempts
  });
  return {
    client: relayClient,
    uri,
    qrUri,
    credentials,
    events,
    cleanup
  };
}

// node_modules/@wizardconnect/core/dist/protocols/base.js
var DisconnectReason;
(function(DisconnectReason2) {
  DisconnectReason2["ProtocolMismatch"] = "protocol_mismatch";
  DisconnectReason2["UserDisconnect"] = "user_disconnect";
})(DisconnectReason || (DisconnectReason = {}));

// node_modules/@wizardconnect/dapp/dist/pubkey-state-manager.js
var DappPubkeyStateManager = class {
  // xpub nodes for on-demand pubkey derivation
  xpubNodes = /* @__PURE__ */ new Map();
  /** Derive a pubkey on demand from the stored xpub node. */
  getPubkey(childIndex, index) {
    const xpubNode = this.xpubNodes.get(childIndex);
    if (!xpubNode)
      return void 0;
    const child = deriveHdPublicNodeChild(xpubNode, Number(index));
    if (typeof child === "string")
      return void 0;
    return child.publicKey;
  }
  /** Returns true if an xpub node is available for this child index. */
  hasPath(childIndex) {
    return this.xpubNodes.has(childIndex);
  }
  setXpubNode(childIndex, node) {
    this.xpubNodes.set(childIndex, node);
  }
  getXpubNode(childIndex) {
    return this.xpubNodes.get(childIndex);
  }
};

// node_modules/@wizardconnect/dapp/dist/session.js
function defaultStorage() {
  if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function")
    return localStorage;
  return null;
}
function resolveStorage(storage) {
  return storage ?? defaultStorage();
}
var DEFAULT_SESSION_KEY = "wizardconnect-session";
function loadSession(key = DEFAULT_SESSION_KEY, storage) {
  const s = resolveStorage(storage);
  if (!s)
    return null;
  const raw = s.getItem(key);
  if (!raw)
    return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.privateKey || !parsed.secret)
      return null;
    return parsed;
  } catch {
    return null;
  }
}
function saveSession(key = DEFAULT_SESSION_KEY, data, storage) {
  const s = resolveStorage(storage);
  if (!s)
    return;
  const existing = loadSession(key, s);
  const merged = { ...existing, ...data };
  s.setItem(key, JSON.stringify(merged));
}
function clearSession(key = DEFAULT_SESSION_KEY, storage) {
  const s = resolveStorage(storage);
  if (!s)
    return;
  s.removeItem(key);
}

// node_modules/@wizardconnect/dapp/dist/dapp-connection-manager.js
var DappConnectionManager = class extends import_index.default {
  dappName;
  dappIcon;
  conn = null;
  listenerAttached = false;
  /** Pubkey state — exposed for callers that need to query by index. */
  pubkeyState;
  walletName = null;
  walletIcon = null;
  protocol = null;
  /** Protocols this dapp supports, in preference order. */
  supportedProtocols = [PROTOCOL_NAME];
  walletDiscovered = false;
  disconnectGraceTimer = null;
  pingInterval = null;
  /** Timestamp (ms) of the last pong or wallet_ready received. Used for liveness detection. */
  lastPongTime = 0;
  sessionPaths = [];
  pendingSignatureRequests = /* @__PURE__ */ new Map();
  sessionOptions = null;
  /**
   * @param dappName  Optional display name of the dapp (sent in dapp_ready).
   * @param dappIcon  Optional icon URL/data-URI of the dapp (sent in dapp_ready).
   * @param options   Optional configuration. Session persistence is enabled by
   *                  default (key: "wizardconnect-session", storage: localStorage).
   *                  Pass `session: false` to disable.
   */
  constructor(dappName, dappIcon, options) {
    super();
    this.dappName = dappName;
    this.dappIcon = dappIcon;
    this.pubkeyState = new DappPubkeyStateManager();
    if (options?.session !== false) {
      const sessionConf = options?.session ?? {};
      this.sessionOptions = {
        key: sessionConf.key ?? DEFAULT_SESSION_KEY,
        storage: sessionConf.storage
      };
      const stored = loadSession(this.sessionOptions.key, this.sessionOptions.storage);
      if (stored) {
        if (stored.walletName)
          this.walletName = stored.walletName;
        if (stored.walletIcon)
          this.walletIcon = stored.walletIcon;
        if (stored.paths?.length) {
          try {
            this.restoreSessionPaths(stored.paths);
          } catch {
          }
        }
      }
    }
  }
  // --- Session persistence (public API) ----------------------------------------
  /**
   * Attach a relay result from `initiateDappRelay()`. Automatically:
   * - Saves relay credentials (privateKey, secret) to the session
   * - Listens for `keyexchangecomplete` and saves the wallet public key
   *
   * No-op if session persistence is disabled.
   */
  attachRelay(relay) {
    if (!this.sessionOptions)
      return;
    saveSession(this.sessionOptions.key, {
      privateKey: relay.credentials.privateKey,
      secret: relay.credentials.secret
    }, this.sessionOptions.storage);
    relay.events.on("keyexchangecomplete", (walletPublicKey) => {
      if (!this.sessionOptions)
        return;
      saveSession(this.sessionOptions.key, { walletPublicKey: binToHex(walletPublicKey) }, this.sessionOptions.storage);
    });
  }
  /**
   * Load the stored session (e.g. for reconnection).
   * Returns null if session persistence is disabled or no session exists.
   */
  loadStoredSession() {
    if (!this.sessionOptions)
      return null;
    return loadSession(this.sessionOptions.key, this.sessionOptions.storage);
  }
  /**
   * Clear the stored session. Call on disconnect.
   * No-op if session persistence is disabled.
   */
  clearStoredSession() {
    if (!this.sessionOptions)
      return;
    clearSession(this.sessionOptions.key, this.sessionOptions.storage);
  }
  // --- Relay connection -------------------------------------------------------
  /**
   * Call this from the RelayStatusCallback passed to `initiateDappRelay`.
   * Attaches the message listener exactly once and re-sends dapp_ready
   * each time the connection is established (handles reconnects).
   */
  updateConnection(client, status) {
    if (client) {
      if (!this.listenerAttached) {
        this.listenerAttached = true;
        client.on("message", (msg) => this.handleMessage(msg));
      }
      this.conn = client;
    }
    if (status.status === "connected" && this.conn) {
      this.onConnected();
    } else if (status.status === "reconnecting" || status.status === "disconnected") {
      this.stopPingInterval();
      if (status.status === "reconnecting") {
        this.emit("reconnecting");
      }
    }
  }
  isWalletDiscovered() {
    return this.walletDiscovered;
  }
  /**
   * Get a sequence number from the relay client.
   * Use this to populate the `sequence` field of a SignTransactionRequest.
   */
  nextSequence() {
    if (!this.conn)
      throw new Error("[wizardconnect/dapp] Not connected");
    return this.conn.nextSequence();
  }
  /**
   * Send a sign transaction request and wait for the wallet's response.
   * The caller is responsible for creating the full SignTransactionRequest
   * (including sequence from `nextSequence()`).
   */
  async sendSignRequest(request) {
    if (!this.conn)
      throw new Error("[wizardconnect/dapp] Not connected");
    return new Promise((resolve, reject) => {
      this.pendingSignatureRequests.set(request.sequence, {
        request,
        resolve,
        reject
      });
      this.conn.relay(request).then(() => {
        this.emit("messagesent", request);
      }).catch((err) => {
        this.pendingSignatureRequests.delete(request.sequence);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }
  /**
   * Cancel an in-flight sign request.
   * Immediately rejects the pending Promise and sends sign_cancel to the wallet.
   */
  async sendSignCancel(sequence, reason) {
    const handlers = this.pendingSignatureRequests.get(sequence);
    if (handlers) {
      this.pendingSignatureRequests.delete(sequence);
      handlers.reject(new Error(reason ?? "Sign request cancelled"));
    }
    if (!this.conn)
      return;
    const msg = {
      action: RelayMsgAction.SignCancel,
      sequence,
      ...reason !== void 0 && { reason },
      time: Math.floor(Date.now() / 1e3)
    };
    await this.conn.relay(msg);
    this.emit("messagesent", msg);
  }
  /**
   * Send a disconnect message to the wallet (courtesy notification).
   * The caller is responsible for calling dappRelay.cleanup() afterwards.
   */
  async sendDisconnect(message) {
    if (!this.conn)
      return;
    const msg = {
      action: RelayMsgAction.Disconnect,
      reason: DisconnectReason.UserDisconnect,
      time: Math.floor(Date.now() / 1e3),
      ...message !== void 0 && { message }
    };
    await this.conn.relay(msg);
    this.emit("messagesent", msg);
  }
  /**
   * Convenience method: build and send a sign transaction request.
   * Auto-fills `action`, `sequence`, and `time`. Supports cancellation via
   * AbortSignal — when aborted, sendSignCancel is called automatically.
   */
  async signTransaction(request, options) {
    const sequence = this.nextSequence();
    const fullRequest = {
      action: RelayMsgAction.SignTransactionRequest,
      time: Math.floor(Date.now() / 1e3),
      sequence,
      ...request
    };
    const signPromise = this.sendSignRequest(fullRequest);
    if (!options?.signal)
      return signPromise;
    signPromise.catch(() => {
    });
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const reason = options.signal.reason instanceof Error ? options.signal.reason.message : typeof options.signal.reason === "string" ? options.signal.reason : "Sign request cancelled";
        this.sendSignCancel(sequence, reason).catch(() => {
        });
        reject(new DOMException(reason, "AbortError"));
      };
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
      signPromise.then(resolve).catch(reject).finally(() => {
        options.signal.removeEventListener("abort", onAbort);
      });
    });
  }
  // --- Pubkey state delegation ------------------------------------------------
  // Convenience methods that forward to pubkeyState.
  getPubkey(childIndex, index) {
    return this.pubkeyState.getPubkey(childIndex, index);
  }
  /** Returns true if an xpub node is available for this child index. */
  hasPath(childIndex) {
    return this.pubkeyState.hasPath(childIndex);
  }
  /**
   * Returns the stored xpub node for the given child index.
   * Available after wallet_ready is received.
   */
  getXpubNode(childIndex) {
    return this.pubkeyState.getXpubNode(childIndex);
  }
  /**
   * Returns the raw PathXpub entries received from the wallet.
   * Available after wallet_ready is received.
   */
  getSessionPaths() {
    return [...this.sessionPaths];
  }
  /**
   * Restore session paths from a previous session (e.g. from localStorage).
   * Decodes xpub strings and populates pubkeyState so getPubkey() works
   * without waiting for wallet_ready.
   */
  restoreSessionPaths(paths) {
    this.sessionPaths = [...paths];
    for (const pathInfo of paths) {
      const decoded = decodeHdPublicKey(pathInfo.xpub);
      if (typeof decoded === "string") {
        throw new Error(`[wizardconnect/dapp] Invalid xpub for path "${pathInfo.name}": ${decoded}`);
      }
      const ci = childIndexOfPathName(pathInfo.name);
      if (ci !== void 0) {
        this.pubkeyState.setXpubNode(ci, decoded.node);
      }
    }
  }
  // --- Private protocol handling -------------------------------------------
  onConnected() {
    (async () => {
      const deadline = Date.now() + 3e4;
      while (this.conn && !this.conn.isKeyExchangeComplete()) {
        if (Date.now() >= deadline) {
          console.error("[wizardconnect/dapp] Key exchange timed out");
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!this.conn)
        return;
      await this.pushDappReady();
    })().catch((e) => console.error("[wizardconnect/dapp] Error in onConnected:", e));
  }
  startPingInterval() {
    this.stopPingInterval();
    this.lastPongTime = Date.now();
    this.pingInterval = setInterval(() => {
      if (!this.conn || !this.walletDiscovered)
        return;
      if (Date.now() - this.lastPongTime > 75e3) {
        this.stopPingInterval();
        this.emit("reconnecting");
        return;
      }
      const ping = {
        action: RelayMsgAction.Ping,
        time: Math.floor(Date.now() / 1e3)
      };
      this.conn.relay(ping).catch(() => {
      });
    }, 1e4);
  }
  stopPingInterval() {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  destroy() {
    this.stopPingInterval();
    if (this.disconnectGraceTimer !== null) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
  }
  async pushDappReady() {
    if (!this.conn)
      return;
    const msg = {
      action: RelayMsgAction.DappReady,
      supported_protocols: this.supportedProtocols,
      wallet_discovered: this.walletDiscovered,
      time: Math.floor(Date.now() / 1e3),
      // Include selected_protocol on the reactive send (after the dapp has seen the wallet)
      ...this.walletDiscovered && this.protocol && { selected_protocol: this.protocol },
      ...this.dappName !== void 0 && { dapp_name: this.dappName },
      ...this.dappIcon !== void 0 && { dapp_icon: this.dappIcon },
      // Transport-level: advertise chunking so the wallet can send large
      // SignTransactionResponses (signed tx hex can reach ~2 MB) that exceed
      // NIP-44's plaintext ceiling.
      extensions: { chunk: chunkExtensionAdvertisement() }
    };
    await this.conn.relay(msg);
    this.emit("messagesent", msg);
  }
  handleMessage(msg) {
    this.emit("messagereceived", msg);
    switch (msg.action) {
      case RelayMsgAction.WalletReady:
        this.handleWalletReady(msg).catch((e) => console.error("[wizardconnect/dapp] Error handling wallet_ready:", e));
        break;
      case RelayMsgAction.SignTransactionResponse:
        this.handleSignTransactionResponse(msg);
        break;
      case RelayMsgAction.Disconnect:
        this.handleRemoteDisconnect(msg);
        break;
      case RelayMsgAction.Pong:
        this.lastPongTime = Date.now();
        break;
      case RelayMsgAction.DappReady:
        break;
      default:
        break;
    }
  }
  handleRemoteDisconnect(msg) {
    if (this.disconnectGraceTimer !== null) {
      clearTimeout(this.disconnectGraceTimer);
    }
    this.disconnectGraceTimer = setTimeout(() => {
      this.disconnectGraceTimer = null;
      this.stopPingInterval();
      this.emit("disconnect", msg.reason, msg.message);
    }, 8e3);
  }
  async handleWalletReady(msg) {
    if (this.disconnectGraceTimer !== null) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
    }
    this.lastPongTime = Date.now();
    this.walletDiscovered = true;
    this.walletName = msg.wallet_name;
    this.walletIcon = msg.wallet_icon;
    const agreed = this.supportedProtocols.find((p) => msg.supported_protocols.includes(p));
    if (!agreed) {
      const detail = `No protocol overlap. Wallet: [${msg.supported_protocols}], Dapp: [${this.supportedProtocols}]`;
      const disconnectMsg = {
        action: RelayMsgAction.Disconnect,
        reason: DisconnectReason.ProtocolMismatch,
        message: detail,
        time: Math.floor(Date.now() / 1e3)
      };
      this.conn?.relay(disconnectMsg).catch(() => {
      });
      this.stopPingInterval();
      this.emit("disconnect", DisconnectReason.ProtocolMismatch, detail);
      return;
    }
    this.protocol = agreed;
    const sessionData = msg.session[agreed];
    if (!isHdwalletv1Session(sessionData)) {
      console.error("[wizardconnect/dapp] Invalid hdwalletv1 session data:", sessionData);
      return;
    }
    if (this.conn) {
      this.conn.setPeerCapabilities({
        chunk: peerSupportsChunk(msg.extensions)
      });
    }
    this.sessionPaths = [...sessionData.paths];
    for (const pathInfo of sessionData.paths) {
      const decoded = decodeHdPublicKey(pathInfo.xpub);
      if (typeof decoded === "string") {
        console.warn("[wizardconnect/dapp] Bad xpub for path", pathInfo.name, decoded);
        continue;
      }
      const ci = childIndexOfPathName(pathInfo.name);
      if (ci !== void 0) {
        this.pubkeyState.setXpubNode(ci, decoded.node);
      }
    }
    if (!msg.dapp_discovered) {
      await this.pushDappReady().catch((e) => console.error("[wizardconnect/dapp] Error pushing dapp_ready:", e));
    }
    this.emit("walletready", msg);
    if (this.pendingSignatureRequests.size > 0) {
      const now2 = Math.floor(Date.now() / 1e3);
      for (const [, entry] of this.pendingSignatureRequests) {
        const refreshed = { ...entry.request, time: now2 };
        this.conn.relay(refreshed).then(() => this.emit("messagesent", refreshed)).catch((err) => {
          this.pendingSignatureRequests.delete(entry.request.sequence);
          entry.reject(err instanceof Error ? err : new Error(String(err)));
        });
      }
    }
    if (this.sessionOptions) {
      const sessionUpdate = {
        walletName: this.walletName ?? void 0,
        walletIcon: this.walletIcon ?? void 0,
        paths: this.getSessionPaths()
      };
      saveSession(this.sessionOptions.key, sessionUpdate, this.sessionOptions.storage);
    }
    this.startPingInterval();
  }
  handleSignTransactionResponse(response) {
    const handlers = this.pendingSignatureRequests.get(response.sequence);
    if (!handlers) {
      console.warn("[wizardconnect/dapp] No pending request for sequence:", response.sequence);
      return;
    }
    this.pendingSignatureRequests.delete(response.sequence);
    if (response.error) {
      handlers.reject(new Error(response.error));
    } else {
      handlers.resolve(response);
    }
  }
};
export {
  DappConnectionManager,
  initiateDappRelay
};
/*! Bundled license information:

@noble/hashes/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/utils.js:
@noble/curves/abstract/modular.js:
@noble/curves/abstract/curve.js:
@noble/curves/abstract/weierstrass.js:
@noble/curves/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/ciphers/utils.js:
  (*! noble-ciphers - MIT License (c) 2023 Paul Miller (paulmillr.com) *)

@scure/base/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
