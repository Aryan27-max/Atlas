// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EngineState } from '@shared/bridge'
import { App } from '../App'
import { arrive } from '../design/motion'
import { Splash, arrival } from './Splash'

const tokens = readFileSync(join(__dirname, '..', 'design', 'tokens.css'), 'utf8')
const splashCss = readFileSync(join(__dirname, 'splash.css'), 'utf8')

/** The declarations of `--name` in the CSS block that starts with `selectorStart`. */
function declared(selectorStart: string, name: string): string[] {
  const start = tokens.indexOf(selectorStart)
  if (start < 0) throw new Error(`no block ${selectorStart}`)
  let depth = 0
  let end = start
  for (let i = tokens.indexOf('{', start); i < tokens.length; i++) {
    if (tokens[i] === '{') depth++
    if (tokens[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  return [...tokens.slice(start, end).matchAll(new RegExp(`--${name}:\\s*([^;]+);`, 'g'))].map((m) =>
    (m[1] ?? '').trim(),
  )
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the start-up screen colour', () => {
  it('is #F5F5F7 in both themes: one theme-independent token, never themed', () => {
    expect(declared('/* Theme-independent tokens */\n:root {', 'atl-splash-bg')).toEqual(['#f5f5f7'])
    expect(declared(":root,\n[data-theme='light']", 'atl-splash-bg')).toEqual([])
    expect(declared("[data-theme='dark'] {", 'atl-splash-bg')).toEqual([])
    expect(declared('@media (prefers-color-scheme: dark)', 'atl-splash-bg')).toEqual([])
    expect([...tokens.matchAll(/--atl-splash-bg:/g)]).toHaveLength(1)
  })

  it('is what the page and the splash paint, edge to edge', () => {
    expect(splashCss).toMatch(
      /html\[data-splash\],\s*html\[data-splash\] body \{\s*background: var\(--atl-splash-bg\);/,
    )
    expect(splashCss).toMatch(/\.splash \{[^}]*position: fixed;[^}]*inset: 0;[^}]*background: var\(--atl-splash-bg\);/)
    expect(readFileSync(join(__dirname, '..', 'index.html'), 'utf8')).toContain('<html lang="en" data-splash>')
  })
})

describe('how "hello" arrives', () => {
  it('fades in while growing from 98%, on the slowed gentle spring', () => {
    expect(arrival(false)).toEqual({
      initial: { opacity: 0, scale: 0.98 },
      animate: { opacity: 1, scale: 1 },
      transition: arrive,
    })
    expect(arrive).toMatchObject({ type: 'spring' })
  })

  it('with reduced motion: a plain fade, no transform at all', () => {
    const { initial, animate } = arrival(true)
    expect(initial).toEqual({ opacity: 0 })
    expect(animate).toEqual({ opacity: 1 })
  })
})

describe('Splash', () => {
  it('is a status named "Atlas is starting" with the hello art, and nothing to focus', () => {
    const { container } = render(<Splash phase="showing" slow={false} drawn={false} shownAt={12.3} leftAt={null} />)
    const status = screen.getByRole('status', { name: 'Atlas is starting' })
    const hello = screen.getByRole('img', { name: 'hello' })
    expect(status.contains(hello)).toBe(true)
    // Drawn in: hello-drawn.svg, as a file or (small enough for Vite to inline) a data: URL with its <animate>s.
    expect(hello.getAttribute('src')).toMatch(/hello-drawn\.svg$|^data:image\/svg\+xml,.*%3canimate/)
    expect(status.dataset).toMatchObject({ theme: 'light', phase: 'showing', shownAt: '12' })
    expect(container.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0)
    expect(screen.queryByText('Still starting…')).toBeNull()
    // Full motion: it starts at 98% (a transform) and fades in.
    expect(hello.style.transform).toContain('scale(0.98)')
  })

  it('says "Still starting…" when the engine is slow', () => {
    render(<Splash phase="showing" slow drawn={false} shownAt={0} leftAt={null} />)
    expect(screen.getByRole('status').textContent).toContain('Still starting…')
  })
})

describe('the app under the start-up screen', () => {
  let engineListener: ((state: EngineState) => void) | null
  const splashDone = vi.fn(async () => undefined)

  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    document.documentElement.dataset.splash = ''
    splashDone.mockClear()
    engineListener = null
    Object.assign(window, {
      atlas: {
        app: {
          info: async () => ({ platform: 'win32', version: '0.0.0', packaged: false, e2e: true, material: false }),
          engineState: async () => ({ state: 'starting' }),
          onEngineState: (listener: (state: EngineState) => void) => {
            engineListener = listener
            return () => {
              engineListener = null
            }
          },
          onNavigate: () => () => undefined,
          restartEngine: async () => undefined,
          splashDone,
        },
      },
    })
  })

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  it('stays out of reach until it leaves, and a failed engine hands over to "Atlas couldn\'t start"', async () => {
    const { container } = render(<App />)
    await advance(0)
    const content = container.querySelector('.app-content') as HTMLElement
    expect(content.hasAttribute('inert')).toBe(true)
    expect(screen.getByRole('status', { name: 'Atlas is starting' }).dataset.phase).toBe('showing')

    act(() => engineListener?.({ state: 'failed', message: "Atlas's engine wasn't found. Reinstall Atlas." }))
    // Esc does nothing.
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    await advance(3199) // with motion, it stays until "hello" is drawn
    expect(screen.getByRole('status', { name: 'Atlas is starting' }).dataset.phase).toBe('showing')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(splashDone).not.toHaveBeenCalled()

    await advance(1)
    // Leaving: the error screen is added under the fading splash, live (not inert).
    expect(screen.getByRole('status', { name: 'Atlas is starting' }).dataset.phase).toBe('leaving')
    expect(content.hasAttribute('inert')).toBe(false)
    expect(screen.getByRole('alert').textContent).toContain("Atlas couldn't start")
    expect(splashDone).toHaveBeenCalledTimes(1)
    expect(document.documentElement.dataset.splash).toBeUndefined()

    await advance(300)
    expect(screen.queryByRole('status', { name: 'Atlas is starting' })).toBeNull()
    expect(screen.getByRole('heading', { name: "Atlas couldn't start" })).toBeTruthy()
  })

  it('at the 15 s cap hands over to "Starting Atlas…" when the engine is still starting', async () => {
    render(<App />)
    await advance(14_999)
    expect(screen.getByRole('status', { name: 'Atlas is starting' }).textContent).toContain('Still starting…')
    await advance(1)
    await advance(300)
    expect(screen.queryByRole('status', { name: 'Atlas is starting' })).toBeNull()
    expect(screen.getByText('Starting Atlas…')).toBeTruthy()
  })
})
