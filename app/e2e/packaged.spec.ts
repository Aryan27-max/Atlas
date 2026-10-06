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

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { type ElectronApplication, type Page, _electron as electron, expect, test } from '@playwright/test'
import { samePath } from '../main/paths'
import { APP_DIR, waitForWelcome } from './helpers'

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

/** The installer next to the unpacked app, if it was built (Windows .exe, macOS .dmg). */
function builtInstaller(): string | null {
  const dist = process.env.ATLAS_PACKAGED_DIR ?? join(APP_DIR, 'dist')
  if (!existsSync(dist)) return null
  const name = readdirSync(dist).find((file) =>
    (process.platform === 'win32' ? /^Atlas-Setup-.*\.exe$/ : /\.dmg$/).test(file),
  )
  return name ? join(dist, name) : null
}

/**
 * How much of the icon the OS shows for a file is the logo's orange-red: the share of its
 * opaque pixels that are clearly orange or red. The logo is 0.79 at every size (the rest is
 * the white bird); Electron's default icon, Notepad, Edge and Paint are 0, and the nearest
 * colour seen, Explorer's yellow folder, is 0.14. At least 0.3 leaves room for macOS drawing
 * an older-style icon smaller, on a grey plate. 'normal' (32 px) is the size every OS supports.
 */
async function orangeShare(app: ElectronApplication, page: Page, target: string, keep = true): Promise<number> {
  const dataUrl = await app.evaluate(
    async ({ app: electronApp }, path) => (await electronApp.getFileIcon(path, { size: 'normal' })).toDataURL(),
    target,
  )
  // What the OS showed, kept with the results (a failure says what it was).
  if (keep)
    await test.info().attach(`os-icon-${basename(target)}.png`, {
      body: Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'),
      contentType: 'image/png',
    })
  return pngOrangeShare(page, dataUrl, target)
}

/** The share of a PNG's opaque pixels that are the logo's orange-red. */
async function pngOrangeShare(page: Page, dataUrl: string, what: string): Promise<number> {
  const { opaque, orange } = await page.evaluate(async (url) => {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const count = { opaque: 0, orange: 0, colourful: 0 }
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) < 200) continue
      count.opaque++
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
      if (r >= 200 && r - g >= 60 && r - b >= 90) count.orange++
      if (Math.max(r, g, b) - Math.min(r, g, b) > 40) count.colourful++
    }
    return count
  }, dataUrl)
  expect(opaque, `${what}: an icon`).toBeGreaterThan(100)
  return orange / opaque
}

/** The share of an icon's opaque pixels that have any real colour: macOS's placeholder is grey. */
async function pngColourShare(page: Page, dataUrl: string): Promise<number> {
  return page.evaluate(async (url) => {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
    ctx.drawImage(image, 0, 0)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let [opaque, colourful] = [0, 0]
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i + 3] ?? 0) < 128) continue
      opaque++
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
      if (Math.max(r, g, b) - Math.min(r, g, b) > 40) colourful++
    }
    return opaque ? colourful / opaque : 0
  }, dataUrl)
}

/**
 * macOS: Contents/Resources has the .icns that Info.plist names, it is the logo (not
 * Electron's), and the DMG has a volume icon.
 */
async function expectMacBundleIcon(page: Page, binary: string): Promise<void> {
  const contents = join(dirname(binary), '..')
  const plist = execFileSync('plutil', ['-convert', 'xml1', '-o', '-', join(contents, 'Info.plist')], {
    encoding: 'utf8',
  })
  const iconFile = /<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? ''
  expect(iconFile, 'Info.plist CFBundleIconFile').not.toBe('')
  const icns = iconFile.endsWith('.icns') ? iconFile : `${iconFile}.icns`
  expect(existsSync(join(contents, 'Resources', icns)), `Contents/Resources/${icns}`).toBe(true)
  // Which sizes the .icns holds (kept with the results).
  const iconset = join(mkdtempSync(join(tmpdir(), 'atlas-iconset-')), 'Atlas.iconset')
  execFileSync('iconutil', ['-c', 'iconset', join(contents, 'Resources', icns), '-o', iconset])
  const sizes = readdirSync(iconset).sort().join('\n')
  console.log(`[packaged] ${icns} holds:
${sizes}`)
  await test.info().attach(`${icns}-sizes.txt`, { body: sizes, contentType: 'text/plain' })
  const png = join(mkdtempSync(join(tmpdir(), 'atlas-icns-')), 'icon.png')
  execFileSync('sips', ['-s', 'format', 'png', '-Z', '64', join(contents, 'Resources', icns), '--out', png])
  const body = readFileSync(png)
  await test.info().attach(`bundle-${icns}.png`, { body, contentType: 'image/png' })
  const share = await pngOrangeShare(page, `data:image/png;base64,${body.toString('base64')}`, icns)
  expect(share, `Contents/Resources/${icns} is the Atlas logo`).toBeGreaterThanOrEqual(0.3)
  const dmg = builtInstaller()
  if (!dmg) return
  const mount = mkdtempSync(join(tmpdir(), 'atlas-dmg-'))
  execFileSync('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg])
  try {
    expect(existsSync(join(mount, '.VolumeIcon.icns')), 'the DMG volume icon').toBe(true)
  } finally {
    execFileSync('hdiutil', ['detach', mount, '-force'])
  }
}

/**
 * macOS renders a bundle's icon asynchronously: until it has, it answers with a blank
 * placeholder (CI saw that for a freshly built app). Wait for the real one, and if the
 * bundle is still unknown to LaunchServices after a while, register it, as copying an app
 * into Applications does. The check after this is unchanged.
 */
async function macShowsTheIcon(app: ElectronApplication, page: Page, bundle: string): Promise<boolean> {
  // A control: a system app's icon, asked for the same way. If even that comes back as the grey
  // placeholder, this Mac renders no app icons for us (as on a CI runner), and what the OS shows
  // can't be checked here; the .icns check above still stands.
  const control = ['/System/Applications/Calculator.app', '/System/Applications/Safari.app'].find((path) =>
    existsSync(path),
  )
  if (control) {
    const icon = await app.evaluate(
      async ({ app: electronApp }, path) => (await electronApp.getFileIcon(path, { size: 'normal' })).toDataURL(),
      control,
    )
    await test.info().attach(`os-icon-control-${basename(control)}.png`, {
      body: Buffer.from(icon.split(',')[1] ?? '', 'base64'),
      contentType: 'image/png',
    })
    const colour = await pngColourShare(page, icon)
    console.log(`[packaged] control ${basename(control)}: ${(colour * 100).toFixed(0)}% coloured pixels`)
    if (colour < 0.1) {
      const note = `macOS here showed a grey placeholder even for ${basename(control)}: what the OS shows can't be checked on this machine (the bundle's .icns was checked).`
      test.info().annotations.push({ type: 'macOS icon', description: note })
      console.warn(`[packaged] ${note}`)
      return false
    }
  }
  const rendered = async (): Promise<boolean> => (await orangeShare(app, page, bundle, false)) >= 0.3
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) if (await rendered()) return true
  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
  execFileSync(lsregister, ['-f', bundle])
  console.warn('[packaged] macOS showed a placeholder for 20 s; registered the bundle with LaunchServices')
  await expect.poll(rendered, { timeout: 30_000, message: `${bundle}: macOS shows the Atlas icon` }).toBe(true)
  return true
}

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
    await waitForWelcome(page)
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

    // The app carries Atlas's icon: what the OS shows for the exe (Windows) or the .app
    // bundle (macOS) is the logo, not Electron's default (grey-blue).
    // The bundle first on macOS: what it contains, then what the OS shows for it.
    if (process.platform === 'darwin') await expectMacBundleIcon(page, executable as string)
    const shown =
      process.platform === 'darwin' ? join(dirname(executable as string), '..', '..') : (executable as string)
    const observable = process.platform !== 'darwin' || (await macShowsTheIcon(app, page, shown))
    if (observable) expect(await orangeShare(app, page, shown), `${shown}: the Atlas icon`).toBeGreaterThanOrEqual(0.3)
    const installer = builtInstaller()
    // The Windows installer shows the icon too. (A .dmg file's own icon is the system's
    // disk image; its volume icon is checked below by mounting it.)
    if (installer && process.platform === 'win32')
      expect(await orangeShare(app, page, installer), `${installer}: the Atlas icon`).toBeGreaterThanOrEqual(0.3)
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
