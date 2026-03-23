# 00 Wallet

Self-custody crypto wallet & privacy suite — no servers, no accounts, runs in your browser.

**Live:** [0penw0rld.com](https://0penw0rld.com)

---

## Features

### Wallet
BIP44 HD wallet (`m/44'/145'/0'`) supporting BCH, Stealth BCH, BTC, ETH, XMR, USDC, USDT. Seed backup, multiple profiles, Ledger hardware support, UTXO coin control, gap-limit scanning.

### Chat
Split-knowledge encrypted messaging. Messages are XOR-split into two halves — one embedded on-chain via OP_RETURN, one sent through Nostr ephemeral events. Each half is encrypted with X25519 ECDH + AES-256-GCM. Neither the blockchain nor the relay can read the message alone.

### Stealth BCH (00 Protocol)
Beaconless ECDH stealth payments on Bitcoin Cash — no OP_RETURN notification required. Every payment creates a unique, unlinkable P2PKH address on-chain. See [full spec](#stealth-addresses--00-protocol) below.

### Onion Payments
Multi-hop stealth payments using HTLC contracts and onion-routed paths. Payments are relayed through intermediary nodes — no direct link between sender and recipient. Coordinated via Nostr.

### Swap
Atomic cross-chain swaps (BCH ↔ BTC, BCH ↔ XMR) with on-chain HTLC contracts. Peer-to-peer OTC orderbook published on Nostr.

### DEX
Cauldron DEX integration — on-chain BCH token swaps with liquidity pools.

### Loan
Moria Protocol integration — borrow MUSD stablecoins using BCH as collateral. On-chain, decentralized, no intermediary.

### Vault
Stealth multisig vaults using MuSig2 — multi-party signing with key aggregation. Vault state synced over Nostr.

### Mesh
Nostr-based social network — posts, DMs, relay management, contact discovery.

### Identity
Sovereign decentralized ID — Nostr keypair as identity, publishable profile card with BCH address, stealth code, and vault pubkey.

### Fusion
CashFusion-style CoinJoin coordinated over Nostr. Multiple wallets combine inputs and outputs into a single transaction — breaks the tx graph with no central coordinator.

### WizardConnect
BCH HD wallet connection protocol for dapps. See [full spec](#wizardconnect) below.

### P2PKH Pubkey Indexer
Privacy-preserving blockchain indexer for stealth address scanning. See [full spec](#p2pkh-pubkey-indexer) below.

---

## Stealth Addresses — 00 Protocol

**[Live demo →](https://0penw0rld.com/stealth.html)**

The 00 Protocol implements beaconless stealth addresses on Bitcoin Cash using ECDH on secp256k1. No OP_RETURN notification transaction is needed — each payment produces a standard-looking P2PKH output with no on-chain link to the recipient.

### Paycode Format
```
stealth:<scan_pubkey_33bytes_hex><spend_pubkey_33bytes_hex>
```
Total: `stealth:` prefix + 66 hex chars (scan) + 66 hex chars (spend) = **140 characters**

### Key Derivation

**BIP32 path (recommended):**
```
m/352'/145'/0'/scan'/0     ← scan key (hardened branch)
m/352'/145'/0'/spend'/0    ← spend key (hardened branch)
```
BIP352-style derivation under a fully isolated tree. Compromise of the scan branch does not expose spend capability.

**Raw key method:**
SHA256 with domain separation (inspired by ERC-5564), deriving stealth keys from raw private keys without BIP32 infrastructure. Deterministic but wallet-import-specific — different entropy input produces different stealth keys.

### ECDH Mechanism

The `stealthDerive()` function:
1. ECDH shared secret between sender's UTXO private key and recipient's scan pubkey
2. Extract x-coordinate → tweak via double SHA256
3. One-time stealth pubkey: `P = spend_pub + (tweak × G)`
4. Convert to CashAddr P2PKH

Sender and receiver independently compute identical shared secrets — standard symmetric ECDH.

### Send Flow
1. Parse and validate recipient paycode
2. Select UTXOs (excluding stealth-received funds)
3. Derive one-time address using first UTXO private key
4. Build and broadcast standard P2PKH transaction
5. Send encrypted Nostr DM (kind 4) with transaction ID using an ephemeral key

### Receive Flow
1. Listen for encrypted Nostr DMs (kind 4)
2. Extract sender's input pubkeys from transaction
3. Compute ECDH with scan private key for each input pubkey
4. Test whether derived stealth address appears in transaction outputs
5. Compute tweaked spend key on match → register UTXO for normal spending

### Scanning Methods

| Method | Trigger | Coverage | Speed |
|---|---|---|---|
| Nostr DM | Real-time | Specific transaction | Instant |
| Periodic Auto-Scan | Every 60 seconds | New TXs on known addresses | Fast |
| Manual Chain Scan | User-initiated | Own address history | Medium |
| Advanced Deep Scan | User selects date range | All TXs in block range | Slow |

> Periodic and chain scans are limited to known addresses. Deep scan via the [Pubkey Indexer](#p2pkh-pubkey-indexer) is required to detect unsolicited payments.

### Balance Separation
Regular BCH balance excludes stealth-received UTXOs. Stealth UTXOs are tracked separately with their tweaked private keys and can be spent as normal P2PKH outputs.

### Security Properties
- **On-chain privacy:** Stealth outputs are indistinguishable from standard P2PKH
- **Sender unlinkability:** Nostr notifications use ephemeral random keys
- **Plausible deniability:** Without the scan key, stealth funds are undetectable
- **Key isolation:** Hardened derivation prevents scan key compromise from exposing the spend key

### Test Status
All 8 test cases passed (v482, March 2026): cross-wallet sends (12-word ↔ raw key), stealth UTXO spending, balance separation, and Advanced Scan verification.

---

## WizardConnect

**[Live demo →](https://0penw0rld.com/wizard.html)**

WizardConnect is a BCH HD wallet connection protocol for securely linking decentralized applications to wallets without exposing private keys.

### Transport
All messages travel as Nostr **NIP-04 encrypted events (kind 21059)** — AES-256-CBC via ECDH shared secrets. Default relay: `wss://relay.cauldron.quest:443`.

### Connection Flow
1. Dapp generates a `wiz://` URI (bech32 pubkey + session secret + relay + protocol)
2. User scans QR code or pastes URI in wallet
3. Wallet responds with extended public keys (xpubs) for requested paths
4. Dapp derives child addresses locally — no further private key interaction needed

### HD Path Structure

| Purpose | Path | Notes |
|---|---|---|
| Receive | `m/44'/145'/0'/0` | Standard BIP44 |
| Change | `m/44'/145'/0'/1` | Standard BIP44 |
| DeFi | `m/44'/145'/0'/7` | Isolated index |
| Stealth scan | `m/352'/145'/0'/scan'` | Hardened, isolated tree |
| Stealth spend | `m/352'/145'/0'/spend'` | Hardened, isolated tree |
| RPA/Paycodes | BIP47 structure | Reusable payment addresses |

Stealth keys live in a fully separate hardened tree — **even if the BIP44 account xpub leaks, stealth keys are unreachable**.

### Capabilities

**Address derivation:** Dapps receive xpubs at handshake and derive child pubkeys locally with no further wallet involvement.

**Transaction signing:** Dapp specifies input paths and indices; wallet displays confirmation UI. 5-minute timeout on pending sign requests.

**Stealth sending:** Dapp handles ECDH derivation and address computation, then requests a standard P2PKH signature from the wallet.

### Implementation
`wizardconnect.js` (783 lines) — three classes:
- `WizRelay` — transport layer (Nostr WebSocket)
- `WizWalletManager` — server side (wallet)
- `WizDappManager` — client side (dapp)

---

## P2PKH Pubkey Indexer

**[Live demo →](https://0penw0rld.com/indexer.html)**

Privacy-preserving indexer infrastructure for stealth address scanning. Returns all compressed public keys from P2PKH transaction inputs for any Bitcoin Cash block range — enabling client-side ECDH scanning without leaking which addresses you control.

### Privacy Model
The server serves **all pubkeys for a requested block range**, not specific addresses. This is equivalent in privacy to downloading full blocks, but with ~90% less data. Confirmed block responses are immutably cached.

### API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/pubkeys?from=<height>&to=<height>` | P2PKH input pubkeys (max 100 blocks/request) |
| `GET /api/health` | Server status |
| `GET /api/stats` | Cache statistics and indexed block range |

**Response fields (JSON):** `height`, `txid`, `vin_index`, `pubkey` (compressed, 33 bytes hex), `outpoint`

**Binary format:** 106 bytes/entry (~60% smaller than JSON) — useful for bulk scanning.

**Typical data volume:** 200–400 pubkeys/block · ~50–100 KB/block · ~7–15 MB/day

### Supported Protocols
- Stealth Addresses (00 Protocol) — live
- RPA (Reusable Payment Addresses) — compatible
- Confidential Transactions — compatible

### Client-Side Scanning
Wallets fetch pubkeys for a block range, then perform ECDH locally to test each pubkey against the scan key. The server never learns which addresses are being scanned.

### Self-Hosting
Single Node.js file, one dependency (`ws`).

**Source modes:**
- `Fulcrum` — public WebSocket servers, no local node required
- `BCHN` — local node for full sovereignty

**Output targets:**
- HTTP/JSON API server (port 3847)
- CLI streaming
- Direct library import

**Deployment options:** standalone process, systemd service, nginx reverse proxy, Docker.

---

## Tech Stack

- **Pure HTML/CSS/JS** — no framework, no build step, no bundler
- **PWA** — installable, offline-first via Service Worker
- **Desktop-first** — sidebar navigation at 900px+
- **`@noble/curves`** — secp256k1, X25519, ed25519, Schnorr
- **`@noble/hashes`** — SHA-256, RIPEMD-160, HMAC, PBKDF2, keccak
- **Fulcrum ElectrumX** — blockchain queries over WebSocket
- **Nostr relays** — coordination, notifications, social, sync
- **Monero-ts** — XMR wallet scanning & atomic swap support
- **WalletConnect v2** — optional ETH wallet connection
- **WizardConnect** — BCH dapp/wallet connection over Nostr NIP-04
- **P2PKH Indexer** — privacy-preserving pubkey indexer (Node.js, `ws`)

All crypto dependencies loaded at runtime via [esm.sh](https://esm.sh) — zero server-side code.

---

## Security

- **Key generation:** `crypto.getRandomValues()` (OS entropy)
- **Key storage:** AES-256-GCM, PBKDF2-SHA256 (200,000 iterations), unique salt + IV per encryption, stored as `00wallet_vault` in localStorage
- **BIP39:** 2,048 PBKDF2-SHA512 iterations → BIP32 master key → BIP44 paths
- **Sessions:** 30-minute TTL tokens — no re-authentication on every page load
- **No analytics, no tracking, no third-party data collection**

---

## Run

Open [0penw0rld.com](https://0penw0rld.com) in a browser. That's it.

Or serve `landing/` locally:
```bash
npx serve landing
```

---

## Structure

```
landing/
  index.html          Dashboard
  wallet.html         Wallet + Unlock
  stealth.html        Stealth Address (00 Protocol)
  wizard.html         WizardConnect dapp bridge
  indexer.html        P2PKH Pubkey Indexer
  pay.html            Payment Terminal
  swap.html           Atomic Swaps (BCH ↔ BTC)
  swap-xmr.html       XMR Swaps
  dex.html            Cauldron DEX
  loan.html           Moria Lending
  chat.html           Encrypted Chat (CCSH)
  onion.html          Onion Payments
  vault.html          Stealth Multisig (MuSig2)
  id.html             Identity
  mesh.html           Nostr Social
  fusion.html         CoinJoin
  analyse.html        Chain Analysis Tools
  config.html         Settings
  docs.html           Documentation
  sub.html            Subscription / Notifications
  desktop.css         Desktop layout
  shell.js            Shared sidebar
  wizardconnect.js    WizardConnect protocol (783 lines)
  ws-bridge.js        WebSocket bridge
  ws-shared.js        Shared WS utilities
  chains.js           Multi-chain config
  ledger.js           Ledger HW wallet (WebHID/APDU)
  sw.js               Service Worker
  lib/                Monero WASM
  icons/              Coin & PWA icons
```

---

## License

MIT
