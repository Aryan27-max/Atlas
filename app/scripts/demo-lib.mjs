// Shared by scripts/demo.mjs (npm run demo) and e2e/demo.spec.ts: where the demo
// keeps its data, how to start the demo stubs, and the environment the app needs.
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
export const REPO = join(APP_DIR, '..')
export const DEMO_FILE = join(REPO, 'docs', 'demo', 'demo-students.xlsx')

/** The demo's own data folder, next to (never inside) the real Atlas one. */
export function demoDataDir() {
  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Atlas Demo')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Atlas Demo')
  }
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'Atlas Demo')
}

export function python() {
  const exe = process.platform === 'win32' ? join('Scripts', 'python.exe') : join('bin', 'python')
  return process.env.ATLAS_PYTHON ?? join(REPO, '.venv', exe)
}

/** Start `python -m engine.tests.demo_stubs serve`; resolves with its URLs once it is listening. */
export function startDemoStubs({ fast }) {
  const child = spawn(python(), ['-m', 'engine.tests.demo_stubs', 'serve', ...(fast ? ['--fast'] : [])], {
    cwd: REPO,
    env: { ...process.env, PYTHONUTF8: '1' },
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`the demo stubs stopped (exit ${code})`)))
    createInterface({ input: child.stdout }).once('line', (line) => {
      const urls = JSON.parse(line)
      resolve({ ...urls, stop: () => child.stdin.end() })
    })
  })
}

/** The environment for the development app pointed at the demo stubs. */
export function demoEnv({ drive, control, ollama, dataDir }) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE // set by Electron-based editors; it would start Atlas as plain Node
  delete env.ATLAS_OLLAMA_URL
  return {
    ...env,
    ATLAS_USER_DATA: dataDir,
    ATLAS_ENGINE_MODULE: 'engine.tests.e2e_engine', // Drive links → the local stub (development only)
    ATLAS_STUB_DRIVE_URL: drive,
    ATLAS_STUB_CONTROL_URL: control,
    ...(ollama ? { ATLAS_OLLAMA_URL: ollama } : {}), // demo:fast: the stub Ollama; demo: the real one
  }
}
