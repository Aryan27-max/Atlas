// Demo mode: every screen of Atlas, with fictional students only (START_CMDS.md → Demo mode).
//
//   npm run demo         the real Ollama on this computer scores the résumés (slow but real)
//   npm run demo:fast    the stub Ollama "scores" each one in about 1.5 s
//   npm run demo:reset   delete the demo's data folder
//
// The student list is docs/demo/demo-students.xlsx. The app keeps its demo data in its
// own folder ("Atlas Demo"), so it never mixes with real screenings.
import { spawnSync, spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { APP_DIR, DEMO_FILE, demoDataDir, demoEnv, python, startDemoStubs } from './demo-lib.mjs'

const args = process.argv.slice(2)
const dataDir = demoDataDir()

if (args.includes('--reset')) {
  rmSync(dataDir, { recursive: true, force: true })
  console.log(`Deleted the demo data folder: ${dataDir}`)
  process.exit(0)
}

const fast = args.includes('--fast')
for (const [what, path] of [
  ['Python environment', python()],
  ['demo student list', DEMO_FILE],
]) {
  if (!existsSync(path)) {
    console.error(`No ${what} at ${path}. See START_CMDS.md → First-time setup.`)
    process.exit(1)
  }
}

console.log('Building the app…')
const build = spawnSync('npx electron-vite build', { cwd: APP_DIR, stdio: 'inherit', shell: true })
if (build.status !== 0) process.exit(build.status ?? 1)

const curl = process.platform === 'win32' ? 'curl.exe' : 'curl'
const stubs = await startDemoStubs({ fast }).catch((error) => {
  console.error(`Couldn't start the demo stubs: ${error.message}`)
  process.exit(1)
})
console.log(`
Atlas demo (${fast ? 'stub Ollama, instant scores' : 'your real Ollama'}). Fictional students only.
  Student list:   ${DEMO_FILE}
  Demo data:      ${dataDir}   (npm run demo:reset deletes it)
  Show a pause:   ${curl} -X POST ${stubs.control}/drive/offline    then  …/drive/online
${fast ? `                  ${curl} -X POST ${stubs.control}/ollama/offline   then  …/ollama/online\n` : ''}Close the Atlas window to stop the demo.
`)

const electron = createRequire(import.meta.url)('electron')
const app = spawn(electron, [join(APP_DIR, 'out', 'main', 'index.js')], {
  cwd: APP_DIR,
  env: demoEnv({ ...stubs, dataDir }),
  stdio: 'inherit',
})
app.on('exit', (code) => {
  stubs.stop()
  process.exit(code ?? 0)
})
