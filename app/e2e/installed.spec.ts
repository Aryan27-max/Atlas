/**
 * Step 3.8: the INSTALLED app, end to end, with the real model.
 *
 * Skipped unless ATLAS_INSTALLED_EXE points at an installed Atlas
 * (…\Programs\Atlas\Atlas.exe, or Atlas.app/Contents/MacOS/Atlas) and the
 * real Ollama is running with qwen3:8b. It:
 *   1. serves five of the fictional eval résumés (engine/eval/sets/fictional/)
 *      from a web server on 127.0.0.1 and writes a student list linking to them;
 *   2. launches the installed Atlas, which uses its normal data folder, and
 *      runs a screening through the UI with qwen3:8b and the eval set's criteria;
 *   3. checks that all five are scored, then exports every candidate to CSV
 *      and checks the file.
 * Fictional people only, and nothing leaves the machine. Uninstalling and
 * checking that the data folder survives are done outside, by the person
 * running this (see docs/summaries/phase3/step-3.8-verification.md).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { type Server, createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { waitForStatus } from './flow'
import { REPO, nextOpenDialogReturns, nextSaveDialogReturns, tempDir } from './stubs'

const EXE = process.env.ATLAS_INSTALLED_EXE
const SET = join(REPO, 'engine', 'eval', 'sets', 'fictional')

// Five of the eight fictional students (engine/eval/fictional.py), best to worst.
const STUDENTS = [
  [
    'Anika Verma',
    'RA9900000001',
    '9.4',
    'anika.verma@example.com',
    'CSE',
    '9000022222',
    'Python, Go, PostgreSQL, Kubernetes, AWS',
    '01_exceptional_backend.pdf',
  ],
  [
    'Rohan Pillai',
    'RA9900000002',
    '8.9',
    'rohan.pillai@example.com',
    'CSE',
    '9000011111',
    'Python, Go, Django, PostgreSQL, Docker',
    '02_strong_backend.pdf',
  ],
  [
    'Karan Sethi',
    'RA9900000004',
    '8.1',
    'karan.sethi@example.com',
    'CSE',
    '9000044444',
    'Python, Flask, MySQL',
    '04_average_backend.pdf',
  ],
  [
    'Dev Kapoor',
    'RA9900000006',
    '7.6',
    'dev.kapoor@example.com',
    'IT',
    '9000066666',
    'Python, Java, SQL, Docker, AWS',
    '06_weak_backend.pdf',
  ],
  [
    'Arjun Balan',
    'RA9900000008',
    '6.9',
    'arjun.balan@example.com',
    'ECE',
    '9000088888',
    'Computer basics',
    '08_very_weak.pdf',
  ],
] as const

test.skip(!EXE, 'Set ATLAS_INSTALLED_EXE to an installed Atlas to run this.')
test.setTimeout(60 * 60_000) // a cold model on a CPU laptop: a few minutes per résumé

let server: Server

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const name = (request.url ?? '').replace(/^\//, '')
    if (!/^0\d_[a-z_]+\.pdf$/.test(name)) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/pdf' }).end(readFileSync(join(SET, name)))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
})

test.afterAll(() => {
  server?.close()
})

test('installed Atlas: a five-student screening with the real model, then export', async () => {
  const { port } = server.address() as AddressInfo
  const folder = tempDir('atlas-installed-')
  const csv = join(folder, 'fictional-students.csv')
  const header = 'Name,RA Number,CGPA,Mail ID,Department,P.No,Skills,Resume Link'
  const rows = STUDENTS.map(([name, ra, cgpa, mail, dept, phone, skills, file]) =>
    [name, ra, cgpa, mail, dept, phone, `"${skills}"`, `http://127.0.0.1:${port}/${file}`].join(','),
  )
  writeFileSync(csv, `${[header, ...rows].join('\r\n')}\r\n`, 'utf8')
  const criteria = readFileSync(join(SET, 'criteria.txt'), 'utf8').trim()

  // An editor's ELECTRON_RUN_AS_NODE would start Atlas as plain Node.
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ATLAS_OLLAMA_URL // the real, local Ollama
  const app = await electron.launch({ executablePath: EXE as string, env })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('[data-engine="ready"]')).toBeVisible({ timeout: 120_000 })
    expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true)
    await expect(page.getByText('Ollama is running', { exact: false })).toBeVisible({ timeout: 30_000 })

    // Students & model
    await page.getByRole('button', { name: 'New screening' }).click()
    await nextOpenDialogReturns(app, csv)
    await page.getByRole('button', { name: 'Choose file…' }).click()
    await expect(page.getByRole('group', { name: 'File summary' })).toContainText('5')
    await page
      .getByRole('radiogroup', { name: 'Installed models' })
      .getByRole('radio', { name: /qwen3:8b/ })
      .click()
    // The first use of a model runs its pre-check: up to 5 minutes cold.
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 6 * 60_000 })
    await page.getByRole('button', { name: 'Continue' }).click()
    // Criteria, Cutoffs (defaults), Review
    await page.getByLabel('What are you looking for?').fill(criteria)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Start screening' }).click()
    const longRun = page.getByRole('alertdialog')
    if (await longRun.isVisible().catch(() => false))
      await longRun.getByRole('button', { name: 'Start anyway' }).click()
    await expect(page.getByRole('region', { name: 'Screening progress' })).toBeVisible({ timeout: 30_000 })

    await waitForStatus(page, 'completed', 50 * 60_000)
    const runs = (await page.evaluate(() => window.atlas.api.request('GET', '/runs'))) as {
      data: Array<{ id: number; counts: Record<string, number> }>
    }
    const run = runs.data[0]
    expect(run?.counts).toMatchObject({ scored: 5 })

    // Results and export
    await page.getByRole('button', { name: 'View results' }).click()
    await expect(page.getByRole('listbox', { name: 'Shortlisted candidates' })).toBeVisible()
    const target = join(folder, 'all-candidates.csv')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Export results' })
    await sheet.getByRole('radio', { name: /All candidates/ }).click()
    await nextSaveDialogReturns(app, target)
    await sheet.getByRole('button', { name: 'Export…' }).click()
    await expect(page.getByText('Exported 5 candidates')).toBeVisible({ timeout: 30_000 })
    const exported = readFileSync(target)
    expect(exported.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true) // UTF-8 with BOM
    const lines = exported.toString('utf8').trim().split('\r\n')
    expect(lines).toHaveLength(6)

    // Numbers only, for the report (no names): bucket counts and the scores in rank order.
    const results = (await page.evaluate(
      (id) => window.atlas.api.request('GET', `/runs/${id}/results?limit=10`),
      run?.id,
    )) as { data: { counts: Record<string, number>; rows: Array<{ ra_number: string; score: number | null }> } }
    console.log(
      `[installed] counts ${JSON.stringify(results.data.counts)}; scores by RA: ${results.data.rows
        .map((r) => `${r.ra_number}=${r.score}`)
        .join(', ')}; export ${exported.length} bytes, ${lines.length - 1} rows`,
    )
  } finally {
    await app.close()
  }
})
