import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { realPath, samePath } from './paths'

const root = mkdtempSync(join(tmpdir(), 'atlas-paths-'))
const real = join(root, 'Real Folder')
mkdirSync(real)
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('samePath', () => {
  it('a folder and a link to it are the same folder (macOS /var → /private/var, a Windows junction)', () => {
    const link = join(root, 'link')
    symlinkSync(real, link, 'junction') // a junction needs no admin rights on Windows; the type is ignored elsewhere
    expect(samePath(link, real)).toBe(true)
    expect(realPath(link)).toBe(realPath(real))
  })

  it('the temp folder as Node spells it is its real path (/var/folders on a Mac, 8.3 names on Windows)', () => {
    expect(samePath(tmpdir(), realPath(tmpdir()))).toBe(true)
    expect(samePath(real, join(realPath(tmpdir()), relative(tmpdir(), real)))).toBe(true)
  })

  it('a trailing separator and a relative spelling name the same folder', () => {
    expect(samePath(`${real}${sep}`, real)).toBe(true)
    expect(samePath(relative(process.cwd(), real), real)).toBe(true)
  })

  it.runIf(process.platform === 'win32')('either slash on Windows', () => {
    expect(samePath(real.replace(/\\/g, '/'), real)).toBe(true)
  })

  it('case is ignored on Windows and macOS, not on Linux', () => {
    // Missing paths compare as written (no file system to ask), so only the rule is tested.
    const missing = join(root, 'Not There')
    const lower = join(root, 'not there')
    expect(samePath(missing, lower, 'win32')).toBe(true)
    expect(samePath(missing, lower, 'darwin')).toBe(true)
    expect(samePath(missing, lower, 'linux')).toBe(false)
  })

  it('different folders are different, existing or not', () => {
    expect(samePath(real, root)).toBe(false)
    expect(samePath(join(root, 'a'), join(root, 'b'))).toBe(false)
  })
})
