/* 00 Wallet — Swap View (SPA v2) — Atomic Cross-Chain Swaps
   ══════════════════════════════════════════════════════════
   Full HTLC swap protocol: BCH ↔ BTC / LTC / XMR
   Nostr order book, hash time-locked contracts, swap state machine.
   ══════════════════════════════════════════════════════════ */
import * as state from '../core/state.js';
import * as auth  from '../core/auth.js';
import { navigate } from '../router.js';
import { balanceChipHtml, statusDotsHtml, infoBtn, updateBalanceChip, setDotStatus } from '../core/ui-helpers.js';
import { secp256k1, schnorr } from 'https://esm.sh/@noble/curves@1.8.1/secp256k1';
import { sha256 }    from 'https://esm.sh/@noble/hashes@1.7.1/sha256';
import { ripemd160 } from 'https://esm.sh/@noble/hashes@1.7.1/ripemd160';

export const id    = 'swap';
export const title = '00 Swap';
export const icon  = '⇄';

/* ══════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════ */
const NOSTR_KIND_OFFER   = 4240;
const NOSTR_KIND_TAKE    = 4241;
const NOSTR_KIND_LOCKED  = 4242;
const NOSTR_KIND_CLAIMED = 4243;

const MAKER_TIMEOUT  = 144;   // ~24h BTC blocks
const TAKER_TIMEOUT  = 72;    // ~12h
const P2SH_VBYTES   = 280;
const OFFER_TTL      = 1800;  // 30 min
const MIN_BCH_SATS   = 1000;
const MIN_BTC_SATS   = 1500;

const _RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.snort.social'];

/* ══════════════════════════════════════════
   MODULE STATE
   ══════════════════════════════════════════ */
let _container = null, _unsubs = [], _bchPrice = 0, _btcPrice = 0;
let _activePair = 'bch_btc'; // 'bch_btc' | 'bch_ltc' | 'bch_xmr'
let _offers = [], _myOffers = new Set(), _seenEvents = new Set();
let _swap = null, _swapHistory = [];
let _monitorInterval = null, _swapBusy = false;
let _marketRate = null, _lastEdited = null;
let _nostrSubId = null;

/* ══════════════════════════════════════════
   BYTE HELPERS
   ══════════════════════════════════════════ */
const b2h = b => [...b].map(x => x.toString(16).padStart(2,'0')).join('');
const h2b = h => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x,16)));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const utf8 = s => new TextEncoder().encode(s);
function concat(...a){const r=new Uint8Array(a.reduce((s,x)=>s+x.length,0));let o=0;for(const x of a){r.set(x,o);o+=x.length;}return r;}
const u32LE = n => new Uint8Array([n&0xff,(n>>8)&0xff,(n>>16)&0xff,(n>>24)&0xff]);
function u64LE(n){const b=new Uint8Array(8);let v=BigInt(n);for(let i=0;i<8;i++){b[i]=Number(v&0xffn);v>>=8n;}return b;}
function writeVarint(n){if(n<0xfd)return new Uint8Array([n]);if(n<=0xffff)return new Uint8Array([0xfd,n&0xff,(n>>8)&0xff]);return new Uint8Array([0xfe,n&0xff,(n>>8)&0xff,(n>>16)&0xff,(n>>24)&0xff]);}
const dsha256 = d => sha256(sha256(d));
const N_SECP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
function satsToBch(s){return(s/1e8).toFixed(8);}
function bchToSats(b){return Math.round(parseFloat(b)*1e8);}

/* ══════════════════════════════════════════
   CASHADDR
   ══════════════════════════════════════════ */
const _caCharset='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function cashAddrToHash20(addr){
  const a=addr.replace(/^bitcoincash:/,'');const d5=[];
  for(const c of a){const v=_caCharset.indexOf(c);if(v>=0)d5.push(v);}
  const payload=d5.slice(0,-8);const conv=[];let acc=0,bits=0;
  for(const v of payload){acc=(acc<<5)|v;bits+=5;while(bits>=8){bits-=8;conv.push((acc>>bits)&0xff);}}
  return new Uint8Array(conv.slice(1,21));
}
function _caPolymod(v){const G=[0x98f2bc8e61n,0x79b76d99e2n,0xf33e5fb3c4n,0xae2eabe2a8n,0x1e4f43e470n];let c=1n;for(const d of v){const c0=c>>35n;c=((c&0x07ffffffffn)<<5n)^BigInt(d);if(c0&1n)c^=G[0];if(c0&2n)c^=G[1];if(c0&4n)c^=G[2];if(c0&8n)c^=G[3];if(c0&16n)c^=G[4];}return c^1n;}
function _hashToCashAddr(hash20,vb){const p=new Uint8Array([vb,...hash20]);const d5=[];let acc=0,bits=0;for(const b of p){acc=(acc<<8)|b;bits+=8;while(bits>=5){bits-=5;d5.push((acc>>bits)&31);}}if(bits>0)d5.push((acc<<(5-bits))&31);const prefix='bitcoincash';const pe=[...prefix.split('').map(c=>c.charCodeAt(0)&31),0];const mod=_caPolymod([...pe,...d5,0,0,0,0,0,0,0,0]);const cs=[];for(let i=7;i>=0;i--)cs.push(Number((mod>>(BigInt(i)*5n))&31n));return'bitcoincash:'+[...d5,...cs].map(v=>_caCharset[v]).join('');}
function pubHashToCashAddr(h){return _hashToCashAddr(h,0x00);}
function scriptHashToCashAddr(h){return _hashToCashAddr(h,0x08);}

/* ══════════════════════════════════════════
   BASE58CHECK (BTC / LTC)
   ══════════════════════════════════════════ */
const B58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Check(payload){const inp=concat(payload,dsha256(payload).slice(0,4));let n=BigInt('0x'+b2h(inp));let s='';while(n>0n){s=B58[Number(n%58n)]+s;n/=58n;}for(const b of inp){if(b===0)s='1'+s;else break;}return s;}
function base58Decode(str){let n=0n;for(const c of str){const i=B58.indexOf(c);if(i===-1)throw new Error('bad b58');n=n*58n+BigInt(i);}const h=n.toString(16).padStart(50,'0');const bytes=h2b(h);return bytes.slice(1,21);}
function btcP2pkhAddr(pub33){return base58Check(concat(new Uint8Array([0x00]),ripemd160(sha256(pub33))));}
function ltcP2pkhAddr(pub33){return base58Check(concat(new Uint8Array([0x30]),ripemd160(sha256(pub33))));}

/* ══════════════════════════════════════════
   TX BUILDER PRIMITIVES
   ══════════════════════════════════════════ */
function p2pkhScript(h20){return concat(new Uint8Array([0x76,0xa9,0x14]),h20,new Uint8Array([0x88,0xac]));}
function p2shScript(rs){return concat(new Uint8Array([0xa9,0x14]),ripemd160(sha256(rs)),new Uint8Array([0x87]));}
function pushData(d){if(d.length<=75)return concat(new Uint8Array([d.length]),d);if(d.length<=255)return concat(new Uint8Array([0x4c,d.length]),d);return concat(new Uint8Array([0x4d,d.length&0xff,(d.length>>8)&0xff]),d);}
function scriptNum(n){if(n===0)return new Uint8Array(0);const neg=n<0;let abs=Math.abs(n);const bytes=[];while(abs>0){bytes.push(abs&0xff);abs=Math.floor(abs/256);}if(bytes[bytes.length-1]&0x80)bytes.push(neg?0x80:0x00);else if(neg)bytes[bytes.length-1]|=0x80;return new Uint8Array(bytes);}

/* HTLC Script: OP_IF OP_SHA256 <hash> OP_EQUALVERIFY <recipPub> OP_CHECKSIG OP_ELSE <lock> OP_CLTV OP_DROP <senderPub> OP_CHECKSIG OP_ENDIF */
function htlcScript(hash32, recipPub33, senderPub33, locktime) {
  const lt = scriptNum(locktime);
  return concat(
    new Uint8Array([0x63, 0xa8, 0x20]), hash32, new Uint8Array([0x88, 0x21]), recipPub33, new Uint8Array([0xac, 0x67]),
    new Uint8Array([lt.length]), lt, new Uint8Array([0xb1, 0x75, 0x21]), senderPub33, new Uint8Array([0xac, 0x68])
  );
}

function serializeTx(ver, lt, ins, outs) {
  return concat(u32LE(ver), writeVarint(ins.length),
    ...ins.flatMap(i => [i.txidLE, u32LE(i.vout), writeVarint(i.scriptSig.length), i.scriptSig, u32LE(i.sequence)]),
    writeVarint(outs.length), ...outs.flatMap(o => [u64LE(o.value), writeVarint(o.script.length), o.script]), u32LE(lt));
}

/* BCH sighash (BIP143 forkid=0x41) */
function bchSighash(ver, lt, ins, outs, i, utxoScript, utxoVal) {
  const po=concat(...ins.map(x=>concat(x.txidLE,u32LE(x.vout))));
  const sq=concat(...ins.map(x=>u32LE(x.sequence)));
  const od=concat(...outs.map(o=>concat(u64LE(o.value),writeVarint(o.script.length),o.script)));
  const inp=ins[i];
  return dsha256(concat(u32LE(ver),dsha256(po),dsha256(sq),inp.txidLE,u32LE(inp.vout),writeVarint(utxoScript.length),utxoScript,u64LE(utxoVal),u32LE(inp.sequence),dsha256(od),u32LE(lt),u32LE(0x41)));
}

/* BTC sighash (legacy pre-SegWit) */
function btcSighash(ver, lt, ins, outs, i, subscript) {
  const parts=[u32LE(ver),writeVarint(ins.length)];
  for(let j=0;j<ins.length;j++){const inp=ins[j];const sc=(j===i)?subscript:new Uint8Array(0);parts.push(inp.txidLE,u32LE(inp.vout),writeVarint(sc.length),sc,u32LE(inp.sequence));}
  parts.push(writeVarint(outs.length));for(const o of outs)parts.push(u64LE(o.value),writeVarint(o.script.length),o.script);
  parts.push(u32LE(lt),u32LE(0x01));return dsha256(concat(...parts));
}

/* ══════════════════════════════════════════
   BCH HTLC TX BUILDERS
   ══════════════════════════════════════════ */
function _getKeys() { return auth.getKeys(); }

function buildBchHtlcFundTx(utxos, redeemScript, amtSats, changeAddr) {
  const keys = _getKeys();
  const p2shOut = p2shScript(redeemScript);
  let total = 0; const sel = [];
  const sorted = [...utxos].sort((a,b)=>b.value-a.value);
  for (const u of sorted) { sel.push(u); total+=u.value; const fee=Math.ceil((10+sel.length*148+2*34)*1); if(total>=amtSats+fee)break; }
  const fee=Math.ceil((10+sel.length*148+2*34)*1);
  if(total<amtSats+fee) throw new Error('insufficient BCH');
  const change=total-amtSats-fee;
  const outs=[{value:amtSats,script:p2shOut}];
  if(change>=546) outs.push({value:change,script:p2pkhScript(cashAddrToHash20(changeAddr))});
  const ins=sel.map(u=>({txidLE:h2b(u.txid).reverse(),vout:u.vout,value:u.value,sequence:0xffffffff,scriptSig:new Uint8Array(0)}));
  for(let i=0;i<ins.length;i++){
    const priv=sel[i]._priv||keys.privKey;
    const pub=secp256k1.getPublicKey(priv,true);
    const us=p2pkhScript(ripemd160(sha256(pub)));
    const sh=bchSighash(1,0,ins,outs,i,us,ins[i].value);
    const sig=secp256k1.sign(sh,priv,{lowS:true});
    const der=concat(sig.toDERRawBytes(),new Uint8Array([0x41]));
    ins[i].scriptSig=concat(new Uint8Array([der.length]),der,new Uint8Array([pub.length]),pub);
  }
  return b2h(serializeTx(1,0,ins,outs));
}

function buildBchClaimTx(txid, vout, value, redeemScript, preimage, recipPriv, outAddr) {
  const fee=Math.ceil((10+P2SH_VBYTES+34)*1); const outVal=value-fee;
  if(outVal<546) throw new Error('htlc too small');
  const pub=secp256k1.getPublicKey(recipPriv,true);
  const ins=[{txidLE:h2b(txid).reverse(),vout,value,sequence:0xffffffff,scriptSig:new Uint8Array(0)}];
  const outs=[{value:outVal,script:p2pkhScript(cashAddrToHash20(outAddr))}];
  const sh=bchSighash(1,0,ins,outs,0,redeemScript,value);
  const sig=secp256k1.sign(sh,recipPriv,{lowS:true});
  const der=concat(sig.toDERRawBytes(),new Uint8Array([0x41]));
  ins[0].scriptSig=concat(new Uint8Array([der.length]),der,new Uint8Array([preimage.length]),preimage,new Uint8Array([0x51]),pushData(redeemScript));
  return b2h(serializeTx(1,0,ins,outs));
}

function buildBchRefundTx(txid, vout, value, redeemScript, locktime, senderPriv, outAddr) {
  const fee=Math.ceil((10+P2SH_VBYTES+34)*1); const outVal=value-fee;
  if(outVal<546) throw new Error('htlc too small');
  const ins=[{txidLE:h2b(txid).reverse(),vout,value,sequence:0xfffffffe,scriptSig:new Uint8Array(0)}];
  const outs=[{value:outVal,script:p2pkhScript(cashAddrToHash20(outAddr))}];
  const sh=bchSighash(1,locktime,ins,outs,0,redeemScript,value);
  const sig=secp256k1.sign(sh,senderPriv,{lowS:true});
  const der=concat(sig.toDERRawBytes(),new Uint8Array([0x41]));
  ins[0].scriptSig=concat(new Uint8Array([der.length]),der,new Uint8Array([0x00]),pushData(redeemScript));
  return b2h(serializeTx(1,locktime,ins,outs));
}

/* ══════════════════════════════════════════
   BTC HTLC TX BUILDERS (also used for LTC)
   ══════════════════════════════════════════ */
function buildBtcHtlcFundTx(utxos, privKey, redeemScript, amtSats, changeAddr, feeRate) {
  const p2shOut=p2shScript(redeemScript);
  let total=0;const sel=[];
  const sorted=[...utxos].sort((a,b)=>b.value-a.value);
  for(const u of sorted){sel.push(u);total+=u.value;const fee=Math.ceil((10+sel.length*148+2*34)*feeRate);if(total>=amtSats+fee)break;}
  const fee=Math.ceil((10+sel.length*148+2*34)*feeRate);
  if(total<amtSats+fee) throw new Error('insufficient funds');
  const change=total-amtSats-fee;
  const outs=[{value:amtSats,script:p2shOut}];
  if(change>=546) outs.push({value:change,script:p2pkhScript(base58Decode(changeAddr))});
  const ins=sel.map(u=>({txidLE:h2b(u.txid).reverse(),vout:u.vout,value:u.value,sequence:0xffffffff,scriptSig:new Uint8Array(0)}));
  for(let i=0;i<ins.length;i++){
    const pub=secp256k1.getPublicKey(privKey,true);
    const us=p2pkhScript(ripemd160(sha256(pub)));
    const sh=btcSighash(1,0,ins,outs,i,us);
    const sig=secp256k1.sign(sh,privKey,{lowS:true});
    const der=concat(sig.toDERRawBytes(),new Uint8Array([0x01]));
    ins[i].scriptSig=concat(new Uint8Array([der.length]),der,new Uint8Array([pub.length]),pub);
  }
  return b2h(serializeTx(1,0,ins,outs));
}

function buildBtcClaimTx(txid, vout, value, redeemScript, preimage, recipPriv, outAddr, feeRate) {
  const fee=Math.ceil((10+P2SH_VBYTES+34)*feeRate); const outVal=value-fee;
  if(outVal<546) throw new Error('htlc too small');
  const ins=[{txidLE:h2b(txid).reverse(),vout,value,sequence:0xffffffff,scriptSig:new Uint8Array(0)}];
  const outs=[{value:outVal,script:p2pkhScript(base58Decode(outAddr))}];
  const sh=btcSighash(1,0,ins,outs,0,redeemScript);
  const sig=secp256k1.sign(sh,recipPriv,{lowS:true});
  const der=concat(sig.toDERRawBytes(),new Uint8Array([0x01]));
  ins[0].scriptSig=concat(new Uint8Array([der.length]),der,new Uint8Array([preimage.length]),preimage,new Uint8Array([0x51]),pushData(redeemScript));
  return b2h(serializeTx(1,0,ins,outs));
}

function buildBtcRefundTx(txid, vout, value, redeemScript, locktime, senderPriv, outAddr, feeRate) {
  const fee=Math.ceil((10+P2SH_VBYTES+34)*feeRate); const outVal=value-fee;
  if(outVal<546) throw new Error('htlc too small');
  const ins=[{txidLE:h2b(txid).reverse(),vout,value,sequence:0xfffffffe,scriptSig:new Uint8Array(0)}];
  const outs=[{value:outVal,script:p2pkhScript(base58Decode(outAddr))}];
  const sh=btcSighash(1,locktime,ins,outs,0,redeemScript);
  const sig=secp256k1.sign(sh,senderPriv,{lowS:true});
  const der=concat(sig.toDERRawBytes(),new Uint8Array([0x01]));
  ins[0].scriptSig=concat(new Uint8Array([der.length]),der,new Uint8Array([0x00]),pushData(redeemScript));
  return b2h(serializeTx(1,locktime,ins,outs));
}

/* ══════════════════════════════════════════
   NOSTR HELPERS
   ══════════════════════════════════════════ */
function _nostrPublish(event) {
  for (const url of _RELAYS) {
    try { const ws = new WebSocket(url); ws.onopen = () => { ws.send(JSON.stringify(['EVENT', event])); setTimeout(() => ws.close(), 3000); }; } catch {}
  }
}
async function _makeEvent(privBytes, kind, content, tags = []) {
  const pub = b2h(secp256k1.getPublicKey(privBytes, true).slice(1));
  const created_at = Math.floor(Date.now() / 1000);
  const idHash = sha256(utf8(JSON.stringify([0, pub, created_at, kind, tags, content])));
  const sig = b2h(schnorr.sign(idHash, privBytes));
  return { id: b2h(idHash), pubkey: pub, created_at, kind, tags, content, sig };
}
async function _nip04Encrypt(priv, pub, text) {
  const sh = secp256k1.getSharedSecret(priv, '02' + pub).slice(1, 33);
  const key = await crypto.subtle.importKey('raw', sh, 'AES-CBC', false, ['encrypt']);
  const iv = rand(16);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, utf8(text)));
  return btoa(String.fromCharCode(...ct)) + '?iv=' + btoa(String.fromCharCode(...iv));
}
async function _nip04Decrypt(priv, pub, ct) {
  try {
    const [data, ivStr] = ct.split('?iv=');
    const sh = secp256k1.getSharedSecret(priv, '02' + pub).slice(1, 33);
    const key = await crypto.subtle.importKey('raw', sh, 'AES-CBC', false, ['decrypt']);
    const iv = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
    const buf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, Uint8Array.from(atob(data), c => c.charCodeAt(0)));
    return new TextDecoder().decode(buf);
  } catch { return null; }
}
async function _verifyNostrEvent(ev) {
  try {
    if (!ev.id || !ev.pubkey || !ev.sig) return false;
    const s = JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content]);
    if (b2h(sha256(utf8(s))) !== ev.id) return false;
    return schnorr.verify(h2b(ev.sig), h2b(ev.id), h2b(ev.pubkey));
  } catch { return false; }
}

/* ══════════════════════════════════════════
   CROSS-CHAIN PREIMAGE DECORRELATION
   ══════════════════════════════════════════ */
function _crossChainPreimages(makerPub, takerPriv) {
  const P_bch = rand(32);
  const shared = secp256k1.getSharedSecret(takerPriv, h2b('02' + makerPub)).slice(1, 33);
  const xorMask = sha256(concat(utf8('swap-decorrelate'), shared));
  const P_btc = new Uint8Array(32);
  for (let i = 0; i < 32; i++) P_btc[i] = P_bch[i] ^ xorMask[i];
  return { P_bch, P_btc, H_bch: sha256(P_bch), H_btc: sha256(P_btc), xorMask };
}
function _deriveOtherPreimage(known, myPriv, theirPub) {
  const shared = secp256k1.getSharedSecret(myPriv, h2b('02' + theirPub)).slice(1, 33);
  const xorMask = sha256(concat(utf8('swap-decorrelate'), shared));
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = known[i] ^ xorMask[i];
  return out;
}

/* ══════════════════════════════════════════
   PREIMAGE EXTRACTION FROM ON-CHAIN TX
   ══════════════════════════════════════════ */
function _extractPreimage(scriptSigHex) {
  const b = h2b(scriptSigHex); let p = 0;
  const rd = () => { let len=b[p++]; if(len===0x4c)len=b[p++]; else if(len===0x4d){len=b[p]|(b[p+1]<<8);p+=2;} const d=b.slice(p,p+len);p+=len;return d; };
  try { rd(); const pre = rd(); return pre; } catch { return null; }
}
function _readVarint(buf, off) { const b=buf[off]; if(b<0xfd)return{value:b,next:off+1}; if(b===0xfd)return{value:buf[off+1]|(buf[off+2]<<8),next:off+3}; return{value:(buf[off+1]|(buf[off+2]<<8)|(buf[off+3]<<16)|(buf[off+4]<<24))>>>0,next:off+5}; }
function _parseTxInputs(hex) {
  try { const b=h2b(hex);let p=4;const ic=_readVarint(b,p);p=ic.next;const ins=[];
    for(let i=0;i<ic.value;i++){const txid=b2h(b.slice(p,p+32).reverse());p+=32;const vout=(b[p]|(b[p+1]<<8)|(b[p+2]<<16)|(b[p+3]<<24))>>>0;p+=4;const sl=_readVarint(b,p);p=sl.next;const ss=b2h(b.slice(p,p+sl.value));p+=sl.value;p+=4;ins.push({txid,vout,scriptSig:ss});}
    return ins;
  } catch { return []; }
}
function _parseTxOutputs(hex) {
  const b=h2b(hex);let p=4;const ic=_readVarint(b,p);p=ic.next;
  for(let i=0;i<ic.value;i++){p+=36;const sl=_readVarint(b,p);p=sl.next;p+=sl.value+4;}
  const oc=_readVarint(b,p);p=oc.next;const outs=[];
  for(let i=0;i<oc.value;i++){let v=0;for(let j=0;j<8;j++)v+=b[p+j]*(256**j);p+=8;const sl=_readVarint(b,p);p=sl.next;outs.push({value:v,script:b.slice(p,p+sl.value)});p+=sl.value;}
  return outs;
}
function _verifyHtlcTx(txHex, expectedAmt, expectedHash, recipPub33, senderPub33, locktime) {
  const outs = _parseTxOutputs(txHex);
  const rs = htlcScript(h2b(expectedHash), recipPub33, senderPub33, locktime);
  const expected = p2shScript(rs);
  for (const out of outs) {
    if (out.script.length === 23 && b2h(out.script) === b2h(expected)) {
      if (out.value < expectedAmt) return { ok: false, reason: 'amount too low' };
      return { ok: true, value: out.value, redeemScript: rs };
    }
  }
  return { ok: false, reason: 'no matching P2SH output' };
}

/* ══════════════════════════════════════════
   SCRIPTHASH FOR ELECTRUM
   ══════════════════════════════════════════ */
function _bchAddrSH(addr) { return b2h(sha256(p2pkhScript(cashAddrToHash20(addr))).reverse()); }
function _btcAddrSH(addr) { return b2h(sha256(p2pkhScript(base58Decode(addr))).reverse()); }
function _p2shSH(rs) { return b2h(sha256(p2shScript(rs)).reverse()); }

/* ══════════════════════════════════════════
   CHAIN DISPATCHERS
   ══════════════════════════════════════════ */
function _fv(method, params) { return window._fvCall(method, params); }
function _btcCall(method, params) { return window._btcCall ? window._btcCall(method, params) : Promise.reject('no btc'); }

function _chainCall(ch) { return ch === 'bch' ? _fv : _btcCall; }
function _chainAddr(ch) {
  const k = _getKeys();
  if (ch === 'bch') return k.bchAddr;
  // BTC derived at m/44'/145'/0'/3/0 — stored on keys by auth.js
  // For now use btcP2pkhAddr from session key as fallback
  return btcP2pkhAddr(secp256k1.getPublicKey(k.privKey, true));
}

/* ══════════════════════════════════════════
   SWAP PERSISTENCE
   ══════════════════════════════════════════ */
function _saveSwap() {
  if (_swap) localStorage.setItem('00_swap_v2', JSON.stringify(_swap, (k, v) => v instanceof Uint8Array ? { _u8: b2h(v) } : v));
  else localStorage.removeItem('00_swap_v2');
}
function _loadSwap() {
  try {
    const raw = localStorage.getItem('00_swap_v2');
    if (!raw) return;
    _swap = JSON.parse(raw, (k, v) => v && v._u8 ? h2b(v._u8) : v);
  } catch { _swap = null; }
}
function _saveHistory() {
  const max = 50;
  if (_swapHistory.length > max) _swapHistory = _swapHistory.slice(-max);
  localStorage.setItem('00_swap_history_v2', JSON.stringify(_swapHistory));
}
function _loadHistory() {
  try { _swapHistory = JSON.parse(localStorage.getItem('00_swap_history_v2') || '[]'); } catch { _swapHistory = []; }
}

/* ══════════════════════════════════════════
   TOAST (SPA-friendly)
   ══════════════════════════════════════════ */
function _toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:8px;font-size:12px;z-index:9999;pointer-events:none;max-width:340px;text-align:center;animation:fadeIn .3s ease;';
  const colors = { info: 'var(--dt-accent, #666)', success: '#0AC18E', error: '#E84142' };
  el.style.background = 'var(--dt-card-bg, #fff)';
  el.style.border = '1px solid ' + (colors[type] || colors.info);
  el.style.color = colors[type] || colors.info;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

/* ══════════════════════════════════════════
   TEMPLATE
   ══════════════════════════════════════════ */
function _template() {
  return `<div class="dt-inner" style="padding:32px 40px">
    <div class="dt-page-header">
      <div class="dt-page-title-wrap"><div class="dt-page-icon">⇄</div><div><div class="dt-page-title">Swap</div><div class="dt-page-sub">Atomic Cross-Chain Swaps</div></div></div>
      <div class="dt-page-actions">
        ${statusDotsHtml(['fulcrum', 'nostr'])}
        <div class="dt-oracle" id="dt-swap-bch">BCH $---</div>
        <div class="dt-oracle" id="dt-swap-btc">BTC $---</div>
      </div>
    </div>
    <div class="dt-tabs" id="dt-swap-tabs">
      <button class="dt-tab active" data-tab="book">OTC Book</button>
      <button class="dt-tab" data-tab="swap">Active Swap</button>
      <button class="dt-tab" data-tab="history">History</button>
    </div>

    <!-- BOOK PANE -->
    <div class="dt-pane active" id="dt-swap-p-book">
      ${balanceChipHtml(['bch', 'btc'])}
      <div class="dt-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <div class="dt-card-title" style="margin:0">Post an Offer</div>
          ${infoBtn('Offers are published on Nostr relays. Swaps use Hash Time-Locked Contracts (HTLC) -- trustless, no counterparty risk. Both parties lock funds; preimage reveal enables claims.')}
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <div class="dt-toggle-group" style="flex:1">
            <button class="dt-toggle-btn active" id="sw-pair-bchbtc" data-pair="bch_btc">BCH / BTC</button>
            <button class="dt-toggle-btn" id="sw-pair-bchltc" data-pair="bch_ltc">BCH / LTC</button>
          </div>
        </div>
        <div class="dt-form-group"><div class="dt-form-lbl">Side</div>
          <select class="dt-form-input" id="sw-side">
            <option value="sell_bch">Sell BCH</option>
            <option value="buy_bch">Buy BCH</option>
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <div class="dt-form-group" style="flex:1"><div class="dt-form-lbl">BCH Amount</div>
            <input class="dt-form-input" id="sw-bch-amt" type="number" step="0.00000001" placeholder="0.001">
          </div>
          <div class="dt-form-group" style="flex:1"><div class="dt-form-lbl" id="sw-other-lbl">BTC Amount</div>
            <input class="dt-form-input" id="sw-other-amt" type="number" step="0.00000001" placeholder="0.00003">
          </div>
        </div>
        <div style="font-size:11px;color:var(--dt-text-secondary);margin-bottom:4px" id="sw-rate-display">Rate: ---</div>
        <div style="font-size:11px;color:var(--dt-accent);margin-bottom:12px" id="sw-market-rate"></div>
        <button class="dt-action-btn" id="sw-post-btn" style="background:var(--dt-accent);color:#fff">Post Offer via Nostr</button>
        <div id="sw-post-status" style="font-size:11px;color:var(--dt-text-secondary);margin-top:8px;min-height:16px;text-align:center"></div>
      </div>

      <div class="dt-card" style="padding:0;overflow:hidden">
        <div style="padding:16px 24px;border-bottom:1px solid var(--dt-border)">
          <div class="dt-card-title" style="margin:0">Order Book</div>
        </div>
        <div id="sw-orderbook"><div class="dt-empty"><div class="dt-empty-icon">⇄</div><div class="dt-empty-text">Scanning for offers...</div></div></div>
      </div>
    </div>

    <!-- SWAP PANE -->
    <div class="dt-pane" id="dt-swap-p-swap">
      <div id="sw-idle" class="dt-empty" style="padding:40px"><div class="dt-empty-icon">⇄</div><div class="dt-empty-text">No Active Swap</div><div style="font-size:12px;margin-top:4px;color:var(--dt-text-secondary)">Select an offer from the OTC Book to start an atomic swap</div></div>
      <div id="sw-active" style="display:none">
        <div class="dt-card"><div class="dt-card-title">Swap Progress</div><div id="sw-steps"></div></div>
        <div class="dt-card"><div class="dt-card-title">Details</div><div id="sw-details" style="font-size:12px;color:var(--dt-text-secondary);line-height:2"></div></div>
        <div id="sw-actions" style="margin-top:12px"></div>
      </div>
    </div>

    <!-- HISTORY PANE -->
    <div class="dt-pane" id="dt-swap-p-history">
      <div class="dt-card" style="padding:0;overflow:hidden">
        <div style="padding:16px 24px;border-bottom:1px solid var(--dt-border)"><div class="dt-card-title" style="margin:0">Swap History</div></div>
        <div id="sw-history-list"><div class="dt-empty" style="padding:24px"><div class="dt-empty-text">No completed swaps</div></div></div>
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════
   BIND
   ══════════════════════════════════════════ */
function _bind() {
  // Tabs
  _container.querySelectorAll('#dt-swap-tabs .dt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _container.querySelectorAll('#dt-swap-tabs .dt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _container.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById('dt-swap-p-' + btn.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });

  // Pair toggle
  _container.querySelectorAll('.dt-toggle-btn[data-pair]').forEach(btn => {
    btn.addEventListener('click', () => {
      _container.querySelectorAll('.dt-toggle-btn[data-pair]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activePair = btn.dataset.pair;
      const chain = _activePair === 'bch_ltc' ? 'LTC' : 'BTC';
      const lbl = document.getElementById('sw-other-lbl');
      if (lbl) lbl.textContent = chain + ' Amount';
      _renderOrderbook();
      _fetchMarketRate();
    });
  });

  // Rate auto-fill on input
  const bchIn = document.getElementById('sw-bch-amt');
  const otherIn = document.getElementById('sw-other-amt');
  if (bchIn) bchIn.addEventListener('input', () => { _lastEdited = 'bch'; _updateRate(); });
  if (otherIn) otherIn.addEventListener('input', () => { _lastEdited = 'other'; _updateRate(); });

  // Post offer
  const postBtn = document.getElementById('sw-post-btn');
  if (postBtn) postBtn.addEventListener('click', _postOffer);
}

/* ══════════════════════════════════════════
   MARKET RATE
   ══════════════════════════════════════════ */
async function _fetchMarketRate() {
  const coin = _activePair === 'bch_ltc' ? 'ltc' : 'btc';
  const ticker = coin.toUpperCase();
  try {
    if (coin === 'btc') {
      const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=BCHXBT');
      const j = await r.json();
      _marketRate = parseFloat(j.result?.BCHXBT?.c?.[0]) || null;
    } else {
      const r = await fetch('https://min-api.cryptocompare.com/data/price?fsym=BCH&tsyms=' + ticker);
      const j = await r.json();
      _marketRate = j[ticker] || null;
    }
  } catch { _marketRate = null; }
  const el = document.getElementById('sw-market-rate');
  if (el) el.textContent = _marketRate ? 'Market: 1 BCH = ' + _marketRate.toFixed(8) + ' ' + ticker : '';
}

function _updateRate() {
  const bchIn = document.getElementById('sw-bch-amt');
  const otherIn = document.getElementById('sw-other-amt');
  if (!bchIn || !otherIn) return;
  const bch = parseFloat(bchIn.value) || 0;
  const other = parseFloat(otherIn.value) || 0;
  if (_marketRate && _lastEdited === 'bch' && bch > 0) otherIn.value = (bch * _marketRate).toFixed(8);
  else if (_marketRate && _lastEdited === 'other' && other > 0) bchIn.value = (other / _marketRate).toFixed(8);
  const fBch = parseFloat(bchIn.value) || 0, fOther = parseFloat(otherIn.value) || 0;
  const rateEl = document.getElementById('sw-rate-display');
  const ticker = _activePair === 'bch_ltc' ? 'LTC' : 'BTC';
  if (rateEl) rateEl.textContent = (fBch > 0 && fOther > 0) ? 'Rate: 1 BCH = ' + (fOther / fBch).toFixed(8) + ' ' + ticker : 'Rate: ---';
}

/* ══════════════════════════════════════════
   NOSTR SUBSCRIPTION
   ══════════════════════════════════════════ */
function _subscribeNostr() {
  const keys = _getKeys();
  if (!keys) return;
  const sessionPub = b2h(secp256k1.getPublicKey(keys.sessionPriv, true).slice(1));
  const since = Math.floor(Date.now() / 1000) - OFFER_TTL;

  // Subscribe to offers (public)
  _nostrSubId = window._nostrSubscribe([
    { kinds: [NOSTR_KIND_OFFER], since },
    { kinds: [NOSTR_KIND_TAKE, NOSTR_KIND_LOCKED, NOSTR_KIND_CLAIMED], '#p': [sessionPub], since: since - 1800 }
  ], ev => _handleSwapEvent(ev));
}

function _unsubscribeNostr() {
  if (_nostrSubId) { window._nostrUnsubscribe(_nostrSubId); _nostrSubId = null; }
}

/* ══════════════════════════════════════════
   EVENT ROUTER
   ══════════════════════════════════════════ */
async function _handleSwapEvent(ev) {
  if (_seenEvents.has(ev.id)) return;
  _seenEvents.add(ev.id);
  if (!await _verifyNostrEvent(ev)) return;

  switch (ev.kind) {
    case NOSTR_KIND_OFFER:   _handleOffer(ev); break;
    case NOSTR_KIND_TAKE:    await _handleTake(ev); break;
    case NOSTR_KIND_LOCKED:  await _handleLocked(ev); break;
    case NOSTR_KIND_CLAIMED: await _handleClaimed(ev); break;
  }
}

/* ══════════════════════════════════════════
   OFFER MANAGEMENT
   ══════════════════════════════════════════ */
function _isHex(s, len) { return typeof s === 'string' && s.length === len && /^[0-9a-f]+$/i.test(s); }

function _handleOffer(ev) {
  try {
    const o = JSON.parse(ev.content);
    if (!['sell_bch', 'buy_bch'].includes(o.side)) return;
    if (typeof o.bch_amt !== 'number' || o.bch_amt <= 0) return;
    const otherAmt = o.other_amt || o.btc_amt;
    if (typeof otherAmt !== 'number' || otherAmt <= 0) return;
    o.other_amt = otherAmt;
    if (!o.pair) o.pair = 'bch_btc';
    if (!_isHex(o.maker_pub, 64)) return;
    o.id = ev.id; o.pubkey = ev.pubkey; o.ts = ev.created_at;
    if (_offers.find(x => x.id === o.id)) return;
    const idx = _offers.findIndex(x => x.pubkey === ev.pubkey && x.pair === o.pair);
    if (idx >= 0) {
      if (_offers[idx].ts >= ev.created_at) return;
      if (_myOffers.has(_offers[idx].id)) { _myOffers.delete(_offers[idx].id); _myOffers.add(ev.id); }
      _offers[idx] = o;
    } else { _offers.push(o); }
    _renderOrderbook();
  } catch {}
}

async function _postOffer() {
  const keys = _getKeys();
  if (!keys) { _toast('Wallet not unlocked', 'error'); return; }
  const sessionPriv = keys.sessionPriv;
  const sessionPub = b2h(secp256k1.getPublicKey(sessionPriv, true).slice(1));
  const side = document.getElementById('sw-side')?.value;
  const bchAmt = bchToSats(document.getElementById('sw-bch-amt')?.value || '0');
  const otherAmt = bchToSats(document.getElementById('sw-other-amt')?.value || '0');
  const statusEl = document.getElementById('sw-post-status');
  if (bchAmt < MIN_BCH_SATS) { if (statusEl) statusEl.textContent = 'Min BCH: ' + satsToBch(MIN_BCH_SATS); return; }
  if (otherAmt < MIN_BTC_SATS) { if (statusEl) statusEl.textContent = 'Min amount: ' + satsToBch(MIN_BTC_SATS); return; }
  const offer = { pair: _activePair, side, bch_amt: bchAmt, other_amt: otherAmt, btc_amt: otherAmt, maker_pub: sessionPub, stealth_code: keys.stealthCode || '', ts: Math.floor(Date.now() / 1000) };
  const ev = await _makeEvent(sessionPriv, NOSTR_KIND_OFFER, JSON.stringify(offer), []);
  _nostrPublish(ev);
  _myOffers.add(ev.id);
  _handleOffer(ev);
  if (statusEl) statusEl.textContent = 'Offer posted';
  _toast('Offer posted', 'success');
}

function _cancelOffer(id) {
  _myOffers.delete(id);
  _offers = _offers.filter(o => o.id !== id);
  _renderOrderbook();
  _toast('Offer cancelled', 'info');
}

/* ══════════════════════════════════════════
   TAKE OFFER (Taker side)
   ══════════════════════════════════════════ */
async function _takeOffer(offerId) {
  const offer = _offers.find(o => o.id === offerId);
  if (!offer) { _toast('Offer not found', 'error'); return; }
  if (_swap) { _toast('Swap already active', 'error'); return; }
  const keys = _getKeys();
  const sessionPriv = keys.sessionPriv;
  const sessionPub = b2h(secp256k1.getPublicKey(sessionPriv, true).slice(1));
  const makerPub = offer.maker_pub || offer.pubkey;
  const oAmt = offer.other_amt || offer.btc_amt;

  if (offer.bch_amt < MIN_BCH_SATS) { _toast('BCH amount too small', 'error'); return; }
  if (oAmt < MIN_BTC_SATS) { _toast('Amount too small', 'error'); return; }

  const { P_bch, P_btc, H_bch, H_btc } = _crossChainPreimages(makerPub, sessionPriv);
  const takeMsg = { offer_id: offerId, taker_pub: sessionPub, H_bch: b2h(H_bch), H_btc: b2h(H_btc), stealth_code: keys.stealthCode || '' };
  const enc = await _nip04Encrypt(sessionPriv, makerPub, JSON.stringify(takeMsg));
  const ev = await _makeEvent(sessionPriv, NOSTR_KIND_TAKE, enc, [['p', makerPub]]);
  _nostrPublish(ev);

  _swap = {
    role: 'taker', pair: offer.pair || _activePair, offer, makerPub,
    P_bch, P_btc, H_bch: b2h(H_bch), H_btc: b2h(H_btc),
    state: 'TAKEN', steps: ['Take Sent', 'Waiting Maker Lock', 'Verifying HTLC', 'Locking My HTLC', 'Claiming', 'Complete'],
    currentStep: 1, ts: Date.now()
  };
  _saveSwap(); _renderSwapState(); _switchTab('swap');
  _toast('Take sent -- waiting for maker', 'info');
  _startMonitoring();
}

/* ══════════════════════════════════════════
   HANDLE TAKE (Maker receives)
   ══════════════════════════════════════════ */
async function _handleTake(ev) {
  const keys = _getKeys(); if (!keys) return;
  const sessionPriv = keys.sessionPriv;
  const dec = await _nip04Decrypt(sessionPriv, ev.pubkey, ev.content);
  if (!dec) return;
  try {
    const take = JSON.parse(dec);
    if (!_myOffers.has(take.offer_id)) return;
    const offer = _offers.find(o => o.id === take.offer_id);
    if (!offer || _swap) return;
    const sessionPub = b2h(secp256k1.getPublicKey(sessionPriv, true).slice(1));
    const chain = (offer.pair || 'bch_btc').split('_')[1] || 'btc';
    const oAmt = offer.other_amt || offer.btc_amt;
    let lockChain, lockAmt, lockHash, claimChain, claimAmt, claimHash;
    if (offer.side === 'sell_bch') {
      lockChain = 'bch'; lockAmt = offer.bch_amt; lockHash = take.H_bch;
      claimChain = chain; claimAmt = oAmt; claimHash = take.H_btc;
    } else {
      lockChain = chain; lockAmt = oAmt; lockHash = take.H_btc;
      claimChain = 'bch'; claimAmt = offer.bch_amt; claimHash = take.H_bch;
    }

    const call = _chainCall(lockChain);
    const header = await call('blockchain.headers.subscribe', []);
    const curH = header.height || header.block_height || 0;
    const locktime = curH + MAKER_TIMEOUT;
    const myPub33 = h2b('02' + sessionPub);
    const takerPub33 = h2b('02' + take.taker_pub);
    const rs = htlcScript(h2b(lockHash), takerPub33, myPub33, locktime);

    let txHex;
    if (lockChain === 'bch') {
      const bals = state.get('bchUtxos') || [];
      txHex = buildBchHtlcFundTx(bals, rs, lockAmt, keys.bchAddr);
    } else {
      _toast('BTC lock via SPA not yet supported', 'error'); return;
    }

    const txid = await call('blockchain.transaction.broadcast', [txHex]);
    const lockedMsg = { offer_id: take.offer_id, maker_htlc_txid: txid, lock_chain: lockChain, lock_amt: lockAmt, locktime, lock_hash: lockHash, claim_hash: claimHash, claim_chain: claimChain, claim_amt: claimAmt };
    const enc = await _nip04Encrypt(sessionPriv, take.taker_pub, JSON.stringify(lockedMsg));
    const lockEv = await _makeEvent(sessionPriv, NOSTR_KIND_LOCKED, enc, [['p', take.taker_pub]]);
    _nostrPublish(lockEv);

    _swap = {
      role: 'maker', pair: offer.pair || _activePair, offer, takerPub: take.taker_pub,
      lockChain, lockAmt, lockHash, claimChain, claimAmt, claimHash,
      myHtlcTxid: txid, locktime, redeemScript: b2h(rs),
      state: 'MAKER_LOCKED',
      steps: ['Take Received', 'My HTLC Locked', 'Waiting Taker Lock', 'Waiting Taker Claim', 'Claiming Other Chain', 'Complete'],
      currentStep: 2, ts: Date.now()
    };
    _saveSwap(); _renderSwapState(); _switchTab('swap');
    _toast('HTLC locked on ' + lockChain.toUpperCase(), 'success');
    _startMonitoring();
  } catch (e) { console.error('[swap] handleTake:', e); }
}

/* ══════════════════════════════════════════
   HANDLE LOCKED (Taker receives maker lock)
   ══════════════════════════════════════════ */
async function _handleLocked(ev) {
  const keys = _getKeys();
  if (!keys || !_swap || _swap.role !== 'taker') return;
  const sessionPriv = keys.sessionPriv;
  const dec = await _nip04Decrypt(sessionPriv, ev.pubkey, ev.content);
  if (!dec) return;
  _swapBusy = true;
  try {
    const locked = JSON.parse(dec);
    if (locked.offer_id !== _swap.offer.id) { _swapBusy = false; return; }
    const sessionPub = b2h(secp256k1.getPublicKey(sessionPriv, true).slice(1));
    _swap.makerHtlcTxid = locked.maker_htlc_txid;
    _swap.lockChain = locked.lock_chain; _swap.lockAmt = locked.lock_amt;
    _swap.lockHash = locked.lock_hash; _swap.claimChain = locked.claim_chain;
    _swap.claimAmt = locked.claim_amt; _swap.claimHash = locked.claim_hash;
    _swap.makerLocktime = locked.locktime;

    // Verify maker HTLC on-chain
    const vCall = _chainCall(locked.lock_chain);
    const txHex = await vCall('blockchain.transaction.get', [locked.maker_htlc_txid]);
    const vRecip = h2b('02' + sessionPub);
    const vSender = h2b('02' + _swap.makerPub);
    const vr = _verifyHtlcTx(txHex, locked.lock_amt, locked.lock_hash, vRecip, vSender, locked.locktime);
    if (!vr.ok) { _toast('HTLC verify failed: ' + vr.reason, 'error'); _swap.state = 'VERIFY_FAILED'; _saveSwap(); _renderSwapState(); return; }

    _swap.state = 'MAKER_LOCKED'; _swap.currentStep = 2; _saveSwap(); _renderSwapState();

    // Wait for 1 confirmation
    const htlcSH = _p2shSH(vr.redeemScript);
    let confirmed = false;
    for (let att = 0; att < 30; att++) {
      const utxos = await vCall('blockchain.scripthash.listunspent', [htlcSH]);
      const u = utxos.find(x => x.tx_hash === locked.maker_htlc_txid);
      if (u && u.height > 0) { confirmed = true; break; }
      if (att === 0) _toast('Waiting for HTLC confirmation...', 'info');
      await new Promise(r => setTimeout(r, 15000));
    }
    if (!confirmed) { _swap.state = 'WAITING_MAKER_CONFIRM'; _saveSwap(); _renderSwapState(); return; }

    // Taker locks on claim chain
    const myLockChain = locked.claim_chain;
    const myLockAmt = locked.claim_amt;
    const myLockHash = locked.claim_hash;
    const myCall = _chainCall(myLockChain);
    const myHeader = await myCall('blockchain.headers.subscribe', []);
    const myH = myHeader.height || myHeader.block_height || 0;
    const myLT = myH + TAKER_TIMEOUT;
    const makerPub33 = h2b('02' + _swap.makerPub);
    const myPub33 = h2b('02' + sessionPub);
    const myRS = htlcScript(h2b(myLockHash), makerPub33, myPub33, myLT);

    let txFund;
    if (myLockChain === 'bch') {
      const bals = state.get('bchUtxos') || [];
      txFund = buildBchHtlcFundTx(bals, myRS, myLockAmt, keys.bchAddr);
    } else { _toast('BTC/LTC lock not yet supported in SPA', 'error'); return; }

    const myTxid = await myCall('blockchain.transaction.broadcast', [txFund]);
    _swap.myHtlcTxid = myTxid; _swap.myLockChain = myLockChain; _swap.myLocktime = myLT;
    _swap.myRedeemScript = b2h(myRS); _swap.state = 'TAKER_LOCKED'; _swap.currentStep = 4;

    // Claim maker's HTLC
    const claimRS = htlcScript(h2b(locked.lock_hash), h2b('02' + sessionPub), h2b('02' + _swap.makerPub), locked.locktime);
    _swap.claimRedeemScriptHex = b2h(claimRS); _swap.claimChainLock = locked.lock_chain;
    _saveSwap();

    await new Promise(r => setTimeout(r, 3000));
    const clSH = _p2shSH(claimRS);
    const clUtxos = await vCall('blockchain.scripthash.listunspent', [clSH]);
    if (clUtxos.length === 0) { _swap.state = 'WAITING_CONFIRM'; _saveSwap(); return; }

    const cu = clUtxos[0];
    const claimPreimage = locked.lock_chain === 'bch' ? _swap.P_bch : _swap.P_btc;
    const preBytes = claimPreimage instanceof Uint8Array ? claimPreimage : h2b(claimPreimage);
    const claimAddr = locked.lock_chain === 'bch' ? keys.bchAddr : btcP2pkhAddr(keys.pubKey);
    let claimTxHex;
    if (locked.lock_chain === 'bch') {
      claimTxHex = buildBchClaimTx(cu.tx_hash, cu.tx_pos, cu.value, claimRS, preBytes, sessionPriv, claimAddr);
    } else {
      claimTxHex = buildBtcClaimTx(cu.tx_hash, cu.tx_pos, cu.value, claimRS, preBytes, sessionPriv, claimAddr, 2);
    }
    const claimTxid = await vCall('blockchain.transaction.broadcast', [claimTxHex]);

    const claimedMsg = { offer_id: _swap.offer.id, claim_txid: claimTxid, chain: locked.lock_chain, taker_locktime: _swap.myLocktime, taker_htlc_txid: _swap.myHtlcTxid };
    const encC = await _nip04Encrypt(sessionPriv, _swap.makerPub, JSON.stringify(claimedMsg));
    const clEv = await _makeEvent(sessionPriv, NOSTR_KIND_CLAIMED, encC, [['p', _swap.makerPub]]);
    _nostrPublish(clEv);

    _swap.claimTxid = claimTxid; _swap.state = 'COMPLETE'; _swap.currentStep = 6;
    _saveSwap(); _renderSwapState(); _toast('Swap complete!', 'success');
    _swapHistory.push({ pair: _swap.pair, role: 'taker', bch: _swap.offer.bch_amt, other: _swap.offer.other_amt, ts: Date.now() });
    _saveHistory(); _renderHistory();
    setTimeout(() => { _swap = null; _saveSwap(); _renderSwapState(); }, 5000);
  } catch (e) { console.error('[swap] handleLocked:', e); _toast('Swap error: ' + e.message, 'error'); }
  finally { _swapBusy = false; }
}

/* ══════════════════════════════════════════
   HANDLE CLAIMED (Maker receives taker claim)
   ══════════════════════════════════════════ */
async function _handleClaimed(ev) {
  const keys = _getKeys();
  if (!keys || !_swap || _swap.role !== 'maker') return;
  const sessionPriv = keys.sessionPriv;
  const dec = await _nip04Decrypt(sessionPriv, ev.pubkey, ev.content);
  if (!dec) return;
  _swapBusy = true;
  try {
    const claimed = JSON.parse(dec);
    if (claimed.offer_id !== _swap.offer.id) { _swapBusy = false; return; }
    const sessionPub = b2h(secp256k1.getPublicKey(sessionPriv, true).slice(1));

    // Extract preimage from claim TX
    const fetchCall = _chainCall(claimed.chain);
    const claimTxHex = await fetchCall('blockchain.transaction.get', [claimed.claim_txid]);
    const txIns = _parseTxInputs(claimTxHex);
    let revealed = null;
    for (const inp of txIns) {
      const pi = _extractPreimage(inp.scriptSig);
      if (pi && pi.length === 32 && b2h(sha256(pi)) === _swap.lockHash) { revealed = pi; break; }
    }
    if (!revealed) { _toast('Preimage extraction failed', 'error'); return; }

    const otherPre = _deriveOtherPreimage(revealed, sessionPriv, _swap.takerPub);
    if (b2h(sha256(otherPre)) !== _swap.claimHash) { _toast('Preimage derivation mismatch', 'error'); return; }

    _swap.revealedPreimage = b2h(revealed); _swap.otherPreimage = b2h(otherPre);
    _swap.currentStep = 4;
    if (claimed.taker_locktime) _swap.takerLocktime = claimed.taker_locktime;
    if (claimed.taker_htlc_txid) _swap.takerHtlcTxid = claimed.taker_htlc_txid;
    _saveSwap(); _renderSwapState();

    // Claim taker's HTLC
    const takerPub33 = h2b('02' + _swap.takerPub);
    const myPub33 = h2b('02' + sessionPub);
    const clCall = _chainCall(_swap.claimChain);
    const clAddr = _swap.claimChain === 'bch' ? keys.bchAddr : btcP2pkhAddr(keys.pubKey);
    let found = false;

    if (claimed.taker_locktime) {
      const rs = htlcScript(h2b(_swap.claimHash), myPub33, takerPub33, claimed.taker_locktime);
      const sh = _p2shSH(rs);
      const utxos = await clCall('blockchain.scripthash.listunspent', [sh]);
      if (utxos.length > 0) {
        const u = utxos[0]; let tx;
        if (_swap.claimChain === 'bch') tx = buildBchClaimTx(u.tx_hash, u.tx_pos, u.value, rs, h2b(_swap.otherPreimage), sessionPriv, clAddr);
        else tx = buildBtcClaimTx(u.tx_hash, u.tx_pos, u.value, rs, h2b(_swap.otherPreimage), sessionPriv, clAddr, 2);
        _swap.myClaimTxid = await clCall('blockchain.transaction.broadcast', [tx]);
        found = true;
      }
    }

    if (!found) {
      const hdr = await clCall('blockchain.headers.subscribe', []);
      const ch = hdr.height || hdr.block_height || 0;
      for (let lt = ch + TAKER_TIMEOUT - 10; lt <= ch + TAKER_TIMEOUT + 10; lt++) {
        const rs = htlcScript(h2b(_swap.claimHash), myPub33, takerPub33, lt);
        const sh = _p2shSH(rs);
        const utxos = await clCall('blockchain.scripthash.listunspent', [sh]);
        if (utxos.length > 0) {
          const u = utxos[0]; let tx;
          if (_swap.claimChain === 'bch') tx = buildBchClaimTx(u.tx_hash, u.tx_pos, u.value, rs, h2b(_swap.otherPreimage), sessionPriv, clAddr);
          else tx = buildBtcClaimTx(u.tx_hash, u.tx_pos, u.value, rs, h2b(_swap.otherPreimage), sessionPriv, clAddr, 2);
          _swap.myClaimTxid = await clCall('blockchain.transaction.broadcast', [tx]);
          _swap.takerLocktime = lt; found = true; break;
        }
      }
    }

    if (!found) { _saveSwap(); return; } // monitoring will retry

    _swap.state = 'COMPLETE'; _swap.currentStep = 6;
    _saveSwap(); _renderSwapState(); _toast('Swap complete!', 'success');
    _swapHistory.push({ pair: _swap.pair, role: 'maker', bch: _swap.offer.bch_amt, other: _swap.offer.other_amt, ts: Date.now() });
    _saveHistory(); _renderHistory();
    setTimeout(() => { _swap = null; _saveSwap(); _renderSwapState(); }, 5000);
  } catch (e) { console.error('[swap] handleClaimed:', e); _toast('Claim error: ' + e.message, 'error'); }
  finally { _swapBusy = false; }
}

/* ══════════════════════════════════════════
   REFUND
   ══════════════════════════════════════════ */
async function _refundSwap() {
  if (!_swap || !_swap.myHtlcTxid || !_swap.redeemScript) { _toast('Nothing to refund', 'error'); return; }
  const keys = _getKeys();
  try {
    const call = _chainCall(_swap.lockChain || 'bch');
    const hdr = await call('blockchain.headers.subscribe', []);
    const curH = hdr.height || hdr.block_height || 0;
    if (curH < _swap.locktime) { _toast('Timelock not expired (' + (_swap.locktime - curH) + ' blocks left)', 'error'); return; }
    const rs = h2b(_swap.redeemScript);
    const addr = _swap.lockChain === 'bch' ? keys.bchAddr : btcP2pkhAddr(keys.pubKey);
    const sh = _p2shSH(rs);
    const utxos = await call('blockchain.scripthash.listunspent', [sh]);
    if (utxos.length === 0) { _toast('HTLC output not found', 'error'); return; }
    const u = utxos[0]; let tx;
    if (_swap.lockChain === 'bch') tx = buildBchRefundTx(u.tx_hash, u.tx_pos, u.value, rs, _swap.locktime, keys.sessionPriv, addr);
    else tx = buildBtcRefundTx(u.tx_hash, u.tx_pos, u.value, rs, _swap.locktime, keys.sessionPriv, addr, 2);
    const txid = await call('blockchain.transaction.broadcast', [tx]);
    _toast('Refund TX: ' + txid.slice(0, 16) + '...', 'success');
    _swap.state = 'REFUNDED'; _saveSwap(); _renderSwapState();
  } catch (e) { _toast('Refund error: ' + e.message, 'error'); }
}

function _abandonSwap() {
  _swap = null; _saveSwap(); _renderSwapState();
  _toast('Swap abandoned', 'info');
}

/* ══════════════════════════════════════════
   MONITORING (poll for HTLC state changes)
   ══════════════════════════════════════════ */
function _startMonitoring() {
  if (_monitorInterval) clearInterval(_monitorInterval);
  _monitorInterval = setInterval(_monitorSwap, 15000);
}
function _stopMonitoring() {
  if (_monitorInterval) { clearInterval(_monitorInterval); _monitorInterval = null; }
}
async function _monitorSwap() {
  if (!_swap) { _stopMonitoring(); return; }
  if (_swap.state === 'COMPLETE' || _swap.state === 'REFUNDED') { _stopMonitoring(); return; }
  if (_swapBusy) return;
  try {
    // Taker: retry claim if needed
    if (_swap.role === 'taker' && (_swap.state === 'WAITING_CONFIRM' || _swap.state === 'TAKER_LOCKED') && _swap.claimRedeemScriptHex && !_swap.claimTxid) {
      const keys = _getKeys(); if (!keys) return;
      const rs = h2b(_swap.claimRedeemScriptHex);
      const vCall = _chainCall(_swap.claimChainLock);
      const utxos = await vCall('blockchain.scripthash.listunspent', [_p2shSH(rs)]);
      if (utxos.length > 0) {
        const cu = utxos[0];
        const preimage = _swap.claimChainLock === 'bch' ? _swap.P_bch : _swap.P_btc;
        const preBytes = preimage instanceof Uint8Array ? preimage : h2b(preimage);
        const addr = _swap.claimChainLock === 'bch' ? keys.bchAddr : btcP2pkhAddr(keys.pubKey);
        let tx;
        if (_swap.claimChainLock === 'bch') tx = buildBchClaimTx(cu.tx_hash, cu.tx_pos, cu.value, rs, preBytes, keys.sessionPriv, addr);
        else tx = buildBtcClaimTx(cu.tx_hash, cu.tx_pos, cu.value, rs, preBytes, keys.sessionPriv, addr, 2);
        const txid = await vCall('blockchain.transaction.broadcast', [tx]);
        const enc = await _nip04Encrypt(keys.sessionPriv, _swap.makerPub, JSON.stringify({ offer_id: _swap.offer.id, claim_txid: txid, chain: _swap.claimChainLock, taker_locktime: _swap.myLocktime, taker_htlc_txid: _swap.myHtlcTxid }));
        const ev = await _makeEvent(keys.sessionPriv, NOSTR_KIND_CLAIMED, enc, [['p', _swap.makerPub]]);
        _nostrPublish(ev);
        _swap.claimTxid = txid; _swap.state = 'COMPLETE'; _swap.currentStep = 6;
        _saveSwap(); _renderSwapState(); _toast('Swap complete! (recovered)', 'success');
      }
    }
    // Maker: retry claim if preimage available
    if (_swap.role === 'maker' && _swap.otherPreimage && !_swap.myClaimTxid) {
      const keys = _getKeys(); if (!keys) return;
      const sessionPub = b2h(secp256k1.getPublicKey(keys.sessionPriv, true).slice(1));
      const takerPub33 = h2b('02' + _swap.takerPub);
      const myPub33 = h2b('02' + sessionPub);
      const clCall = _chainCall(_swap.claimChain);
      const addr = _swap.claimChain === 'bch' ? keys.bchAddr : btcP2pkhAddr(keys.pubKey);
      if (_swap.takerLocktime) {
        const rs = htlcScript(h2b(_swap.claimHash), myPub33, takerPub33, _swap.takerLocktime);
        const utxos = await clCall('blockchain.scripthash.listunspent', [_p2shSH(rs)]);
        if (utxos.length > 0) {
          const u = utxos[0]; let tx;
          if (_swap.claimChain === 'bch') tx = buildBchClaimTx(u.tx_hash, u.tx_pos, u.value, rs, h2b(_swap.otherPreimage), keys.sessionPriv, addr);
          else tx = buildBtcClaimTx(u.tx_hash, u.tx_pos, u.value, rs, h2b(_swap.otherPreimage), keys.sessionPriv, addr, 2);
          _swap.myClaimTxid = await clCall('blockchain.transaction.broadcast', [tx]);
          _swap.state = 'COMPLETE'; _swap.currentStep = 6;
          _saveSwap(); _renderSwapState(); _toast('Swap complete! (maker recovered)', 'success');
        }
      }
    }
  } catch (e) { console.error('[swap] monitor:', e); }
}

/* ══════════════════════════════════════════
   RENDER: ORDERBOOK
   ══════════════════════════════════════════ */
function _renderOrderbook() {
  const el = document.getElementById('sw-orderbook');
  if (!el) return;
  const now = Math.floor(Date.now() / 1000);
  _offers = _offers.filter(o => (now - o.ts) < OFFER_TTL);
  const keys = _getKeys();
  const sessionPub = keys ? b2h(secp256k1.getPublicKey(keys.sessionPriv, true).slice(1)) : '';
  const pairOffers = _offers.filter(o => (o.pair || 'bch_btc') === _activePair);
  const chain = _activePair === 'bch_ltc' ? 'LTC' : 'BTC';

  if (pairOffers.length === 0) {
    el.innerHTML = '<div class="dt-empty"><div class="dt-empty-icon">⇄</div><div class="dt-empty-text">No ' + chain + ' offers available</div><div style="font-size:12px;color:var(--dt-text-secondary);margin-top:8px">Post the first offer or wait for peers</div></div>';
    return;
  }
  el.innerHTML = pairOffers.sort((a, b) => b.ts - a.ts).map(o => {
    const isMine = o.maker_pub === sessionPub || o.pubkey === sessionPub || _myOffers.has(o.id);
    const isSell = o.side === 'sell_bch';
    const oAmt = o.other_amt || o.btc_amt;
    const rate = oAmt && o.bch_amt ? (oAmt / o.bch_amt).toFixed(8) : '?';
    const ago = Math.floor((now - o.ts) / 60);
    const agoStr = ago < 1 ? '<1m' : ago + 'm ago';
    const pub8 = (o.maker_pub || o.pubkey || '').slice(0, 8);
    return `<div class="dt-row" style="cursor:pointer">
      <div class="dt-row-left">
        <div class="dt-row-icon ${isSell ? 'out' : 'in'}">${isSell ? '↑' : '↓'}</div>
        <div><div class="dt-row-title">${satsToBch(o.bch_amt)} BCH ↔ ${satsToBch(oAmt)} ${chain}</div>
        <div class="dt-row-sub">Rate: 1 BCH = ${rate} ${chain} · ${agoStr} · ${pub8}...</div></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:6px;border:1px solid;${isSell ? 'color:var(--dt-danger, #E84142);border-color:var(--dt-danger, #E84142)' : 'color:var(--dt-accent, #0AC18E);border-color:var(--dt-accent, #0AC18E)'}">${isSell ? 'SELL' : 'BUY'}</span>
        ${isMine
          ? `<button class="dt-action-btn-outline" style="width:auto;padding:6px 14px;font-size:11px;color:var(--dt-danger);border-color:var(--dt-danger)" data-cancel="${o.id}">Cancel</button>`
          : `<button class="dt-action-btn" style="width:auto;padding:6px 14px;font-size:11px" data-take="${o.id}">Swap</button>`}
      </div>
    </div>`;
  }).join('');

  // Bind buttons
  el.querySelectorAll('[data-take]').forEach(btn => btn.addEventListener('click', () => _takeOffer(btn.dataset.take)));
  el.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => _cancelOffer(btn.dataset.cancel)));
}

/* ══════════════════════════════════════════
   RENDER: SWAP STATE
   ══════════════════════════════════════════ */
function _renderSwapState() {
  const idle = document.getElementById('sw-idle');
  const active = document.getElementById('sw-active');
  if (!idle || !active) return;
  if (!_swap) { idle.style.display = ''; active.style.display = 'none'; return; }
  idle.style.display = 'none'; active.style.display = '';

  const steps = _swap.steps || [];
  const cur = _swap.currentStep || 0;
  const done = _swap.state === 'COMPLETE' || _swap.state === 'REFUNDED';
  const stepsEl = document.getElementById('sw-steps');
  if (stepsEl) {
    stepsEl.innerHTML = steps.map((s, i) => {
      const isDone = i < cur || done;
      const isAct = i === cur && !done;
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0">
        <div style="width:28px;height:28px;border-radius:50%;border:2px solid ${isDone ? 'var(--dt-accent, #0AC18E)' : isAct ? 'var(--dt-text, #333)' : 'var(--dt-border, #eee)'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:${isDone ? 'var(--dt-accent)' : isAct ? 'var(--dt-text)' : 'var(--dt-text-secondary)'};${isDone ? 'background:rgba(10,193,142,.08)' : ''}">${isDone ? '&#10003;' : i + 1}</div>
        <span style="font-size:13px;color:${isDone ? 'var(--dt-accent)' : isAct ? 'var(--dt-text)' : 'var(--dt-text-secondary)'};font-weight:${isAct ? '600' : '400'}">${s}</span>
        ${isAct ? '<div style="width:14px;height:14px;border:2px solid var(--dt-border);border-top-color:var(--dt-accent);border-radius:50%;animation:spin .7s linear infinite"></div>' : ''}
      </div>`;
    }).join('');
  }

  const detEl = document.getElementById('sw-details');
  if (detEl) {
    const d = [`Role: ${_swap.role}`, `State: ${_swap.state}`, `BCH: ${satsToBch(_swap.offer?.bch_amt || 0)}`];
    if (_swap.myHtlcTxid) d.push('Lock TX: ' + _swap.myHtlcTxid.slice(0, 16) + '...');
    if (_swap.claimTxid) d.push('Claim TX: ' + _swap.claimTxid.slice(0, 16) + '...');
    if (_swap.myClaimTxid) d.push('My Claim TX: ' + _swap.myClaimTxid.slice(0, 16) + '...');
    detEl.innerHTML = d.join('<br>');
  }

  const actEl = document.getElementById('sw-actions');
  if (actEl) {
    let html = '';
    if (_swap.role === 'maker' && _swap.myHtlcTxid && _swap.state !== 'COMPLETE' && _swap.state !== 'REFUNDED') {
      html += '<button class="dt-action-btn" style="background:var(--dt-danger, #E84142);color:#fff;margin-bottom:8px" id="sw-refund-btn">Refund</button>';
    }
    if (_swap.state === 'COMPLETE' || _swap.state === 'REFUNDED') {
      html += '<button class="dt-action-btn-outline" id="sw-clear-btn">Clear Swap</button>';
    }
    if (_swap.state !== 'COMPLETE' && _swap.state !== 'REFUNDED') {
      html += '<button class="dt-action-btn-outline" style="margin-top:8px;color:var(--dt-text-secondary);border-color:var(--dt-border)" id="sw-abandon-btn">Abandon Swap</button>';
    }
    actEl.innerHTML = html;
    actEl.querySelector('#sw-refund-btn')?.addEventListener('click', _refundSwap);
    actEl.querySelector('#sw-clear-btn')?.addEventListener('click', () => { _swap = null; _saveSwap(); _renderSwapState(); });
    actEl.querySelector('#sw-abandon-btn')?.addEventListener('click', _abandonSwap);
  }
}

/* ══════════════════════════════════════════
   RENDER: HISTORY
   ══════════════════════════════════════════ */
function _renderHistory() {
  const el = document.getElementById('sw-history-list');
  if (!el) return;
  if (_swapHistory.length === 0) {
    el.innerHTML = '<div class="dt-empty" style="padding:24px"><div class="dt-empty-text">No completed swaps</div></div>';
    return;
  }
  el.innerHTML = _swapHistory.slice().reverse().map(h => {
    const chain = (h.pair || 'bch_btc').split('_')[1]?.toUpperCase() || 'BTC';
    const d = new Date(h.ts);
    const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="dt-row" style="cursor:default">
      <div class="dt-row-left"><div class="dt-row-icon in">⇄</div><div>
        <div class="dt-row-title">${satsToBch(h.bch || 0)} BCH ↔ ${satsToBch(h.other || 0)} ${chain}</div>
        <div class="dt-row-sub">${h.role} · ${dateStr}</div>
      </div></div>
      <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:6px;border:1px solid var(--dt-accent);color:var(--dt-accent)">Done</span>
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════
   TAB SWITCH HELPER
   ══════════════════════════════════════════ */
function _switchTab(tabName) {
  if (!_container) return;
  _container.querySelectorAll('#dt-swap-tabs .dt-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  _container.querySelectorAll('.dt-pane').forEach(p => p.classList.remove('active'));
  const pane = document.getElementById('dt-swap-p-' + tabName);
  if (pane) pane.classList.add('active');
}

/* ══════════════════════════════════════════
   PRICES
   ══════════════════════════════════════════ */
function _updatePrices() {
  const prices = state.get('prices') || {};
  _bchPrice = prices.bch?.price || 0;
  _btcPrice = prices.btc?.price || 0;
  const bEl = document.getElementById('dt-swap-bch');
  const tEl = document.getElementById('dt-swap-btc');
  if (bEl && _bchPrice) bEl.textContent = 'BCH $' + _bchPrice.toFixed(2);
  if (tEl && _btcPrice) tEl.textContent = 'BTC $' + _btcPrice.toFixed(0);
}

/* ══════════════════════════════════════════
   MOUNT / UNMOUNT
   ══════════════════════════════════════════ */
export function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  container.innerHTML = _template();
  _bind();
  _updatePrices();
  _loadSwap();
  _loadHistory();
  _renderSwapState();
  _renderHistory();
  _fetchMarketRate();
  _subscribeNostr();

  if (_swap && _swap.state !== 'COMPLETE' && _swap.state !== 'REFUNDED') _startMonitoring();

  _unsubs.push(state.subscribe('prices', _updatePrices));
  _unsubs.push(state.subscribe('balances', () => { updateBalanceChip('bch'); updateBalanceChip('btc'); }));

  // Wire connection dots
  const wiredFulcrum = state.subscribe('fulcrumConnected', v => setDotStatus('fulcrum', !!v));
  const wiredNostr = state.subscribe('nostrConnected', v => setDotStatus('nostr', !!v));
  _unsubs.push(wiredFulcrum, wiredNostr);
  setDotStatus('fulcrum', !!state.get('fulcrumConnected'));
  setDotStatus('nostr', !!state.get('nostrConnected'));

  // Initial orderbook render after short delay for events
  setTimeout(_renderOrderbook, 1000);
}

export function unmount() {
  _unsubs.forEach(fn => fn()); _unsubs = [];
  _unsubscribeNostr();
  _stopMonitoring();
  if (_container) _container.innerHTML = '';
  _container = null;
}
