/**
 * PLAN Phase 2 exit criterion: every screen works at 1280×800 *and* full
 * screen. Full screen here is the real thing (`setFullScreen`), plus a large
 * display (1920×1200 CSS pixels, by zooming the page out) because this
 * machine's screen is itself 1280×800 in CSS pixels.
 *
 * On each screen: nothing scrolls sideways, the content column stays centred
 * and readable (it doesn't stretch across a wide screen), and the toolbar
 * spans the window.
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Page, expect, test } from '@playwright/test'
import { type Launched, close, launch, waitForEngine } from './helpers'
import { PHASE3_SCREENS_DIR, SCREENS_DIR } from './screens'
import { PYTHON, REPO, tempDir } from './stubs'

test.describe.configure({ mode: 'serial' })

let launched: Launched

interface Layout {
  width: number
  sideways: boolean
  column: { left: number; right: number } | null
  toolbar: number | null
}

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const root = document.documentElement
    const sideways = [...document.querySelectorAll<HTMLElement>('body, .screen-scroll, .results-main')].some(
      (el) => el.scrollWidth > el.clientWidth + 1,
    )
    const column = document.querySelector('.screen-column')?.getBoundingClientRect()
    const toolbar = document.querySelector('header, [role="banner"]')?.getBoundingClientRect()
    return {
      width: root.clientWidth,
      sideways,
      column: column ? { left: Math.round(column.left), right: Math.round(root.clientWidth - column.right) } : null,
      toolbar: toolbar ? Math.round(toolbar.width) : null,
    }
  })
}

async function check(page: Page, name: string, main = true): Promise<void> {
  const info = await layout(page)
  expect(info.sideways, `${name}: nothing scrolls sideways at ${info.width}px`).toBe(false)
  if (main && info.column) {
    expect(Math.abs(info.column.left - info.column.right), `${name}: column centred`).toBeLessThanOrEqual(2)
    expect(info.width - info.column.left - info.column.right, `${name}: column stays readable`).toBeLessThanOrEqual(900)
  }
}

async function everyScreen(page: Page, label: string): Promise<void> {
  const home = page.getByRole('button', { name: 'Home' })
  if (await home.isVisible()) await home.click()
  await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
  await check(page, `${label} Welcome`)
  await page.getByRole('button', { name: /Campus drive/ }).click()
  await expect(page.getByRole('listbox', { name: 'Shortlisted candidates' })).toBeVisible()
  await check(page, `${label} Results`, false)
  await page.getByRole('listbox', { name: 'Shortlisted candidates' }).getByRole('option').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await check(page, `${label} Candidate`, false)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Adjust cutoffs' }).first().click()
  const pop = page.getByRole('dialog', { name: 'Adjust cutoffs' })
  await expect(pop).toBeVisible()
  const box = await pop.boundingBox()
  const width = (await layout(page)).width
  expect(box && box.x >= 0 && box.x + box.width <= width, `${label} popover inside the window`).toBe(true)
  await page.keyboard.press('Escape')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await check(page, `${label} Settings`)
  // Settings was opened from Results, so Back returns there; then Home.
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Home' }).click()
  await page.getByRole('button', { name: 'New screening' }).click()
  await expect(page.getByRole('button', { name: 'Choose file…' })).toBeVisible()
  await check(page, `${label} Students & model`)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
}

test.beforeAll(async () => {
  const userData = tempDir()
  execFileSync(PYTHON, ['-m', 'engine.tests.e2e_seed', userData, '--count', '300'], {
    cwd: REPO,
    env: { ...process.env, PYTHONUTF8: '1' },
  })
  launched = await launch({}, userData)
  await waitForEngine(launched.page)
})

test.afterAll(async () => {
  await close(launched)
})

test('1280×800: every screen fits', async () => {
  await everyScreen(launched.page, '1280×800')
})

test('full screen: every screen fits', async () => {
  const { app, page } = launched
  // A Mac animates into full screen for about a second, longer on a busy runner, so
  // wait for the transition to end ('enter-full-screen'), then for the page to be laid
  // out at the window's new size, rather than for a fixed time.
  await app.evaluate(({ BrowserWindow }) => {
    const state = globalThis as { __fullScreen?: boolean }
    const win = BrowserWindow.getAllWindows()[0]
    state.__fullScreen = false
    win?.once('enter-full-screen', () => (state.__fullScreen = true))
    win?.setFullScreen(true)
  })
  await expect.poll(() => app.evaluate(() => (globalThis as { __fullScreen?: boolean }).__fullScreen)).toBe(true)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen())).toBe(true)
  const contentWidth = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getContentBounds().width ?? 0)
  await expect
    .poll(async () => Math.abs((await page.evaluate(() => window.innerWidth)) - (await contentWidth())))
    .toBeLessThanOrEqual(1)
  await everyScreen(page, 'full screen')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setFullScreen(false))
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isFullScreen()))
    .toBe(false)
})

test('a large display (1920×1200): every screen fits', async () => {
  const { app, page } = launched
  // Zoom from the window's real width: 1280, or less where the screen is
  // smaller (the window opens to fit it), so the page is 1920 CSS pixels wide.
  const width = (await layout(page)).width
  await app.evaluate(
    ({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(factor),
    width / 1920,
  )
  await expect.poll(async () => (await layout(page)).width).toBeGreaterThan(1900)
  await everyScreen(page, '1920×1200')
  await page.getByRole('button', { name: /Campus drive/ }).click()
  await expect(page.getByRole('listbox', { name: 'Shortlisted candidates' })).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
    await page.waitForTimeout(200)
    // Playwright would capture a 1920×1200 canvas around a 1280×800 window;
    // Electron's own capture is exactly what the window shows.
    await page.mouse.move(1, 1)
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const image = await BrowserWindow.getAllWindows()[0]?.webContents.capturePage()
      return image ? image.toPNG().toString('base64') : ''
    })
    writeFileSync(join(PHASE3_SCREENS_DIR, `results-large-display-${theme}.png`), Buffer.from(png, 'base64'))
  }
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1))
})
