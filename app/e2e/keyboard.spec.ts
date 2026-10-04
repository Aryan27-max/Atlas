/**
 * Step 2.9: set up and start a screening with the keyboard alone (Tab,
 * Shift+Tab, arrows, Enter, Space, typing). Every stop must show a focus ring.
 * The native open dialog is stubbed; it is opened from the keyboard.
 */

import { type Locator, type Page, expect, test } from '@playwright/test'
import { type Launched, close, waitForWelcome } from './helpers'
import { type Stubs, launchWithStubs, nextOpenDialogReturns, startStubs } from './stubs'

let stubs: Stubs
let launched: Launched

/** Press Tab until `target` has focus (at most 40 stops), checking each stop shows focus. */
async function tabTo(page: Page, target: Locator): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const state = await page.evaluate(() => {
      const el = document.activeElement
      return { visible: el ? el.matches(':focus-visible') : false, body: el === document.body }
    })
    expect(state.body || state.visible, 'every focused control shows a focus ring').toBe(true)
    if (await target.evaluate((el) => el === document.activeElement)) return
  }
  throw new Error(`Tab never reached ${target}`)
}

test.beforeAll(async () => {
  stubs = await startStubs(0.05)
  launched = await launchWithStubs(stubs)
  await waitForWelcome(launched.page)
})

test.afterAll(async () => {
  await close(launched)
  stubs.stop()
})

test('keyboard only: Welcome → four setup steps → Start screening', async () => {
  const { app, page } = launched

  // Welcome
  await tabTo(page, page.getByRole('button', { name: 'New screening' }))
  await page.keyboard.press('Enter')

  // 1 · Students & model
  await nextOpenDialogReturns(app, stubs.files.xlsx)
  await tabTo(page, page.getByRole('button', { name: 'Choose file…' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'File summary' })).toBeVisible()
  const model = page.getByRole('radiogroup', { name: 'Installed models' }).getByRole('radio', { name: /qwen3:8b/ })
  await tabTo(page, model)
  await page.keyboard.press('Space')
  await expect(model).toHaveAttribute('aria-checked', 'true')
  const next = page.getByRole('button', { name: 'Continue' })
  await expect(next).toBeEnabled({ timeout: 60_000 })
  await tabTo(page, next)
  await page.keyboard.press('Enter')

  // 2 · Criteria: the text box has focus on arrival.
  const criteria = page.getByRole('textbox', { name: /What are you looking for/ })
  await expect(criteria).toBeFocused()
  await page.keyboard.type('Python and SQL, with one real project. Internship experience is a plus.')
  await tabTo(page, next)
  await page.keyboard.press('Enter')

  // 3 · Cutoffs: move the shortlist handle with the arrows, turn on a minimum.
  const shortlist = page.getByRole('slider', { name: 'Shortlist score' })
  await tabTo(page, shortlist)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(shortlist).toHaveAttribute('aria-valuenow', '62')
  const minimum = page.getByRole('switch', { name: 'Always shortlist at least' })
  await tabTo(page, minimum)
  await page.keyboard.press('Space')
  await expect(minimum).toHaveAttribute('aria-checked', 'true')
  await tabTo(page, next)
  await page.keyboard.press('Enter')

  // 4 · Review: Escape goes back a step, Enter comes forward again.
  await expect(page.getByRole('button', { name: 'Start screening' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(shortlist).toBeVisible()
  await tabTo(page, next)
  await page.keyboard.press('Enter')
  const start = page.getByRole('button', { name: 'Start screening' })
  await tabTo(page, start)
  await page.keyboard.press('Enter')

  await expect(page.getByRole('region', { name: 'Screening progress' })).toBeVisible({ timeout: 30_000 })
  const runs = (await page.evaluate(() => window.atlas.api.request('GET', '/runs'))) as {
    data: Array<{ shortlist_cutoff: number; min_shortlist: number; model_name: string; criteria_prompt: string }>
  }
  expect(runs.data[0]).toMatchObject({ shortlist_cutoff: 62, min_shortlist: 10, model_name: 'qwen3:8b' })
  expect(runs.data[0]?.criteria_prompt).toContain('Python and SQL')
})
