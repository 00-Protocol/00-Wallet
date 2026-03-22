import { sdk } from './sdk'

export const setDependencies = sdk.setupDependencies(
  async ({ effects }) => ({
    'bitcoin-cash-node': {
      kind: 'running',
      versionRange: '>=27.0:0',
      healthChecks: [],
    },
  }),
)
