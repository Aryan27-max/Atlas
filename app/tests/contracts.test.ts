/**
 * Contracts that span files:
 *  - the generated API types match the engine's schema (regenerate when stale);
 *  - the renderer and preload never reference the API token.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain .mjs build script without type declarations
import { OUT_PATH, SCHEMA_PATH, generate } from '../scripts/gen-api-types.mjs'

const APP = join(__dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

describe('generated API types', () => {
  it('are current (else: npm run gen:api)', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
    expect(readFileSync(OUT_PATH, 'utf8')).toBe(generate(schema))
  })

  it('cover every route in the schema', () => {
    const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as { paths: Record<string, object> }
    const types = readFileSync(OUT_PATH, 'utf8')
    for (const [path, methods] of Object.entries(schema.paths)) {
      for (const method of Object.keys(methods)) expect(types).toContain(`"${method.toUpperCase()} ${path}"`)
    }
  })
})

describe('the token stays in main', () => {
  it('no renderer or preload source mentions it', () => {
    const sources = [...files(join(APP, 'renderer')), ...files(join(APP, 'preload'))].filter((f) =>
      /\.(ts|tsx|html|css)$/.test(f),
    )
    expect(sources.length).toBeGreaterThan(3)
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(APP, file)).not.toMatch(/token|authorization|bearer|ATLAS_TOKEN/i)
    }
  })
})
