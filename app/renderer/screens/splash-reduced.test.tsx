// @vitest-environment jsdom
// Its own file: motion reads the reduced-motion preference once per module.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Splash } from './Splash'

beforeAll(() => {
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Splash with reduced motion', () => {
  it('only fades: "hello" never has a transform', async () => {
    render(<Splash phase="showing" slow={false} drawn={false} shownAt={0} leftAt={null} />)
    const hello = screen.getByRole('img', { name: 'hello' })
    expect(hello.style.transform).toBe('')
    expect(hello.style.opacity).toBe('0')
    // The finished lettering, not the drawing.
    expect(hello.getAttribute('src')).not.toMatch(/hello-drawn|%3canimate/)
    // However far the fade has got.
    await act(async () => {
      await new Promise((done) => setTimeout(done, 50))
    })
    expect(hello.style.transform).toBe('')
  })
})
