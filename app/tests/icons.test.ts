/**
 * The app icons are rendered from the logo by packaging/icons/render-icons.mjs
 * and committed. This fails if a committed icon isn't what the script last
 * wrote (an edit by hand, or a re-render without its SHA256SUMS), or if a
 * file's real size doesn't match its name. Re-running the script writes
 * byte-identical files: `node packaging/icons/render-icons.mjs --check`.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const ICONS = join(__dirname, '..', '..', 'packaging', 'icons')
const sums = readFileSync(join(ICONS, 'SHA256SUMS'), 'utf8')
  .trim()
  .split('\n')
  .map((line) => {
    const [hash = '', name = ''] = line.split(/\s+/)
    return { hash, name }
  })

/** An 8-bit RGBA, non-interlaced PNG (what Chromium's canvas writes), decoded with Node's zlib. */
function decodeRgba(data: Buffer): { width: number; alpha: (x: number, y: number) => number } {
  const [width, height] = pngSize(data)
  expect([data.readUInt8(24), data.readUInt8(25), data.readUInt8(28)]).toEqual([8, 6, 0]) // 8-bit, RGBA, no interlace
  const idat: Buffer[] = []
  for (let at = 8; at < data.length;) {
    const length = data.readUInt32BE(at)
    if (data.subarray(at + 4, at + 8).toString('latin1') === 'IDAT') idat.push(data.subarray(at + 8, at + 8 + length))
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i] ?? 0
      const a = i >= 4 ? (pixels[y * stride + i - 4] ?? 0) : 0
      const b = y > 0 ? (pixels[(y - 1) * stride + i] ?? 0) : 0
      const c = y > 0 && i >= 4 ? (pixels[(y - 1) * stride + i - 4] ?? 0) : 0
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      const predictor = [0, a, b, (a + b) >> 1, paeth][filter ?? 0] ?? 0
      pixels[y * stride + i] = (x + predictor) & 0xff
    }
  }
  return { width, alpha: (x, y) => pixels[y * stride + x * 4 + 3] ?? 0 }
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(data: Buffer): [number, number] {
  expect(data.subarray(1, 4).toString('latin1')).toBe('PNG')
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

describe('the committed app icons', () => {
  it('are exactly what render-icons.mjs wrote', () => {
    expect(sums.map((s) => s.name).sort()).toEqual(
      [
        'icon-16.png',
        'icon-24.png',
        'icon-32.png',
        'icon-48.png',
        'icon-64.png',
        'icon-128.png',
        'icon-256.png',
        'icon-512.png',
        'icon.png',
        'icon-mac.png',
        'icon.ico',
      ].sort(),
    )
    for (const { hash, name } of sums) {
      const actual = createHash('sha256')
        .update(readFileSync(join(ICONS, name)))
        .digest('hex')
      expect(actual, name).toBe(hash)
    }
  })

  it('are the size their names say', () => {
    for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
      expect(pngSize(readFileSync(join(ICONS, `icon-${size}.png`))), `icon-${size}.png`).toEqual([size, size])
    }
    expect(pngSize(readFileSync(join(ICONS, 'icon.png')))).toEqual([1024, 1024])
    expect(pngSize(readFileSync(join(ICONS, 'icon-mac.png')))).toEqual([1024, 1024])
  })

  it('macOS: the artwork fills the middle 824 px of 1024, with a transparent margin (Apple icon grid)', () => {
    const { width, alpha } = decodeRgba(readFileSync(join(ICONS, 'icon-mac.png')))
    // Where the opaque artwork is (the shadow is at most 30% black, so it's below the threshold).
    let [left, right, top, bottom] = [width, -1, width, -1]
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        if (alpha(x, y) < 128) continue
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
    expect([left, top]).toEqual([100, 100])
    expect([right, bottom]).toEqual([923, 923])
    expect([alpha(0, 0), alpha(1023, 0), alpha(0, 1023), alpha(1023, 1023), alpha(40, 512)]).toEqual([0, 0, 0, 0, 0])
    // A soft shadow just below the artwork: present, light (under 50%), gone well before the edge.
    expect(alpha(512, 932)).toBeGreaterThan(0)
    expect(alpha(512, 932)).toBeLessThan(128)
    expect(alpha(512, 990)).toBe(0)
  })

  it('Windows: icon.ico holds 16 to 256 px, as bitmaps with a PNG at 256 (what Explorer and the taskbar can show)', () => {
    const ico = readFileSync(join(ICONS, 'icon.ico'))
    expect(ico.readUInt16LE(2)).toBe(1) // an icon
    const count = ico.readUInt16LE(4)
    const sizes: number[] = []
    for (let i = 0; i < count; i++) {
      const entry = 6 + 16 * i
      const size = ico.readUInt8(entry) || 256
      const offset = ico.readUInt32LE(entry + 12)
      const image = ico.subarray(offset, offset + ico.readUInt32LE(entry + 8))
      if (size === 256) {
        expect(pngSize(image)).toEqual([256, 256])
      } else {
        // A PNG here makes Windows show the generic program icon instead (found by e2e/packaged.spec.ts).
        expect(image.subarray(1, 4).toString('latin1'), `${size} px`).not.toBe('PNG')
        expect([image.readUInt32LE(0), image.readInt32LE(4), image.readInt32LE(8), image.readUInt16LE(14)]).toEqual([
          40,
          size,
          size * 2,
          32,
        ])
        expect(image.length).toBe(40 + size * size * 4 + Math.ceil(size / 32) * 4 * size)
      }
      sizes.push(size)
    }
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256])
  })
})
