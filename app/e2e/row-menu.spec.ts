/**
 * The Results row menu's "Copy RA number" when the clipboard refuses the text
 * (another app holding it, a locked session): the recruiter is told, plainly,
 * instead of the menu claiming it copied.
 */

import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { type Launched, close, launch, waitForWelcome } from './helpers'
import { PYTHON, REPO, copiedText, nextMenuPicks, tempDir } from './stubs'

test.describe.configure({ mode: 'serial' })

let launched: Launched

test.beforeAll(async () => {
  const userData = tempDir()
  execFileSync(PYTHON, ['-m', 'engine.tests.e2e_seed', userData, '--count', '20'], {
    cwd: REPO,
    env: { ...process.env, PYTHONUTF8: '1' },
  })
  launched = await launch({}, userData)
  await waitForWelcome(launched.page)
  await launched.page.getByRole('button', { name: /Campus drive/ }).click()
  await expect(launched.page.getByRole('listbox', { name: 'Shortlisted candidates' })).toBeVisible()
})

test.afterAll(async () => {
  await close(launched)
})

test('a clipboard that refuses the text gets a plain message, not a silent "copied"', async () => {
  const { app, page } = launched
  const row = page.getByRole('listbox', { name: 'Shortlisted candidates' }).getByRole('option').first()

  // It works: the RA number is on the clipboard and nothing is said.
  await app.evaluate(({ clipboard }) => clipboard.writeText(''))
  await nextMenuPicks(app, [['Copy RA number']])
  await row.click({ button: 'right' })
  await expect.poll(() => copiedText(app)).toMatch(/^RA\d+$/)
  await expect(page.getByText(/Couldn't copy/)).toHaveCount(0)

  // It fails: main's clipboard rejects, after a while.
  await app.evaluate(({ clipboard }) => {
    const state = globalThis as { __realWriteText?: typeof clipboard.writeText }
    state.__realWriteText = clipboard.writeText.bind(clipboard)
    clipboard.writeText = (() =>
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('clipboard busy')), 400),
      )) as typeof clipboard.writeText
  })
  await nextMenuPicks(app, [['Copy RA number']])
  await row.click({ button: 'right' })
  await expect(page.getByText("Couldn't copy the RA number. Try again in a moment.")).toBeVisible()
  await app.evaluate(({ clipboard }) => {
    const state = globalThis as { __realWriteText?: typeof clipboard.writeText }
    if (state.__realWriteText) clipboard.writeText = state.__realWriteText
  })
})
