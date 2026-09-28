/**
 * Step 2.9: the five end-to-end flows from the Phase 2 definition of done,
 * each in a fresh app against the real engine and the stubs (fictional data).
 *
 * 1. Happy path from an .xlsx: minimum 15 → "Filled to minimum", live
 *    cutoffs, an override, export, and the file on disk.
 * 2. Ollama stops mid-run: the run pauses (nobody fails) and resumes by itself.
 * 3. Atlas is closed mid-run and reopened: Resume, and not one candidate is
 *    lost or scored twice.
 * 4. A file without a résumé link column is refused before anything starts.
 * 5. The theme survives a restart.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { startScreening, waitForStatus } from './flow'
import { type Launched, close, launch, waitForEngine } from './helpers'
import {
  type Stubs,
  launchWithStubs,
  nextMessageBoxAnswers,
  nextOpenDialogReturns,
  nextSaveDialogReturns,
  startStubs,
  tempDir,
} from './stubs'

interface Run {
  id: number
  status: string
  done: number
  total: number
  pause_reason: string | null
  counts: { scored: number; failed: number }
}
interface Row {
  candidate_id: number
  ra_number: string
  bucket: string
  failure_reason: string | null
}
interface Detail {
  events: Array<{ message: string }>
}

async function request<T>(page: Page, method: string, path: string, body?: unknown): Promise<T> {
  const result = (await page.evaluate(([m, p, b]) => window.atlas.api.request(m as 'GET', p as string, b), [
    method,
    path,
    body,
  ] as const)) as { ok: boolean; data: T; error?: { message: string } }
  if (!result.ok) throw new Error(`${method} ${path}: ${result.error?.message}`)
  return result.data
}

/** Minimal RFC 4180 reader for the exported file (quotes, doubled quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

const firstRun = async (page: Page): Promise<Run> => (await request<Run[]>(page, 'GET', '/runs'))[0] as Run
const LINK_REASONS = 3 // the fixture's private link, Google Doc and missing file

let stubs: Stubs
const opened: Launched[] = []

async function open(userData?: string): Promise<Launched> {
  const launched = await launchWithStubs(stubs, userData)
  opened.push(launched)
  await waitForEngine(launched.page)
  return launched
}

test.beforeAll(async () => {
  stubs = await startStubs(0.05)
})

test.afterEach(async () => {
  await stubs.ollamaOnline()
  await stubs.chatDelay(0.05)
  for (const launched of opened.splice(0)) {
    // If a run is still going, closing asks "Close Atlas?": answer it.
    await nextMessageBoxAnswers(launched.app, 0).catch(() => undefined)
    await close(launched).catch(() => undefined)
  }
})

test.afterAll(() => stubs.stop())

test('1 · happy path from an .xlsx: fill, live cutoffs, override, export', async () => {
  const launched = await open()
  const { app, page } = launched
  await startScreening(launched, stubs, { minimum: 15, file: stubs.files.xlsx })
  await waitForStatus(page, 'completed', 180_000)
  await page.getByRole('button', { name: 'View results' }).click()

  const shortlisted = page.getByRole('listbox', { name: 'Shortlisted candidates' })
  await expect(shortlisted.getByRole('option')).toHaveCount(15)
  await expect(shortlisted.getByText('Filled to minimum')).toHaveCount(7)

  // Live cutoffs: the counts move before anything is saved.
  const count = page.getByRole('navigation', { name: 'Buckets' }).getByRole('button', { name: /^Shortlisted/ })
  await page.getByRole('button', { name: 'Adjust cutoffs' }).first().click()
  const pop = page.getByRole('dialog', { name: 'Adjust cutoffs' })
  await pop.getByRole('switch', { name: 'Always shortlist at least' }).click()
  await expect(count).toContainText('8')
  await expect(pop.getByRole('status')).toContainText('−7 from Shortlisted')
  await pop.getByRole('button', { name: 'Save cutoffs' }).click()
  await expect(pop).toBeHidden()
  const run = await firstRun(page)
  expect((await request<{ min_shortlist: number }>(page, 'GET', `/runs/${run.id}`)).min_shortlist).toBe(0)

  // Override the top candidate into Cutoff.
  await shortlisted.getByRole('option').first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('combobox', { name: 'Move to…' }).selectOption('cutoff')
  await sheet.getByLabel('Note (optional)').fill('Second round')
  await sheet.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(sheet.getByText('Moved by you', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(count).toContainText('7')

  // Export everything and read the file back.
  const target = join(tempDir('atlas-export-'), 'all.csv')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await nextSaveDialogReturns(app, target)
  await page.getByRole('dialog', { name: 'Export results' }).getByRole('button', { name: 'Export…' }).click()
  await expect(page.getByText('Exported 25 candidates')).toBeVisible()
  const bytes = readFileSync(target)
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  const [header, ...rows] = parseCsv(bytes.toString('utf8').slice(1))
  expect(rows).toHaveLength(25)
  const column = (name: string): number => (header ?? []).indexOf(name)
  expect(column('RA Number')).toBeGreaterThanOrEqual(0)
  const bucketOf = rows.map((row) => row[column('Bucket')])
  const placed = rows.map((row) => row[column('How placed')])
  expect(bucketOf.filter((b) => b === 'Shortlisted')).toHaveLength(7)
  expect(placed.filter((p) => p === 'Moved by recruiter')).toHaveLength(1)
  // Rule 14: no cell starts with a formula character.
  expect(rows.flat().filter((cell) => /^[=+@\t\r]/.test(cell))).toEqual([])
})

test('2 · Ollama stops mid-run: paused, nobody fails, resumes by itself', async () => {
  const launched = await open()
  const { page } = launched
  await stubs.chatDelay(0.5)
  await startScreening(launched, stubs, { file: stubs.files.csv })
  await expect.poll(async () => (await firstRun(page)).counts.scored, { timeout: 60_000 }).toBeGreaterThanOrEqual(3)

  await stubs.ollamaOffline()
  await expect(page.getByText("Ollama isn't running").first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/continue automatically/).first()).toBeVisible()
  const paused = await firstRun(page)
  expect(paused.status).toBe('paused')
  expect(paused.pause_reason).toBe("Ollama isn't running")
  expect(paused.counts.failed).toBeLessThanOrEqual(LINK_REASONS)

  await stubs.chatDelay(0.05)
  await stubs.ollamaOnline()
  await waitForStatus(page, 'completed', 120_000)
  const done = await firstRun(page)
  expect(done.counts).toMatchObject({ scored: 22, failed: LINK_REASONS })
  const failed = await request<{ rows: Row[] }>(page, 'GET', `/runs/${done.id}/results?bucket=failed`)
  expect(failed.rows.map((row) => row.failure_reason)).not.toContainEqual(expect.stringMatching(/Ollama/))
})

test('3 · closed mid-run and reopened: Resume, 0 lost, 0 duplicated', async () => {
  const first = await open()
  await stubs.chatDelay(0.6)
  await startScreening(first, stubs, { file: stubs.files.csv })
  await expect
    .poll(async () => (await firstRun(first.page)).counts.scored, { timeout: 60_000 })
    .toBeGreaterThanOrEqual(4)
  const before = await firstRun(first.page)
  expect(before.status).toBe('running')

  // Close the window the way a recruiter would, and confirm "Close Atlas".
  await nextMessageBoxAnswers(first.app, 0)
  const closed = first.app.waitForEvent('close')
  await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await closed
  opened.splice(opened.indexOf(first), 1)

  const second = await open(first.userData)
  const { page } = second
  const reopened = await firstRun(page)
  expect(reopened).toMatchObject({ status: 'paused', pause_reason: 'Atlas was closed' })
  expect(reopened.counts.scored).toBeGreaterThanOrEqual(before.counts.scored)

  await page.getByRole('button', { name: 'Resume' }).first().click() // the Welcome card
  await expect(page.getByRole('region', { name: 'Screening progress' })).toBeVisible()
  await stubs.chatDelay(0.05)
  await page.getByRole('banner').getByRole('button', { name: 'Resume' }).click() // Progress toolbar
  await waitForStatus(page, 'completed', 120_000)

  const run = await firstRun(page)
  expect(run.counts).toMatchObject({ scored: 22, failed: LINK_REASONS })
  const results = await request<{ total: number; rows: Row[] }>(page, 'GET', `/runs/${run.id}/results?limit=5000`)
  expect(results.total).toBe(25)
  expect(new Set(results.rows.map((row) => row.ra_number)).size).toBe(25) // nobody lost or doubled
  for (const row of results.rows) {
    const detail = await request<Detail>(page, 'GET', `/runs/${run.id}/candidates/${row.candidate_id}`)
    const scoredEvents = detail.events.filter((event) => event.message.startsWith('Scored')).length
    expect(scoredEvents, `${row.ra_number} scored events`).toBe(row.bucket === 'failed' ? 0 : 1)
  }
  console.log(
    `[flow 3] scored before close: ${before.counts.scored}; after reopen: ${reopened.counts.scored}; ` +
      `final: ${run.counts.scored} scored + ${run.counts.failed} need attention of ${results.total}; ` +
      `unique RA numbers: ${new Set(results.rows.map((row) => row.ra_number)).size}; one "Scored" event per scored candidate`,
  )
})

test('4 · a file without a résumé link column is refused', async () => {
  const launched = await open()
  const { app, page } = launched
  await page.getByRole('button', { name: 'New screening' }).click()
  await nextOpenDialogReturns(app, stubs.files.no_links)
  await page.getByRole('button', { name: 'Choose file…' }).click()
  await expect(page.getByText("This file can't be used yet")).toBeVisible()
  await expect(page.getByText(/No column for Résumé link/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  const run = await firstRun(page)
  expect(run).toMatchObject({ status: 'draft', total: 0 })
})

test('5 · the theme survives a restart', async () => {
  const userData = tempDir()
  const first = await launch({}, userData)
  await waitForEngine(first.page)
  await first.page.getByRole('button', { name: 'Settings' }).click()
  await first.page.getByRole('radiogroup', { name: 'Appearance' }).getByRole('radio', { name: 'Dark' }).click()
  await expect
    .poll(async () => (await request<{ appearance: string }>(first.page, 'GET', '/settings')).appearance)
    .toBe('dark')
  await close(first, false)

  const second = await launch({}, userData)
  opened.push(second)
  await waitForEngine(second.page)
  await expect(second.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await second.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
})
