import { sdk } from './sdk'

const rootDir = '/data'
const apiPort = 3847

export const mainMounts = sdk.Mounts.of().mountVolume({
  volumeId: 'main',
  subpath: null,
  mountpoint: rootDir,
  readonly: false,
})

export const main = sdk.setupMain(async ({ effects }) => {
  const daemons = sdk.Daemons.of(effects).addDaemon('primary', {
    subcontainer: await sdk.SubContainer.of(
      effects,
      { imageId: 'main' },
      mainMounts,
      'indexer-sub',
    ),
    exec: {
      command: [
        'node',
        '/app/pubkey-indexer.js',
        'serve',
        '--cache-dir',
        `${rootDir}/pubkeys`,
        '--port',
        String(apiPort),
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
            const body = await res.json() as { status?: string }
            if (body.status === 'ok') {
              const stats = await effects
                .fetch(`http://localhost:${apiPort}/api/stats`)
                .then((r) => r.json()) as { cached_blocks?: number }
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
