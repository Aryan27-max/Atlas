/**
 * Step 2.9: performance with 2,000 fictional scored students (seeded through
 * the engine's own state machine by engine/tests/e2e_seed.py).
 *
 * Measured inside the page, so Playwright's round trips don't count:
 * - long tasks (> 50 ms on the main thread) while opening, scrolling and
 *   moving the cutoffs;
 * - live cutoff response: a key press on the shortlist handle until the
 *   engine's new Shortlisted count is on screen.
 */

import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { type Launched, close, launch, waitForEngine } from './helpers'
import { PYTHON, REPO, tempDir } from './stubs'

test.describe.configure({ mode: 'serial' })

const COUNT = 2000
const RESPONSE_BUDGET_MS = 200

let launched: Launched

declare global {
  interface Window {
    __longTasks?: number[]
  }
}

async function longTasks(): Promise<number[]> {
  return launched.page.evaluate(() => window.__longTasks?.splice(0) ?? [])
}

test.beforeAll(async () => {
  const userData = tempDir()
  execFileSync(PYTHON, ['-m', 'engine.tests.e2e_seed', userData, '--count', String(COUNT)], {
    cwd: REPO,
    env: { ...process.env, PYTHONUTF8: '1' },
  })
  launched = await launch({}, userData)
  await waitForEngine(launched.page)
  await launched.page.evaluate(() => {
    window.__longTasks = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks?.push(Math.round(entry.duration))
    }).observe({ type: 'longtask', buffered: false })
  })
})

test.afterAll(async () => {
  await close(launched)
})

test('open 2,000 results, scroll end to end', { tag: '@perf' }, async () => {
  const { page } = launched
  await longTasks()
  const started = Date.now()
  await page.getByRole('button', { name: /Campus drive \(2,000 fictional students\)/ }).click()
  const list = page.getByRole('listbox', { name: 'Shortlisted candidates' })
  await expect(list.getByRole('option').first()).toBeVisible()
  const openMs = Date.now() - started
  const shortlisted = Number(await list.getByRole('option').first().getAttribute('aria-setsize'))
  expect(shortlisted).toBeGreaterThan(400)
  // Virtualised: only the rows near the viewport exist.
  expect(await list.getByRole('option').count()).toBeLessThan(60)
  const openTasks = await longTasks()

  await list.focus()
  await page.keyboard.press('End')
  await expect(list.locator(`[aria-posinset="${shortlisted}"]`)).toBeVisible()
  for (let i = 0; i < 10; i++) await page.keyboard.press('PageUp')
  await page.keyboard.press('Home')
  await expect(list.locator('[aria-posinset="1"]')).toBeVisible()
  await page.getByRole('button', { name: /^Rejected/ }).click()
  await expect(page.getByRole('listbox', { name: 'Rejected candidates' })).toBeVisible()
  await page.getByRole('button', { name: /^Shortlisted/ }).click()
  const scrollTasks = await longTasks()

  console.log(
    `[perf] open: ${openMs} ms; long tasks while opening: ${JSON.stringify(openTasks)}; while scrolling and switching: ${JSON.stringify(scrollTasks)}`,
  )
  expect(scrollTasks.filter((ms) => ms > 100)).toEqual([])
})

test(`live cutoffs answer within ${RESPONSE_BUDGET_MS} ms`, { tag: '@perf' }, async () => {
  const { page } = launched
  await page.getByRole('button', { name: 'Adjust cutoffs' }).first().click()
  const slider = page.getByRole('dialog', { name: 'Adjust cutoffs' }).getByRole('slider', { name: 'Shortlist score' })
  await expect(slider).toBeVisible()
  await longTasks()

  const timings: number[] = []
  for (let i = 0; i < 8; i++) {
    const key = i % 2 === 0 ? 'ArrowRight' : 'ArrowLeft'
    const ms = await page.evaluate(
      (key) =>
        new Promise<number>((resolve, reject) => {
          const count = document.querySelector('nav[aria-label="Buckets"] button .atl-sidebar-count')
          const handle = document.querySelector('[role="slider"][aria-label="Shortlist score"]')
          if (!count || !(handle instanceof HTMLElement)) return reject(new Error('missing elements'))
          const before = count.getAttribute('aria-label')
          const start = performance.now()
          const observer = new MutationObserver(() => {
            if (count.getAttribute('aria-label') !== before) {
              observer.disconnect()
              resolve(performance.now() - start)
            }
          })
          observer.observe(count, { attributes: true, attributeFilter: ['aria-label'] })
          setTimeout(() => {
            observer.disconnect()
            reject(new Error('the count never changed'))
          }, 5_000)
          handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
        }),
      key,
    )
    timings.push(Math.round(ms))
    await page.waitForTimeout(250)
  }
  const tasks = await longTasks()
  const sorted = [...timings].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  console.log(
    `[perf] cutoff response ms: ${JSON.stringify(timings)} (median ${median}); long tasks: ${JSON.stringify(tasks)}`,
  )
  expect(median).toBeLessThan(RESPONSE_BUDGET_MS)
  expect(Math.max(...timings)).toBeLessThan(RESPONSE_BUDGET_MS * 1.5)
  await page.keyboard.press('Escape')
})
