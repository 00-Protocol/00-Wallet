// 0penw0rld SharedWorker — persistent Electrum WebSocket connections
// Survives page navigations. One WS per chain shared across all tabs/pages.

const chains = {};  // 'bch' | 'btc' → chain state
let portId = 0;

function initChain(name) {
  if (chains[name]) return chains[name];
  chains[name] = {
    ws: null,
    connected: false,
    server: '',
    servers: [],
    serverIdx: 0,
    reqId: 0,
    pending: new Map(),     // wsReqId → {portId, clientReqId}
    subscriptions: new Map(), // "method:param0" → Set<portId>
    ports: new Map(),       // portId → MessagePort
    connectTimer: null,
    reconnectTimer: null,
    queue: [],              // calls queued while connecting
  };
  return chains[name];
}

// ── Connect to Electrum server ──
function connect(name) {
  const c = chains[name];
  if (!c || !c.servers.length) return;
  if (c.ws) { try { c.ws.close(); } catch(e){} c.ws = null; }
  clearTimeout(c.connectTimer);
  clearTimeout(c.reconnectTimer);

  const url = c.servers[c.serverIdx % c.servers.length];
  c.server = url;
  let opened = false;

  try {
    const ws = new WebSocket(url);
    c.ws = ws;

    // Timeout — 8s to connect
    c.connectTimer = setTimeout(() => {
      if (!opened) { ws.close(); rotateAndReconnect(name); }
    }, 8000);

    ws.onopen = () => {
      opened = true;
      clearTimeout(c.connectTimer);
      // Electrum handshake
      const hId = ++c.reqId;
      ws.send(JSON.stringify({ id: hId, method: 'server.version', params: ['00shared', '1.4'] }));
      c.pending.set(hId, { portId: -1, clientReqId: -1 }); // internal, not routed
    };

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch(err) { return; }

      // Handshake response
      if (msg.id && c.pending.has(msg.id)) {
        const p = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        if (p.portId === -1) {
          // Handshake complete — connected
          c.connected = true;
          broadcastStatus(name);
          resubscribeAll(name);
          flushQueue(name);
          return;
        }
        // Route response to originating port
        const port = c.ports.get(p.portId);
        if (port) {
          try {
            port.postMessage({
              type: 'result', chain: name, id: p.clientReqId,
              result: msg.result !== undefined ? msg.result : undefined,
              error: msg.error || undefined
            });
          } catch(err) { c.ports.delete(p.portId); }
        }
        return;
      }

      // Push notification (subscription)
      if (msg.method) {
        const key = msg.method + ':' + (msg.params && msg.params[0] !== undefined ? msg.params[0] : '');
        const subs = c.subscriptions.get(key);
        if (subs) {
          for (const pid of subs) {
            const port = c.ports.get(pid);
            if (port) {
              try {
                port.postMessage({ type: 'notification', chain: name, method: msg.method, params: msg.params });
              } catch(err) { subs.delete(pid); c.ports.delete(pid); }
            } else { subs.delete(pid); }
          }
        }
        // Also broadcast to wildcard subscribers (key "method:*")
        const wildKey = msg.method + ':*';
        const wildSubs = c.subscriptions.get(wildKey);
        if (wildSubs) {
          for (const pid of wildSubs) {
            const port = c.ports.get(pid);
            if (port) {
              try {
                port.postMessage({ type: 'notification', chain: name, method: msg.method, params: msg.params });
              } catch(err) { wildSubs.delete(pid); c.ports.delete(pid); }
            } else { wildSubs.delete(pid); }
          }
        }
        return;
      }
    };

    ws.onclose = () => {
      c.ws = null;
      c.connected = false;
      broadcastStatus(name);
      // Reject all pending
      for (const [wid, p] of c.pending) {
        if (p.portId !== -1) {
          const port = c.ports.get(p.portId);
          if (port) {
            try { port.postMessage({ type: 'result', chain: name, id: p.clientReqId, error: { message: 'connection closed' } }); } catch(err) {}
          }
        }
      }
      c.pending.clear();
      rotateAndReconnect(name);
    };

    ws.onerror = () => { /* onclose will fire */ };

  } catch(err) {
    rotateAndReconnect(name);
  }
}

function rotateAndReconnect(name) {
  const c = chains[name];
  if (!c) return;
  c.serverIdx++;
  // Pause longer if we've tried all servers
  const delay = (c.serverIdx % c.servers.length === 0) ? 8000 : 3000;
  c.reconnectTimer = setTimeout(() => connect(name), delay);
}

function broadcastStatus(name) {
  const c = chains[name];
  if (!c) return;
  const msg = { type: 'status', chain: name, connected: c.connected, server: c.server };
  for (const [pid, port] of c.ports) {
    try { port.postMessage(msg); } catch(err) { c.ports.delete(pid); }
  }
}

function resubscribeAll(name) {
  const c = chains[name];
  if (!c || !c.ws || c.ws.readyState !== 1) return;
  for (const key of c.subscriptions.keys()) {
    if (key.endsWith(':*')) continue; // wildcard, not a real RPC sub
    const parts = key.split(':');
    const method = parts[0];
    const param0 = parts.slice(1).join(':');
    const wid = ++c.reqId;
    c.pending.set(wid, { portId: -1, clientReqId: -1 }); // internal
    c.ws.send(JSON.stringify({ id: wid, method: method, params: [param0] }));
  }
}

function flushQueue(name) {
  const c = chains[name];
  if (!c) return;
  const q = c.queue.splice(0);
  for (const item of q) {
    sendCall(name, item.portId, item.clientReqId, item.method, item.params);
  }
}

function sendCall(name, pid, clientReqId, method, params) {
  const c = chains[name];
  if (!c) return;
  if (!c.ws || c.ws.readyState !== 1) {
    // Queue for later
    c.queue.push({ portId: pid, clientReqId: clientReqId, method: method, params: params });
    return;
  }
  const wid = ++c.reqId;
  c.pending.set(wid, { portId: pid, clientReqId: clientReqId });
  c.ws.send(JSON.stringify({ id: wid, method: method, params: params || [] }));
}

// ── Port management ──
self.onconnect = function(e) {
  const port = e.ports[0];
  const pid = ++portId;

  port.onmessage = function(ev) {
    const msg = ev.data;

    if (msg.type === 'init') {
      const c = initChain(msg.chain);
      c.ports.set(pid, port);
      // Use server list from first init, or update if empty
      if (!c.servers.length && msg.servers && msg.servers.length) {
        c.servers = msg.servers;
        connect(msg.chain);
      } else {
        // Already connected or connecting — just send current status
        port.postMessage({ type: 'status', chain: msg.chain, connected: c.connected, server: c.server });
      }
    }

    else if (msg.type === 'call') {
      const c = chains[msg.chain];
      if (!c) return;
      c.ports.set(pid, port); // ensure registered
      sendCall(msg.chain, pid, msg.id, msg.method, msg.params);
    }

    else if (msg.type === 'subscribe') {
      const c = chains[msg.chain];
      if (!c) return;
      c.ports.set(pid, port);
      const param0 = msg.params && msg.params[0] !== undefined ? msg.params[0] : '*';
      const key = msg.method + ':' + param0;
      if (!c.subscriptions.has(key)) c.subscriptions.set(key, new Set());
      c.subscriptions.get(key).add(pid);
      // If this is a real subscription (not wildcard) and WS is connected, send the RPC
      if (param0 !== '*' && c.ws && c.ws.readyState === 1) {
        const wid = ++c.reqId;
        c.pending.set(wid, { portId: pid, clientReqId: msg.id || -1 });
        c.ws.send(JSON.stringify({ id: wid, method: msg.method, params: msg.params || [] }));
      }
    }

    else if (msg.type === 'status') {
      const c = chains[msg.chain];
      if (c) port.postMessage({ type: 'status', chain: msg.chain, connected: c.connected, server: c.server });
    }

    else if (msg.type === 'updateServers') {
      const c = chains[msg.chain];
      if (c) {
        c.servers = msg.servers || [];
        c.serverIdx = 0;
        if (c.ws) { try { c.ws.close(); } catch(e){} }
        else connect(msg.chain);
      }
    }
  };

  // Cleanup when port disconnects
  port.onmessageerror = function() { removePort(pid); };
  // Note: there's no reliable "port close" event in SharedWorker.
  // Ports from navigated-away pages become garbage collected.
  // We handle stale ports via try/catch in postMessage calls.
};

function removePort(pid) {
  for (const name in chains) {
    const c = chains[name];
    c.ports.delete(pid);
    for (const [key, subs] of c.subscriptions) {
      subs.delete(pid);
      if (subs.size === 0) c.subscriptions.delete(key);
    }
  }
}
