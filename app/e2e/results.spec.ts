/**
 * Step 2.7: Results, against the stubs (fictional data). The 25-student
 * fixture with shortlist 60, band 50, minimum 15 gives: 15 shortlisted
 * (7 filled to the minimum), 3 cutoff, 4 rejected, 3 need attention.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { startScreening, waitForStatus } from './flow'
import { type Launched, close } from './helpers'
import { capture, setTheme } from './screens'
import { type Stubs, launchWithStubs, nextSaveDialogReturns, startStubs, tempDir } from './stubs'

// One screening shared by every test, so a failure skips the rest instead of
// re-running them against a fresh app.
test.describe.configure({ mode: 'serial' })

let stubs: Stubs
let launched: Launched

const bucket = (name: RegExp | string) =>
  launched.page.getByRole('navigation', { name: 'Buckets' }).getByRole('button', { name })

test.beforeAll(async () => {
  stubs = await startStubs(0.05)
  launched = await launchWithStubs(stubs)
  await expect(launched.page.locator('[data-engine="ready"]')).toBeVisible({ timeout: 120_000 })
  await startScreening(launched, stubs, { minimum: 15 })
  await waitForStatus(launched.page, 'completed', 180_000)
  await launched.page.getByRole('button', { name: 'View results' }).click()
  await expect(launched.page.getByRole('listbox', { name: 'Shortlisted candidates' })).toBeVisible()
})

test.afterAll(async () => {
  await close(launched)
  stubs.stop()
})

test('buckets, counts, fill badges and notes come from the engine', async () => {
  const { page } = launched
  await expect(bucket(/^Shortlisted/)).toContainText('15')
  await expect(bucket(/^Cutoff/)).toContainText('3')
  await expect(bucket(/^Rejected/)).toContainText('4')
  await expect(bucket(/^Needs attention/)).toContainText('3')
  await expect(bucket(/^Filtered out/)).toContainText('0')
  await expect(page.getByText('7 candidates below 60 were shortlisted to reach the minimum.')).toBeVisible()
  const list = page.getByRole('listbox', { name: 'Shortlisted candidates' })
  await expect(list.getByRole('option')).toHaveCount(15)
  await expect(list.getByText('Filled to minimum')).toHaveCount(7)
  await expect(list.getByRole('option').first()).toContainText('1')
  await expect(list.getByRole('img', { name: 'Score 92, Shortlisted' })).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'results', theme)
  }
})

test('search and sort', async () => {
  const { page } = launched
  const search = page.getByRole('searchbox', { name: 'Search by name or RA number' })
  await search.fill('RA2311000003')
  const list = page.getByRole('listbox', { name: 'Shortlisted candidates' })
  await expect(list.getByRole('option')).toHaveCount(1)
  await search.fill('nobody-by-this-name')
  await expect(page.getByText('Nothing matches “nobody-by-this-name”')).toBeVisible()
  await search.fill('')
  await expect(list.getByRole('option')).toHaveCount(15)
  // By rank, the second row is Diya Iyer (88); by name it is Arjun Pillai.
  await expect(list.getByRole('option').nth(1)).toContainText('Diya Iyer')
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('name')
  await expect(list.getByRole('option').nth(1)).toContainText('Arjun Pillai')
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('rank')
  await expect(list.getByRole('option').nth(1)).toContainText('Diya Iyer')
})

test('keyboard into the detail sheet; override with a note', async () => {
  const { page } = launched
  const list = page.getByRole('listbox', { name: 'Shortlisted candidates' })
  await list.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('img', { name: /Technical \d+ out of 100/ })).toBeVisible()
  await expect(sheet.getByText('Evidence from the résumé')).toBeVisible()
  await expect(sheet.locator('blockquote').first()).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'candidate', theme)
  }
  await sheet.getByRole('combobox', { name: 'Move to…' }).selectOption('rejected')
  await sheet.getByLabel('Note (optional)').fill('Withdrew from the drive')
  await sheet.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(sheet.getByText('Moved by you', { exact: true })).toBeVisible()
  await expect(sheet.getByText(/Moved by recruiter: shortlisted → rejected \(Withdrew from the drive\)/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(bucket(/^Shortlisted/)).toContainText('14')
  await expect(bucket(/^Rejected/)).toContainText('5')
  await expect(page.getByText('Recruiter changes leave 14 shortlisted, below the minimum of 15.')).toBeVisible()
  await bucket(/^Rejected/).click()
  await expect(page.getByRole('listbox', { name: 'Rejected candidates' }).getByText('Moved by you')).toBeVisible()
  await bucket(/^Shortlisted/).click()
})

test('adjust cutoffs: live preview with what moves, then save', async () => {
  const { page } = launched
  await page.getByRole('button', { name: 'Adjust cutoffs' }).first().click()
  const pop = page.getByRole('dialog', { name: 'Adjust cutoffs' })
  await expect(pop).toBeVisible()
  await expect(pop.getByText('These are the saved cutoffs.')).toBeVisible()
  const shortlist = pop.getByRole('slider', { name: 'Shortlist score' })
  await shortlist.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await expect(shortlist).toHaveAttribute('aria-valuenow', '65')
  await pop.getByRole('switch', { name: 'Always shortlist at least' }).click()
  // The engine's delta, before anything is saved.
  await expect(pop.getByRole('status')).toContainText(/to Rejected|from Shortlisted/, { timeout: 5_000 })
  await expect(bucket(/^Shortlisted/)).toContainText('7')
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'adjust-cutoffs', theme)
  }
  const saved = (await page.evaluate(() => window.atlas.api.request('GET', '/runs'))) as {
    data: Array<{ shortlist_cutoff: number }>
  }
  expect(saved.data[0]?.shortlist_cutoff).toBe(60)
  await pop.getByRole('button', { name: 'Save cutoffs' }).click()
  await expect(pop).toBeHidden()
  const after = (await page.evaluate(() => window.atlas.api.request('GET', '/runs'))) as {
    data: Array<{ shortlist_cutoff: number; min_shortlist: number }>
  }
  expect(after.data[0]).toMatchObject({ shortlist_cutoff: 65, min_shortlist: 0 })
  await expect(bucket(/^Shortlisted/)).toContainText('7')
})

test('needs attention: grouped by reason, with retry', async () => {
  const { page } = launched
  await bucket(/^Needs attention/).click()
  await expect(
    page.getByRole('region', { name: 'Link is private. Ask the student to set sharing to "Anyone with the link".' }),
  ).toBeVisible()
  await expect(page.getByText('This is a Google Doc, not a PDF. Ask the student to upload a PDF.')).toBeVisible()
  await expect(page.getByText('The file no longer exists at this link.')).toBeVisible()
  await expect(page.getByText('Google Doc', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry failed (0)' })).toBeDisabled()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'needs-attention', theme)
  }
})

test('export: choose a view, save, file on disk', async () => {
  const { app, page } = launched
  const folder = tempDir('atlas-export-')
  const target = join(folder, 'shortlisted.csv')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Export results' })
  await sheet.getByRole('radio', { name: /Shortlisted/ }).click()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'export', theme)
  }
  await nextSaveDialogReturns(app, target)
  await sheet.getByRole('button', { name: 'Export…' }).click()
  await expect(page.getByText('Exported 7 candidates')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show in folder' })).toBeVisible()
  const csv = readFileSync(target)
  expect(csv.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true)
  expect(csv.toString('utf8').trim().split('\r\n')).toHaveLength(8)
})

test('empty buckets say so', async () => {
  const { page } = launched
  await bucket(/^Filtered out/).click()
  await expect(page.getByText('No one was filtered out')).toBeVisible()
})

test('retry all: back to Progress, then complete again', async () => {
  const { page } = launched
  await bucket(/^Needs attention/).click()
  await page.getByRole('button', { name: 'Retry all including fixed links (3)' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Retry all' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Screening progress' })
      .or(page.getByRole('heading', { name: 'Screening complete' })),
  ).toBeVisible()
  await waitForStatus(page, 'completed', 60_000)
})
