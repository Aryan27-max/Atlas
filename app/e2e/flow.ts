/** Drive the setup flow from Welcome to a started screening (fictional fixture file). */

import { type Page, expect } from '@playwright/test'
import type { Launched } from './helpers'
import { type Stubs, nextOpenDialogReturns } from './stubs'

export interface SetupOptions {
  minimum?: number
  file?: string
  model?: RegExp
}

export async function startScreening(launched: Launched, stubs: Stubs, options: SetupOptions = {}): Promise<void> {
  const { app, page } = launched
  await page.getByRole('button', { name: 'New screening' }).click()
  await nextOpenDialogReturns(app, options.file ?? stubs.files.xlsx)
  await page.getByRole('button', { name: 'Choose file…' }).click()
  await expect(page.getByRole('group', { name: 'File summary' })).toBeVisible()
  await page
    .getByRole('radiogroup', { name: 'Installed models' })
    .getByRole('radio', { name: options.model ?? /qwen3:8b/ })
    .click()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'SWE intern' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  if (options.minimum) {
    await page.getByRole('switch', { name: 'Always shortlist at least' }).click()
    const minimum = page.getByRole('spinbutton', { name: 'Minimum shortlisted' })
    await minimum.fill(String(options.minimum))
    await minimum.press('Enter')
  }
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Start screening' }).click()
  await expect(page.getByRole('region', { name: 'Screening progress' })).toBeVisible({ timeout: 30_000 })
}

export async function waitForStatus(page: Page, status: string, timeout = 120_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const runs = (await page.evaluate(() => window.atlas.api.request('GET', '/runs'))) as {
          ok: boolean
          data?: Array<{ status: string }>
        }
        return runs.ok ? runs.data?.[0]?.status : undefined
      },
      { timeout, intervals: [250, 500, 1000] },
    )
    .toBe(status)
}
