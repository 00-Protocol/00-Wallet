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

export const main = sdk.setupMain(async ({ effects, started }) => {
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

  const [rpcUser, rpcPass] = cookie.trim().split(':')

  const daemons = sdk.Daemons.of(effects, started).addDaemon('primary', {
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
      fn: async () => {
        try {
          const res = await effects.fetch(
            `http://localhost:${apiPort}/api/health`,
          )
          if (res.status === 200) {
            const body = (await res.json()) as { status?: string }
            if (body.status === 'ok') {
              const stats = (await effects
                .fetch(`http://localhost:${apiPort}/api/stats`)
                .then((r) => r.json())) as { cached_blocks?: number }
              return {
                message: `API ready — ${stats.cached_blocks ?? 0} blocks cached`,
                result: 'success',
              }
            }
          }
          return { message: 'Waiting for indexer to start', result: 'starting' }
        } catch {
          return { message: 'Waiting for indexer to start', result: 'starting' }
        }
      },
    },
    requires: [],
  })

  return daemons
})
