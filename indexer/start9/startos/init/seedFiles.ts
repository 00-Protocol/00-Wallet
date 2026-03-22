import { sdk } from '../sdk'

export const seedFiles = sdk.setupSeedFiles(async ({ effects }) => {
  // Create cache directories on first init
  await effects.createDir({
    volumeId: 'main',
    path: 'pubkeys/json',
    skipIfExists: true,
  })
  await effects.createDir({
    volumeId: 'main',
    path: 'pubkeys/bin',
    skipIfExists: true,
  })
})
