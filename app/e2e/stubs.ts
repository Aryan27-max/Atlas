/**
 * The Phase 1 stub Drive and Ollama, started by the test in their own Python
 * process (engine/tests/e2e_stubs.py), plus the app launched against them.
 * All data is fictional.
 */

import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { APP_DIR, type Launched, launch } from './helpers'

export const REPO = join(APP_DIR, '..')
export const PYTHON = join(
  REPO,
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python',
)

export interface Stubs {
  drive: string
  ollama: string
  control: string
  files: { xlsx: string; csv: string; no_links: string }
  folder: string
  ollamaOffline(): Promise<void>
  ollamaOnline(): Promise<void>
  chatDelay(seconds: number): Promise<void>
  stop(): void
}

export async function startStubs(chatDelay = 0.15): Promise<Stubs> {
  const folder = mkdtempSync(join(tmpdir(), 'atlas-stubs-'))
  const child: ChildProcessWithoutNullStreams = spawn(
    PYTHON,
    ['-m', 'engine.tests.e2e_stubs', '--dir', folder, '--chat-delay', String(chatDelay)],
    { cwd: REPO, env: { ...process.env, PYTHONUTF8: '1' } },
  )
  const line = await new Promise<string>((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('stubs did not start')), 60_000)
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const newline = buffer.indexOf('\n')
      if (newline >= 0) {
        clearTimeout(timer)
        resolve(buffer.slice(0, newline))
      }
    })
    child.on('exit', (code) => reject(new Error(`stubs exited (${code})`)))
  })
  const info = JSON.parse(line) as Pick<Stubs, 'drive' | 'ollama' | 'control' | 'files'>
  const post = async (path: string): Promise<void> => {
    await fetch(`${info.control}${path}`, { method: 'POST' })
  }
  return {
    ...info,
    folder,
    ollamaOffline: () => post('/ollama/offline'),
    ollamaOnline: () => post('/ollama/online'),
    chatDelay: (seconds) => post(`/ollama/delay?seconds=${seconds}`),
    stop: () => {
      child.stdin.end()
      child.kill()
      rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}

/** Launch Atlas with its engine pointed at the stubs. */
export function launchWithStubs(stubs: Stubs, userData?: string): Promise<Launched> {
  return launch(
    {
      ATLAS_ENGINE_MODULE: 'engine.tests.e2e_engine',
      ATLAS_STUB_DRIVE_URL: stubs.drive,
      ATLAS_OLLAMA_URL: stubs.ollama,
      ATLAS_STUB_POLL: '0.5',
    },
    userData,
  )
}

/** Make the next native open dialog return this file (Playwright can't click native dialogs). */
export async function nextOpenDialogReturns(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog
  }, path)
}

/** Make the next native save dialog return this path. */
export async function nextSaveDialogReturns(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog
  }, path)
}

/** Answer the next message box with the button at `index`. */
export async function nextMessageBoxAnswers(app: ElectronApplication, index: number): Promise<void> {
  await app.evaluate(({ dialog }, response) => {
    dialog.showMessageBox = (async () => ({ response, checkboxChecked: false })) as typeof dialog.showMessageBox
  }, index)
}

export function tempDir(prefix = 'atlas-e2e-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** Record "Show in folder" / "Open logs folder" instead of opening Explorer or Finder. */
export async function recordShellOpens(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { __opened?: string[] }).__opened = opened
    shell.openPath = (async (path: string) => {
      opened.push(path)
      return ''
    }) as typeof shell.openPath
    shell.showItemInFolder = ((path: string) => void opened.push(path)) as typeof shell.showItemInFolder
  })
}

export function shellOpened(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => [...((globalThis as { __opened?: string[] }).__opened ?? [])])
}
