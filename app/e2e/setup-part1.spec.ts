/**
 * Step 2.4: Welcome, then Upload + Model, against the stub Drive and Ollama.
 * Screenshots of each screen in both themes. Fictional data only.
 */

import { expect, test } from '@playwright/test'
import { type Launched, close, waitForWelcome } from './helpers'
import { capture, setTheme } from './screens'
import { type Stubs, launchWithStubs, nextOpenDialogReturns, startStubs } from './stubs'

let stubs: Stubs
let launched: Launched

test.beforeAll(async () => {
  stubs = await startStubs()
  launched = await launchWithStubs(stubs)
  await waitForWelcome(launched.page)
})

test.afterAll(async () => {
  await close(launched)
  stubs.stop()
})

test('Welcome: greeting, system status, new screening', async () => {
  const { page } = launched
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Good (morning|afternoon|evening)/)
  await expect(page.getByText('Ollama is running')).toBeVisible()
  await expect(page.getByText('2 models installed')).toBeVisible()
  await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'welcome', theme)
  }
})

test('Upload + Model: a file with a problem cannot continue', async () => {
  const { app, page } = launched
  await page.getByRole('button', { name: 'New screening' }).click()
  await expect(page.getByRole('heading', { name: 'Students and model' })).toBeVisible()
  await expect(page.getByLabel('Screening name')).toHaveValue(/^Screening /)

  // The "Input fields" box lists every column the engine reads, required ones first.
  const fields = page.getByRole('list', { name: 'Input fields' })
  await expect(fields.getByRole('listitem')).toHaveCount(10)
  await expect(fields.getByRole('listitem').nth(0)).toContainText('RA numberRequired')
  await expect(fields.getByRole('listitem').nth(1)).toContainText('Résumé linkRequired')
  await expect(fields.getByRole('listitem').nth(2)).toContainText('NameOptional')
  await expect(page.getByText('File types: .csv, .xlsx. Save an old .xls file as .xlsx first.')).toBeVisible()
  await expect(page.getByText(/Column order doesn’t matter/)).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'upload-empty', theme)
  }

  await nextOpenDialogReturns(app, stubs.files.no_links)
  await page.getByRole('button', { name: 'Choose file…' }).click()
  await expect(page.getByText("This file can't be used yet")).toBeVisible()
  await expect(page.getByText(/No column for Résumé link/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
})

test('Upload + Model: the pre-flight report and a model that passes its pre-check', async () => {
  const { app, page } = launched
  await page.getByRole('button', { name: 'Replace file' }).click()
  await nextOpenDialogReturns(app, stubs.files.xlsx)
  await page.getByRole('button', { name: 'Choose file…' }).click()
  const summary = page.getByRole('group', { name: 'File summary' })
  await expect(summary).toContainText('25')
  await expect(summary).toContainText('ready to screen')
  await expect(page.getByText('Everything looks good.')).toBeVisible()

  const models = page.getByRole('radiogroup', { name: 'Installed models' })
  await expect(models.getByRole('radio')).toHaveCount(2)
  await models.getByRole('radio', { name: /qwen3:8b/ }).click()
  await expect(models.getByRole('radio', { name: /qwen3:8b/ })).toHaveAttribute('aria-checked', 'true')
  await expect(models.getByRole('radio', { name: /qwen3:8b.*Ready/ })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'upload-model', theme)
  }
})

test('Get another model: suggestions, progress, and it becomes ready', async () => {
  const { page } = launched
  await page.getByRole('button', { name: 'Get another model' }).click()
  const sheet = page.getByRole('dialog', { name: 'Get another model' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'gemma3:4b' }).click()
  await expect(sheet.getByLabel('Model name')).toHaveValue('gemma3:4b')
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'model-pull', theme)
  }
  await sheet.getByRole('button', { name: 'Download' }).click()
  await expect(sheet).toBeHidden({ timeout: 30_000 })
  const models = page.getByRole('radiogroup', { name: 'Installed models' })
  await expect(models.getByRole('radio', { name: /gemma3:4b/ })).toHaveAttribute('aria-checked', 'true')
  await expect(models.getByRole('radio', { name: /gemma3:4b.*Ready/ })).toBeVisible({ timeout: 60_000 })
})

test('an unknown model says so', async () => {
  const { page } = launched
  await page.getByRole('button', { name: 'Get another model' }).click()
  const sheet = page.getByRole('dialog', { name: 'Get another model' })
  await sheet.getByLabel('Model name').fill('no-such-model')
  await sheet.getByRole('button', { name: 'Download' }).click()
  await expect(
    sheet.getByText('There is no model called "no-such-model". Check the name at ollama.com/library.'),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
})

test('Continue saves the model and moves to Criteria; Esc goes back', async () => {
  const { page } = launched
  await page
    .getByRole('radiogroup', { name: 'Installed models' })
    .getByRole('radio', { name: /qwen3:8b/ })
    .click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.locator('.setup-step[aria-current="step"]')).toContainText('Criteria')
  // Criteria focuses its text box: the first Esc leaves the field, the second goes back.
  await expect(page.getByRole('textbox', { name: 'What are you looking for?' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: 'What are you looking for?' })).not.toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Students and model' })).toBeVisible()
  await expect(page.getByText('Everything looks good.')).toBeVisible()
})

test('Ollama stopped: a calm banner with Check again', async () => {
  const { page } = launched
  await stubs.ollamaOffline()
  await page.getByRole('button', { name: 'Home' }).click()
  await page
    .getByRole('button', { name: 'Check again' })
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined)
  await page.reload()
  await expect(page.getByText("Ollama isn't running")).toBeVisible({ timeout: 30_000 })
  await stubs.ollamaOnline()
  await page.getByRole('button', { name: 'Check again' }).click()
  await expect(page.getByText('Ollama is running')).toBeVisible({ timeout: 30_000 })
})
