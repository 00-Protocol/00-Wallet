# BCH Stealth Protocol

**Stealth + Fusion + Onion — one pipeline, one button, maximum privacy.**

> *No other BCH wallet offers this. This is the moat.*

---

## What Is It?

The BCH Stealth Protocol is a composable privacy pipeline for Bitcoin Cash that
unifies three independent privacy primitives into a single, automatic flow:

```
 Receive BCH
      │
      ▼
 ┌─────────────────────────────────┐
 │  1. ONION (00 Onion)            │  Route funds through multi-hop HTLC relay
 │     Multi-hop, Nostr-coordinated│  Hides sender IP, breaks network-level analysis
 └──────────────┬──────────────────┘
                │
                ▼
 ┌─────────────────────────────────┐
 │  2. FUSION (00 Joiner)          │  CashFusion-style CoinJoin mixing
 │     CoinJoin, Nostr-coordinated │  Breaks on-chain input/output linkage
 └──────────────┬──────────────────┘
                │
                ▼
 ┌─────────────────────────────────┐
 │  3. STEALTH (00 Protocol)       │  Output to beaconless ECDH stealth address
 │     ECDH, no OP_RETURN         │  Receiver address is unlinkable, unannounced
 └──────────────┬──────────────────┘
                │
                ▼
      Funds arrive at stealth address
      Receiver scans via Pubkey Indexer
      No link to sender, mixer, or receiver
```

**One button. No manual steps. All three, always.**

---

## Why Three? Why Together?

Each component attacks a different privacy leak:

| Component | What It Breaks |
|-----------|----------------|
| **Onion** | Network-level analysis (who sent to whom, IP linkage) |
| **Fusion** | On-chain input/output graph (which inputs funded which outputs) |
| **Stealth** | Address reuse, receiver identification, payment graph |

Separating them creates **metadata leaks**:
- Onion without Stealth: the final output address reveals the receiver
- Fusion without Stealth: change outputs can re-link identities
- Stealth without Fusion: the sender's inputs are still linkable to the payment

Together they form a complete privacy envelope. **Separating them is a bug.**

---

## Auto Stealth Mode

The user-facing feature is called **Auto Stealth Mode**:

- A single toggle in wallet settings (default: ON)
- When ON: every incoming payment automatically triggers Onion → Fusion → Stealth
- When OFF: funds arrive normally (useful when no relay is available)
- Rounds selector: choose 1, 2, 3, or 4 Fusion rounds (more rounds = more privacy)

```
Settings
  ┌──────────────────────────────────────┐
  │  ✅ Auto Stealth Mode  [ON]          │
  │                                      │
  │  Fusion Rounds:  [ 1 ] [●2] [ 3 ] [ 4] │
  │                                      │
  │  Pipeline: Onion + Fusion + Stealth  │
  │  Status: Ready                       │
  └──────────────────────────────────────┘
```

**Implementation in wallet.html:**
- On UTXO receive event: auto-trigger `startStealthPipeline(utxo)`
- `startStealthPipeline` = `routeOnion()` → `joinFusion()` → `sendStealth()`
- Each step's completion triggers the next automatically
- User sees a single status: "Stealth Pipeline Running…" / "Complete"

---

## Protocol Components

### 1. Stealth Addresses (00 Protocol)

**Specification**: `stealth.html` / `wallet.html:4139-4515`

The receiver publishes a **stealth paycode**:
```
stealth:<scan_pubkey_66hex><spend_pubkey_66hex>
```

**Sender flow** (no OP_RETURN, beaconless):
```
1. Pick first input's private key → derive its pubkey P_sender
2. Compute shared secret: S = ECDH(scan_pub_receiver, P_sender)
3. Derive one-time address: addr = Hash(S) · G + spend_pub_receiver
4. Send to addr
5. Notify receiver via Nostr DM (encrypted with scan_pub): { txid }
```

**Receiver scanning flow**:
```
1. Download all P2PKH input pubkeys for block range from Pubkey Indexer
2. For each pubkey P: compute S = ECDH(scan_priv, P)
3. Derive: addr_candidate = Hash(S) · G + spend_pub
4. Check if addr_candidate has UTXOs → match = payment received
5. Spend: derive spend_key = spend_priv + Hash(S)
```

**Key derivation paths:**
```
BIP39 seed path:  m/352'/145'/0'/0/i  (scan)
                  m/352'/145'/0'/1/i  (spend)
Raw hex keys:     scan_key  = SHA256("bch-stealth-scan:"  || raw_key)
                  spend_key = SHA256("bch-stealth-spend:" || raw_key)
```

---

### 2. P2PKH Pubkey Indexer

**The scanning backbone.** Without this, receivers must download full blocks.

**Architecture:**

```
                     ┌─────────────────────────────────┐
                     │         Source Layer             │
                     │                                  │
                     │  Mode A: Fulcrum (WSS)           │
                     │  - Public servers, no node       │
                     │  - blockchain.transaction.get()  │
                     │  - Default for quick setup       │
                     │                                  │
                     │  Mode B: Local Node (BCHN RPC)   │
                     │  - Local BCHN, full sovereignty  │
                     │  - getblock(hash, 2)             │
                     │  - For self-hosters (Start9)     │
                     └──────────────┬──────────────────┘
                                    │
                                    │ raw tx hex
                                    ▼
                     ┌─────────────────────────────────┐
                     │        Extract Layer             │
                     │                                  │
                     │  Parse P2PKH scriptSig inputs    │
                     │  Extract per input:              │
                     │   - compressed pubkey (33 bytes) │
                     │   - prevTxid (32 bytes)          │
                     │   - prevVout (4 bytes)           │
                     │   - vin index                    │
                     └──────────────┬──────────────────┘
                                    │
                          ┌─────────┴──────────┐
                          │                    │
                    ┌─────▼──────┐      ┌──────▼─────┐
                    │ JSON Cache │      │ Binary Cache│
                    │ per block  │      │ per block   │
                    │ (readable) │      │ (73 bytes/  │
                    │            │      │  entry)     │
                    └─────┬──────┘      └──────┬──────┘
                          │                    │
           ┌──────────────┼────────────────────┼──────────────┐
           │              │                    │              │
    ┌──────▼─────┐ ┌──────▼────┐       ┌──────▼─────┐ ┌─────▼──────┐
    │ HTTP/JSON  │ │    Tor    │       │   Binary   │ │  Library  │
    │ API        │ │  .onion   │       │   stdout   │ │  import   │
    │ port 3847  │ │  service  │       │  (pipe)    │ │  (JS/TS)  │
    └──────┬─────┘ └────┬──────┘       └──────┬─────┘ └─────┬──────┘
           │             │                    │              │
           ▼             ▼                    ▼              ▼
      Browser        Remote             CLI tools /      EC plugin /
      wallets        wallets            desktop app      any wallet
      (00-Wallet)    over Tor                            direct call
```

**Indexer API:**
```
GET /api/pubkeys?from={height}&to={height}
GET /api/health
GET /api/stats
```

**P2PKH scriptSig parsing:**
```
scriptSig bytes: <sig_push> <sig_71-73> <0x21> <pubkey_33>

sig_push:   0x47–0x49 (71–73 bytes)
0x21:       push 33 bytes (compressed pubkey prefix)
pubkey[0]:  0x02 or 0x03 (compressed point on secp256k1)
```

**Binary wire format:**

Stream entry (69 bytes, `scan --format binary` stdout):
```
┌──────────┬─────────────────┬──────────────┐
│ pubkey   │ outpoint_txid   │ outpoint_vout│
│ 33 bytes │    32 bytes     │   4 bytes    │
│ 02/03... │   big-endian    │   LE u32     │
└──────────┴─────────────────┴──────────────┘
```

File entry (106 bytes, stored in `.bin` block cache):
```
┌──────────┬──────────┬─────┬──────────┬─────────────────┬──────────────┐
│ height   │  txid    │ vin │  pubkey  │ outpoint_txid   │ outpoint_vout│
│  4 bytes │ 32 bytes │  1  │ 33 bytes │    32 bytes     │   4 bytes    │
│  LE u32  │  big-end │ u8  │ 02/03..  │   big-endian    │   LE u32     │
└──────────┴──────────┴─────┴──────────┴─────────────────┴──────────────┘
 total: 106 bytes/entry
```

Block file header (8 bytes, precedes each block's entries):
```
┌──────────┬──────────┐
│ height   │  count   │
│  4 bytes │  4 bytes │
│  LE u32  │  LE u32  │
└──────────┴──────────┘
followed by count × 106-byte entries
File is seekable: read header → skip count×106 → next block header
```

> Stream drops `height`, `txid`, and `vin` — only the data needed for ECDH scanning.
> Full file format retains all fields for seekable indexed access.

**Library usage:**
```js
const { createScanner } = require('./pubkey-indexer');
const scanner = createScanner({ source: 'fulcrum', cacheDir: './cache' });

for await (const { height, pubkey, prevTxid, prevVout } of scanner.pubkeys(943000, 943100)) {
  // ECDH check
  const shared = secp256k1.getSharedSecret(scanPriv, pubkey);
  const tweak  = sha256(shared);
  const candidate = secp256k1.pointAddScalar(spendPub, tweak);
  const addr   = p2pkh(candidate);
  if (myUtxos.has(addr)) { /* stealth payment found */ }
}
```

---

### 3. Fusion (CoinJoin — 00 Joiner)

**Implementation**: `fusion.html`

Multi-wallet, Nostr-coordinated CoinJoin mixing. 6-phase protocol:

```
Phase 1: Announcement   → broadcast intent to join round via Nostr
Phase 2: Registration   → register inputs + blinded outputs
Phase 3: Rounds         → onion-wrapped input/output matching
Phase 4: Reveal         → deblind outputs, verify no input/output link
Phase 5: Commit         → all peers sign the combined transaction
Phase 6: Broadcast      → submit to BCH network
```

Key properties:
- No central coordinator — Nostr ephemeral events only
- Onion-wrapped output registration (no coordinator knows who gets what)
- Configurable rounds: 1–4 passes through the mixer
- Input/output amounts must match (equal-value mixing)

---

### 4. Onion Routing (00 Onion)

**Implementation**: `onion.html`

Multi-hop HTLC payment routing over BCH, Nostr-coordinated:

```
Sender → Relay1 (HTLC) → Relay2 (HTLC) → Relay3 (HTLC) → Receiver
```

- Each hop: Hash Time Locked Contract on-chain
- Routing instructions onion-encrypted per hop (only next hop revealed)
- Nostr relays coordinate hop discovery and routing
- Relay pool: join with locked BCH, earn routing fees
- `onionLayer()` / `onionPeel()`: layered AES-GCM encryption

---

## Deployment Targets

### Target 1: Start9 / Server (Service Mode)

```
start9-pubkey-indexer/
├── Dockerfile              # node:18-alpine, ~50MB image
├── start9/
│   ├── manifest.yaml       # Start9 package manifest
│   ├── config.yaml         # UI config schema
│   ├── docker_entrypoint.sh
│   └── check-health.sh
└── pubkey-indexer.js       # Self-contained ~350 LOC
```

Behavior on Start9:
- Runs as background service, auto-start on boot
- HTTP API on port 3847 (LAN + Tor)
- Tor .onion auto-generated → usable from anywhere
- If BCHN installed on same server: auto-discovers RPC at `http://bchn:8332`
- If no node: falls back to public Fulcrum servers
- Dashboard: sync height, blocks cached, connected source, .onion address

### Target 2: AppImage / Desktop (Local Mode)

```
pubkey-indexer          (single binary via pkg, ~40MB)

Commands:
  pubkey-indexer serve                          # HTTP API (same as server)
  pubkey-indexer scan --from 943000             # JSON lines to stdout
  pubkey-indexer scan --from 943000 --format binary   # 69-byte records
  pubkey-indexer scan --from 943000 --source node --rpc http://localhost:8332
```

Build targets:
- `dist/pubkey-indexer-linux`      (Linux x64)
- `dist/pubkey-indexer-mac`        (macOS Intel)
- `dist/pubkey-indexer-mac-arm64`  (macOS Apple Silicon)
- `dist/pubkey-indexer-win.exe`    (Windows x64)

### Target 3: Library (Direct Wallet Integration)

```js
// EC plugin or any Node.js wallet
const { createScanner } = require('bch-pubkey-indexer');

const scanner = createScanner({
  source: 'fulcrum',       // 'fulcrum' (default) or 'local-node'
  cacheDir: './cache'
});

for await (const entry of scanner.pubkeys(943000, 943100)) {
  // entry: { height, vin, pubkey: Buffer(33), prevTxid: Buffer(32), prevVout }
}
```

No HTTP overhead. No JSON parsing. Direct binary iteration over cached data.

---

## Implementation Status

| Component | Status | File |
|-----------|--------|------|
| Stealth Addresses (00 Protocol) | ✅ Live | `wallet.html:4139-4515` |
| Pubkey Indexer API | ✅ Live | `indexer/pubkey-indexer.js` |
| Fusion (CoinJoin) | ✅ Live | `fusion.html` |
| Onion Routing | ✅ Live | `onion.html` |
| Auto Stealth Mode (unified pipeline) | 🔧 Next | `wallet.html` |
| Start9 package | 🔧 This week | `indexer/start9/` |
| Desktop binaries (Linux/Mac/Win) | 🔧 This week | `indexer/scripts/` |
| Configurable Fusion rounds (1–4) | 🔧 Next | `fusion.html` |
| BCHN node source mode | 🔧 Ready | `indexer/pubkey-indexer.js` |

---

## What Needs to Be Built Next

### High Priority

1. **Auto Stealth Mode toggle** in `wallet.html`
   - Single checkbox in Settings (default ON)
   - On UTXO receive: auto-trigger `onionRoute()` → `fusionJoin()` → `sendStealth()`
   - Round selector: 1 / 2 / 3 / 4

2. **Configurable Fusion rounds** in `fusion.html`
   - Currently fixed rounds — expose as config param
   - UI: four-button selector

3. **Start9 .s9pk packaging** (`indexer/start9/`)
   - `make` → `start-sdk pack` → `bch-pubkey-indexer.s9pk`
   - Submit to Start9 marketplace

4. **Desktop binary releases** (`indexer/scripts/`)
   - GitHub Actions CI: build all targets on tag push
   - Attach to GitHub release as downloadable assets

### Medium Priority

5. **BCHN source mode testing** — wire up and test `getblock(hash, 2)` path
6. **Binary cache format** — implement read-back path (currently write-only)
7. **Indexer URL config in 00-Wallet** — let users point to their Start9 .onion

---

## Repository Structure

```
00-Wallet/
├── landing/                    # 00-Wallet PWA (22 modules)
│   ├── wallet.html             # HD wallet + stealth implementation
│   ├── fusion.html             # CoinJoin (6-phase, Nostr)
│   ├── onion.html              # Multi-hop HTLC routing
│   ├── stealth.html            # Protocol specification
│   └── indexer.html            # Indexer API documentation
│
├── indexer/                    # Pubkey Indexer (standalone service)
│   ├── pubkey-indexer.js       # Core: Fulcrum+BCHN sources, HTTP API, CLI, library
│   ├── package.json
│   ├── start9/                 # Start9 packaging
│   │   ├── Dockerfile
│   │   ├── manifest.yaml       # StartOS package manifest
│   │   ├── config.yaml         # UI config schema
│   │   ├── docker_entrypoint.sh
│   │   ├── check-health.sh
│   │   ├── instructions.md
│   │   └── Makefile
│   └── scripts/                # Desktop build scripts
│       ├── build-linux.sh
│       ├── build-mac.sh
│       ├── build-windows.sh
│       └── build-all.sh
│
└── bch-stealth-protocol/       # This document — protocol spec
    └── README.md
```

---

## References

- [00 Protocol Stealth Spec](https://0penw0rld.com/stealth.html)
- [Pubkey Indexer API](https://0penw0rld.com/indexer.html)
- [BCH Research Forum — ECDH Stealth Addresses](https://bitcoincashresearch.org/t/ecdh-stealth-addresses-on-bitcoin-cash-implementation-code/1773)
- [BIP352 — Silent Payments](https://github.com/bitcoin/bips/blob/master/bip-0352.mediawiki)
- [CashFusion Protocol](https://cashfusion.org/)
