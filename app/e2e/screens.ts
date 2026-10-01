import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { APP_DIR } from './helpers'

export const SCREENS_DIR = join(APP_DIR, '..', 'docs', 'summaries', 'phase2', 'screens')
/** Screens added or changed in Phase 3. */
export const PHASE3_SCREENS_DIR = join(APP_DIR, '..', 'docs', 'summaries', 'phase3', 'screens')

export type ThemeName = 'light' | 'dark'

/** Switch the app's theme the way Settings does (native chrome + the page). */
export async function setTheme(page: Page, theme: ThemeName): Promise<void> {
  await page.evaluate(async (t) => {
    await window.atlas.app.setTheme(t)
    document.documentElement.dataset.theme = t
  }, theme)
  await page.waitForTimeout(300) // let transitions settle
}

/**
 * Save `<name>-<theme>.png` at the window's 1280×800. With `full`, the
 * scrolling container is let out first so the whole screen is captured.
 */
export async function capture(
  page: Page,
  name: string,
  theme: ThemeName,
  full?: string,
  dir: string = SCREENS_DIR,
): Promise<void> {
  mkdirSync(dir, { recursive: true })
  // Screens are captured from the top, however far a test scrolled.
  await page.evaluate(() => document.querySelectorAll('.screen-scroll').forEach((el) => el.scrollTo(0, 0)))
  // No hover highlight left over from the last click.
  await page.mouse.move(1, 799)
  await page.waitForTimeout(100)
  if (full) {
    await page.addStyleTag({
      content: `html, body, #root { height: auto !important; overflow: visible !important; } ${full} { height: auto !important; overflow: visible !important; }`,
    })
  }
  await page.screenshot({
    path: join(dir, `${name}-${theme}.png`),
    fullPage: Boolean(full),
    animations: 'disabled',
  })
}
