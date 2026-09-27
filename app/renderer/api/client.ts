/**
 * Typed calls to the engine, through main (window.atlas). Route keys and
 * types come from the engine's OpenAPI schema (src/shared/api-types.ts), so a
 * typo or a wrong field is a compile error.
 *
 *   const run = await api('GET /runs/{run_id}', { params: { run_id: 3 } })
 *
 * Failures throw ApiFailure with the engine's recruiter-readable message.
 */

import type { ApiRoutes, RouteKey } from '@shared/api-types'
import type { HttpMethod } from '@shared/bridge'

type Part<K extends RouteKey, P extends 'params' | 'query' | 'body'> = ApiRoutes[K][P]

export type ApiResponse<K extends RouteKey> = ApiRoutes[K]['response']

export interface CallOptions<K extends RouteKey> {
  params?: Part<K, 'params'> extends never ? never : Part<K, 'params'>
  query?: Part<K, 'query'> extends never ? never : Partial<Part<K, 'query'>>
  body?: Part<K, 'body'> extends never ? never : Part<K, 'body'>
}

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiFailure'
  }
}

const FALLBACK = 'Something went wrong inside Atlas. Try again.'

export function buildPath(template: string, params?: Record<string, unknown>, query?: Record<string, unknown>): string {
  const path = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params?.[key]
    if (value === undefined || value === null) throw new Error(`missing path parameter ${key}`)
    return encodeURIComponent(String(value))
  })
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item))
  }
  const text = search.toString()
  return text ? `${path}?${text}` : path
}

export async function api<K extends RouteKey>(route: K, options: CallOptions<K> = {}): Promise<ApiResponse<K>> {
  const space = route.indexOf(' ')
  const method = route.slice(0, space) as HttpMethod
  const path = buildPath(
    route.slice(space + 1),
    options.params as Record<string, unknown> | undefined,
    options.query as Record<string, unknown> | undefined,
  )
  let result
  try {
    result = await window.atlas.api.request<ApiResponse<K>>(method, path, options.body)
  } catch {
    throw new ApiFailure(FALLBACK, 'bridge', 0)
  }
  if (!result.ok) throw new ApiFailure(result.error.message || FALLBACK, result.error.code, result.status)
  return result.data
}

/** The message to show for anything thrown by `api()` or the bridge. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiFailure) return error.message
  return FALLBACK
}
