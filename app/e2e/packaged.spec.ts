/**
 * Step 3.5: the packaged app, not the development build. electron-builder's
 * unpacked folder holds the same files the installer puts on disk; this
 * launches it, waits for its bundled engine (the PyInstaller binary in
 * resources/engine/) to be ready, and checks the Welcome screen.
 *
 * Skipped until `npm run dist` has built it. The build is looked for in
 * app/dist, or in ATLAS_PACKAGED_DIR when the output went elsewhere.
 * The app gets its own temporary data folder (--user-data-dir), so the test
 * never touches a real Atlas data folder on this computer.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { samePath } from '../main/paths'
import { APP_DIR } from './helpers'

function packagedExecutable(): string | null {
  const dist = process.env.ATLAS_PACKAGED_DIR ?? join(APP_DIR, 'dist')
  const candidates =
    process.platform === 'win32'
      ? [join(dist, 'win-unpacked', 'Atlas.exe')]
      : process.platform === 'darwin'
        ? ['mac-arm64', 'mac', 'mac-universal'].map((folder) =>
            join(dist, folder, 'Atlas.app', 'Contents', 'MacOS', 'Atlas'),
          )
        : [join(dist, 'linux-unpacked', 'atlas')]
  return candidates.find((path) => existsSync(path)) ?? null
}

const executable = packagedExecutable()

test.skip(!executable, 'No packaged app yet: run `npm run dist` first (or set ATLAS_PACKAGED_DIR).')

test('the packaged app starts its bundled engine and shows Welcome', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'atlas-packaged-'))
  // As in helpers.launch: an editor's ELECTRON_RUN_AS_NODE would start Atlas as plain Node,
  // and a dead Ollama address keeps the test away from a real Ollama.
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ATLAS_OLLAMA_URL: 'http://127.0.0.1:9',
  }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({
    executablePath: executable as string,
    args: [`--user-data-dir=${userData}`],
    env,
  })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('[data-engine="ready"]')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('button', { name: 'New screening' })).toBeVisible()
    expect(await app.evaluate(({ app: electronApp }) => electronApp.isPackaged)).toBe(true)
    // The engine answering is the bundled binary: a packaged app never looks for Python.
    const health = await page.evaluate(() => window.atlas.api.request('GET', '/health'))
    expect(health).toMatchObject({ ok: true, data: { status: 'ok' } })
    const system = (await page.evaluate(() => window.atlas.api.request('GET', '/system'))) as {
      data: { data_dir: string }
    }
    // Its own data folder, not the real one. Compared as folders, not strings: Electron
    // makes --user-data-dir absolute with realpath(), so on a Mac /var/folders/… (where
    // os.tmpdir() points) comes back as /private/var/folders/… (main/paths.ts).
    const dataDir = system.data.data_dir
    expect(samePath(dataDir, userData), `${dataDir} is not ${userData}`).toBe(true)
    // The Welcome card shows the folder exactly as the engine reports it.
    await expect(page.getByText(dataDir, { exact: true })).toBeVisible()
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
