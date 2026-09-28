/**
 * The screen a recruiter sees when the engine can't start (here: the Python
 * it needs is missing), with light and dark screenshots.
 */

import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { close, launch } from './helpers'
import { capture, setTheme } from './screens'

test('the engine cannot start: a plain explanation and Restart Atlas', async () => {
  const launched = await launch({ ATLAS_PYTHON: join(__dirname, 'missing', 'no-such-python.exe') })
  try {
    const { page } = launched
    const alert = page.getByRole('alert')
    await expect(alert.getByRole('heading', { name: "Atlas couldn't start" })).toBeVisible({ timeout: 30_000 })
    await expect(alert).toContainText("Atlas's engine wasn't found. Reinstall Atlas.")
    await expect(alert.getByRole('button', { name: 'Restart Atlas' })).toBeVisible()
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme)
      await capture(page, 'engine-failed', theme)
    }
  } finally {
    await close(launched)
  }
})
