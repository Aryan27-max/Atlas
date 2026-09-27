import { describe, expect, it } from 'vitest'
import {
  InvalidArgument,
  MAIN_ONLY_ROUTES,
  ROUTES,
  validateApiRequest,
  validateFileName,
  validateFolderTarget,
  validateNotification,
  validateRunId,
  validateRunIdOrNull,
  validateTheme,
  validateUploadSource,
  validateView,
} from './validate'

describe('validateApiRequest', () => {
  it('allows the engine routes the renderer needs', () => {
    const ok: Array<[string, string, unknown?]> = [
      ['GET', '/health'],
      ['GET', '/runs'],
      ['POST', '/runs', { name: 'Campus drive' }],
      ['PATCH', '/runs/12', { criteria_prompt: 'Python', cgpa_min: null }],
      ['GET', '/runs/12/results?shortlist=70&band=50&min=10&bucket=shortlisted&q=RA%2012&sort=rank&offset=0&limit=500'],
      ['GET', '/runs/3/filters/preview?cgpa_min=8.5&departments=CSE&departments=E%26C'],
      ['POST', '/runs/3/candidates/77/override', { to_bucket: 'shortlisted', note: '' }],
      ['POST', '/models/qwen3%3A8b/precheck'],
      ['POST', '/models/hf.co%2Fuser%2Fmodel%3Aq4/pull'],
      ['DELETE', '/runs/4'],
      ['PUT', '/settings', { appearance: 'dark' }],
    ]
    for (const [method, path, body] of ok) {
      expect(() => validateApiRequest(method, path, body), `${method} ${path}`).not.toThrow()
    }
  })

  it('refuses routes reserved for main', () => {
    for (const [method, path] of [
      ['POST', '/shutdown'],
      ['POST', '/runs/1/table'],
      ['POST', '/runs/1/export'],
      ['GET', '/runs/1/export?view=all'],
      ['GET', '/runs/1/events'],
      ['GET', '/events'],
    ]) {
      expect(() => validateApiRequest(method, path)).toThrow(InvalidArgument)
    }
    expect(ROUTES.some((r) => MAIN_ONLY_ROUTES.has(r.key))).toBe(false)
  })

  it('refuses anything that is not a known route', () => {
    const bad: Array<[unknown, unknown, unknown?]> = [
      ['GET', '/runs/../settings'],
      ['GET', '/runs/0'],
      ['GET', '/runs/abc'],
      ['GET', '//evil.example/runs'],
      ['GET', 'http://evil.example/runs'],
      ['GET', '/runs\\1'],
      ['GET', '/runs#x'],
      ['GET', '/nope'],
      ['TRACE', '/runs'],
      ['get', '/runs'],
      ['POST', '/runs?name=x'],
      ['GET', '/runs?x=<script>'],
      ['GET', `/${'a'.repeat(3000)}`],
      [42, '/runs'],
      ['GET', 42],
      ['GET', '/runs', { body: 'on a GET' }],
    ]
    for (const [method, path, body] of bad) {
      expect(() => validateApiRequest(method, path, body), `${String(method)} ${String(path).slice(0, 40)}`).toThrow(
        InvalidArgument,
      )
    }
  })

  it('accepts only plain JSON bodies of reasonable size', () => {
    expect(validateApiRequest('POST', '/runs', { name: 'x' }).body).toBe('{"name":"x"}')
    expect(() => validateApiRequest('POST', '/runs', new Date())).toThrow(InvalidArgument)
    expect(() => validateApiRequest('POST', '/runs', { n: Number.NaN })).toThrow(InvalidArgument)
    expect(() => validateApiRequest('POST', '/runs', 'a string')).toThrow(InvalidArgument)
    expect(() => validateApiRequest('POST', '/runs', { big: 'x'.repeat(300 * 1024) })).toThrow(InvalidArgument)
    let deep: Record<string, unknown> = {}
    const root = deep
    for (let i = 0; i < 30; i++) deep = (deep.a = {}) as Record<string, unknown>
    expect(() => validateApiRequest('POST', '/runs', root)).toThrow(InvalidArgument)
  })
})

describe('small validators', () => {
  it('run ids', () => {
    expect(validateRunId(3)).toBe(3)
    for (const bad of [0, -1, 1.5, '3', null, Number.NaN, 2 ** 40])
      expect(() => validateRunId(bad)).toThrow(InvalidArgument)
    expect(validateRunIdOrNull(null)).toBeNull()
  })

  it('views and themes', () => {
    expect(validateView('failed')).toBe('failed')
    expect(() => validateView('everything')).toThrow(InvalidArgument)
    expect(validateTheme('dark')).toBe('dark')
    expect(() => validateTheme('sepia')).toThrow(InvalidArgument)
  })

  it('file names lose folders and forbidden characters', () => {
    expect(validateFileName('Campus: 2026 / all')).toBe('Campus 2026 all')
    expect(validateFileName('..\\..\\evil')).toBe('.. .. evil')
    expect(() => validateFileName('   ')).toThrow(InvalidArgument)
    expect(() => validateFileName(7)).toThrow(InvalidArgument)
  })

  it('upload sources', () => {
    expect(validateUploadSource({ handle: 'a'.repeat(32) })).toEqual({ handle: 'a'.repeat(32) })
    expect(() => validateUploadSource({ handle: '../../etc/passwd' })).toThrow(InvalidArgument)
    const ok = validateUploadSource({ name: 'students.xlsx', bytes: new Uint8Array([1, 2, 3]) })
    expect('bytes' in ok && ok.bytes.byteLength).toBe(3)
    // The file type is the engine's call; the size gets the engine's wording from the IPC handler.
    expect(validateUploadSource({ name: 'resume.pdf', bytes: new ArrayBuffer(1) })).toMatchObject({
      name: 'resume.pdf',
    })
    expect(() => validateUploadSource({ name: 'a/b.csv', bytes: new ArrayBuffer(1) })).toThrow(InvalidArgument)
    expect(() => validateUploadSource({ name: '', bytes: new ArrayBuffer(1) })).toThrow(InvalidArgument)
    expect(() => validateUploadSource({ name: 'x.csv', bytes: 'not bytes' })).toThrow(InvalidArgument)
  })

  it('folders: only data, logs, or a file this app exported', () => {
    const known = new Set(['C:\\Users\\me\\Documents\\all.csv'])
    expect(validateFolderTarget({ kind: 'logs' }, known)).toEqual({ kind: 'logs' })
    expect(validateFolderTarget({ kind: 'export', path: 'C:\\Users\\me\\Documents\\all.csv' }, known).kind).toBe(
      'export',
    )
    expect(() => validateFolderTarget({ kind: 'export', path: 'C:\\Windows\\System32' }, known)).toThrow(
      InvalidArgument,
    )
    expect(() => validateFolderTarget({ kind: 'anywhere' }, known)).toThrow(InvalidArgument)
  })

  it('notifications', () => {
    expect(validateNotification({ title: 'Done', body: 'x'.repeat(1000) }).body).toHaveLength(400)
    expect(() => validateNotification({ title: '', body: '' })).toThrow(InvalidArgument)
    expect(() => validateNotification(null)).toThrow(InvalidArgument)
  })
})
