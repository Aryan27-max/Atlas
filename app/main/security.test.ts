import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { isAppPage } from './security'

// Where a recruiter's install can live: a space and a non-ASCII letter in the user name.
const root = mkdtempSync(join(tmpdir(), 'atlas-page-'))
const folder = join(root, 'Kārthik Rao', 'resources', 'renderer')
mkdirSync(folder, { recursive: true })
const page = join(folder, 'index.html')
writeFileSync(page, '<!doctype html>')
writeFileSync(join(folder, 'other.html'), '<!doctype html>')
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('isAppPage (packaged: the renderer file)', () => {
  it('knows its own page however Chromium spells the URL', () => {
    const url = pathToFileURL(page).href // percent-encoded, file:///C:/… on Windows
    expect(url).toMatch(/%20/)
    expect(isAppPage(url, null, page)).toBe(true)
    expect(isAppPage(`${url}#/settings`, null, page)).toBe(true)
  })

  it('anything else is not the app', () => {
    expect(isAppPage(pathToFileURL(join(folder, 'other.html')).href, null, page)).toBe(false)
    expect(isAppPage('https://example.com/', null, page)).toBe(false)
    expect(isAppPage('not a url', null, page)).toBe(false)
  })
})

describe('isAppPage (development: the dev server)', () => {
  const devServer = 'http://localhost:5173'
  it('the dev server, with the slash Chromium adds', () => {
    expect(isAppPage('http://localhost:5173/', devServer, page)).toBe(true)
    expect(isAppPage('http://localhost:5173/#/design', devServer, page)).toBe(true)
  })
  it('another port, site or file is not the app', () => {
    expect(isAppPage('http://localhost:5174/', devServer, page)).toBe(false)
    expect(isAppPage('https://example.com/', devServer, page)).toBe(false)
    expect(isAppPage(pathToFileURL(page).href, devServer, page)).toBe(false)
  })
})
