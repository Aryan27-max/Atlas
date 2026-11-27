/**
 * Step 2.5: Criteria → Cutoffs → Review, then Start. Against the stubs,
 * fictional data only. Screenshots of each screen in both themes.
 */

import { expect, test } from '@playwright/test'
import { type Launched, close, waitForWelcome } from './helpers'
import { capture, setTheme } from './screens'
import { type Stubs, launchWithStubs, nextOpenDialogReturns, startStubs } from './stubs'

let stubs: Stubs
let launched: Launched

test.beforeAll(async () => {
  stubs = await startStubs(1.0) // slow model: the run is still going when the test ends
  launched = await launchWithStubs(stubs)
  const { app, page } = launched
  await waitForWelcome(page)
  await page.getByRole('button', { name: 'New screening' }).click()
  await nextOpenDialogReturns(app, stubs.files.xlsx)
  await page.getByRole('button', { name: 'Choose file…' }).click()
  await expect(page.getByText('Everything looks good.')).toBeVisible()
  await page
    .getByRole('radiogroup', { name: 'Installed models' })
    .getByRole('radio', { name: /qwen3:8b/ })
    .click()
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Continue' }).click()
})

test.afterAll(async () => {
  await close(launched)
  stubs.stop()
})

test('Criteria: templates fill the box, short text gets a gentle hint', async () => {
  const { page } = launched
  await expect(page.getByRole('heading', { name: 'What are you looking for?' })).toBeVisible()
  const box = page.getByRole('textbox', { name: 'What are you looking for?' })
  await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  await box.fill('Python interns')
  await expect(page.getByText('A little more detail helps')).toBeVisible()
  await page.getByRole('button', { name: 'SWE intern' }).click()
  await expect(box).toHaveValue(/^Software engineering interns/)
  await expect(page.getByRole('button', { name: 'SWE intern' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/ \/ 8,000 characters/)).toBeVisible()
  await expect(page.getByText('Criteria are locked once screening starts.')).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'criteria', theme)
  }
  await page.getByRole('button', { name: 'Continue' }).click()
})

test('Cutoffs: the score band, minimum and filters with live counts', async () => {
  const { page } = launched
  await expect(page.getByRole('heading', { name: 'Cutoffs' })).toBeVisible()
  const shortlist = page.getByRole('slider', { name: 'Shortlist score' })
  const bandStart = page.getByRole('slider', { name: 'Cutoff band starts at' })
  await expect(shortlist).toHaveAttribute('aria-valuenow', '60')
  await expect(bandStart).toHaveAttribute('aria-valuenow', '50')

  // Keyboard: the handles move and never cross.
  await shortlist.focus()
  await page.keyboard.press('ArrowRight')
  await expect(shortlist).toHaveAttribute('aria-valuenow', '61')
  await page.keyboard.press('ArrowLeft')
  await bandStart.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp')
  await expect(bandStart).toHaveAttribute('aria-valuenow', '60')
  await page.keyboard.press('PageDown')
  await expect(bandStart).toHaveAttribute('aria-valuenow', '50')

  // The stepper moves the same value.
  await page.getByRole('button', { name: 'Increase Shortlist score' }).click()
  await expect(shortlist).toHaveAttribute('aria-valuenow', '61')
  await page.getByRole('button', { name: 'Decrease Shortlist score' }).click()

  // Minimum shortlisted.
  await page.getByRole('switch', { name: 'Always shortlist at least' }).click()
  const minimum = page.getByRole('spinbutton', { name: 'Minimum shortlisted' })
  await minimum.fill('15')
  await minimum.press('Enter')
  await expect(minimum).toHaveValue('15')

  // Filters: live counts from the engine.
  await expect(page.getByText('25 of 25 students will be screened.')).toBeVisible()
  await page.getByRole('switch', { name: 'Minimum CGPA' }).click()
  await expect(page.getByText(/^Removes \d+ students?\. Students without a CGPA are kept\.$/)).toBeVisible()
  await expect(page.getByText(/^\d+ of 25 students will be screened\.$/)).toBeVisible()
  await page.getByRole('switch', { name: 'Minimum CGPA' }).click()
  // Departments: typed, checked against the student list, then added.
  const departments = page.getByRole('group', { name: 'Departments' })
  await expect(departments).toHaveCount(0)
  const addField = page.getByRole('textbox', { name: 'Add a department' })
  await addField.fill('Astrology')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(
    page.getByText('\u201cAstrology\u201d isn\u2019t a department in the student list. Check the spelling.'),
  ).toBeVisible()
  await expect(departments).toHaveCount(0)
  await addField.fill('cse')
  await addField.press('Enter')
  await expect(departments.getByRole('button')).toHaveCount(1)
  await expect(departments.getByRole('button', { name: /^CSE/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(addField).toHaveValue('')
  await addField.fill('C.S.E.')
  await addField.press('Enter')
  await expect(page.getByText('CSE is already added.')).toBeVisible()
  await expect(departments.getByRole('button')).toHaveCount(1)
  await expect(page.getByText(/^Removes \d+ students? from other departments\.$/)).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'cutoffs', theme)
  }
  await departments.getByRole('button', { name: /^CSE/ }).click()
  await expect(departments).toHaveCount(0)
  await expect(page.getByText('None selected: every department is included.')).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
})

test('Review: every choice, the estimate, and Start screening', async () => {
  const { page } = launched
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  await expect(page.getByText('students.xlsx · 25 students ready')).toBeVisible()
  await expect(page.getByText('qwen3:8b')).toBeVisible()
  await expect(page.getByText('60 and above')).toBeVisible()
  await expect(page.getByText('50 to 59')).toBeVisible()
  await expect(page.getByText('15 candidates')).toBeVisible()
  await expect(page.getByText(/^About \d+ seconds? per résumé on this computer$/)).toBeVisible()
  await expect(
    page.getByText('Rough estimate based on this computer. After the first 5 résumés, Atlas shows a measured time.'),
  ).toBeVisible()
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme)
    await capture(page, 'review', theme)
  }

  // Edit goes back to the step; Esc returns.
  await page.getByRole('region', { name: 'Criteria' }).getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('heading', { name: 'What are you looking for?' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()

  await page.getByRole('button', { name: 'Start screening' }).click()
  await expect(page.getByRole('heading', { name: 'Review' })).toBeHidden({ timeout: 30_000 })
  const runs = await page.evaluate(() => window.atlas.api.request('GET', '/runs'))
  expect(runs).toMatchObject({ ok: true })
  const [run] = (runs as { data: Array<{ status: string; total: number; min_shortlist: number }> }).data
  expect(run).toMatchObject({ status: 'running', total: 25, min_shortlist: 15 })
})
