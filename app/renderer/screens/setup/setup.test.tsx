// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelsOut } from '@shared/api-types'
import { ModelPicker } from './ModelPicker'

const SLOW = "This model works, but it's slow on this computer: about 24 résumés an hour."

function models(slow: boolean): ModelsOut {
  return {
    ollama_running: true,
    suggestions: [],
    models: [
      {
        name: 'qwen3:8b',
        digest: 'd',
        size_bytes: 5_200_000_000,
        precheck: {
          status: 'ready',
          message: slow ? SLOW : 'This model is ready for screening.',
          seconds: 150,
          checked: null,
          slow,
        },
      },
    ],
  }
}

function renderPicker(slow: boolean) {
  const client = new QueryClient()
  return render(
    <QueryClientProvider client={client}>
      <ModelPicker
        data={models(slow)}
        loading={false}
        checking={false}
        selected="qwen3:8b"
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  // The picker's "Get another model" sheet listens to app events through the bridge.
  ;(window as unknown as { atlas: unknown }).atlas = { events: { subscribe: vi.fn(() => () => {}) } }
})
afterEach(cleanup)

describe('ModelPicker', () => {
  it('says when a working model is slow on this computer, without refusing it', () => {
    renderPicker(true)
    expect(screen.getByText(/Ready · slow on this computer/)).toBeTruthy()
    expect(screen.getByText(SLOW)).toBeTruthy()
    expect(screen.getByText(/best screened overnight/)).toBeTruthy()
  })

  it('stays quiet for a model that is simply ready', () => {
    renderPicker(false)
    expect(screen.getByText(/· Ready$/)).toBeTruthy()
    expect(screen.queryByText(/slow on this computer/)).toBeNull()
  })
})
