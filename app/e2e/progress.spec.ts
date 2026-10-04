/**
 * Step 2.6: Progress, against the stub Drive and Ollama (fictional data).
 * A slow model so the run can be watched, paused, resumed, interrupted by
 * Ollama stopping, and finished.
 */

import { expect, test } from '@playwright/test'
import { startScreening, waitForStatus } from './flow'
import { type Launched, close, waitForWelcome } from './helpers'
import { capture, setTheme } from './screens'
import { type Stubs, launchWithStubs, startStubs } from './stubs'

let stubs: Stubs
let launched: Launched

test.beforeAll(async () => {
  stubs = await startStubs(0.6)
  launched = await launchWithStubs(stubs)
  await waitForWelcome(launched.page)
  await startScreening(launched, stubs, { minimum: 15 })
})

test.afterAll(async () => {
  await close(launched)
  stubs.stop()
})

test('live progress: ring, stages, activity by id and RA only, estimate', async () => {
  const { page } = launched
  const ring = page.getByRole('progressbar', { name: 'Screening progress' })
  await expect(ring).toBeVisible()
  await expect(page.locator('.stage-grid')).toContainText('Waiting')
  await expect(page.locator('.stage-grid')).toContainText('Needs attention')
  await expect(page.locator('.activity-line').first()).toContainText(/résumé #\d+ · RA2311\d{6}/, { timeout: 30_000 })
  // After 5 scored, the estimate switches to Measured.
  await expect(page.locator('.eta-basis')).toHaveText('Measured', { timeout: 60_000 })
  await expect(page.getByText(/^(About .+|Less than a minute) left$/)).toBeVisible()
  await expect(page.getByText(/^Done around /)).toBeVisible()
  // Names never appear on this screen.
  const text = await page.locator('main').innerText()
  for (const name of ['Aarav', 'Sharma', 'Diya', 'Iyer', 'Meera', 'Menon']) expect(text).not.toContain(name)
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'progress', theme)
  }
})

test('pause by the user shows Resume; Resume continues', async () => {
  const { page } = launched
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Paused by you' })).toBeVisible()
  await expect(page.getByText('Paused', { exact: true })).toBeVisible()
  await page.getByRole('status').filter({ hasText: 'Paused by you' }).getByRole('button', { name: 'Resume' }).click()
  await waitForStatus(page, 'running')
  // The banner goes; the activity feed keeps "Paused by you" as history.
  await expect(page.getByRole('status').filter({ hasText: 'Paused by you' })).toBeHidden()
  await expect(page.locator('.feed-lines')).toContainText('Paused by you')
})

test('Ollama stopping pauses the run; it continues by itself', async () => {
  const { page } = launched
  await stubs.ollamaOffline()
  const banner = page.getByRole('status').filter({ hasText: "Ollama isn't running" })
  await expect(banner).toBeVisible({ timeout: 60_000 })
  await expect(banner).toContainText('Atlas will continue automatically when this is fixed.')
  await expect(banner.getByRole('button', { name: 'Resume' })).toHaveCount(0)
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'progress-paused', theme)
  }
  // Welcome shows the unfinished run with its reason.
  await page.getByRole('button', { name: 'Home' }).click()
  await expect(page.getByRole('region', { name: /Resume “Screening/ })).toBeVisible()
  await expect(page.getByText('Atlas will continue automatically when this is fixed.')).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'welcome-resume', theme)
  }
  await page.getByRole('button', { name: 'Resume', exact: true }).click()
  await stubs.ollamaOnline()
  await waitForStatus(page, 'running', 60_000)
  await expect(banner).toBeHidden()
})

test('completion: success state, needs attention, View results', async () => {
  const { page } = launched
  await stubs.chatDelay(0.05)
  await waitForStatus(page, 'completed', 180_000)
  await expect(page.getByRole('heading', { name: 'Screening complete' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/22 résumés scored · 3 need attention/)).toBeVisible()
  const attention = page.getByRole('region', { name: 'Needs attention' })
  await expect(attention).toContainText('Link is private.')
  await expect(attention).toContainText('This is a Google Doc, not a PDF.')
  await expect(attention).toContainText('The file no longer exists at this link.')
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'progress-done', theme)
  }
  await page.getByRole('button', { name: 'View results' }).click()
  await expect(page.getByRole('region', { name: 'Screening progress' })).toBeHidden()
})
