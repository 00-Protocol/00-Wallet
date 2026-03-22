# BCH Pubkey Indexer — Instructions

## What This Service Does

The BCH Pubkey Indexer serves all compressed public keys from P2PKH transaction
inputs for any Bitcoin Cash block range. It is the scanning backbone of:

- **00 Protocol** — beaconless ECDH stealth addresses (00-Wallet)
- **RPA** — Reusable Payment Addresses
- **Confidential Transactions** — ECDH-based CT scanning

**Privacy model**: the server serves ALL pubkeys for a block range. It has no
information about who you are, what you're scanning for, or which keys are
yours — equivalent to downloading full blocks but ~90% less data.

---

## Quick Start

1. Install and start the service
2. Note your `.onion` address from the **Interfaces** tab
3. In **00-Wallet** → Settings → Indexer URL, enter your `.onion` address
4. Your wallet will now use your own indexer for stealth address scanning

---

## Data Source Options

### Fulcrum (Default — Recommended)

Uses public Fulcrum electrum servers. No additional services required.
Automatically rotates between:
- `wss://bch.imaginary.cash:50004`
- `wss://electroncash.de:50004`
- `wss://bch.loping.net:50004`

### BCHN Node (Sovereign Mode)

Fetches block data directly from your local BCHN node via JSON-RPC.
No third-party servers involved — full data sovereignty.

**Requires**: BCHN installed on this Start9 server.
When BCHN is installed, the RPC URL is auto-discovered as `http://bchn:8332`.

---

## API Reference

### `GET /api/pubkeys?from={height}&to={height}`

Returns all P2PKH input pubkeys for the specified block range (max 100 blocks).

```json
{
  "from": 943000,
  "to": 943001,
  "entries": [
    {
      "height": 943000,
      "vin": 0,
      "pubkey": "02a1b2c3...",
      "prevTxid": "aabbcc...",
      "prevVout": 0
    }
  ]
}
```

### `GET /api/health`

Service health status.

### `GET /api/stats`

Cache statistics (blocks cached, height range).

---

## Cache

Block data is cached permanently in `/data/pubkeys/`. Confirmed blocks never
change, so cached results are served instantly. The cache grows at approximately
2–5 MB per 1000 blocks depending on transaction volume.

---

## Tor Access

Your indexer is accessible over Tor via the `.onion` address shown in the
**Interfaces** tab. Share this address with your mobile wallet to scan stealth
payments from anywhere — with no IP leakage to the indexer.

---

## Backup

The block cache is included in Start9 backups. Restoring a backup skips
re-downloading already-cached blocks.
