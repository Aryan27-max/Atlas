/**
 * Demo mode (START_CMDS.md → Demo mode): the same stubs and environment as
 * `npm run demo:fast`, then the click path that shows every screen, with the
 * fictional list docs/demo/demo-students.xlsx. The app gets a temporary data
 * folder here, not the real demo one.
 */

import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { waitForStatus } from './flow'
import { APP_DIR, type Launched, close } from './helpers'
import { menusShown, nextMenuPicks, nextOpenDialogReturns, nextSaveDialogReturns, tempDir } from './stubs'

interface DemoStubs {
  drive: string
  control: string
  ollama: string | null
  stop: () => void
}

test.describe.configure({ mode: 'serial' })
test.setTimeout(6 * 60_000)

interface DemoLib {
  DEMO_FILE: string
  demoEnv: (options: DemoStubs & { dataDir: string }) => Record<string, string>
  startDemoStubs: (options: { fast: boolean }) => Promise<DemoStubs>
}

let lib: DemoLib
let stubs: DemoStubs
let launched: Launched

const post = (path: string) => fetch(`${stubs.control}${path}`, { method: 'POST' })

test.beforeAll(async () => {
  // The same helpers npm run demo uses (an ES module, so it's loaded dynamically).
  lib = (await import('../scripts/demo-lib.mjs' as string)) as DemoLib
  stubs = await lib.startDemoStubs({ fast: true })
  // A temporary folder, unless ATLAS_DEMO_DATA_DIR asks to keep the screening (START_CMDS.md → 6).
  const dataDir = process.env.ATLAS_DEMO_DATA_DIR ?? tempDir('atlas-demo-e2e-')
  const app = await electron.launch({
    args: [join(APP_DIR, 'out', 'main', 'index.js')],
    cwd: APP_DIR,
    env: { ...lib.demoEnv({ ...stubs, dataDir }), ATLAS_E2E: '1' },
  })
  launched = { app, page: await app.firstWindow(), userData: dataDir }
})

test.afterAll(async () => {
  await close(launched, !process.env.ATLAS_DEMO_DATA_DIR)
  stubs.stop()
})

test('demo:fast — every screen, from Welcome to the design gallery', async () => {
  const { app, page } = launched
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  const bucket = (name: RegExp) => page.getByRole('navigation', { name: 'Buckets' }).getByRole('button', { name })

  // Welcome
  await expect(page.locator('[data-engine="ready"]')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('Ollama is running', { exact: false })).toBeVisible()

  // Students & model → Criteria → Cutoffs → Review
  await page.getByRole('button', { name: 'New screening' }).click()
  await nextOpenDialogReturns(app, lib.DEMO_FILE)
  await page.getByRole('button', { name: 'Choose file…' }).click()
  await expect(page.getByRole('group', { name: 'File summary' })).toContainText('20')
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

  // Progress, with a pause: the "internet" (the Drive stub) goes away, then comes back.
  await expect(page.getByRole('region', { name: 'Screening progress' })).toBeVisible({ timeout: 30_000 })
  await post('/drive/offline')
  await expect(page.getByRole('status').filter({ hasText: 'No internet connection' })).toBeVisible({
    timeout: 60_000,
  })
  await post('/drive/online')
  await waitForStatus(page, 'completed', 180_000)

  // Results, Adjust cutoffs, candidate detail
  await page.getByRole('button', { name: 'View results' }).click()
  const list = page.getByRole('listbox', { name: 'Shortlisted candidates' })
  await expect(list).toBeVisible()
  await page.getByRole('button', { name: 'Adjust cutoffs' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Adjust cutoffs' })).toBeVisible()
  await page.keyboard.press('Escape')
  const rows = list.getByRole('option')
  await rows.first().click()
  await expect(page.getByRole('dialog').getByText('Evidence from the résumé')).toBeVisible()
  await page.keyboard.press('Escape')

  // Right-click menu, multi-select
  await nextMenuPicks(app, [['Copy RA number']])
  await rows.first().click({ button: 'right' })
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toMatch(/^RA2599\d{6}$/)
  expect((await menusShown(app)).at(-1)).toContain('Copy RA number')
  await rows.nth(1).click({ modifiers: [mod] })
  await expect(page.getByRole('group', { name: 'Selected candidates' })).toContainText('2 selected')
  await page.getByRole('button', { name: 'Deselect' }).click()

  // Export
  const target = join(tempDir('atlas-demo-export-'), 'demo.csv')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Export results' })
  await sheet.getByRole('radio', { name: /All candidates/ }).click()
  await nextSaveDialogReturns(app, target)
  await sheet.getByRole('button', { name: 'Export…' }).click()
  await expect(page.getByText('Exported 20 candidates')).toBeVisible()

  // Needs attention: the three broken links
  await bucket(/^Needs attention/).click()
  await expect(bucket(/^Needs attention/)).toContainText('3')
  await expect(page.getByText('This is a Google Doc, not a PDF. Ask the student to upload a PDF.')).toBeVisible()

  // Settings, and its Data section
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await page.getByRole('heading', { name: 'Data' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible()

  // The design gallery
  await page.evaluate(() => {
    window.location.hash = '#/design'
  })
  await expect(page.getByTestId('design-gallery')).toBeVisible()
})
