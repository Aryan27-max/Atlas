/**
 * Step 2.3: the #/design gallery renders every component, in both themes,
 * and is captured for the step summary.
 */

import { expect, test } from '@playwright/test'
import { type Launched, close, launch, waitForWelcome } from './helpers'
import { capture, setTheme } from './screens'

let launched: Launched

test.beforeAll(async () => {
  launched = await launch()
  await waitForWelcome(launched.page)
})

test.afterAll(async () => {
  await close(launched)
})

test('the gallery shows every component in both themes', async () => {
  const { page } = launched
  await page.evaluate(() => {
    window.location.hash = '#/design'
  })
  const gallery = page.getByTestId('design-gallery')
  await expect(gallery).toBeVisible()
  for (const role of ['radiogroup', 'switch', 'slider', 'spinbutton', 'progressbar', 'navigation']) {
    expect(await page.getByRole(role as never).count(), role).toBeGreaterThan(0)
  }
  for (const label of ['Score 86, Shortlisted', 'Score 55, Cutoff', 'Score 31, Rejected']) {
    await expect(page.getByRole('img', { name: label }).first()).toBeVisible()
  }
  expect(await page.locator('[data-theme="light"] .atl-button--primary').count()).toBeGreaterThan(0)
  expect(await page.locator('[data-theme="dark"] .atl-button--primary').count()).toBeGreaterThan(0)
})

test('the sheet and alert trap focus and close with Esc', async () => {
  const { page } = launched
  const column = page.locator('.gallery-column[data-theme="light"]')
  await column.getByRole('button', { name: 'Open sheet' }).click()
  const sheet = page.getByRole('dialog', { name: 'Export results' })
  await expect(sheet).toBeVisible()
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab')
  expect(await sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  await column.getByRole('button', { name: 'Cancel screening…' }).click()
  const alert = page.getByRole('alertdialog', { name: 'Cancel this screening?' })
  await expect(alert).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Keep screening' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(alert).toBeHidden()
})

test('screenshots', async () => {
  const { page } = launched
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'design', theme, '.gallery')
    await page.reload()
    await page.evaluate(() => {
      window.location.hash = '#/design'
    })
    await expect(page.getByTestId('design-gallery')).toBeVisible()
  }
})
