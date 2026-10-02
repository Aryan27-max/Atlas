import { describe, expect, it, vi } from 'vitest'
import { RunWatcher, type RunStatus, notificationFor } from './runs'
import { defaultBounds, restoreBounds } from './window-state'

const run = (status: string, pause_reason: string | null = null, auto_resume = false): RunStatus => ({
  run_id: 1,
  name: 'Campus drive',
  status,
  pause_reason,
  auto_resume,
})

describe('notificationFor', () => {
  it('announces completion once', () => {
    expect(notificationFor(run('running'), run('completed'))?.title).toBe('Screening complete')
    expect(notificationFor(run('completed'), run('completed'))).toBeNull()
  })

  it('announces pauses that need the recruiter', () => {
    expect(notificationFor(run('running'), run('paused', 'Disk is full'))?.body).toBe('"Campus drive": Disk is full')
  })

  it('stays quiet for pauses that resume by themselves or that the recruiter caused', () => {
    expect(notificationFor(run('running'), run('paused', 'No internet connection', true))).toBeNull()
    expect(notificationFor(run('running'), run('paused', 'Paused by you'))).toBeNull()
    expect(notificationFor(run('running'), run('paused', 'Atlas was closed'))).toBeNull()
    expect(notificationFor(run('paused', 'x'), run('running'))).toBeNull()
  })
})

describe('RunWatcher', () => {
  function watcher(settings = { keep_awake: true, notify_done: true }, focused = false) {
    const keepAwake = { start: vi.fn(() => 7), stop: vi.fn() }
    const notify = vi.fn()
    const request = vi.fn(async (_method: string, path: string) =>
      path === '/settings'
        ? { ok: true as const, status: 200, data: settings }
        : {
            ok: true as const,
            status: 200,
            data: [{ id: 1, name: 'Campus drive', status: 'draft', pause_reason: null, auto_resume: false }],
          },
    )
    const w = new RunWatcher({ request: request as never, keepAwake, notify, windowFocused: () => focused })
    return { w, keepAwake, notify }
  }

  it('keeps the computer awake only while something runs', async () => {
    const { w, keepAwake } = watcher()
    await w.seed()
    expect(keepAwake.start).not.toHaveBeenCalled()
    await w.handle(run('running'))
    expect(w.anyRunning()).toBe(true)
    expect(keepAwake.start).toHaveBeenCalledTimes(1)
    await w.handle(run('paused', 'Paused by you'))
    expect(keepAwake.stop).toHaveBeenCalledWith(7)
    expect(w.holdingKeepAwake()).toBe(false)
  })

  it('picks up a settings change at once', async () => {
    const settings = { keep_awake: true, notify_done: true }
    const { w, keepAwake } = watcher(settings)
    await w.handle(run('running'))
    expect(w.holdingKeepAwake()).toBe(true)
    settings.keep_awake = false
    await w.preferencesChanged()
    expect(keepAwake.stop).toHaveBeenCalledWith(7)
    expect(w.holdingKeepAwake()).toBe(false)
  })

  it('respects "Keep computer awake" off', async () => {
    const { w, keepAwake } = watcher({ keep_awake: false, notify_done: true })
    await w.handle(run('running'))
    expect(keepAwake.start).not.toHaveBeenCalled()
  })

  it('notifies only when the window is not focused and the setting is on', async () => {
    const hidden = watcher()
    await hidden.w.handle(run('running'))
    await hidden.w.handle(run('completed'))
    expect(hidden.notify).toHaveBeenCalledWith('Screening complete', '"Campus drive" is ready to review.')

    const focused = watcher(undefined, true)
    await focused.w.handle(run('completed'))
    expect(focused.notify).not.toHaveBeenCalled()

    const off = watcher({ keep_awake: true, notify_done: false })
    await off.w.handle(run('completed'))
    expect(off.notify).not.toHaveBeenCalled()
  })
})

describe('restoreBounds', () => {
  const screen = [{ x: 0, y: 0, width: 1920, height: 1040 }]

  it('uses the default when nothing sane was saved', () => {
    expect(restoreBounds(null, screen)).toEqual({ width: 1280, height: 800, maximized: false })
    expect(restoreBounds({ width: 'big' }, screen)).toEqual({ width: 1280, height: 800, maximized: false })
  })

  it('keeps a saved position that is on a screen, enforcing the minimum size', () => {
    expect(restoreBounds({ x: 100, y: 50, width: 900, height: 500, maximized: true }, screen)).toEqual({
      x: 100,
      y: 50,
      width: 1100,
      height: 720,
      maximized: true,
    })
  })

  it('opens at 1280×800, or the work area if smaller, never below the minimum', () => {
    expect(defaultBounds({ x: 0, y: 0, width: 1920, height: 1040 })).toEqual({
      width: 1280,
      height: 800,
      maximized: false,
    })
    // A 1440×900 MacBook Air less its menu bar and Dock.
    expect(defaultBounds({ x: 0, y: 25, width: 1440, height: 790 })).toEqual({
      width: 1280,
      height: 790,
      maximized: false,
    })
    // A 1024×768 screen (a CI Mac): the minimum, not something smaller.
    expect(defaultBounds({ x: 0, y: 25, width: 1024, height: 743 })).toEqual({
      width: 1100,
      height: 743,
      maximized: false,
    })
    expect(defaultBounds({ x: 0, y: 25, width: 1024, height: 700 })).toEqual({
      width: 1100,
      height: 720,
      maximized: false,
    })
    expect(defaultBounds()).toEqual({ width: 1280, height: 800, maximized: false })
    expect(restoreBounds(null, [{ x: 0, y: 25, width: 1200, height: 760 }])).toEqual({
      width: 1200,
      height: 760,
      maximized: false,
    })
  })

  it('shrinks a saved size to the work area of the screen it opens on', () => {
    const laptop = { x: 0, y: 0, width: 1440, height: 860 }
    const monitor = { x: 1440, y: 0, width: 2560, height: 1400 }
    expect(restoreBounds({ x: 1500, y: 50, width: 2400, height: 1300 }, [laptop, monitor])).toMatchObject({
      x: 1500,
      width: 2400,
      height: 1300,
    })
    expect(restoreBounds({ x: 100, y: 50, width: 2400, height: 1300 }, [laptop, monitor])).toMatchObject({
      x: 100,
      width: 1440,
      height: 860,
    })
    // The monitor is gone: the primary display's work area.
    expect(restoreBounds({ x: 1500, y: 50, width: 2400, height: 1300 }, [laptop])).toEqual({
      width: 1440,
      height: 860,
      maximized: false,
    })
  })

  it('drops a position on a screen that is gone', () => {
    const bounds = restoreBounds({ x: 3000, y: 50, width: 1300, height: 900 }, screen)
    expect(bounds.x).toBeUndefined()
    expect(bounds.width).toBe(1300)
  })
})
