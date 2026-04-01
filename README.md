# 00 Wallet

> Self-custody crypto wallet & privacy suite — no servers, no accounts, runs entirely in your browser.

**Live → [0penw0rld.com](https://0penw0rld.com)** · `v0.1.0-beta`

---

## What it is

00 Wallet is a browser-native PWA built without any framework or build step. Every key is generated locally, every cryptographic operation happens client-side. No analytics, no tracking, no KYC, no backend.

It ships a suite of privacy primitives on top of a standard HD wallet — stealth payments, P2P CoinJoin, onion-routed payments, encrypted chat, and atomic swaps — all coordinated peer-to-peer over Nostr.

---

## Features

| Feature | Description |
|---|---|
| **HD Wallet** | BIP44 multi-chain — BCH, BTC, ETH, XMR, USDT, USDC. Seed backup, UTXO coin control, Ledger hardware support |
| **Stealth Payments** | Beaconless ECDH stealth addresses on BCH. No OP_RETURN required — outputs are indistinguishable from standard P2PKH |
| **P2P CashFusion** | CoinJoin coordinated over Nostr with gift-wrapped messages (NIP-59). No central coordinator — peers self-elect via lowest ephemeral pubkey |
| **Onion Payments** | Multi-hop payments using HTLC contracts and onion-routed paths over Nostr |
| **Encrypted Chat** | Split-knowledge messaging — half on-chain (OP_RETURN), half via Nostr. Neither side can read the message alone |
| **Atomic Swaps** | On-chain HTLC swaps BCH ↔ BTC and BCH ↔ XMR. Peer-to-peer orderbook on Nostr |
| **DEX** | Cauldron DEX integration — on-chain BCH/token swaps |
| **Lending** | Moria Protocol — borrow MUSD against BCH collateral, fully on-chain |
| **Vault** | Stealth multisig using MuSig2 key aggregation, state synced over Nostr |
| **Identity** | Sovereign DID — Nostr keypair as identity, shareable profile with BCH address and stealth paycode |
| **Mesh** | Nostr social — posts, DMs, relay management |

---

## Privacy Architecture

### Stealth Payments
Each payment derives a unique, unlinkable P2PKH address via ECDH on secp256k1:

```
Sender:   sharedSecret = ECDH(senderPriv, recipientScanPub)
          tweak c      = sha256(sha256(sharedX) || senderPub)
          outputAddr   = P2PKH(spendPub + c·G)

Receiver: sharedSecret = ECDH(scanPriv, senderPub)
          → same tweak c → same address
```

No OP_RETURN, no notification transaction. Outputs look like ordinary P2PKH.

**Paycode format:**
```
stealth:<scan_pubkey_hex_33bytes><spend_pubkey_hex_33bytes>
```

**Key paths (BIP352-style):**
```
m/352'/145'/0'/1'/0   ← scan key  (hardened, isolated tree)
m/352'/145'/0'/0'/0   ← spend key (hardened, isolated tree)
```

### P2P CashFusion
CoinJoin with zero central infrastructure:

1. Wallets broadcast a pool announcement (`kind:22230`) with an ephemeral pubkey on Nostr
2. After a random delay (0–180s), all participants sort ephemeral pubkeys → **lowest = round coordinator**
3. Coordinator sends `round_start` gift-wrapped (NIP-59) to each peer
4. Inputs are collected, outputs are routed via onion layers
5. Coordinator assembles the unsigned TX, collects partial signatures, broadcasts

Each output goes to a fresh stealth address. No coordinator server, no relay dependency.

---

## Tech Stack

- **Pure HTML/CSS/JS** — no framework, no build step, no bundler
- **PWA** — installable, offline-capable via Service Worker
- **[@noble/curves](https://github.com/paulmillr/noble-curves)** — secp256k1, X25519, Ed25519, Schnorr
- **[@noble/hashes](https://github.com/paulmillr/noble-hashes)** — SHA-256, RIPEMD-160, HMAC, PBKDF2, Keccak
- **[Fulcrum ElectrumX](https://github.com/cculianu/Fulcrum)** — blockchain queries over WebSocket
- **[Nostr](https://nostr.com)** — peer coordination, notifications, social
- **[monero-ts](https://github.com/monero-ecosystem/monero-ts)** — XMR wallet scanning & atomic swap support
- **[esm.sh](https://esm.sh)** — runtime ES module delivery, zero bundling

---

## Security

| Concern | Approach |
|---|---|
| Key generation | `crypto.getRandomValues()` — OS entropy |
| Key storage | AES-256-GCM, PBKDF2-SHA256 (200k iterations), unique salt + IV, stored in `localStorage` |
| BIP39 | 2,048 PBKDF2-SHA512 iterations → BIP32 master → BIP44 derivation |
| Sessions | 30-minute TTL — no persistent plaintext keys in memory |
| Stealth isolation | Hardened derivation — scan key compromise cannot expose spend key |
| No telemetry | Zero analytics, no third-party requests, no tracking |

---

## Run

```bash
# Option 1 — just open the live app
# https://0penw0rld.com

# Option 2 — serve locally
npx serve landing

# Option 3 — any static file server
cd landing && python3 -m http.server 8080
```

No build step, no `npm install` required.

---

## Structure

```
landing/
├── index.html              SPA shell (entry point)
├── v2.html                 SPA shell v2
├── app.js                  Boot, router, module loader
├── shell.js                Sidebar, nav, shared UI
├── desktop.css             Layout + CSS variables (light/dark)
├── chains.js               Multi-chain config (BCH/BTC/ETH/XMR...)
├── sw.js                   Service Worker (PWA/offline)
├── manifest.json           PWA manifest
│
├── core/                   Cryptographic primitives
│   ├── auth.js             Vault encryption, session management
│   ├── stealth.js          ECDH stealth derivation + scanning
│   ├── send-bch.js         BCH transaction builder
│   ├── addr-derive.js      HD address derivation
│   └── ...                 Multi-chain send, XMR keys, Polymarket
│
├── views/                  SPA views (lazy-loaded)
│   ├── wallet.js           Wallet — balances, TX history, UTXO
│   ├── fusion.js           P2P CashFusion (CoinJoin)
│   ├── onion.js            Onion-routed payments
│   ├── chat.js             Split-knowledge encrypted chat
│   ├── swap.js             Atomic swaps BCH ↔ BTC / XMR
│   ├── sub.js              Subscriptions
│   ├── bet.js              Prediction markets (Polymarket)
│   └── ...                 DEX, loan, vault, mesh, identity
│
├── services/               Background services
│   ├── balance-service.js  HD address scanner, live balance
│   ├── hd-scanner.js       Gap-limit HD derivation scanner
│   └── xmr-scanner.js      XMR subaddress scanner
│
├── lib/                    WASM bundles (Monero)
├── icons/                  PWA + coin icons
├── ws-bridge.js            Fulcrum WebSocket bridge
└── ws-shared.js            Shared WebSocket utilities
```

---

## Roadmap

- [ ] BIP352 aggregated ECDH for stealth scanning (5–10× faster)
- [ ] Atomic swap UX improvements
- [ ] Hardware wallet (Ledger) full integration
- [ ] Mobile layout
- [ ] v1.0.0-beta — full test coverage

---

## License

MIT
