/**
 * Step 2.2: the Electron shell. The app launches, spawns the real engine, the
 * engine becomes ready, and requests pass through the bridge; the token never
 * reaches the renderer; the CSP and navigation rules hold.
 */

import { expect, test } from '@playwright/test'
import { type Launched, close, launch, waitForEngine } from './helpers'

let launched: Launched

test.beforeAll(async () => {
  launched = await launch()
  await waitForEngine(launched.page)
})

test.afterAll(async () => {
  await close(launched)
})

test('the engine is ready and /health passes through the bridge', async () => {
  const { page } = launched
  const health = await page.evaluate(() => window.atlas.api.request('GET', '/health'))
  expect(health).toMatchObject({ ok: true, status: 200, data: { status: 'ok' } })
  const state = await page.evaluate(() => window.atlas.app.engineState())
  expect(state.state).toBe('ready')
  const runs = await page.evaluate(() => window.atlas.api.request('GET', '/runs'))
  expect(runs).toMatchObject({ ok: true, data: [] })
})

test('routes reserved for main are refused', async () => {
  const outcome = await launched.page.evaluate(() =>
    window.atlas.api.request('POST', '/shutdown').then(
      () => 'allowed',
      (error: unknown) => String(error),
    ),
  )
  expect(outcome).toContain('Not an allowed route')
})

test('the token never reaches the renderer', async () => {
  const { app, page } = launched
  const token = await app.evaluate(() =>
    (globalThis as unknown as { __atlasTest: { token(): string } }).__atlasTest.token(),
  )
  expect(token.length).toBeGreaterThanOrEqual(43)

  const seen = await page.evaluate(async () => {
    const strings: string[] = []
    const visit = (value: unknown, depth: number): void => {
      if (depth > 4 || value === null || value === undefined) return
      if (typeof value === 'string') strings.push(value)
      else if (typeof value === 'function') strings.push(String(value))
      else if (typeof value === 'object') {
        for (const key of Object.keys(value)) {
          strings.push(key)
          visit((value as Record<string, unknown>)[key], depth + 1)
        }
      }
    }
    visit(window.atlas, 0)
    const responses = await Promise.all([
      window.atlas.api.request('GET', '/system'),
      window.atlas.api.request('GET', '/settings'),
      window.atlas.app.info(),
      window.atlas.app.engineState(),
    ])
    return {
      keys: Object.keys(window.atlas).sort(),
      text: [
        ...strings,
        JSON.stringify(responses),
        document.documentElement.outerHTML,
        JSON.stringify({ ...localStorage }),
        JSON.stringify({ ...sessionStorage }),
        document.cookie,
      ].join('\n'),
    }
  })
  expect(seen.keys).toEqual(['api', 'app', 'events', 'files', 'menus', 'notifications'])
  expect(seen.text).not.toContain(token)
  expect(seen.text.toLowerCase()).not.toContain('bearer')
})

test('the CSP blocks remote content, inline scripts and eval', async () => {
  const { page } = launched
  const fetched = await page.evaluate(() =>
    fetch('https://example.com/').then(
      () => 'loaded',
      () => 'blocked',
    ),
  )
  expect(fetched).toBe('blocked')

  const violations = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const seen: string[] = []
        document.addEventListener('securitypolicyviolation', (event) => seen.push(event.effectiveDirective))
        const remote = document.createElement('script')
        remote.src = 'https://example.com/evil.js'
        document.head.appendChild(remote)
        const inline = document.createElement('script')
        inline.textContent = 'window.__ran = true'
        document.head.appendChild(inline)
        setTimeout(() => resolve(seen), 1500)
      }),
  )
  expect(violations).toContain('script-src-elem')
  expect(violations.length).toBeGreaterThanOrEqual(2)
  expect(await page.evaluate(() => (window as unknown as { __ran?: boolean }).__ran)).toBeUndefined()

  // page.evaluate itself runs with DevTools privileges, which Chromium exempts
  // from the CSP; a normal task scheduled by the page is not exempt.
  const evaluated = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        setTimeout(() => {
          try {
            // eslint-disable-next-line no-eval
            resolve(String(eval('1 + 1')))
          } catch {
            resolve('blocked')
          }
        }, 0)
      }),
  )
  expect(evaluated).toBe('blocked')
})

test('no Node in the renderer and no new windows', async () => {
  const { app, page } = launched
  const globals = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    opened: window.open('https://example.com/') === null,
  }))
  expect(globals).toEqual({ require: 'undefined', process: 'undefined', opened: true })
  expect(app.windows()).toHaveLength(1)
})

test('the window has the design size and the security preferences', async () => {
  const { app } = launched
  const facts = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return null
    // 1280×800, or the primary display's work area if that is smaller (a CI Mac's
    // screen is), but never below the 1100×720 minimum.
    const area = screen.getPrimaryDisplay().workArea
    const expected = [Math.max(1100, Math.min(1280, area.width)), Math.max(720, Math.min(800, area.height))]
    const hooks = (globalThis as unknown as { __atlasTest: { webPreferences: Record<string, unknown> } }).__atlasTest
    const prefs = hooks.webPreferences
    return {
      size: win.getSize(),
      expected,
      min: win.getMinimumSize(),
      contextIsolation: prefs.contextIsolation,
      sandbox: prefs.sandbox,
      nodeIntegration: prefs.nodeIntegration,
      webSecurity: prefs.webSecurity,
    }
  })
  expect(facts?.size).toEqual(facts?.expected)
  expect(facts).toMatchObject({
    min: [1100, 720],
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
  })
})

// Last: after a navigation Chromium cancels, Playwright's page-world context is
// stale (page.evaluate sees an empty document), so the checks below ask the
// main process and use locator counts rather than page.evaluate.
test('navigation away from the app is blocked', async () => {
  const { app, page } = launched
  const appUrl = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getURL())
  await page.evaluate(() => {
    window.location.href = 'https://example.com/'
  })
  await page.waitForTimeout(1500)
  const now = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.getURL())
  expect(now).toBe(appUrl)
  expect(now?.startsWith('file://')).toBe(true)
  expect(await page.locator('[data-engine="ready"]').count()).toBe(1)
  expect(await page.locator('[data-engine="ready"]').isVisible()).toBe(true)
  expect(app.windows()).toHaveLength(1)
})
