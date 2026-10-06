// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineStateName } from '@shared/bridge'
import { REDUCED_SPLASH_TIMING, SPLASH_TIMING, type SplashTiming, useSplash } from './splash'

const splashDone = vi.fn(async () => undefined)

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  document.documentElement.dataset.splash = ''
  splashDone.mockClear()
  Object.assign(window, { atlas: { app: { splashDone } } })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function start(engine: EngineStateName = 'starting', timing: SplashTiming = SPLASH_TIMING) {
  return renderHook(({ engine: state }) => useSplash(state, timing), { initialProps: { engine } })
}

const MIN = SPLASH_TIMING.minMs

function wait(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('the start-up screen', () => {
  it('uses the agreed timings: 3.2 s while "hello" is drawn in, 1.2 s with reduced motion', () => {
    expect(SPLASH_TIMING).toEqual({ minMs: 3200, slowMs: 6000, maxMs: 15_000, fadeMs: 300 })
    expect(REDUCED_SPLASH_TIMING).toEqual({ minMs: 1200, slowMs: 6000, maxMs: 15_000, fadeMs: 300 })
  })

  it.each([
    ['3.2 s (the drawing)', SPLASH_TIMING],
    ['1.2 s (reduced motion)', REDUCED_SPLASH_TIMING],
  ])('shows for at least %s, even when the engine is ready at once', (_label, timing) => {
    const { result } = start('ready', timing)
    wait(timing.minMs - 1)
    expect(result.current.phase).toBe('showing')
    expect(result.current.drawn).toBe(false)
    expect(document.documentElement.dataset.splash).toBe('')
    expect(splashDone).not.toHaveBeenCalled()
    wait(1)
    expect(result.current.phase).toBe('leaving')
    expect(result.current.drawn).toBe(true)
    // Handing over: the page and the window take the app's colours at the start of the fade.
    expect(document.documentElement.dataset.splash).toBeUndefined()
    expect(splashDone).toHaveBeenCalledTimes(1)
    wait(299)
    expect(result.current.phase).toBe('leaving')
    wait(1)
    expect(result.current.phase).toBe('gone')
    expect(splashDone).toHaveBeenCalledTimes(1)
  })

  it('waits for the engine past the minimum, then hands over at once', () => {
    const { result, rerender } = start('starting')
    wait(4000)
    expect(result.current.phase).toBe('showing')
    rerender({ engine: 'restarting' })
    wait(500)
    expect(result.current.phase).toBe('showing')
    rerender({ engine: 'ready' })
    expect(result.current.phase).toBe('leaving')
    expect(result.current.leftAt).not.toBeNull()
    wait(300)
    expect(result.current.phase).toBe('gone')
  })

  it('says "Still starting…" from 6 s', () => {
    const { result } = start('starting')
    wait(5999)
    expect(result.current.slow).toBe(false)
    wait(1)
    expect(result.current.slow).toBe(true)
    expect(result.current.phase).toBe('showing')
  })

  it('never hangs: at 15 s it hands over whatever the engine is doing', () => {
    const { result } = start('starting')
    wait(14_999)
    expect(result.current.phase).toBe('showing')
    wait(1)
    expect(result.current.phase).toBe('leaving')
    expect(splashDone).toHaveBeenCalledTimes(1)
    wait(300)
    expect(result.current.phase).toBe('gone')
  })

  it('hands over to the error screen when the engine fails, after the minimum', () => {
    const early = start('failed')
    wait(MIN - 1)
    expect(early.result.current.phase).toBe('showing')
    wait(1)
    expect(early.result.current.phase).toBe('leaving')
    early.unmount()

    sessionStorage.clear()
    const late = start('starting')
    wait(MIN + 1000)
    late.rerender({ engine: 'failed' })
    expect(late.result.current.phase).toBe('leaving')
  })

  it('stays gone: an engine restart later never brings it back', () => {
    const { result, rerender } = start('ready')
    wait(MIN) // React runs effects between act() calls, so the fade starts here
    wait(300)
    expect(result.current.phase).toBe('gone')
    rerender({ engine: 'restarting' })
    wait(20_000)
    rerender({ engine: 'ready' })
    expect(result.current.phase).toBe('gone')
    expect(splashDone).toHaveBeenCalledTimes(1)
  })

  it('shows once per launch: a reload in the same session skips it', () => {
    start('ready')
    wait(MIN)
    wait(300)
    cleanup()
    document.documentElement.dataset.splash = ''
    splashDone.mockClear()
    const { result } = start('starting')
    expect(result.current.phase).toBe('gone')
    // The page and the window still take the app's colours.
    expect(document.documentElement.dataset.splash).toBeUndefined()
    expect(splashDone).toHaveBeenCalledTimes(1)
  })
})
