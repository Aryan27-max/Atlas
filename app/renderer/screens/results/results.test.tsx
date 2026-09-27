// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ResultRowOut } from '@shared/api-types'
import { describeDelta } from './CutoffPopover'
import { ResultList } from './ResultList'

// jsdom has no layout; give elements a size so the virtual list renders rows.
const sized = ['offsetHeight', 'offsetWidth', 'clientHeight', 'clientWidth'] as const
const original = new Map<string, PropertyDescriptor | undefined>()
beforeAll(() => {
  for (const key of sized) {
    original.set(key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key))
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => 800 })
  }
})
afterAll(() => {
  for (const key of sized) {
    const descriptor = original.get(key)
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor)
    else Reflect.deleteProperty(HTMLElement.prototype, key)
  }
})
afterEach(cleanup)

function row(n: number, extra: Partial<ResultRowOut> = {}): ResultRowOut {
  return {
    candidate_id: n,
    ra_number: `RA${String(n).padStart(6, '0')}`,
    name: `Student ${n}`,
    department: 'CSE',
    cgpa: 9,
    flags: 0,
    score: 90 - n,
    bucket: 'shortlisted',
    auto_bucket: 'shortlisted',
    how_placed: 'score',
    rank: n,
    tie: false,
    failure_kind: null,
    failure_reason: null,
    filter_reason: null,
    link_kind: 'drive_file',
    ...extra,
  }
}

describe('describeDelta', () => {
  it('says what moves, in bucket order, with a real minus sign', () => {
    expect(describeDelta({ shortlisted: -7, cutoff: 7, rejected: 0 })).toBe('−7 from Shortlisted, +7 to Cutoff')
    expect(describeDelta({ shortlisted: 2, cutoff: 0, rejected: -2 })).toBe('+2 to Shortlisted, −2 from Rejected')
  })
  it('is empty when nothing moves or there is no preview', () => {
    expect(describeDelta({ shortlisted: 0, cutoff: 0, rejected: 0 })).toBe('')
    expect(describeDelta(undefined)).toBe('')
  })
})

describe('ResultList', () => {
  it('shows what the engine sent: rank, score, fill and override badges', () => {
    const rows = [
      row(1),
      row(2, { how_placed: 'fill' }),
      row(3, { how_placed: 'override', bucket: 'shortlisted', auto_bucket: 'rejected' }),
    ]
    render(<ResultList rows={rows} label="Shortlisted candidates" onOpen={() => {}} variant="scored" />)
    expect(screen.getByRole('listbox', { name: 'Shortlisted candidates' })).toBeTruthy()
    expect(screen.getByText('Filled to minimum')).toBeTruthy()
    expect(screen.getByText('Moved by you')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Score 89, Shortlisted' })).toBeTruthy()
  })

  it('arrow keys move the active row; Enter opens it', () => {
    const onOpen = vi.fn()
    render(
      <ResultList rows={[row(1), row(2), row(3)]} label="Shortlisted candidates" onOpen={onOpen} variant="scored" />,
    )
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ candidate_id: 3 }))
    fireEvent.keyDown(list, { key: 'Home' })
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ candidate_id: 1 }))
  })
})
