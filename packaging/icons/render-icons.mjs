// Render Atlas's app icons from the logo (app/renderer/assets/brand/logo.svg).
//
//   node packaging/icons/render-icons.mjs           write the icons and SHA256SUMS
//   node packaging/icons/render-icons.mjs --check   re-render, and fail if a file would change
//
// No new dependency: it draws with the Chromium inside Electron, driven by
// Playwright (both already installed in app/), on a CPU-backed canvas so the
// output doesn't depend on a GPU. Re-running it writes byte-identical files.
//
// Output (packaging/icons/):
//   icon-16.png … icon-512.png   full-bleed, for Windows and general use
//   icon.png                     1024 px, full-bleed
//   icon-mac.png                 1024 px on Apple's icon grid: the artwork at 824 px,
//                                centred, with a soft drop shadow, so it sits in the
//                                Dock like other apps' icons instead of looking oversized
//   icon.ico                     16-256 px in one file (Windows: the exe, the installer,
//                                the uninstaller, the window), each size drawn from the
//                                vector rather than shrunk from 1024 px
//   SHA256SUMS                   what was written (checked by app/tests/icons.test.ts)

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')
const LOGO = join(REPO, 'app', 'renderer', 'assets', 'brand', 'logo.svg')
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const MAC = { canvas: 1024, art: 824, shadow: { color: 'rgba(0, 0, 0, 0.3)', blur: 20, offsetY: 10 } }

// Playwright and Electron live in app/node_modules.
const require = createRequire(join(REPO, 'app', 'package.json'))
const { _electron: electron } = require('@playwright/test')

async function render() {
  const svg = readFileSync(LOGO, 'utf8')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE // set by Electron-based editors; it would start Electron as plain Node
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [join(HERE, 'render-window.cjs')],
    env,
  })
  try {
    const page = await app.firstWindow()
    const draw = (size, art, shadow) =>
      page.evaluate(
        async ([source, size, art, shadow]) => {
          const image = new Image()
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = size
          const ctx = canvas.getContext('2d', { willReadFrequently: true }) // CPU raster: the same bytes every run
          if (shadow) {
            ctx.shadowColor = shadow.color
            ctx.shadowBlur = shadow.blur
            ctx.shadowOffsetY = shadow.offsetY
          }
          const at = (size - art) / 2
          ctx.drawImage(image, at, at, art, art)
          return canvas.toDataURL('image/png').split(',')[1]
        },
        [svg, size, art, shadow],
      )
    const files = new Map()
    for (const size of SIZES) files.set(`icon-${size}.png`, Buffer.from(await draw(size, size, null), 'base64'))
    files.set('icon.png', Buffer.from(await draw(1024, 1024, null), 'base64'))
    files.set('icon-mac.png', Buffer.from(await draw(MAC.canvas, MAC.art, MAC.shadow), 'base64'))
    files.set('icon.ico', ico(ICO_SIZES.map((size) => ({ size, png: files.get(`icon-${size}.png`) }))))
    return files
  } finally {
    await app.close()
  }
}

/** An .ico holding PNG images (supported since Windows Vista), largest last. */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + 16 * images.length
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2) // no palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)])
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex')

const files = await render()
const sums = `${[...files].map(([name, data]) => `${sha256(data)}  ${name}`).join('\n')}\n`

if (process.argv.includes('--check')) {
  const changed = [...files]
    .filter(([name, data]) => !existsSync(join(HERE, name)) || !readFileSync(join(HERE, name)).equals(data))
    .map(([name]) => name)
  const sumsChanged = !existsSync(join(HERE, 'SHA256SUMS')) || readFileSync(join(HERE, 'SHA256SUMS'), 'utf8') !== sums
  if (changed.length || sumsChanged) {
    console.error(`icons: re-rendering would change ${[...changed, ...(sumsChanged ? ['SHA256SUMS'] : [])].join(', ')}`)
    process.exit(1)
  }
  console.log(`icons: ${files.size} files re-rendered byte for byte`)
} else {
  for (const [name, data] of files) writeFileSync(join(HERE, name), data)
  writeFileSync(join(HERE, 'SHA256SUMS'), sums)
  console.log(`icons: wrote ${[...files.keys()].join(', ')} and SHA256SUMS`)
}
