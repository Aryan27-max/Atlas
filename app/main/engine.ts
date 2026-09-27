/**
 * The Python engine as a child process (ARCHITECTURE §2).
 *
 * - Spawned with `--data-dir <userData> --port 0 --watch-stdin`; the per-launch
 *   token (32 random bytes) goes in the ATLAS_TOKEN environment variable, not
 *   on the command line, and never leaves main.
 * - Ready when it prints `ATLAS_READY port=<n>`; health-checked every 5 s.
 * - If it dies it is restarted: up to 3 times in 60 s, then `failed` and the
 *   app shows an error screen with "Restart Atlas". All state is in SQLite,
 *   so a restart loses nothing.
 * - On quit: POST /shutdown, wait up to 10 s, then kill.
 */

import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { ApiResult, EngineState } from '@shared/bridge'
import { ReadyLineParser } from './ready'

export interface EngineCommand {
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

export interface EngineOptions {
  readyTimeoutMs?: number
  healthIntervalMs?: number
  stopTimeoutMs?: number
  maxRestarts?: number
  restartWindowMs?: number
}

const ENGINE_DOWN = "Atlas's engine stopped and couldn't be restarted."
const ENGINE_BUSY = 'Atlas is starting. Try again in a moment.'

/** How to start the engine: the repo's .venv in development, the bundled binary when packaged. */
export function engineCommand(opts: {
  packaged: boolean
  appPath: string
  resourcesPath: string
  dataDir: string
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
}): EngineCommand {
  const exe = opts.platform === 'win32' ? '.exe' : ''
  const common = ['--data-dir', opts.dataDir, '--port', '0', '--watch-stdin']
  const ollama = opts.env.ATLAS_OLLAMA_URL ? ['--ollama-url', opts.env.ATLAS_OLLAMA_URL] : []
  if (opts.packaged) {
    // Phase 3 ships a PyInstaller build here.
    return {
      command: join(opts.resourcesPath, 'engine', `atlas-engine${exe}`),
      args: [...common, ...ollama],
      cwd: opts.resourcesPath,
      env: {},
    }
  }
  const repo = findRepo(opts.appPath) ?? resolve(opts.appPath, '..')
  const python =
    opts.env.ATLAS_PYTHON ?? join(repo, '.venv', opts.platform === 'win32' ? 'Scripts' : 'bin', `python${exe}`)
  // Tests may swap in a module that wraps engine.server with stub URLs (development only).
  const module = opts.env.ATLAS_ENGINE_MODULE ?? 'engine.server'
  return { command: python, args: ['-m', module, ...common, ...ollama], cwd: repo, env: { PYTHONUTF8: '1' } }
}

/**
 * The repository root in development: the first folder above `start` that has
 * `engine/server.py`. (`app.getAppPath()` is `app/` with `electron .` but
 * `app/out/main` when Electron is given the built file, as the tests do.)
 */
export function findRepo(start: string): string | null {
  let dir = resolve(start)
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'engine', 'server.py'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export class EngineProcess extends EventEmitter {
  private proc: ChildProcess | null = null
  private port: number | null = null
  private readonly token = randomBytes(32).toString('base64url')
  private current: EngineState = { state: 'stopped' }
  private restarts: number[] = []
  private stopping = false
  private healthTimer: NodeJS.Timeout | null = null
  private readyTimer: NodeJS.Timeout | null = null
  private healthFailures = 0
  private generation = 0
  private readonly stderrTail: string[] = []
  private readonly opts: Required<EngineOptions>

  constructor(
    private readonly command: EngineCommand,
    options: EngineOptions = {},
  ) {
    super()
    this.opts = {
      readyTimeoutMs: options.readyTimeoutMs ?? 120_000,
      healthIntervalMs: options.healthIntervalMs ?? 5_000,
      stopTimeoutMs: options.stopTimeoutMs ?? 10_000,
      maxRestarts: options.maxRestarts ?? 3,
      restartWindowMs: options.restartWindowMs ?? 60_000,
    }
  }

  get state(): EngineState {
    return this.current
  }

  /** Increases each time a new engine process is started. */
  get processGeneration(): number {
    return this.generation
  }

  /** Base URL while ready, else null. */
  get baseUrl(): string | null {
    return this.current.state === 'ready' && this.port ? `http://127.0.0.1:${this.port}` : null
  }

  /** Headers for a request to the engine (main only). */
  authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` }
  }

  /** For the end-to-end tests' main-process checks only (see main/index.ts). */
  tokenForTests(): string {
    return this.token
  }

  start(): void {
    this.stopping = false
    this.launch()
  }

  /** "Restart Atlas" on the error screen: forget earlier crashes and try again. */
  restart(): void {
    this.restarts = []
    this.kill()
    this.stopping = false
    this.launch()
  }

  private setState(state: EngineState): void {
    this.current = state
    this.emit('state', state)
  }

  private launch(): void {
    const generation = ++this.generation
    this.port = null
    this.healthFailures = 0
    this.setState({ state: this.restarts.length ? 'restarting' : 'starting' })
    if (!existsSync(this.command.command)) {
      this.setState({ state: 'failed', message: "Atlas's engine wasn't found. Reinstall Atlas." })
      return
    }
    const child = spawn(this.command.command, this.command.args, {
      cwd: this.command.cwd,
      env: { ...process.env, ...this.command.env, ATLAS_TOKEN: this.token },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.proc = child
    const parser = new ReadyLineParser()
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      const port = parser.feed(chunk)
      if (port !== null && generation === this.generation) this.ready(port)
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      this.stderrTail.push(chunk)
      if (this.stderrTail.length > 50) this.stderrTail.shift()
    })
    child.on('error', () => this.exited(generation))
    child.on('exit', () => this.exited(generation))
    this.readyTimer = setTimeout(() => {
      if (generation === this.generation && this.current.state !== 'ready') child.kill()
    }, this.opts.readyTimeoutMs)
  }

  private ready(port: number): void {
    if (this.readyTimer) clearTimeout(this.readyTimer)
    this.port = port
    this.setState({ state: 'ready' })
    this.emit('ready', port)
    this.healthTimer = setInterval(() => void this.checkHealth(), this.opts.healthIntervalMs)
  }

  private async checkHealth(): Promise<void> {
    const url = this.baseUrl
    if (!url) return
    try {
      const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(4_000) })
      this.healthFailures = response.ok ? 0 : this.healthFailures + 1
    } catch {
      this.healthFailures += 1
    }
    if (this.healthFailures >= 2) this.proc?.kill() // hung: the exit handler restarts it
  }

  private exited(generation: number): void {
    if (generation !== this.generation) return
    this.clearTimers()
    this.proc = null
    this.port = null
    if (this.stopping) {
      this.setState({ state: 'stopped' })
      return
    }
    const now = Date.now()
    this.restarts = this.restarts.filter((t) => now - t < this.opts.restartWindowMs)
    if (this.restarts.length >= this.opts.maxRestarts) {
      this.setState({ state: 'failed', message: ENGINE_DOWN })
      return
    }
    this.restarts.push(now)
    this.launch()
  }

  private clearTimers(): void {
    if (this.healthTimer) clearInterval(this.healthTimer)
    if (this.readyTimer) clearTimeout(this.readyTimer)
    this.healthTimer = this.readyTimer = null
  }

  private kill(): void {
    this.stopping = true
    this.clearTimers()
    this.proc?.kill()
    this.proc = null
  }

  /** Graceful stop: the engine pauses a running run ("Atlas was closed") and exits. */
  async stop(): Promise<void> {
    this.stopping = true
    this.clearTimers()
    const child = this.proc
    if (!child || child.exitCode !== null) {
      this.setState({ state: 'stopped' })
      return
    }
    const exited = new Promise<void>((done) => child.once('exit', () => done()))
    const url = this.port ? `http://127.0.0.1:${this.port}` : null
    if (url) {
      try {
        await fetch(`${url}/shutdown`, {
          method: 'POST',
          headers: this.authHeaders(),
          signal: AbortSignal.timeout(3_000),
        })
      } catch {
        // already gone, or hung: the timeout below handles it
      }
    }
    const timer = new Promise<'timeout'>((done) => setTimeout(() => done('timeout'), this.opts.stopTimeoutMs))
    if ((await Promise.race([exited.then(() => 'exited' as const), timer])) === 'timeout') {
      child.kill()
      await exited
    }
    this.proc = null
    this.setState({ state: 'stopped' })
  }

  /** A JSON request with the token. Never throws: errors come back as `{ ok: false }`. */
  async request<T>(method: string, path: string, body?: string): Promise<ApiResult<T>> {
    const headers: Record<string, string> = body === undefined ? {} : { 'Content-Type': 'application/json' }
    return this.send<T>(path, { method, headers, body })
  }

  /** Upload one file as multipart form data (the pre-flight upload). */
  async upload<T>(path: string, name: string, bytes: ArrayBuffer): Promise<ApiResult<T>> {
    const form = new FormData()
    form.append('file', new Blob([bytes]), name)
    return this.send<T>(path, { method: 'POST', headers: {}, body: form })
  }

  private async send<T>(
    path: string,
    init: { method: string; headers: Record<string, string>; body?: string | FormData },
  ): Promise<ApiResult<T>> {
    const url = this.baseUrl
    if (!url) {
      const message = this.current.state === 'failed' ? ENGINE_DOWN : ENGINE_BUSY
      return { ok: false, status: 503, error: { code: 'engine_unavailable', message } }
    }
    try {
      const response = await fetch(`${url}${path}`, {
        method: init.method,
        headers: { ...init.headers, ...this.authHeaders() },
        body: init.body,
      })
      const text = await response.text()
      const data = text ? (JSON.parse(text) as unknown) : null
      if (response.ok) return { ok: true, status: response.status, data: data as T }
      const error = data as { code?: string; message?: string } | null
      return {
        ok: false,
        status: response.status,
        error: { code: error?.code ?? 'error', message: error?.message ?? 'Something went wrong inside Atlas.' },
      }
    } catch {
      return { ok: false, status: 503, error: { code: 'engine_unavailable', message: ENGINE_BUSY } }
    }
  }

  /** Last lines the engine wrote to stderr (for diagnostics in development). */
  stderr(): string {
    return this.stderrTail.join('')
  }
}
