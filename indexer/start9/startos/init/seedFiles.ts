import * as fs from 'node:fs/promises'
import { sdk } from '../sdk'

export const seedFiles = async () => {
  const vol = sdk.volumes.main
  // Create cache directories on first init
  await fs.mkdir(vol.subpath('pubkeys/json'), { recursive: true })
  await fs.mkdir(vol.subpath('pubkeys/bin'), { recursive: true })
}
