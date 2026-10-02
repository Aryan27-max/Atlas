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
import { menuLabel } from '../main/menus'
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
  /** The models the stub Ollama has installed (none: the "no model yet" state). */
  setModels(names: string[]): Promise<void>
  stop(): void
}

export async function startStubs(chatDelay = 0.15): Promise<Stubs> {
  const folder = mkdtempSync(join(tmpdir(), 'atlas-stubs-'))
  const child: ChildProcessWithoutNullStreams = spawn(
    PYTHON,
    ['-m', 'engine.tests.e2e_stubs', '--dir', folder, '--chat-delay', String(chatDelay)],
    { cwd: REPO, env: { ...process.env, PYTHONUTF8: '1' } },
  )
  // Decode the stream, not each chunk: a non-ASCII letter in a path (a user name in
  // the temp folder) can be split across two chunks.
  child.stdout.setEncoding('utf8')
  const line = await new Promise<string>((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => reject(new Error('stubs did not start')), 60_000)
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk
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
    setModels: (names) => post(`/ollama/models?names=${encodeURIComponent(names.join(','))}`),
    stop: () => {
      child.stdin.end()
      child.kill()
      rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}

/** Launch Atlas with its engine pointed at the stubs. */
export function launchWithStubs(stubs: Stubs, userData?: string, env: Record<string, string> = {}): Promise<Launched> {
  return launch(
    {
      ATLAS_ENGINE_MODULE: 'engine.tests.e2e_engine',
      ATLAS_STUB_DRIVE_URL: stubs.drive,
      ATLAS_OLLAMA_URL: stubs.ollama,
      ATLAS_STUB_CONTROL_URL: stubs.control,
      ATLAS_STUB_POLL: '0.5',
      ...env,
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
    shell.openExternal = (async (url: string) => void opened.push(url)) as typeof shell.openExternal
  })
}

export function shellOpened(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => [...((globalThis as { __opened?: string[] }).__opened ?? [])])
}

/**
 * A menu label as Atlas shows it on this computer. Specs use the source's
 * wording ("Copy RA number"); on macOS the menu says "Copy RA Number".
 */
export function menuText(text: string): string {
  return menuLabel(text, process.platform)
}

/**
 * Answer the next native menus. Each pick is a path of labels in the source's
 * wording, e.g. ['Move to', 'Cutoff…']; an empty path dismisses the menu.
 * Playwright can't click a native menu, so this replaces
 * Menu.buildFromTemplate in main with one that "clicks" the picked item and
 * records every menu shown. A pick that matches no item is recorded as a miss
 * (see copiedText) instead of silently clicking nothing.
 */
export async function nextMenuPicks(app: ElectronApplication, picks: string[][]): Promise<void> {
  const queue = picks.map((path) => path.map(menuText))
  await app.evaluate(({ Menu }, queue) => {
    type Item = Electron.MenuItemConstructorOptions
    const state = globalThis as {
      __realBuild?: typeof Menu.buildFromTemplate
      __menuPicks?: string[][]
      __menusShown?: string[][]
      __menuMisses?: string[]
    }
    state.__realBuild ??= Menu.buildFromTemplate.bind(Menu)
    state.__menuPicks = [...queue]
    state.__menusShown ??= []
    state.__menuMisses = []
    const describe = (items: Item[]): string[] =>
      items.map((item) =>
        item.type === 'separator'
          ? '—'
          : item.submenu
            ? `${item.label} ▸ ${(item.submenu as Item[]).map((sub) => sub.label).join(', ')}`
            : String(item.label),
      )
    Menu.buildFromTemplate = (template) => {
      const menu = (state.__realBuild as typeof Menu.buildFromTemplate)(template)
      menu.popup = (options) => {
        const items = template as Item[]
        state.__menusShown?.push(describe(items))
        let level: Item[] = items
        let chosen: Item | undefined
        for (const label of state.__menuPicks?.shift() ?? []) {
          chosen = level.find((item) => item.label === label)
          if (!chosen) {
            const offered = level.filter((item) => item.type !== 'separator').map((item) => item.label)
            state.__menuMisses?.push(`no menu item "${label}" among ${JSON.stringify(offered)}`)
            break
          }
          level = (chosen.submenu as Item[] | undefined) ?? []
        }
        ;(chosen?.click as (() => void) | undefined)?.()
        options?.callback?.()
      }
      return menu
    }
  }, queue)
}

/** The clipboard after a menu pick; throws (so expect.poll reports it) if a pick matched no item. */
export async function copiedText(app: ElectronApplication): Promise<string> {
  const { misses, text } = await app.evaluate(async ({ clipboard }) => ({
    misses: [...((globalThis as { __menuMisses?: string[] }).__menuMisses ?? [])],
    // Awaited: in Electron 44 the main-process clipboard may answer with a promise.
    text: String(await clipboard.readText()),
  }))
  if (misses.length) throw new Error(misses.join('; '))
  return text
}

/** The labels of every native menu shown since the first nextMenuPicks. */
export async function menusShown(app: ElectronApplication): Promise<string[][]> {
  const { shown, misses } = await app.evaluate(() => {
    const state = globalThis as { __menusShown?: string[][]; __menuMisses?: string[] }
    return { shown: [...(state.__menusShown ?? [])], misses: [...(state.__menuMisses ?? [])] }
  })
  if (misses.length) throw new Error(misses.join('; '))
  return shown
}
