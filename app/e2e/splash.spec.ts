/**
 * The start-up screen ("hello" on off-white) and the logo, with screenshots
 * for docs/summaries/branding.md.
 *
 * A slow engine is made on demand: `engine.tests.gated_engine` holds the
 * engine at "starting" until the test creates its gate file, so nothing here
 * depends on how fast this computer starts Python. The real 1.2 s minimum is
 * used throughout (no test-only timings).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ElectronApplication, type Locator, type Page, expect, test } from '@playwright/test'
import { close, launch, splashGone, waitForWelcome } from './helpers'
import { BRANDING_SCREENS_DIR } from './screens'
import { launchWithStubs, startStubs } from './stubs'

const OFF_WHITE = 'rgb(245, 245, 247)'

/** An engine that starts only when `open()` is called. */
function gatedEngine(): { env: Record<string, string>; open: () => void; remove: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-gate-'))
  const gate = join(dir, 'go')
  return {
    env: { ATLAS_ENGINE_MODULE: 'engine.tests.gated_engine', ATLAS_ENGINE_GATE: gate },
    open: () => writeFileSync(gate, ''),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  }
}

function splashOf(page: Page): Locator {
  return page.getByRole('status', { name: 'Atlas is starting' })
}

async function windowBackground(app: ElectronApplication): Promise<string | undefined> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getBackgroundColor().toLowerCase())
}

async function engineState(app: ElectronApplication): Promise<string> {
  return app.evaluate(
    () =>
      (globalThis as unknown as { __atlasTest: { engine: { state: { state: string } } } }).__atlasTest.engine.state
        .state,
  )
}

/** "hello" has finished arriving: drawn in, fully opaque, at its full size. */
async function arrived(hello: Locator): Promise<void> {
  await expect.poll(() => hello.evaluate((img) => img.closest('.splash')?.getAttribute('data-drawn'))).toBe('true')
  await expect.poll(() => hello.evaluate((img) => getComputedStyle(img).opacity)).toBe('1')
  await expect
    .poll(() => hello.evaluate((img) => getComputedStyle(img).transform))
    .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
}

interface Handover {
  /** performance.now() when it showed, and when it started to leave. */
  shown: number
  left: number
  engineReady: boolean
}

/** The moment the start-up screen starts to leave, as the page saw it (checked every frame; the fade lasts 300 ms). */
async function handover(page: Page): Promise<Handover> {
  const record = await page.waitForFunction(
    () => {
      const splash = document.querySelector<HTMLElement>('.splash[data-phase="leaving"]')
      if (!splash) return null
      return {
        shown: Number(splash.dataset.shownAt),
        left: Number(splash.dataset.leftAt),
        engineReady: document.querySelector('[data-engine="ready"]') !== null,
      }
    },
    null,
    { timeout: 120_000 },
  )
  return (await record.jsonValue()) as Handover
}

async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync(BRANDING_SCREENS_DIR, { recursive: true })
  await page.mouse.move(1, 799)
  await page.screenshot({ path: join(BRANDING_SCREENS_DIR, `${name}.png`), animations: 'disabled' })
}

test('it opens off-white edge to edge, with the window behind it, and "hello" centred', async () => {
  const engine = gatedEngine()
  const launched = await launch(engine.env)
  try {
    const { app, page } = launched
    const splash = splashOf(page)
    await expect(splash).toBeVisible()
    const hello = splash.getByRole('img', { name: 'hello' })
    await expect
      .poll(() => hello.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
      .toBeGreaterThan(0)
    // The lettering is drawn in: caught while drawing, it differs from the finished drawing.
    const drawing = (): Promise<string | null | undefined> => splash.getAttribute('data-drawn')
    const before = await drawing()
    const midway = await hello.screenshot()
    const caughtMidway = before === 'false' && (await drawing()) === 'false'

    // Off-white from edge to edge: the splash covers the window, the page behind it is the
    // same colour, and so is the window's own background (no other colour before the first frame).
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
    expect(await splash.boundingBox()).toEqual({ x: 0, y: 0, ...viewport })
    expect(await splash.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(OFF_WHITE)
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(OFF_WHITE)
    expect(await windowBackground(app)).toBe('#f5f5f7')

    // "hello": centred, about 40% of the window's width (at most 520 px), clear of every edge.
    await arrived(hello)
    if (caughtMidway) expect((await hello.screenshot()).equals(midway), 'drawn in, not shown all at once').toBe(false)
    else
      test
        .info()
        .annotations.push({ type: 'hello', description: 'this machine was too slow to catch the drawing midway' })
    const art = (await hello.boundingBox()) as { x: number; y: number; width: number; height: number }
    expect(Math.abs(art.width - Math.min(0.4 * viewport.width, 520))).toBeLessThan(1)
    expect(Math.abs(art.x + art.width / 2 - viewport.width / 2)).toBeLessThan(1)
    expect(Math.abs(art.y + art.height / 2 - viewport.height / 2)).toBeLessThan(1)
    expect(art.x).toBeGreaterThan(0)
    expect(art.y).toBeGreaterThan(0)
    expect(art.x + art.width).toBeLessThan(viewport.width)
    expect(art.y + art.height).toBeLessThan(viewport.height)

    // It takes no focus, Esc does nothing, and the app under it is out of reach.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
    await expect(splash).toHaveAttribute('data-phase', 'showing')
    await expect(page.locator('.app-content')).toHaveAttribute('inert', '')
    expect(await engineState(app)).toBe('starting')

    await screenshot(page, 'splash-light')
  } finally {
    engine.open()
    await close(launched)
    engine.remove()
  }
})

test('dark mode: still off-white, and the window takes the dark background after it', async () => {
  const engine = gatedEngine()
  // The page is dark from its first frame, as on a computer in dark mode.
  const launched = await launch(engine.env, undefined, { colorScheme: 'dark' })
  try {
    const { app, page } = launched
    const splash = splashOf(page)
    await expect(splash).toBeVisible()
    expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
    expect(
      await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-window').trim()),
    ).toBe('#161618')
    // Main goes dark too (as Settings → Dark does) while the splash is up: the window keeps the splash's colour.
    await page.evaluate(() => window.atlas.app.setTheme('dark'))
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors)).toBe(true)

    expect(await splash.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(OFF_WHITE)
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(OFF_WHITE)
    expect(await windowBackground(app)).toBe('#f5f5f7')
    const hello = splash.getByRole('img', { name: 'hello' })
    await arrived(hello)
    await screenshot(page, 'splash-dark')

    // After it, the window and the page follow the theme again.
    engine.open()
    await waitForWelcome(page)
    // Welcome applies the saved appearance ("system") first; then dark again.
    await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('system')
    await page.evaluate(() => window.atlas.app.setTheme('dark'))
    await expect.poll(() => windowBackground(app)).toBe('#1c1c1e')
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(22, 22, 24)')
  } finally {
    engine.open()
    await close(launched)
    engine.remove()
  }
})

test('with the real 3.8 s minimum (the drawing, then a moment) it hands over to Welcome once the engine is ready, once per launch', async () => {
  const launched = await launch()
  try {
    const { page } = launched
    const left = await handover(page)
    expect(left.left - left.shown).toBeGreaterThanOrEqual(3800)
    expect(left.engineReady).toBe(true)
    await splashGone(page)
    await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
    await expect(page.locator('.app-content')).not.toHaveAttribute('inert', '')
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-splash'))).toBe(false)

    // Once per launch: a reload of the page doesn't show it again.
    await page.reload()
    await expect(page.locator('[data-engine="ready"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.splash')).toHaveCount(0)
  } finally {
    await close(launched)
  }
})

test('a slow engine keeps it up, saying "Still starting…", until the engine is ready', async () => {
  const engine = gatedEngine()
  const launched = await launch(engine.env)
  try {
    const { app, page } = launched
    const splash = splashOf(page)
    await expect(splash).toContainText('Still starting…', { timeout: 30_000 })
    // Long past the minimum: still up, because the engine is still starting.
    await expect(splash).toHaveAttribute('data-phase', 'showing')
    expect(await engineState(app)).toBe('starting')
    await expect(page.locator('.app-content')).toHaveAttribute('inert', '')

    engine.open()
    const left = await handover(page)
    expect(left.left - left.shown).toBeGreaterThanOrEqual(6000)
    expect(left.engineReady).toBe(true)
    await waitForWelcome(page)
    await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
  } finally {
    engine.open()
    await close(launched)
    engine.remove()
  }
})

test('when the engine fails it hands over to "Atlas couldn\'t start"', async () => {
  const launched = await launch({ ATLAS_PYTHON: join(__dirname, 'missing', 'no-such-python.exe') })
  try {
    const { page } = launched
    const left = await handover(page)
    expect(left.left - left.shown).toBeGreaterThanOrEqual(3800)
    expect(left.engineReady).toBe(false)
    await splashGone(page)
    await expect(page.getByRole('alert').getByRole('heading', { name: "Atlas couldn't start" })).toBeVisible()
  } finally {
    await close(launched)
  }
})

test('reduced motion: "hello" only fades in, never transformed', async () => {
  const engine = gatedEngine()
  const launched = await launch(engine.env)
  try {
    const { page } = launched
    await expect(splashOf(page)).toBeVisible()
    // Playwright pins the page's motion preference (it ignores --force-prefers-reduced-motion), and
    // the app reads it once, as it starts: so ask for reduced motion and start the page again. The
    // engine is still held, so this launch's splash never handed over and shows again.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await expect(splashOf(page)).toBeVisible()
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    // Every frame from now until it is fully shown.
    const transforms = await page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const seen = new Set<string>()
          const frame = (): void => {
            const hello = document.querySelector<HTMLImageElement>('.splash-hello')
            if (hello) {
              const style = getComputedStyle(hello)
              seen.add(style.transform)
              if (style.opacity === '1') return resolve([...seen])
            }
            requestAnimationFrame(frame)
          }
          frame()
        }),
    )
    expect(transforms).toEqual(['none'])
    // The finished lettering, not the drawing, and the shorter minimum.
    expect(await splashOf(page).getByRole('img', { name: 'hello' }).getAttribute('src')).not.toMatch(
      /hello-drawn|%3canimate/,
    )
  } finally {
    engine.open()
    await close(launched)
    engine.remove()
  }
})

test('the logo on Welcome and in Settings → About (screenshots)', async () => {
  const stubs = await startStubs()
  const launched = await launchWithStubs(stubs)
  try {
    const { page } = launched
    await waitForWelcome(page)
    await expect(page.getByText('Ollama is running', { exact: false })).toBeVisible()
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate(async (t) => {
        await window.atlas.app.setTheme(t)
        document.documentElement.dataset.theme = t
      }, theme)
      const background = theme === 'dark' ? 'rgb(22, 22, 24)' : 'rgb(242, 242, 247)'
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(background)

      const logo = page.getByRole('img', { name: 'Atlas' })
      await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
      await screenshot(page, `welcome-${theme}`)

      await page.getByRole('button', { name: 'Settings' }).click()
      const about = page.getByRole('region', { name: 'About Atlas' })
      await about.scrollIntoViewIfNeeded()
      await expect(about).toContainText('0.3.0 · Running')
      await expect(about).toContainText('Running · 0.0.0-stub')
      await expect(about.locator('dd').nth(3)).not.toHaveText('–')
      await expect
        .poll(() => about.getByRole('img', { name: 'Atlas' }).evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0)
      mkdirSync(BRANDING_SCREENS_DIR, { recursive: true })
      await about.screenshot({ path: join(BRANDING_SCREENS_DIR, `about-${theme}.png`), animations: 'disabled' })
      await page.getByRole('button', { name: 'Home' }).click()
      await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
    }
  } finally {
    await close(launched)
    stubs.stop()
  }
})
