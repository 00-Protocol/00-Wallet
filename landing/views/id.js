/* 00 Wallet — Identity View (SPA v2) — Full v1 functionality */
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';
import { nostrPublish, nostrSubscribe, nostrUnsubscribe } from '../core/nostr-bridge.js';

export const id = 'id';
export const title = '00 Identity';
export const icon = '◉';
let _container = null, _unsubs = [], _QRLib = null, _meta = {}, _subIds = [];

function _nostrPub(ev) { nostrPublish(ev); }

function _nostrFetch(pubHex) {
  return new Promise(async (resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { if (sid) nostrUnsubscribe(sid); resolve(null); } }, 8000);
    const sid = await nostrSubscribe([{ kinds: [0], authors: [pubHex], limit: 1 }], (ev) => {
      if (ev.kind === 0 && !done) {
        done = true; clearTimeout(timer);
        nostrUnsubscribe(sid);
        resolve(ev);
      }
    });
    if (!sid && !done) { clearTimeout(timer); resolve(null); }
  });
}

let _schnorr,_sha256S,_b2h,_h2b,_utf8;
async function _lc(){if(_schnorr)return;const[c,h]=await Promise.all([import('https://esm.sh/@noble/curves@1.8.1/secp256k1'),import('https://esm.sh/@noble/hashes@1.7.1/sha256')]);_schnorr=c.schnorr;_sha256S=h.sha256;_b2h=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');_h2b=h=>new Uint8Array(h.match(/.{2}/g).map(x=>parseInt(x,16)));_utf8=s=>new TextEncoder().encode(s);}
async function _makeEv(privHex,kind,content,tags=[]){await _lc();const p=_h2b(privHex),pub=_b2h(_schnorr.getPublicKey(p)),ca=Math.floor(Date.now()/1000),pre=JSON.stringify([0,pub,ca,kind,tags,content]),eid=_b2h(_sha256S(_utf8(pre))),sig=_b2h(_schnorr.sign(eid,p));return{id:eid,pubkey:pub,created_at:ca,kind,tags,content,sig};}

function _drawAvatar(pubHex,canvas){if(!canvas||!pubHex)return;const ctx=canvas.getContext('2d'),bytes=[];for(let i=0;i<Math.min(64,pubHex.length);i+=2)bytes.push(parseInt(pubHex.substr(i,2),16));const s=canvas.width,g=8,c=s/g;ctx.fillStyle='#020a03';ctx.fillRect(0,0,s,s);for(let y=0;y<g;y++)for(let x=0;x<g/2;x++){const idx=(y*(g/2)+x)%bytes.length;if(bytes[idx]>128){ctx.fillStyle=`rgba(10,193,142,${0.6+(bytes[idx]/255)*0.4})`;ctx.fillRect(x*c,y*c,c,c);ctx.fillRect((g-1-x)*c,y*c,c,c);}}ctx.strokeStyle='rgba(10,193,142,0.3)';ctx.lineWidth=2;ctx.strokeRect(1,1,s-2,s-2);}

async function _qr(id,text,color){const c=document.getElementById(id);if(!c||!text)return;if(!_QRLib){const m=await import('https://esm.sh/qrcode@1.5.4');_QRLib=m.default||m;}await _QRLib.toCanvas(c,text,{width:200,margin:1,color:{dark:color||'#0AC18E',light:'#ffffff'}});}

function _npub(pubHex){const CH='qpzry9x8gf2tvdw0s3jn54khce6mua7l';function pm(v){let c=1;for(const d of v){const b=c>>25;c=((c&0x1ffffff)<<5)^d;for(let i=0;i<5;i++)if((b>>i)&1)c^=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3][i];}return c;}function ex(h){const r=[];for(const c of h)r.push(c.charCodeAt(0)>>5);r.push(0);for(const c of h)r.push(c.charCodeAt(0)&31);return r;}const data=new Uint8Array(pubHex.match(/.{2}/g).map(x=>parseInt(x,16)));const d5=[];let ac=0,bi=0;for(const b of data){ac=(ac<<8)|b;bi+=8;while(bi>=5){bi-=5;d5.push((ac>>bi)&31);}}if(bi>0)d5.push((ac<<(5-bi))&31);const chk=pm([...ex('npub'),...d5,0,0,0,0,0,0])^1;const cs=[];for(let i=0;i<6;i++)cs.push((chk>>(5*(5-i)))&31);return'npub1'+[...d5,...cs].map(v=>CH[v]).join('');}

function _decodeNpub(npub){const CH='qpzry9x8gf2tvdw0s3jn54khce6mua7l';const d5=[];for(const c of npub.slice(5))d5.push(CH.indexOf(c));const d8=[];let ac=0,bi=0;for(const v of d5.slice(0,-6)){ac=(ac<<5)|v;bi+=5;while(bi>=8){bi-=8;d8.push((ac>>bi)&0xff);}}return d8.map(b=>b.toString(16).padStart(2,'0')).join('');}

function _template(keys){const sp=keys?.sessionPub||'',ba=keys?.bchAddr||'',sc=keys?.stealthCode||'',np=sp?_npub(sp):'';
return `<div class="dt-inner" style="padding:32px 40px;max-width:560px;margin:0 auto">
  <div class="dt-page-header"><div class="dt-page-title-wrap"><div class="dt-page-icon">◉</div><div><div class="dt-page-title">Identity</div><div class="dt-page-sub">Decentralized Identity · Nostr</div></div></div></div>
  <div class="dt-tabs" id="dt-id-tabs"><button class="dt-tab active" data-tab="card">Card</button><button class="dt-tab" data-tab="edit">Edit</button><button class="dt-tab" data-tab="share">Share</button><button class="dt-tab" data-tab="lookup">Lookup</button></div>
  <div class="dt-pane active" id="dt-id-p-card">
    <!-- Identity Card -->
    <div class="dt-card" style="padding:0;overflow:hidden">
      <!-- Header gradient -->
      <div style="background:linear-gradient(135deg,#0AC18E,#0AD18E 40%,#08A87A);padding:32px 28px 48px;text-align:center;position:relative">
        <canvas id="dt-id-avatar" width="88" height="88" style="border-radius:50%;border:4px solid rgba(255,255,255,.3);display:block;margin:0 auto 14px;box-shadow:0 4px 16px rgba(0,0,0,.2)"></canvas>
        <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:2px;text-shadow:0 1px 4px rgba(0,0,0,.15)" id="dt-id-name">Anonymous</div>
        <div style="font-size:13px;color:rgba(255,255,255,.75)" id="dt-id-bio">No bio set</div>
      </div>
      <!-- Info rows -->
      <div style="padding:24px 24px 20px;display:flex;flex-direction:column;gap:0">
        ${[[ba,'BCH Address','₿','#0AC18E'],[sc,'Stealth Code','🔒','#BF5AF2'],[np,'Nostr npub','◈','#627EEA'],[sp,'Hex Pubkey','⬡','#f0a500']].map(([v,l,ico,col])=>`
        <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--dt-bg,#f0f2f5);border:1px solid var(--dt-border);border-radius:12px;margin-bottom:10px;cursor:pointer;transition:all .15s" onmouseover="this.style.borderColor='${col}';this.style.boxShadow='0 2px 8px ${col}20'" onmouseout="this.style.borderColor='var(--dt-border)';this.style.boxShadow='none'" onclick="navigator.clipboard.writeText('${v}');this.querySelector('.cp').textContent='✓';setTimeout(()=>this.querySelector('.cp').textContent='📋',1000)">
          <div style="width:36px;height:36px;border-radius:10px;background:${col}18;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;color:${col}">${ico}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:600;color:var(--dt-text-secondary);letter-spacing:.3px;margin-bottom:2px">${l}</div>
            <div style="font-size:12px;font-family:'SF Mono',monospace;color:var(--dt-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v||'—'}</div>
          </div>
          <span class="cp" style="font-size:14px;opacity:.4;flex-shrink:0">📋</span>
        </div>`).join('')}
      </div>
    </div>
  </div>
  <div class="dt-pane" id="dt-id-p-edit"><div class="dt-card"><div class="dt-card-title">Edit Identity</div>
    <div class="dt-form-group"><div class="dt-form-lbl">NAME</div><input class="dt-form-input" id="dt-id-ni" placeholder="Your name..."></div>
    <div class="dt-form-group"><div class="dt-form-lbl">BIO</div><textarea class="dt-form-input" id="dt-id-bi" rows="3" placeholder="About you..."></textarea></div>
    <div class="dt-form-group"><div class="dt-form-lbl">PICTURE URL</div><input class="dt-form-input" id="dt-id-pi" placeholder="https://..."></div>
    <div style="display:flex;gap:12px"><button class="dt-action-btn" style="flex:1;background:var(--dt-accent)" id="dt-id-save">Save Locally</button><button class="dt-action-btn-outline" style="flex:1" id="dt-id-bcast">Broadcast to Nostr</button></div>
    <div id="dt-id-status" style="font-size:11px;color:var(--dt-text-secondary);margin-top:8px;text-align:center;min-height:16px"></div>
  </div></div>
  <div class="dt-pane" id="dt-id-p-share"><div class="dt-card" style="text-align:center"><div class="dt-card-title">Share Your Identity</div>
    <div class="dt-qr-wrap"><canvas id="dt-id-qr" width="200" height="200"></canvas></div>
    <div style="font-family:monospace;font-size:10px;color:var(--dt-text-secondary);word-break:break-all;padding:12px;background:var(--dt-bg);border-radius:8px;margin:12px 0" id="dt-id-json">—</div>
    <div style="display:flex;gap:8px;justify-content:center"><button class="dt-copy-btn" id="dt-id-cj" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">📋 Copy JSON</button><button class="dt-copy-btn" id="dt-id-cl" style="background:var(--dt-accent);color:#fff;border-color:var(--dt-accent)">🔗 Copy Link</button></div>
  </div></div>
  <div class="dt-pane" id="dt-id-p-lookup"><div class="dt-card"><div class="dt-card-title">Lookup Identity</div>
    <div class="dt-form-group"><div class="dt-form-lbl">NPUB OR HEX PUBKEY</div><input class="dt-form-input" id="dt-id-li" placeholder="npub1... or 64-char hex..."></div>
    <button class="dt-action-btn" id="dt-id-resolve" style="background:var(--dt-accent)">🔍 Resolve Identity</button>
    <div id="dt-id-lr" style="margin-top:16px"></div>
  </div></div>
</div>`;}

function _bind(keys){
  document.querySelectorAll('#dt-id-tabs .dt-tab').forEach(b=>{b.addEventListener('click',()=>{document.querySelectorAll('#dt-id-tabs .dt-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.dt-pane').forEach(p=>p.classList.remove('active'));document.getElementById('dt-id-p-'+b.dataset.tab)?.classList.add('active');});});
  try{_meta=JSON.parse(localStorage.getItem('00id_meta')||'{}');}catch{}
  if(_meta.name){document.getElementById('dt-id-name').textContent=_meta.name;document.getElementById('dt-id-ni').value=_meta.name;}
  if(_meta.bio){document.getElementById('dt-id-bio').textContent=_meta.bio;document.getElementById('dt-id-bi').value=_meta.bio;}
  if(_meta.picture)document.getElementById('dt-id-pi').value=_meta.picture;
  if(keys?.sessionPub)_drawAvatar(keys.sessionPub,document.getElementById('dt-id-avatar'));
  document.getElementById('dt-id-save')?.addEventListener('click',()=>{_meta={name:document.getElementById('dt-id-ni')?.value||'',bio:document.getElementById('dt-id-bi')?.value||'',picture:document.getElementById('dt-id-pi')?.value||''};localStorage.setItem('00id_meta',JSON.stringify(_meta));document.getElementById('dt-id-name').textContent=_meta.name||'Anonymous';document.getElementById('dt-id-bio').textContent=_meta.bio||'No bio set';document.getElementById('dt-id-status').textContent='✓ Saved locally';});
  document.getElementById('dt-id-bcast')?.addEventListener('click',async()=>{const s=document.getElementById('dt-id-status');if(!keys?.sessionPub){s.textContent='No session key';return;}s.textContent='Broadcasting...';try{await _lc();const ev=await _makeEv(_b2h(keys.sessionPriv),0,JSON.stringify({name:_meta.name||'',about:_meta.bio||'',picture:_meta.picture||''}));_nostrPub(ev);s.textContent='✓ Published via Nostr bridge';}catch(e){s.textContent='Error: '+e.message;}});
  const sd=JSON.stringify({v:1,n:_meta.name||'',b:keys?.bchAddr||'',p:keys?.sessionPub?_npub(keys.sessionPub):''});
  document.getElementById('dt-id-json').textContent=sd;_qr('dt-id-qr',sd);
  document.getElementById('dt-id-cj')?.addEventListener('click',async()=>{await navigator.clipboard.writeText(sd);const b=document.getElementById('dt-id-cj');if(b){b.textContent='✓ Copied!';setTimeout(()=>b.textContent='📋 Copy JSON',1500);}});
  document.getElementById('dt-id-cl')?.addEventListener('click',async()=>{await navigator.clipboard.writeText(location.origin+location.pathname+'#id:'+btoa(sd));const b=document.getElementById('dt-id-cl');if(b){b.textContent='✓ Copied!';setTimeout(()=>b.textContent='🔗 Copy Link',1500);}});
  document.getElementById('dt-id-resolve')?.addEventListener('click',async()=>{const input=document.getElementById('dt-id-li')?.value.trim(),el=document.getElementById('dt-id-lr');if(!input||!el)return;el.innerHTML='<div style="text-align:center;color:var(--dt-text-secondary)">🔍 Searching...</div>';
    let ph=input;if(input.startsWith('npub1'))try{ph=_decodeNpub(input);}catch{}
    if(ph.length!==64){el.innerHTML='<div style="color:var(--dt-danger)">Invalid pubkey</div>';return;}
    const m=await _nostrFetch(ph);if(!m){el.innerHTML='<div style="color:var(--dt-text-secondary)">No identity found</div>';return;}
    try{const p=JSON.parse(m.content),np=_npub(ph);el.innerHTML=`<div class="dt-card" style="padding:20px"><div style="display:flex;align-items:center;gap:16px;margin-bottom:16px"><canvas id="dt-la" width="48" height="48" style="border-radius:50%"></canvas><div><div style="font-size:16px;font-weight:700;color:var(--dt-text)">${p.name||'Anonymous'}</div><div style="font-size:12px;color:var(--dt-text-secondary)">${p.about||''}</div></div></div><div style="font-family:monospace;font-size:10px;color:var(--dt-text-secondary);word-break:break-all;margin-bottom:12px">${np}</div><div style="display:flex;gap:8px"><button class="dt-action-btn-outline" style="flex:1;font-size:11px" onclick="navigator.clipboard.writeText('${np}')">Copy npub</button><button class="dt-action-btn-outline" style="flex:1;font-size:11px" onclick="window.location.hash='#/chat'">💬 Chat</button><button class="dt-action-btn-outline" style="flex:1;font-size:11px" onclick="window.location.hash='#/mesh'">◈ Follow</button></div></div>`;_drawAvatar(ph,document.getElementById('dt-la'));}catch{el.innerHTML='<div style="color:var(--dt-danger)">Parse error</div>';}});
}

export function mount(container){_container=container;if(!auth.isUnlocked()){navigate('auth');return;}const keys=auth.getKeys();container.innerHTML=_template(keys);_bind(keys);}
export function unmount(){for(const sid of _subIds)nostrUnsubscribe(sid);_subIds=[];_unsubs.forEach(fn=>fn());_unsubs=[];if(_container)_container.innerHTML='';_container=null;}
