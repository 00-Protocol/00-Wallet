import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_0_0_0 = VersionInfo.of({
  version: '1.0.0:0',
  releaseNotes: [
    'Initial release',
    'Zero-knowledge P2PKH pubkey indexer for BCH stealth address scanning',
    'Source modes: Fulcrum WSS (public servers) and Local Node (BCHN JSON-RPC)',
    'HTTP/JSON API on port 3847 with Tor .onion access',
    'Permanent block cache (JSON + binary per block)',
    'Compatible with 00 Protocol stealth addresses, RPA, and Confidential Transactions',
  ].join('\n'),
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
