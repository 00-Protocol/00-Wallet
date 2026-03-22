import { sdk } from './sdk'

const apiPort = 3847

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const multi = sdk.MultiHost.of(effects, 'api')

  const origin = await multi.bindPort(apiPort, {
    protocol: 'http',
    preferredExternalPort: apiPort,
  })

  const iface = sdk.createInterface(effects, {
    name: 'Pubkey Indexer API',
    id: 'api',
    description:
      'HTTP API for querying P2PKH input pubkeys by BCH block range. Used by 00-Wallet and compatible wallets for stealth address scanning.',
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  return [await origin.export([iface])]
})
