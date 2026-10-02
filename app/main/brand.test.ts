import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { iconPath } from './brand'

const root = mkdtempSync(join(tmpdir(), 'atlas-brand-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('iconPath', () => {
  it('packaged: <resources>/icons/', () => {
    const resources = join(root, 'resources')
    mkdirSync(join(resources, 'icons'), { recursive: true })
    writeFileSync(join(resources, 'icons', 'icon.ico'), '')
    expect(iconPath('icon.ico', { packaged: true, resourcesPath: resources, from: root })).toBe(
      join(resources, 'icons', 'icon.ico'),
    )
    expect(iconPath('icon-256.png', { packaged: true, resourcesPath: resources, from: root })).toBeNull()
  })

  it('development: walks up from main to the repository', () => {
    const repo = join(root, 'repo')
    mkdirSync(join(repo, 'packaging', 'icons'), { recursive: true })
    mkdirSync(join(repo, 'app', 'out', 'main'), { recursive: true })
    writeFileSync(join(repo, 'packaging', 'icons', 'icon-mac.png'), '')
    const from = join(repo, 'app', 'out', 'main')
    expect(iconPath('icon-mac.png', { packaged: false, resourcesPath: '', from })).toBe(
      join(repo, 'packaging', 'icons', 'icon-mac.png'),
    )
    expect(iconPath('icon.ico', { packaged: false, resourcesPath: '', from })).toBeNull()
  })

  it("the repository's own icons are where development looks", () => {
    const here = { packaged: false, resourcesPath: '', from: __dirname }
    for (const name of ['icon.ico', 'icon-256.png', 'icon-mac.png'] as const) {
      expect(iconPath(name, here), name).not.toBeNull()
    }
  })
})
