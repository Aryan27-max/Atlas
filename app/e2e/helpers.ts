import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ElectronApplication, type Page, _electron as electron, expect } from '@playwright/test'

export const APP_DIR = join(__dirname, '..')

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

export interface LaunchOptions {
  /** Extra command-line switches. */
  args?: string[]
  /** The OS colour scheme the page sees from its first frame (Playwright's default: light). */
  colorScheme?: 'light' | 'dark'
}

/** Launch the built app with its own throwaway data folder. */
export async function launch(
  env: Record<string, string> = {},
  userData?: string,
  options: LaunchOptions = {},
): Promise<Launched> {
  const folder = userData ?? mkdtempSync(join(tmpdir(), 'atlas-e2e-'))
  // Editors built on Electron (VS Code) set ELECTRON_RUN_AS_NODE for their
  // child processes; inherited, it would start Atlas as plain Node.
  const inherited = { ...(process.env as Record<string, string>) }
  delete inherited.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    args: [join(APP_DIR, 'out', 'main', 'index.js'), ...(options.args ?? [])],
    ...(options.colorScheme ? { colorScheme: options.colorScheme } : {}),
    cwd: APP_DIR,
    env: {
      ...inherited,
      ATLAS_E2E: '1',
      ATLAS_USER_DATA: folder,
      ATLAS_OLLAMA_URL: 'http://127.0.0.1:9',
      ...env,
    },
  })
  const page = await app.firstWindow()
  return { app, page, userData: folder }
}

/**
 * The start-up screen has handed over and been removed. It covers the app,
 * which is inert under it, until then.
 */
export async function splashGone(page: Page): Promise<void> {
  await expect(page.locator('.splash')).toHaveCount(0, { timeout: 120_000 })
}

/** Atlas is ready to use: past the start-up screen, with the engine ready. */
export async function waitForWelcome(page: Page): Promise<void> {
  await splashGone(page)
  await expect(page.locator('[data-engine="ready"]')).toBeVisible({ timeout: 120_000 })
}

export async function close(launched: Launched, removeData = true): Promise<void> {
  // If the engine was restarted during the test (a screen the test was on is then remounted),
  // say so in the log, with the engine's last error output: a failure can't hide it.
  const restarts = await launched.app
    .evaluate(() => {
      const test = (globalThis as { __atlasTest?: { engine: { processGeneration: number; stderrTail: string[] } } })
        .__atlasTest
      return test
        ? { processes: test.engine.processGeneration, stderr: test.engine.stderrTail.join('').slice(-2000) }
        : null
    })
    .catch(() => null)
  if (restarts && restarts.processes > 1) {
    console.warn(`[e2e] the engine was started ${restarts.processes} times; its last error output:
${restarts.stderr}`)
  }
  // If a screening is still running, closing asks "Close Atlas?" in a native
  // dialog nobody can click; answer it so cleanup can never hang.
  await launched.app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as typeof dialog.showMessageBox
    })
    .catch(() => undefined)
  await launched.app.close()
  if (removeData) rmSync(launched.userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
