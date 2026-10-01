// Runs before `npm run dist`: the installer bundles the engine that
// packaging/build_engine.py builds. Stop early, saying what to do, if it's missing.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const name = process.platform === 'win32' ? 'atlas-engine.exe' : 'atlas-engine'
const binary = join(root, 'dist', 'engine', 'atlas-engine', name)

if (!existsSync(binary)) {
  console.error(`No engine build at ${binary}.`)
  console.error('Build it first, from the repository root:  python packaging/build_engine.py')
  process.exit(1)
}
console.log(`Bundling the engine from ${binary}`)
