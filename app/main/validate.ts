/**
 * Every IPC argument from the renderer is checked here before main acts on it.
 *
 * API calls are allowed only if the method + path match a route in the
 * engine's own OpenAPI schema. Routes that write files, upload, stream or
 * shut down are reserved for main (they have their own, narrower IPC calls).
 */

import schema from '@shared/api-schema.json'
import type { ExportView, FolderTarget, HttpMethod, NotificationRequest, Theme, UploadSource } from '@shared/bridge'

export class InvalidArgument extends Error {
  override name = 'InvalidArgument'
}

const METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])

/** Only main calls these (uploads, writing files, event streams, shutdown). */
export const MAIN_ONLY_ROUTES: ReadonlySet<string> = new Set([
  'POST /shutdown',
  'POST /runs/{run_id}/table',
  'POST /runs/{run_id}/export',
  'GET /runs/{run_id}/export',
  'GET /runs/{run_id}/events',
  'GET /events',
])

const PARAM_PATTERNS: Record<string, string> = {
  run_id: '[1-9][0-9]{0,9}',
  candidate_id: '[1-9][0-9]{0,9}',
  name: '[A-Za-z0-9._%-]{1,200}', // a model name, percent-encoded (":" and "/" arrive as %3A, %2F)
}

interface Route {
  key: string
  method: string
  pattern: RegExp
}

function compile(path: string): RegExp {
  const source = path
    .split(/(\{[a-z_]+\})/)
    .map((part) => {
      const param = /^\{([a-z_]+)\}$/.exec(part)
      if (param) return `(?:${PARAM_PATTERNS[param[1] ?? ''] ?? '[A-Za-z0-9._-]+'})`
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${source}$`)
}

export const ROUTES: readonly Route[] = Object.entries((schema as { paths: Record<string, object> }).paths)
  .flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => ({
      key: `${method.toUpperCase()} ${path}`,
      method: method.toUpperCase(),
      pattern: compile(path),
    })),
  )
  .filter((route) => !MAIN_ONLY_ROUTES.has(route.key))

const QUERY = /^[A-Za-z0-9_\-.~%=&+,]*$/
const MAX_BODY_BYTES = 256 * 1024

export interface CheckedRequest {
  method: HttpMethod
  path: string
  body: string | undefined
  route: string
}

export function validateApiRequest(method: unknown, path: unknown, body?: unknown): CheckedRequest {
  if (typeof method !== 'string' || !METHODS.has(method)) throw new InvalidArgument('Unknown HTTP method.')
  if (typeof path !== 'string' || path.length === 0 || path.length > 2048) throw new InvalidArgument('Bad path.')
  if (
    !path.startsWith('/') ||
    path.includes('..') ||
    path.includes('\\') ||
    path.includes('//') ||
    path.includes('#')
  ) {
    throw new InvalidArgument('Bad path.')
  }
  const [pathname = '', query, ...rest] = path.split('?')
  if (rest.length) throw new InvalidArgument('Bad path.')
  if (query !== undefined && (method !== 'GET' || !QUERY.test(query))) throw new InvalidArgument('Bad query.')
  const route = ROUTES.find((r) => r.method === method && r.pattern.test(pathname))
  if (!route) throw new InvalidArgument(`Not an allowed route: ${method} ${pathname}`)

  let serialized: string | undefined
  if (body !== undefined && body !== null) {
    if (method === 'GET' || method === 'DELETE') throw new InvalidArgument('This request takes no body.')
    if (typeof body !== 'object' || !isPlainJson(body)) throw new InvalidArgument('The body must be plain JSON.')
    serialized = JSON.stringify(body)
    if (new TextEncoder().encode(serialized).length > MAX_BODY_BYTES)
      throw new InvalidArgument('The body is too large.')
  }
  return { method: method as HttpMethod, path, body: serialized, route: route.key }
}

function isPlainJson(value: unknown, depth = 0): boolean {
  if (depth > 20) return false
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return typeof value !== 'number' || Number.isFinite(value)
  }
  if (Array.isArray(value)) return value.every((item) => isPlainJson(item, depth + 1))
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return false
    return Object.values(value as Record<string, unknown>).every((item) => isPlainJson(item, depth + 1))
  }
  return false
}

export function validateRunId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2 ** 31) {
    throw new InvalidArgument('Bad run id.')
  }
  return value
}

export function validateRunIdOrNull(value: unknown): number | null {
  return value === null ? null : validateRunId(value)
}

const VIEWS: readonly ExportView[] = ['all', 'shortlisted', 'cutoff', 'rejected', 'failed']

export function validateView(value: unknown): ExportView {
  if (typeof value !== 'string' || !(VIEWS as readonly string[]).includes(value)) throw new InvalidArgument('Bad view.')
  return value as ExportView
}

export function validateTheme(value: unknown): Theme {
  if (value !== 'system' && value !== 'light' && value !== 'dark') throw new InvalidArgument('Bad theme.')
  return value
}

/** A default file name for the save dialog: no folders, no characters Windows forbids. */
export function validateFileName(value: unknown): string {
  if (typeof value !== 'string') throw new InvalidArgument('Bad file name.')
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  if (!cleaned || cleaned === '.' || cleaned === '..') throw new InvalidArgument('Bad file name.')
  return cleaned
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const TABLE_EXTENSIONS: readonly string[] = ['.csv', '.txt', '.tsv', '.xlsx', '.xlsm', '.xls']

export function validateUploadSource(value: unknown): UploadSource {
  if (typeof value !== 'object' || value === null) throw new InvalidArgument('Bad file.')
  const source = value as Record<string, unknown>
  if ('handle' in source) {
    if (typeof source.handle !== 'string' || !/^[a-f0-9]{32}$/.test(source.handle))
      throw new InvalidArgument('Bad file.')
    return { handle: source.handle }
  }
  // The file type is the engine's call (it answers "Choose a CSV or Excel
  // (.xlsx) file."); the size is checked by the IPC handler, which answers
  // with the engine's wording instead of an error.
  const { name, bytes } = source
  if (typeof name !== 'string' || name.length === 0 || name.length > 255 || /[\\/]/.test(name)) {
    throw new InvalidArgument('Bad file name.')
  }
  if (!(bytes instanceof ArrayBuffer) && !(bytes instanceof Uint8Array)) throw new InvalidArgument('Bad file.')
  return { name, bytes: bytes instanceof Uint8Array ? copy(bytes) : bytes }
}

function copy(view: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(view.byteLength)
  new Uint8Array(out).set(view)
  return out
}

export function validateFolderTarget(value: unknown, knownExports: ReadonlySet<string>): FolderTarget {
  if (typeof value !== 'object' || value === null) throw new InvalidArgument('Bad folder.')
  const target = value as Record<string, unknown>
  if (target.kind === 'data' || target.kind === 'logs') return { kind: target.kind }
  if (target.kind === 'export' && typeof target.path === 'string' && knownExports.has(target.path)) {
    return { kind: 'export', path: target.path }
  }
  throw new InvalidArgument('Bad folder.')
}

export function validateNotification(value: unknown): NotificationRequest {
  if (typeof value !== 'object' || value === null) throw new InvalidArgument('Bad notification.')
  const { title, body } = value as Record<string, unknown>
  if (typeof title !== 'string' || typeof body !== 'string' || !title.trim())
    throw new InvalidArgument('Bad notification.')
  return { title: title.slice(0, 120), body: body.slice(0, 400) }
}
