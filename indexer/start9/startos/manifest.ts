import { setupManifest } from '@start9labs/start-sdk'

export const manifest = setupManifest({
  id: 'bch-pubkey-indexer',
  title: 'BCH Pubkey Indexer',
  license: 'MIT',
  packageRepo: 'https://github.com/00-Protocol/BCH-Stealth-Protocol',
  upstreamRepo: 'https://github.com/00-Protocol/BCH-Stealth-Protocol',
  marketingUrl: 'https://0penw0rld.com/indexer.html',
  donationUrl: null,
  docsUrls: [
    'https://0penw0rld.com/indexer.html',
    'https://github.com/00-Protocol/BCH-Stealth-Protocol',
  ],
  description: {
    short: 'Zero-knowledge BCH pubkey indexer for stealth address scanning',
    long: 'Serves all compressed public keys from P2PKH transaction inputs for any BCH block range. The scanning backbone of the 00 Protocol (beaconless ECDH stealth addresses), RPA, and other BCH privacy protocols. The server never sees your scan key — it returns all pubkeys for a range and wallets filter locally. Equivalent privacy to downloading full blocks at ~90% less data. HTTP API on port 3847 with automatic Tor .onion address.',
  },
  volumes: ['main'],
  images: {
    main: {
      source: { dockerBuild: { workdir: '..' } },
    },
  },
  alerts: {
    install:
      'The indexer will begin caching block data on first start. The API is immediately available but returns empty results for uncached blocks.',
    update: null,
    uninstall:
      'Uninstalling will delete all cached block data. You will need to re-sync from scratch if you reinstall.',
    restore: null,
    start: null,
    stop: null,
  },
  dependencies: {
    'bitcoin-cash-node': {
      description:
        'Required to fetch blockchain data via local JSON-RPC. The indexer authenticates using the BCHN cookie file.',
      optional: false,
      metadata: {
        title: 'Bitcoin Cash Node',
        icon: 'https://raw.githubusercontent.com/linkinparkrulz/bitcoin-cash-node-startos/master/icon.png',
      },
    },
  },
})
