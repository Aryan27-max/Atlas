/**
 * Adjust cutoffs from the keyboard while the screen is slow: every key press
 * on a handle counts and the handle keeps focus.
 *
 * CI (macOS) once saw five ArrowRight presses move the shortlist by one: the
 * popover's "focus the first control" ran a frame late, after the first press,
 * and moved focus to the band handle. Here both kinds of slowness are forced:
 * the engine's preview answers 1.5 s late, and the popover's first frame only
 * arrives after the first key press.
 */

import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { type Launched, close, launch, waitForEngine } from './helpers'
import { PYTHON, REPO, tempDir } from './stubs'

test.describe.configure({ mode: 'serial' })

const PREVIEW_DELAY_MS = 1500

let launched: Launched

type Request = (...args: unknown[]) => Promise<unknown>
interface Hooks {
  __atlasTest: { engine: { request: Request }; slowPreview?: { original: Request; delayed: number; answered: number } }
}

test.beforeAll(async () => {
  const userData = tempDir()
  // 40 fictional students, saved cutoffs 70 (shortlist) and 55 (band).
  execFileSync(PYTHON, ['-m', 'engine.tests.e2e_seed', userData, '--count', '40'], {
    cwd: REPO,
    env: { ...process.env, PYTHONUTF8: '1' },
  })
  launched = await launch({}, userData)
  await waitForEngine(launched.page)
  await launched.page.getByRole('button', { name: /Campus drive/ }).click()
  await expect(launched.page.getByRole('listbox', { name: 'Shortlisted candidates' })).toBeVisible()
})

test.afterAll(async () => {
  await close(launched)
})

test('every key press on a handle counts while the preview is slow and the first frame is late', async () => {
  const { app, page } = launched
  // Main: preview requests (results with cutoffs in the query) answer late.
  await app.evaluate((_electron, delay) => {
    const hooks = (globalThis as unknown as Hooks).__atlasTest
    const original = hooks.engine.request.bind(hooks.engine)
    const slow = { original, delayed: 0, answered: 0 }
    hooks.slowPreview = slow
    hooks.engine.request = async (...args: unknown[]) => {
      if (!String(args[1]).includes('shortlist=')) return original(...args)
      slow.delayed += 1
      await new Promise((resolve) => setTimeout(resolve, delay))
      const answer = await original(...args)
      slow.answered += 1
      return answer
    }
  }, PREVIEW_DELAY_MS)
  // Renderer: animation frames wait for the next key release.
  await page.evaluate(() => {
    const queued: FrameRequestCallback[] = []
    window.requestAnimationFrame = (cb: FrameRequestCallback) => queued.push(cb)
    document.addEventListener('keyup', () => queued.splice(0).forEach((cb) => cb(performance.now())), true)
  })

  await page.getByRole('button', { name: 'Adjust cutoffs' }).first().click()
  const pop = page.getByRole('dialog', { name: 'Adjust cutoffs' })
  const shortlist = pop.getByRole('slider', { name: 'Shortlist score' })
  const band = pop.getByRole('slider', { name: 'Cutoff band starts at' })
  await expect(shortlist).toHaveAttribute('aria-valuenow', '70')
  await shortlist.focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await expect(shortlist).toHaveAttribute('aria-valuenow', '75')
  await expect(band).toHaveAttribute('aria-valuenow', '55')
  await expect(shortlist).toBeFocused()

  // Still waiting for the engine: keys keep counting.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  await expect(shortlist).toHaveAttribute('aria-valuenow', '72')
  await expect(shortlist).toBeFocused()

  // The late previews arrive; nothing was lost on the way.
  const slow = () => app.evaluate(() => (globalThis as unknown as Hooks).__atlasTest.slowPreview)
  await expect
    .poll(
      async () => {
        const s = await slow()
        return s !== undefined && s.delayed > 0 && s.answered === s.delayed
      },
      { timeout: PREVIEW_DELAY_MS * 10 },
    )
    .toBe(true)
  await expect(pop.getByRole('status')).not.toHaveText('These are the saved cutoffs.')
  await expect(shortlist).toHaveAttribute('aria-valuenow', '72')
  await expect(band).toHaveAttribute('aria-valuenow', '55')
  await expect(shortlist).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(pop).toBeHidden()
  await app.evaluate(() => {
    const hooks = (globalThis as unknown as Hooks).__atlasTest
    if (hooks.slowPreview) hooks.engine.request = hooks.slowPreview.original
  })
})
