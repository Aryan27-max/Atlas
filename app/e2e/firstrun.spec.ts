/**
 * Step 3.3: the first-run states of Ollama, against the stub (it never launches
 * or installs anything real), plus the long-screening warning at Start.
 *
 *   not installed → "Open download page" (https://ollama.com/download)
 *   installed, not running → "Start Ollama" → running
 *   running, no model → "Get a model" (the pull sheet, qwen3:8b suggested)
 *   ready → status lines
 */

import { expect, test } from '@playwright/test'
import { type Launched, close, waitForWelcome } from './helpers'
import { PHASE3_SCREENS_DIR, capture, setTheme } from './screens'
import { type Stubs, launchWithStubs, nextOpenDialogReturns, recordShellOpens, shellOpened, startStubs } from './stubs'

test.describe.configure({ mode: 'serial' })

let stubs: Stubs
let launched: Launched | null = null

async function open(env: Record<string, string> = {}): Promise<Launched> {
  launched = await launchWithStubs(stubs, undefined, env)
  await waitForWelcome(launched.page)
  await recordShellOpens(launched.app)
  return launched
}

async function screenshots(page: Launched['page'], name: string): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, name, theme, undefined, PHASE3_SCREENS_DIR)
  }
  await setTheme(page, 'light')
}

test.beforeAll(async () => {
  stubs = await startStubs(0.05)
})

test.afterEach(async () => {
  if (launched) await close(launched)
  launched = null
  await stubs.ollamaOnline()
  await stubs.setModels(['qwen3:8b', 'qwen3:4b'])
})

test.afterAll(() => stubs.stop())

test('Ollama not installed: a plain explanation and the download page', async () => {
  await stubs.ollamaOffline()
  const { app, page } = await open({ ATLAS_STUB_OLLAMA_INSTALLED: '0' })
  await expect(page.getByText('Install Ollama to start screening')).toBeVisible()
  await expect(page.getByText(/no résumé is\s+sent to the internet/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Ollama' })).toHaveCount(0)
  await screenshots(page, 'welcome-ollama-missing')
  await page.getByRole('button', { name: 'Open download page' }).click()
  await expect.poll(() => shellOpened(app)).toEqual(['https://ollama.com/download'])
})

test('Ollama installed but not running: Start Ollama, then it is ready', async () => {
  await stubs.ollamaOffline()
  const { page } = await open()
  await expect(page.getByText("Ollama isn't running")).toBeVisible()
  await expect(page.getByText(/Atlas can start it for you/)).toBeVisible()
  await screenshots(page, 'welcome-ollama-stopped')
  await page.getByRole('button', { name: 'Start Ollama' }).click()
  await expect(page.getByText('Ollama is running', { exact: false })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('2 models installed')).toBeVisible()
})

test('Ollama running with no model: Get a model opens the download sheet', async () => {
  await stubs.setModels([])
  const { page } = await open()
  await expect(page.getByText(/no model yet/)).toBeVisible()
  await screenshots(page, 'welcome-no-model')
  await page.getByRole('button', { name: 'Get a model' }).click()
  const sheet = page.getByRole('dialog', { name: 'Get another model' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('group', { name: 'Suggested models' })).toContainText('qwen3:8b')
})

test('ready: status lines, and the hardware in Settings', async () => {
  const { page } = await open()
  await expect(page.getByText('Ollama is running', { exact: false })).toBeVisible()
  await expect(page.getByText('2 models installed')).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  const about = page.getByRole('region', { name: 'About Atlas' })
  await expect(about).toContainText('Processor')
  await expect(about).toContainText(/processor cores/)
  await expect(page.getByRole('switch', { name: /more than 4 hours/ })).toHaveAttribute('aria-checked', 'true')
})

test('a screening over 4 hours asks before it starts', async () => {
  const { app, page } = await open()
  // Make the engine's estimate say "long" for this run, as it would for ~400 students on a CPU laptop.
  await app.evaluate(() => {
    const hook = (
      globalThis as unknown as {
        __atlasTest: {
          engine: { request: (...args: unknown[]) => Promise<{ ok: boolean; data?: Record<string, unknown> }> }
        }
      }
    ).__atlasTest
    const original = hook.engine.request.bind(hook.engine)
    hook.engine.request = async (...args: unknown[]) => {
      const result = await original(...args)
      if (args[0] === 'GET' && /\/estimate/.test(String(args[1])) && result.ok && result.data) {
        result.data = {
          ...result.data,
          long_run: true,
          estimate: {
            low_seconds: 5 * 3600,
            high_seconds: 9 * 3600,
            basis: 'precheck',
            per_resume_seconds: 60,
            label: 'Rough estimate',
          },
        }
      }
      return result
    }
  })
  await page.getByRole('button', { name: 'New screening' }).click()
  await nextOpenDialogReturns(app, stubs.files.xlsx)
  await page.getByRole('button', { name: 'Choose file…' }).click()
  await page
    .getByRole('radiogroup', { name: 'Installed models' })
    .getByRole('radio', { name: /qwen3:8b/ })
    .click()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'SWE intern' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Start screening' }).click()
  const alert = page.getByRole('alertdialog')
  await expect(alert).toContainText('This screening will take about 5–9 hours')
  await expect(alert).toContainText('overnight')
  await alert.getByRole('button', { name: 'Not now' }).click()
  await expect(page.getByRole('button', { name: 'Start screening' })).toBeVisible() // still on Review
  await page.getByRole('button', { name: 'Start screening' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start anyway' }).click()
  await expect(page.getByRole('region', { name: 'Screening progress' })).toBeVisible({ timeout: 30_000 })
})
