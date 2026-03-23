import { FileHelper } from '@start9labs/start-sdk'
import { sdk } from './sdk'

const rootDir   = '/data'
const bchnDir   = '/mnt/bchn'
const apiPort   = 3847
const bchnPort  = 8332

export const mainMounts = sdk.Mounts.of()
  .mountVolume({
    volumeId: 'main',
    subpath: null,
    mountpoint: rootDir,
    readonly: false,
  })
  .mountDependency({
    dependencyId: 'bitcoin-cash-node',
    mountpoint: bchnDir,
    subpath: null,
    readonly: true,
    volumeId: 'main',
  })

export const main = sdk.setupMain(async ({ effects }) => {
  const osIp = await sdk.getOsIp(effects)

  const sub = await sdk.SubContainer.of(
    effects,
    { imageId: 'main' },
    mainMounts,
    'indexer-sub',
  )

  // Read BCHN cookie for RPC auth — restart indexer if it changes
  const cookie = await FileHelper.string(`${sub.rootfs}${bchnDir}/.cookie`)
    .read()
    .const(effects)

  if (!cookie) throw new Error('BCHN cookie not found — is Bitcoin Cash Node running?')

  const [rpcUser, rpcPass] = cookie.trim().split(':')

  const daemons = sdk.Daemons.of(effects).addDaemon('primary', {
    subcontainer: sub,
    exec: {
      command: [
        'node',
        '/app/pubkey-indexer.js',
        'serve',
        '--source',    'local-node',
        '--rpc-url',   `http://${osIp}:${bchnPort}`,
        '--rpc-user',  rpcUser,
        '--rpc-pass',  rpcPass,
        '--cache-dir', `${rootDir}/pubkeys`,
        '--port',      String(apiPort),
      ],
      sigtermTimeout: 10_000,
    },
    ready: {
      display: 'HTTP API',
      fn: () =>
        sdk.healthCheck.checkPortListening(effects, apiPort, {
          successMessage: 'Indexer API is ready',
          errorMessage: 'Indexer API is not yet available',
        }),
    },
    requires: [],
  })

  return daemons
})
