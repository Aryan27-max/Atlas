// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiFailure, api, buildPath, messageOf } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildPath', () => {
  it('fills and encodes path parameters', () => {
    expect(buildPath('/models/{name}/precheck', { name: 'qwen3:8b' })).toBe('/models/qwen3%3A8b/precheck')
    expect(buildPath('/runs/{run_id}/candidates/{candidate_id}', { run_id: 3, candidate_id: 41 })).toBe(
      '/runs/3/candidates/41',
    )
    expect(() => buildPath('/runs/{run_id}', {})).toThrow()
  })

  it('skips empty query values and repeats arrays', () => {
    expect(
      buildPath('/runs/{run_id}/filters/preview', { run_id: 1 }, { cgpa_min: 8.5, departments: ['CSE', 'E&C'], q: '' }),
    ).toBe('/runs/1/filters/preview?cgpa_min=8.5&departments=CSE&departments=E%26C')
    expect(buildPath('/runs', undefined, { a: undefined, b: null })).toBe('/runs')
  })
})

describe('api', () => {
  function bridge(result: unknown) {
    const request = vi.fn(async () => result)
    Object.assign(window, { atlas: { api: { request } } })
    return request
  }

  it('sends the method, path and body through the bridge', async () => {
    const request = bridge({ ok: true, status: 200, data: { id: 3 } })
    const run = await api('PATCH /runs/{run_id}', { params: { run_id: 3 }, body: { name: 'Campus' } })
    expect(run).toEqual({ id: 3 })
    expect(request).toHaveBeenCalledWith('PATCH', '/runs/3', { name: 'Campus' })
  })

  it("throws the engine's message", async () => {
    bridge({ ok: false, status: 409, error: { code: 'locked', message: "A run's model is locked." } })
    const failure = await api('GET /runs').catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ApiFailure)
    expect(messageOf(failure)).toBe("A run's model is locked.")
    expect((failure as ApiFailure).code).toBe('locked')
  })

  it('turns a bridge rejection into a calm message', async () => {
    Object.assign(window, { atlas: { api: { request: vi.fn(async () => Promise.reject(new Error('IPC'))) } } })
    const failure = await api('GET /runs').catch((error: unknown) => error)
    expect(messageOf(failure)).toBe('Something went wrong inside Atlas. Try again.')
    expect(messageOf(new Error('raw'))).toBe('Something went wrong inside Atlas. Try again.')
  })
})
