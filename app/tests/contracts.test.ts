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
    // "Design tokens" are fine; anything that names or handles the API credential is not.
    const credential = /ATLAS_TOKEN|authorization|bearer|tokenForTests|__atlasTest|api[ _-]?token|authHeaders/i
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      expect(text, relative(APP, file)).not.toMatch(credential)
    }
  })
})

describe('rule 16: no scoring or bucketing in the renderer', () => {
  const sources = files(join(APP, 'renderer')).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))

  it('never compares a candidate score with anything', () => {
    // `score >= 60`, `row.score < cutoff`, `70 <= evaluation.overall_score` …
    // Prettier always spaces comparison operators, so JSX tags (`score</h3>`) don't match.
    const comparison = /\b(score|overall_score|sub_scores)\b\s+[<>]=?\s|\s[<>]=?\s+[\w.]*\b(score|overall_score)\b/
    for (const file of sources) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return
        expect(line, `${relative(APP, file)}:${i + 1}`).not.toMatch(comparison)
      })
    }
  })

  it('takes every bucket, rank, fill and tie from the engine', () => {
    const logic = /compute_?buckets|computeBucket|assignBucket|bucketFor|\.sort\([^)]*score|rank\s*=\s*[^=]/
    for (const file of sources) {
      expect(readFileSync(file, 'utf8'), relative(APP, file)).not.toMatch(logic)
    }
  })
})
