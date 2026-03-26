/* 00 Wallet — Analyse View (SPA v2) — Full Blockchain Tracer with Cytoscape Graph */
import * as auth from '../core/auth.js';
import { navigate } from '../router.js';

export const id = 'analyse';
export const title = '00 Analyse';
export const icon = '◪';
let _container = null, _unsubs = [];

/* ── State ── */
let _graphNodes = new Map(), _graphEdges = [], _tracing = false, _cy = null, _activeChain = 'bch', _selectedNode = null;
let _FV, _ETH_RPC;

/* ── Crypto (lazy loaded) ── */
let _sha256, _ripemd160;
async function _loadCrypto() {
  if (_sha256) return;
  const [h, r] = await Promise.all([
    import('https://esm.sh/@noble/hashes@1.7.1/sha256'),
    import('https://esm.sh/@noble/hashes@1.7.1/ripemd160'),
  ]);
  _sha256 = h.sha256; _ripemd160 = r.ripemd160;
}

/* ── Helpers ── */
const b2h = b => [...b].map(x => x.toString(16).padStart(2,'0')).join('');
const h2b = h => new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x,16)));
const dsha256 = d => _sha256(_sha256(d));
function satsToBch(s) { return (s/1e8).toFixed(8).replace(/\.?0+$/,'') || '0'; }
function shortAddr(a) { if(!a) return '???'; const c=a.replace('bitcoincash:',''); return c.slice(0,6)+'...'+c.slice(-4); }
function shortTxid(t) { return t.slice(0,8)+'...'+t.slice(-6); }
function shortEthAddr(a) { return a?a.slice(0,6)+'...'+a.slice(-4):'???'; }
function weiToEth(h) { const w=BigInt(h||'0x0'); const e=Number(w)/1e18; return e===0?'0':e<0.0001?e.toExponential(2):e.toFixed(6).replace(/\.?0+$/,''); }

/* ── CashAddr ── */
const _caCharset='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function _caPolymod(v){const G=[0x98f2bc8e61n,0x79b76d99e2n,0xf33e5fb3c4n,0xae2eabe2a8n,0x1e4f43e470n];let c=1n;for(const d of v){const c0=c>>35n;c=((c&0x07ffffffffn)<<5n)^BigInt(d);if(c0&1n)c^=G[0];if(c0&2n)c^=G[1];if(c0&4n)c^=G[2];if(c0&8n)c^=G[3];if(c0&16n)c^=G[4];}return c^1n;}
function pubHashToCashAddr(h20,vb=0x00){const p=new Uint8Array([vb,...h20]);const d5=[];let ac=0,bi=0;for(const b of p){ac=(ac<<8)|b;bi+=8;while(bi>=5){bi-=5;d5.push((ac>>bi)&31);}}if(bi>0)d5.push((ac<<(5-bi))&31);const pe=[...'bitcoincash'.split('').map(c=>c.charCodeAt(0)&31),0];const mod=_caPolymod([...pe,...d5,0,0,0,0,0,0,0,0]);const cs=[];for(let i=7;i>=0;i--)cs.push(Number((mod>>(BigInt(i)*5n))&31n));return'bitcoincash:'+[...d5,...cs].map(v=>_caCharset[v]).join('');}
function cashAddrToHash20(addr){const a=addr.replace(/^bitcoincash:/,'');const data=[];for(const c of a.toLowerCase()){const v=_caCharset.indexOf(c);if(v===-1)throw new Error('bad');data.push(v);}const pl=data.slice(0,-8);const cv=[];let ac=0,bi=0;for(const v of pl){ac=(ac<<5)|v;bi+=5;while(bi>=8){bi-=8;cv.push((ac>>bi)&0xff);}}return new Uint8Array(cv.slice(1,21));}
function scriptToAddr(s){if(s.length===50&&s.startsWith('76a914')&&s.endsWith('88ac'))return pubHashToCashAddr(Array.from(h2b(s.slice(6,46))));if(s.length===46&&s.startsWith('a914')&&s.endsWith('87'))return pubHashToCashAddr(Array.from(h2b(s.slice(4,44))),0x08);return null;}
function addrScriptHash(addr){const h=cashAddrToHash20(addr);const s=new Uint8Array([0x76,0xa9,0x14,...h,0x88,0xac]);return b2h(_sha256(s).reverse());}

/* ── Fulcrum ── */
function fulcrumCall(m,p){if(window._fvCall)return window._fvCall(m,p);return Promise.reject(new Error('no fulcrum'));}

/* ── ETH RPC ── */
let _ethId=1;
async function ethCall(m,p){const r=await fetch(_ETH_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:_ethId++,method:m,params:p})});const j=await r.json();if(j.error)throw new Error(j.error.message);return j.result;}

/* ── Graph helpers ── */
function addNode(id,d){if(!_graphNodes.has(id))_graphNodes.set(id,d);}
function addEdge(s,t,l,v,tx){const eid=s+'>'+t+':'+tx;if(!_graphEdges.some(e=>e.id===eid))_graphEdges.push({id:eid,source:s,target:t,label:l,value:v,txid:tx});}
function statusMsg(m){const e=document.getElementById('dt-trace-status');if(e)e.textContent=m;}

/* ── TX Parsing ── */
function parseTxFull(hex){try{const b=h2b(hex);let p=0;const rB=n=>{const s=b.slice(p,p+n);p+=n;return s;};const rLE4=()=>{let r=0;for(let i=0;i<4;i++)r|=b[p+i]<<(i*8);p+=4;return r>>>0;};const rLE8=()=>{let lo=rLE4(),hi=rLE4();return hi*0x100000000+lo;};const rVI=()=>{const f=b[p++];if(f<0xfd)return f;if(f===0xfd){const v=b[p]|(b[p+1]<<8);p+=2;return v;}if(f===0xfe)return rLE4();return 0;};rLE4();const inCount=rVI();const inputs=[];for(let i=0;i<inCount;i++){const txidLE=rB(32);const prevTxid=b2h([...txidLE].reverse());const prevVout=rLE4();const ssLen=rVI();const scriptSig=rB(ssLen);rLE4();let address=null;if(scriptSig.length>=35){let sp=0;const sigLen=scriptSig[sp++];sp+=sigLen;if(sp<scriptSig.length){const pubLen=scriptSig[sp++];if((pubLen===33||pubLen===65)&&sp+pubLen<=scriptSig.length){const pubkey=scriptSig.slice(sp,sp+pubLen);const hash=_ripemd160(_sha256(pubkey));address=pubHashToCashAddr(Array.from(hash));}}}inputs.push({prevTxid,prevVout,address});}const outCount=rVI();const outputs=[];for(let i=0;i<outCount;i++){const value=rLE8();const scriptLen=rVI();const script=b2h(rB(scriptLen));outputs.push({value,script,address:scriptToAddr(script),index:i});}return{txid:b2h(dsha256(b).reverse()),inputs,outputs};}catch{return null;}}

/* ── BCH Tracing ── */
async function traceTxid(txid,depth){statusMsg('Fetching TX '+shortTxid(txid)+'...');const raw=await fulcrumCall('blockchain.transaction.get',[txid]);if(!raw){statusMsg('TX not found');return;}const tx=parseTxFull(raw);if(!tx){statusMsg('Parse failed');return;}const tn='tx:'+txid;addNode(tn,{type:'tx',label:shortTxid(txid),fullTxid:txid,isCenter:true});for(const inp of tx.inputs){if(inp.address){addNode(inp.address,{type:'address',label:shortAddr(inp.address),fullAddr:inp.address,role:'source'});addEdge(inp.address,tn,'',0,txid);if(depth>=1&&inp.prevTxid!=='0'.repeat(64)){try{const pr=await fulcrumCall('blockchain.transaction.get',[inp.prevTxid]);if(pr){const pt=parseTxFull(pr);if(pt&&pt.outputs[inp.prevVout]){const po=pt.outputs[inp.prevVout];const ei=_graphEdges.findIndex(e=>e.source===inp.address&&e.target===tn);if(ei>=0){_graphEdges[ei].label=satsToBch(po.value)+' BCH';_graphEdges[ei].value=po.value;}const ptn='tx:'+inp.prevTxid;addNode(ptn,{type:'tx',label:shortTxid(inp.prevTxid),fullTxid:inp.prevTxid});addEdge(ptn,inp.address,satsToBch(po.value)+' BCH',po.value,inp.prevTxid);for(const pi of pt.inputs)if(pi.address){addNode(pi.address,{type:'address',label:shortAddr(pi.address),fullAddr:pi.address,role:'source'});addEdge(pi.address,ptn,'',0,inp.prevTxid);}}}}catch{}}}}for(const out of tx.outputs){if(out.address){addNode(out.address,{type:'address',label:shortAddr(out.address),fullAddr:out.address,role:'dest'});addEdge(tn,out.address,satsToBch(out.value)+' BCH',out.value,txid);if(depth>=1){try{const sh=addrScriptHash(out.address);const hist=await fulcrumCall('blockchain.scripthash.get_history',[sh])||[];for(const h of hist.filter(h=>h.tx_hash!==txid).slice(-5)){const fr=await fulcrumCall('blockchain.transaction.get',[h.tx_hash]);if(!fr)continue;const ft=parseTxFull(fr);if(!ft||!ft.inputs.some(i=>i.address===out.address))continue;const ftn='tx:'+h.tx_hash;addNode(ftn,{type:'tx',label:shortTxid(h.tx_hash),fullTxid:h.tx_hash});addEdge(out.address,ftn,'',0,h.tx_hash);for(const fo of ft.outputs)if(fo.address){addNode(fo.address,{type:'address',label:shortAddr(fo.address),fullAddr:fo.address,role:'dest'});addEdge(ftn,fo.address,satsToBch(fo.value)+' BCH',fo.value,h.tx_hash);}}}catch{}}}}}

async function traceAddress(addr,depth,visited=new Set()){if(visited.has(addr)||depth<0)return;visited.add(addr);addNode(addr,{type:'address',label:shortAddr(addr),fullAddr:addr});statusMsg('Fetching history for '+shortAddr(addr)+'...');const sh=addrScriptHash(addr);const hist=await fulcrumCall('blockchain.scripthash.get_history',[sh])||[];for(const h of hist.slice(-20)){statusMsg('Parsing TX '+shortTxid(h.tx_hash)+'...');const raw=await fulcrumCall('blockchain.transaction.get',[h.tx_hash]);if(!raw)continue;const tx=parseTxFull(raw);if(!tx)continue;const tn='tx:'+h.tx_hash;addNode(tn,{type:'tx',label:shortTxid(h.tx_hash),fullTxid:h.tx_hash});for(const inp of tx.inputs)if(inp.address){addNode(inp.address,{type:'address',label:shortAddr(inp.address),fullAddr:inp.address});addEdge(inp.address,tn,'',0,h.tx_hash);}for(const out of tx.outputs)if(out.address){addNode(out.address,{type:'address',label:shortAddr(out.address),fullAddr:out.address});addEdge(tn,out.address,satsToBch(out.value)+' BCH',out.value,h.tx_hash);}if(depth>1){for(const inp of tx.inputs)if(inp.address&&inp.address!==addr)await traceAddress(inp.address,depth-1,visited);for(const out of tx.outputs)if(out.address&&out.address!==addr)await traceAddress(out.address,depth-1,visited);}}}

/* ── ETH Tracing ── */
async function ethGetAddrTxs(addr){try{const r=await fetch(`https://api.blockchair.com/ethereum/dashboards/address/${addr}?limit=20`);const j=await r.json();return j.data?.[addr.toLowerCase()]?.transactions||[];}catch{return[];}}
async function traceEthTxid(txid,depth){statusMsg('Fetching ETH TX...');const tx=await ethCall('eth_getTransactionByHash',[txid]);if(!tx){statusMsg('TX not found');return;}const tn='tx:'+txid;addNode(tn,{type:'tx',label:shortTxid(txid),fullTxid:txid,isCenter:true});if(tx.from){const f=tx.from.toLowerCase();addNode(f,{type:'address',label:shortEthAddr(f),fullAddr:f,role:'source'});addEdge(f,tn,weiToEth(tx.value)+' ETH',0,txid);}if(tx.to){const t=tx.to.toLowerCase();addNode(t,{type:'address',label:shortEthAddr(t),fullAddr:t,role:'dest'});addEdge(tn,t,weiToEth(tx.value)+' ETH',0,txid);}if(depth>=1){for(const a of[tx.from,tx.to].filter(Boolean)){const addr=a.toLowerCase();const txs=await ethGetAddrTxs(addr);for(const h of txs.filter(x=>x!==txid).slice(0,5)){try{const ht=await ethCall('eth_getTransactionByHash',[h]);if(!ht)continue;const htn='tx:'+h;addNode(htn,{type:'tx',label:shortTxid(h),fullTxid:h});if(ht.from){const hf=ht.from.toLowerCase();addNode(hf,{type:'address',label:shortEthAddr(hf),fullAddr:hf,role:'source'});addEdge(hf,htn,'',0,h);}if(ht.to){const ht2=ht.to.toLowerCase();addNode(ht2,{type:'address',label:shortEthAddr(ht2),fullAddr:ht2,role:'dest'});addEdge(htn,ht2,weiToEth(ht.value)+' ETH',0,h);}}catch{}}}}}
async function traceEthAddr(addr,depth,visited=new Set()){addr=addr.toLowerCase();if(visited.has(addr)||depth<0)return;visited.add(addr);addNode(addr,{type:'address',label:shortEthAddr(addr),fullAddr:addr});const txs=await ethGetAddrTxs(addr);for(const h of txs.slice(0,15)){try{const tx=await ethCall('eth_getTransactionByHash',[h]);if(!tx)continue;const tn='tx:'+h;addNode(tn,{type:'tx',label:shortTxid(h),fullTxid:h});if(tx.from){addNode(tx.from.toLowerCase(),{type:'address',label:shortEthAddr(tx.from),fullAddr:tx.from.toLowerCase()});addEdge(tx.from.toLowerCase(),tn,'',0,h);}if(tx.to){addNode(tx.to.toLowerCase(),{type:'address',label:shortEthAddr(tx.to),fullAddr:tx.to.toLowerCase()});addEdge(tn,tx.to.toLowerCase(),weiToEth(tx.value)+' ETH',0,h);}if(depth>1)for(const na of[tx.from,tx.to].filter(Boolean))if(na.toLowerCase()!==addr)await traceEthAddr(na,depth-1,visited);}catch{}}}

/* ── Graph Rendering (Cytoscape) ── */
async function renderGraph(centerId){
  document.getElementById('graph-empty').style.display='none';
  if(!window.cytoscape){const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.4/cytoscape.min.js';document.head.appendChild(s);await new Promise(r=>{s.onload=r;});}
  const elements=[];
  for(const[id,data]of _graphNodes){const cl=[];if(data.isCenter||id===centerId)cl.push('center');if(data.type==='tx')cl.push('tx-node');if(data.role==='source')cl.push('source');if(data.role==='dest')cl.push('dest');elements.push({data:{id,label:data.label,type:data.type,...data},classes:cl.join(' ')});}
  for(const e of _graphEdges)elements.push({data:{id:e.id,source:e.source,target:e.target,label:e.label||'',value:e.value,txid:e.txid}});
  if(_cy)_cy.destroy();_selectedNode=null;
  const isDark=document.documentElement.getAttribute('data-theme')!=='light';
  const tc=isDark?'#aaa':'#555',ec=isDark?'#444':'#ccc';
  _cy=cytoscape({container:document.getElementById('graph-container'),elements,style:[{selector:'node',style:{'background-color':'#4f8eff',label:'data(label)','font-size':'9px','font-family':'SF Mono, monospace',color:tc,'text-outline-color':isDark?'#111':'#fff','text-outline-width':1.5,'text-valign':'bottom','text-margin-y':8,width:40,height:40,'border-width':2,'border-color':'rgba(255,255,255,.15)'}},{selector:'node.center',style:{'background-color':'#ff4040',width:52,height:52,'border-width':3,'border-color':'#ff6060','font-size':'11px','font-weight':'bold'}},{selector:'node.source',style:{'background-color':'#1DD9A5'}},{selector:'node.dest',style:{'background-color':'#4f8eff'}},{selector:'node.tx-node',style:{'background-color':'#f0a500',shape:'diamond',width:30,height:30,'font-size':'8px','text-opacity':0.6}},{selector:'edge',style:{width:1.5,'line-color':ec,'target-arrow-color':ec,'target-arrow-shape':'triangle','arrow-scale':0.8,'curve-style':'bezier',label:'data(label)','font-size':'8px','font-family':'SF Mono, monospace',color:isDark?'#888':'#666','text-outline-color':isDark?'#111':'#fff','text-outline-width':1,'text-rotation':'autorotate'}}],layout:{name:'cose',animate:true,animationDuration:800,nodeRepulsion:60000,idealEdgeLength:200,edgeElasticity:80,gravity:0.08,numIter:1000,padding:40,nodeDimensionsIncludeLabels:true},minZoom:0.2,maxZoom:3,wheelSensitivity:0.3});
  _selectedNode = null;
  _cy.on('tap','node',e=>{
    if (_selectedNode) { try { _selectedNode.style({'border-width':2,'border-color':'rgba(255,255,255,.15)','width':_selectedNode.data('type')==='tx'?30:40,'height':_selectedNode.data('type')==='tx'?30:40}); } catch {} }
    _selectedNode = e.target;
    const isCenter = _selectedNode.hasClass('center');
    const baseSize = _selectedNode.data('type')==='tx' ? 30 : (isCenter ? 52 : 40);
    _selectedNode.style({'border-width':6,'border-color':'#ff4040','width':baseSize+16,'height':baseSize+16});
    showDetail(e.target.data());
  });
  _cy.on('tap',e=>{if(e.target===_cy){if(_selectedNode){const isTx=_selectedNode.data('type')==='tx';const isC=_selectedNode.hasClass('center');_selectedNode.style({'border-width':isC?3:2,'border-color':isC?'#ff6060':'rgba(255,255,255,.15)','width':isTx?30:(isC?52:40),'height':isTx?30:(isC?52:40)});_selectedNode=null;}closeDetail();}});
}

function showDetail(data){const panel=document.getElementById('detail-panel');const title=document.getElementById('detail-title');const content=document.getElementById('detail-content');panel.style.display='block';const isEth=_activeChain==='eth';const base=isEth?'https://etherscan.io':'https://blockchair.com/bitcoin-cash';if(data.type==='tx'){title.textContent='Transaction';const txid=data.fullTxid||data.id.replace('tx:','');content.innerHTML=`<div style="margin-bottom:8px"><strong>TXID:</strong></div><div style="font-size:10px;color:var(--dt-accent);margin-bottom:12px">${txid}</div><a href="${isEth?base+'/tx/'+txid:base+'/transaction/'+txid}" target="_blank" style="color:var(--dt-accent);font-size:11px">View on ${isEth?'Etherscan':'Blockchair'} →</a>`;}else{title.textContent='Address';const addr=data.fullAddr||data.id;const inE=_graphEdges.filter(e=>e.target===data.id),outE=_graphEdges.filter(e=>e.source===data.id);const tIn=inE.reduce((s,e)=>s+(e.value||0),0),tOut=outE.reduce((s,e)=>s+(e.value||0),0);content.innerHTML=`<div style="margin-bottom:8px"><strong>Address:</strong></div><div style="font-size:10px;color:var(--dt-accent);margin-bottom:12px">${addr}</div><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Incoming:</span><span>${inE.length}</span></div><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Outgoing:</span><span>${outE.length}</span></div>${tIn>0?`<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Total In:</span><span style="color:#1DD9A5">${satsToBch(tIn)} BCH</span></div>`:''}<a href="${base}/address/${addr}" target="_blank" style="color:var(--dt-accent);font-size:11px">View on ${isEth?'Etherscan':'Blockchair'} →</a><div style="margin-top:8px"><button class="dt-action-btn-outline" style="width:100%;padding:8px;font-size:11px" id="trace-again-btn">Trace this address →</button></div>`;document.getElementById('trace-again-btn')?.addEventListener('click',()=>{document.getElementById('dt-analyse-input').value=addr;startTrace();});}}
function closeDetail(){document.getElementById('detail-panel').style.display='none';}

/* ── Main Trace ── */
async function startTrace(){
  const input=document.getElementById('dt-analyse-input').value.trim();
  const chain=document.getElementById('dt-analyse-chain').value;
  const depth=parseInt(document.getElementById('dt-analyse-depth').value)||1;
  if(!input){statusMsg('Enter a TX ID or address');return;}
  if(_tracing)return;
  _tracing=true;_graphNodes=new Map();_graphEdges=[];_activeChain=chain;
  const btn=document.getElementById('dt-trace-btn');btn.disabled=true;btn.textContent='Tracing...';
  closeDetail();
  try{
    if(chain==='eth'){const isTx=/^0x[0-9a-fA-F]{64}$/.test(input),isAddr=/^0x[0-9a-fA-F]{40}$/i.test(input);if(isTx){await traceEthTxid(input,depth);await renderGraph('tx:'+input);}else if(isAddr){await traceEthAddr(input,depth);await renderGraph(input.toLowerCase());}else statusMsg('Invalid — enter 0x txid or ETH address');}
    else{const isTx=/^[0-9a-fA-F]{64}$/.test(input),isAddr=input.startsWith('bitcoincash:')||input.startsWith('q')||input.startsWith('p');if(isTx){await traceTxid(input,depth);await renderGraph('tx:'+input);}else if(isAddr){const addr=input.startsWith('bitcoincash:')?input:'bitcoincash:'+input;await traceAddress(addr,depth);await renderGraph(addr);}else statusMsg('Invalid — enter txid or BCH address');}
    statusMsg(`Done — ${_graphNodes.size} nodes, ${_graphEdges.length} edges`);
  }catch(e){statusMsg('Error: '+e.message);console.error('[TRACE]',e);}
  _tracing=false;btn.disabled=false;btn.textContent='Trace →';
}

/* ── Template (exact v1 layout) ── */
function _template(){return `<div style="padding:24px 32px;width:100%;box-sizing:border-box">
  <div class="dt-page-header"><div class="dt-page-title-wrap"><div class="dt-page-icon" style="font-size:24px">⊙</div><div><div class="dt-page-title">Analyse</div><div class="dt-page-sub">Blockchain Transaction Tracer</div></div></div><div class="dt-page-actions"></div></div>
  <div class="dt-card"><div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
    <div class="dt-form-group" style="flex:1;min-width:300px;margin:0"><div class="dt-form-lbl">Transaction ID or Address</div><input class="dt-form-input" id="dt-analyse-input" placeholder="txid or address (BCH / 0x...)" style="margin:0"></div>
    <div class="dt-form-group" style="width:100px;margin:0"><div class="dt-form-lbl">Chain</div><select class="dt-form-input" id="dt-analyse-chain" style="margin:0;cursor:pointer"><option value="bch">BCH</option><option value="eth">ETH</option></select></div>
    <div class="dt-form-group" style="width:90px;margin:0"><div class="dt-form-lbl">Depth</div><select class="dt-form-input" id="dt-analyse-depth" style="margin:0;cursor:pointer"><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option></select></div>
    <button class="dt-action-btn" id="dt-trace-btn" style="width:140px;margin:0;height:42px;background:var(--dt-accent)">Trace →</button>
  </div><div id="dt-trace-status" style="font-size:11px;color:var(--dt-text-secondary);margin-top:8px;min-height:16px"></div></div>
  <div style="display:flex;gap:16px;margin-top:16px;flex:1;min-height:0">
    <div style="flex:1;min-width:0">
      <div id="graph-container" style="width:100%;height:calc(100vh - 260px);min-height:500px;background:var(--dt-surface);border-radius:16px;border:1px solid var(--dt-border);position:relative">
        <div id="graph-empty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:var(--dt-text-secondary);font-size:13px"><div style="font-size:48px;opacity:.3">⊙</div><div>Enter a TX ID or address to start tracing</div><div style="font-size:11px;opacity:.5">Depth 1 = 1 hop before + 1 hop after</div></div>
      </div>
      <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--dt-text-secondary)">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ff4040;margin-right:4px;vertical-align:middle"></span>Traced</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#1DD9A5;margin-right:4px;vertical-align:middle"></span>Source</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#4f8eff;margin-right:4px;vertical-align:middle"></span>Destination</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:5px 0 5px 0;background:#f0a500;margin-right:4px;vertical-align:middle"></span>Transaction</span>
      </div>
    </div>
    <div id="detail-panel" style="width:320px;display:none;flex-shrink:0"><div class="dt-card" style="position:sticky;top:16px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div class="dt-card-title" style="margin:0" id="detail-title">Details</div><button id="detail-close" style="background:none;border:none;color:var(--dt-text-secondary);cursor:pointer;font-size:16px">×</button></div><div id="detail-content" style="font-size:12px;color:var(--dt-text-secondary);line-height:1.8;word-break:break-all"></div></div></div>
  </div>
</div>`;}

/* ── Lifecycle ── */
export async function mount(container) {
  _container = container;
  if (!auth.isUnlocked()) { navigate('auth'); return; }
  await _loadCrypto();
  _FV = JSON.parse(localStorage.getItem('00_ep_fulcrum') || 'null') || ['wss://bch.imaginary.cash:50004'];
  _ETH_RPC = JSON.parse(localStorage.getItem('00_ep_eth_rpc') || 'null') || 'https://ethereum-rpc.publicnode.com';
  container.innerHTML = _template();
  document.getElementById('dt-trace-btn')?.addEventListener('click', startTrace);
  document.getElementById('dt-analyse-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') startTrace(); });
  document.getElementById('detail-close')?.addEventListener('click', closeDetail);
  // Resize graph on window resize
  window._analyseResize = () => { if (_cy) _cy.resize(); };
  window.addEventListener('resize', window._analyseResize);
}
export function unmount() { window.removeEventListener('resize', window._analyseResize); if (_cy) { _cy.destroy(); _cy = null; } _graphNodes = new Map(); _graphEdges = []; _unsubs.forEach(fn => fn()); _unsubs = []; if (_container) _container.innerHTML = ''; _container = null; }
