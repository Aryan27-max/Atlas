/**
 * Step 2.8: Settings, against the real engine and the stub Ollama.
 * Everything applies at once; deleting goes through the engine.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { APP_DIR, type Launched, close, waitForWelcome } from './helpers'
import { PHASE3_SCREENS_DIR, capture } from './screens'
import { type Stubs, launchWithStubs, recordShellOpens, shellOpened, startStubs } from './stubs'

test.describe.configure({ mode: 'serial' })

let stubs: Stubs
let launched: Launched

interface Settings {
  appearance: string
  keep_awake: boolean
  notify_done: boolean
  default_model: string | null
  default_shortlist: number
  default_band: number
  default_min: number
}

async function settings(): Promise<Settings> {
  const result = (await launched.page.evaluate(() => window.atlas.api.request('GET', '/settings'))) as {
    data: Settings
  }
  return result.data
}

async function runs(): Promise<
  Array<{ id: number; name: string; model_name: string | null; shortlist_cutoff: number; min_shortlist: number }>
> {
  const result = (await launched.page.evaluate(() => window.atlas.api.request('GET', '/runs'))) as {
    data: Array<{
      id: number
      name: string
      model_name: string | null
      shortlist_cutoff: number
      min_shortlist: number
    }>
  }
  return result.data
}

const heading = () => launched.page.getByRole('heading', { name: 'Settings', level: 1 })

test.beforeAll(async () => {
  stubs = await startStubs()
  launched = await launchWithStubs(stubs)
  await waitForWelcome(launched.page)
  await recordShellOpens(launched.app)
})

test.afterAll(async () => {
  await close(launched)
  stubs.stop()
})

test('opens from Welcome and with Ctrl/Cmd+comma; Home goes back', async () => {
  const { page } = launched
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(heading()).toBeVisible()
  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma')
  await expect(heading()).toBeVisible()
})

test('appearance applies at once and is saved', async () => {
  const { page } = launched
  const appearance = page.getByRole('radiogroup', { name: 'Appearance' })
  await appearance.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(async () => (await settings()).appearance).toBe('dark')
  await appearance.getByRole('radio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await appearance.getByRole('radio', { name: 'System' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  await expect.poll(async () => (await settings()).appearance).toBe('system')
})

test('keep awake and notifications reach main at once', async () => {
  const { app, page } = launched
  const preferences = () =>
    app.evaluate(() => {
      const hook = (
        globalThis as unknown as {
          __atlasTest: { watcher: { preferences: { keep_awake: boolean; notify_done: boolean } } }
        }
      ).__atlasTest
      return { ...hook.watcher.preferences }
    })
  const awake = page.getByRole('switch', { name: 'Keep the computer awake' })
  await expect(awake).toHaveAttribute('aria-checked', 'true')
  await awake.click()
  await expect(awake).toHaveAttribute('aria-checked', 'false')
  await expect.poll(async () => (await preferences()).keep_awake).toBe(false)
  await page.getByRole('switch', { name: 'Notify me' }).click()
  await expect.poll(async () => (await preferences()).notify_done).toBe(false)
  expect(await settings()).toMatchObject({ keep_awake: false, notify_done: false })
  await awake.click()
  await page.getByRole('switch', { name: 'Notify me' }).click()
  await expect.poll(async () => await preferences()).toEqual({ keep_awake: true, notify_done: true })
})

test('defaults apply to the next new screening', async () => {
  const { page } = launched
  await page.getByRole('combobox', { name: 'Model' }).selectOption('qwen3:8b')
  await page.getByRole('switch', { name: 'Always shortlist at least' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Minimum shortlisted' })).toHaveValue('10')
  const shortlist = page.getByRole('slider', { name: 'Shortlist score' })
  await shortlist.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await expect(shortlist).toHaveAttribute('aria-valuenow', '65')
  await expect.poll(settings).toMatchObject({ default_model: 'qwen3:8b', default_shortlist: 65, default_min: 10 })

  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'New screening' }).click()
  const models = page.getByRole('radiogroup', { name: 'Installed models' })
  await expect(models.getByRole('radio', { name: /qwen3:8b/ })).toHaveAttribute('aria-checked', 'true')
  const [draft] = await runs()
  expect(draft).toMatchObject({ model_name: 'qwen3:8b', shortlist_cutoff: 65, min_shortlist: 10 })
})

test('screenshots with a screening listed', async () => {
  const { page } = launched
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma')
  await expect(heading()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Delete Screening/ })).toBeVisible()
  const appearance = page.getByRole('radiogroup', { name: 'Appearance' })
  for (const theme of ['light', 'dark'] as const) {
    await appearance.getByRole('radio', { name: theme === 'light' ? 'Light' : 'Dark' }).click()
    await page.waitForTimeout(300)
    await capture(page, 'settings', theme)
    await page.getByRole('heading', { name: 'Data' }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(PHASE3_SCREENS_DIR, `settings-data-${theme}.png`), animations: 'disabled' })
  }
  await appearance.getByRole('radio', { name: 'System' }).click()
})

test('delete a screening: confirm, gone, and Back never returns to it', async () => {
  const { page } = launched
  const [draft] = await runs()
  await page.getByRole('button', { name: `Delete ${draft?.name}` }).click()
  const alert = page.getByRole('alertdialog')
  await expect(alert).toContainText('CSV files you exported stay where you saved them.')
  await alert.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByText(`Deleted “${draft?.name}”`)).toBeVisible()
  await expect(page.getByRole('button', { name: `Delete ${draft?.name}` })).toHaveCount(0)
  expect(await runs()).toHaveLength(0)
  // It came from that run's setup; with the run gone, Back goes Home.
  await expect(page.getByRole('button', { name: 'Home' })).toBeVisible()
})

test('about: versions, and the logs folder opens', async () => {
  const { app, page } = launched
  const about = page.getByRole('region', { name: 'About Atlas' })
  await expect(about).toContainText('Running · 0.0.0-stub')
  await expect(about).toContainText('0.2.0 · Running')
  await expect(about).toContainText('© 2026 Aryan Gupta. All rights reserved.')
  // Atlas's own version (package.json), not Electron's.
  const version = (JSON.parse(readFileSync(join(APP_DIR, 'package.json'), 'utf8')) as { version: string }).version
  await expect(about.locator('dd').first()).toHaveText(version)
  await about.getByRole('button', { name: 'Open logs folder' }).click()
  await expect.poll(async () => (await shellOpened(app)).at(-1) ?? '').toMatch(/logs$/)
  await page.getByRole('button', { name: 'Show in folder' }).click()
  await expect.poll(async () => (await shellOpened(app)).length).toBe(2)
})

test('delete all data: typed confirmation, then a fresh start', async () => {
  const { page } = launched
  await page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.evaluate(() => window.atlas.api.request('POST', '/runs', { name: 'Campus drive' }))

  await page.getByRole('button', { name: 'Delete all data…' }).click()
  const sheet = page.getByRole('dialog', { name: 'Delete all Atlas data?' })
  const confirm = sheet.getByRole('button', { name: 'Delete everything' })
  await expect(confirm).toBeDisabled()
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(PHASE3_SCREENS_DIR, `delete-all-${theme}.png`), animations: 'disabled' })
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await sheet.getByLabel('Type DELETE to confirm').fill('delet')
  await expect(confirm).toBeDisabled()
  await sheet.getByLabel('Type DELETE to confirm').fill('delete')
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(page.getByText('All Atlas data was deleted from this computer.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
  expect(await runs()).toHaveLength(0)
  expect(await settings()).toMatchObject({
    appearance: 'system',
    default_model: null,
    default_min: 0,
    keep_awake: true,
  })
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
})
