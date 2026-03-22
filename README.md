# 00 Wallet

Self-custody crypto wallet & privacy suite — no servers, no accounts, runs in your browser.

**Live:** [0penw0rld.com](https://0penw0rld.com)

---

## Repository Structure

```
00-Wallet/
├── landing/                    # 00-Wallet PWA (22 modules, live at 0penw0rld.com)
├── indexer/                    # BCH P2PKH Pubkey Indexer (standalone service)
│   ├── pubkey-indexer.js       # Core: Fulcrum+BCHN sources, HTTP API, CLI, library export
│   ├── package.json
│   ├── start9/                 # Start9 OS package (produces .s9pk)
│   │   ├── Dockerfile
│   │   ├── manifest.yaml
│   │   ├── config.yaml
│   │   ├── docker_entrypoint.sh
│   │   ├── check-health.sh
│   │   └── instructions.md
│   └── scripts/                # Desktop binary build scripts (Linux / Mac / Windows)
│       ├── build-linux.sh
│       ├── build-mac.sh
│       ├── build-windows.sh
│       └── build-all.sh
└── bch-stealth-protocol/       # BCH Stealth Protocol spec (Stealth + Fusion + Onion)
    └── README.md
```

---

## BCH Stealth Protocol

> **Stealth + Fusion + Onion — one pipeline, maximum privacy.**
> See [`bch-stealth-protocol/README.md`](./bch-stealth-protocol/README.md) for the full spec.

The unified privacy pipeline for BCH:

```
Receive BCH → Onion routing → CoinJoin mixing → Stealth address output
```

**Auto Stealth Mode**: one toggle, all three activated automatically on every receive.
No other BCH wallet offers this full pipeline.

---

## Pubkey Indexer

Zero-knowledge scanning infrastructure for BCH privacy protocols.

Serves all P2PKH input pubkeys for any BCH block range. Wallets download the full
set and filter locally — the server never learns your scan key.

**Self-host on Start9:**
```bash
cd indexer/start9
make          # builds Docker image + .s9pk
start-sdk pack && start-sdk verify
```

**Run locally:**
```bash
cd indexer && npm install
node pubkey-indexer.js serve          # HTTP API on :3847
node pubkey-indexer.js scan --from 943000
```

**Desktop binary (cross-platform):**
```bash
cd indexer && bash scripts/build-all.sh
# outputs: dist/pubkey-indexer-linux, -mac, -mac-arm64, -win.exe
```

**API:** `GET /api/pubkeys?from=943000&to=943100`

---

## 00 Wallet Features

### Wallet
BIP44 HD wallet (`m/44'/145'/0'`) supporting BCH, Stealth BCH, BTC, ETH, XMR, USDC, USDT. Seed backup, multiple profiles, Ledger hardware support, UTXO coin control, gap-limit scanning.

### Stealth BCH (00 Protocol)
Beaconless ECDH stealth addresses — every payment goes to a unique one-time address, unlinkable on-chain. No OP_RETURN. Receiver scans via Pubkey Indexer. Combined with CoinJoin mixing.

### Onion Payments
Multi-hop HTLC routing over BCH, Nostr-coordinated. Funds route through relay nodes — no direct sender/receiver link. Per-hop CLTV and fee configuration.

### Fusion (CoinJoin)
CashFusion-style 6-phase CoinJoin over Nostr. No central coordinator. Onion-wrapped output registration. Configurable rounds (1–4).

### Swap
Atomic cross-chain swaps (BCH ↔ BTC, BCH ↔ XMR) with HTLC contracts. Peer-to-peer OTC orderbook on Nostr.

### Chat
Split-knowledge encrypted messaging. One half on-chain (OP_RETURN), one via Nostr. X25519 ECDH + AES-256-GCM per half. Neither layer can read it alone.

### Vault
Stealth multisig vaults with MuSig2 key aggregation. State synced over Nostr.

### DEX
Cauldron DEX — on-chain BCH token swaps.

### Loan
Moria Protocol — borrow MUSD stablecoins using BCH collateral.

### Mesh
Full Nostr client — posts, DMs, relay management, contact discovery.

### Identity
Nostr keypair as sovereign DID, publishable profile card.

---

## Tech Stack

- **Pure HTML/CSS/JS** — no framework, no build step, no bundler
- **PWA** — installable, offline-first via Service Worker
- **`@noble/curves`** — secp256k1, X25519, ed25519, Schnorr
- **`@noble/hashes`** — SHA-256, RIPEMD-160, HMAC, PBKDF2, keccak
- **Fulcrum ElectrumX** — blockchain queries over WebSocket
- **Nostr relays** — coordination, notifications, social, sync
- **Monero-ts** — XMR wallet scanning & atomic swap support

All crypto loaded at runtime via [esm.sh](https://esm.sh) — zero server-side code.

---

## Run the Wallet

Open [0penw0rld.com](https://0penw0rld.com) in a browser.

Or serve locally:
```bash
npx serve landing
```

---

## License

MIT
