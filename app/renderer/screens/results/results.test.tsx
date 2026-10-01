// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ResultRowOut } from '@shared/api-types'
import { describeDelta } from './CutoffPopover'
import { ResultList, type SortColumn } from './ResultList'

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

describe('ResultList: headers, selection and the right-click menu', () => {
  const four = [row(1), row(2), row(3), row(4)]

  function Harness(props: {
    rows?: ResultRowOut[]
    onOpen?: (row: ResultRowOut) => void
    onSort?: (column: SortColumn) => void
    onMenu?: (row: ResultRowOut, ids: number[]) => void
  }) {
    const [selected, setSelected] = useState<number[]>([])
    return (
      <>
        <ResultList
          rows={props.rows ?? four}
          label="Shortlisted candidates"
          variant="scored"
          onOpen={props.onOpen ?? (() => {})}
          sorted={{ column: 'rank', order: 'asc' }}
          onSort={props.onSort}
          selected={selected}
          onSelect={setSelected}
          onMenu={props.onMenu}
        />
        <output data-testid="selected">{selected.join(',')}</output>
      </>
    )
  }
  const selected = (): string | null => screen.getByTestId('selected').textContent
  const rowEl = (n: number): HTMLElement => document.getElementById(`row-${n}`) as HTMLElement

  it('title-case headers ask the engine to sort; the sorted one shows its direction', () => {
    const onSort = vi.fn()
    render(<Harness onSort={onSort} />)
    const header = screen.getByRole('group', { name: 'Sort by' })
    expect(header.textContent).toBe('RankNameDepartmentCGPAScore')
    const rank = screen.getByRole('button', { name: /^Rank/ })
    expect(rank.getAttribute('aria-pressed')).toBe('true')
    expect(rank.querySelector('svg')?.getAttribute('aria-label')).toBe('ascending')
    expect(screen.getByRole('button', { name: 'Name' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(onSort).toHaveBeenCalledWith('name')
  })

  it('click selects and opens; Ctrl-click adds or removes; Shift-click selects a range', () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)
    fireEvent.click(rowEl(2))
    expect(selected()).toBe('2')
    expect(onOpen).toHaveBeenCalledTimes(1)
    fireEvent.click(rowEl(4), { ctrlKey: true })
    expect(selected()).toBe('2,4')
    fireEvent.click(rowEl(2), { ctrlKey: true })
    expect(selected()).toBe('4')
    fireEvent.click(rowEl(1), { shiftKey: true })
    expect(selected()).toBe('1,2')
    expect(onOpen).toHaveBeenCalledTimes(1) // only the plain click opened a candidate
    expect(rowEl(1).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('listbox').getAttribute('aria-multiselectable')).toBe('true')
  })

  it('keyboard: arrows select, Shift+arrows extend, Ctrl+A selects all', () => {
    render(<Harness />)
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(selected()).toBe('2')
    fireEvent.keyDown(list, { key: 'ArrowDown', shiftKey: true })
    expect(selected()).toBe('2,3')
    fireEvent.keyDown(list, { key: 'a', ctrlKey: true })
    expect(selected()).toBe('1,2,3,4')
  })

  it('right-click: an unselected row alone; inside a selection, the whole selection', () => {
    const onMenu = vi.fn()
    render(<Harness onMenu={onMenu} />)
    fireEvent.click(rowEl(1), { ctrlKey: true })
    fireEvent.click(rowEl(3), { ctrlKey: true })
    fireEvent.contextMenu(rowEl(3))
    expect(onMenu).toHaveBeenLastCalledWith(expect.objectContaining({ candidate_id: 3 }), [1, 3])
    fireEvent.contextMenu(rowEl(2))
    expect(selected()).toBe('2')
    expect(onMenu).toHaveBeenLastCalledWith(expect.objectContaining({ candidate_id: 2 }), [2])
    // The keyboard's context-menu key (or Shift+F10) lands on the list itself: the active row.
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    fireEvent.contextMenu(list)
    expect(onMenu).toHaveBeenLastCalledWith(expect.objectContaining({ candidate_id: 3 }), [3])
  })

  it('a missing name says so, in the secondary style', () => {
    render(<Harness rows={[row(1, { name: '' })]} />)
    expect(screen.getByText('Name not given').className).toBe('result-name-missing')
    expect(screen.queryByText('No name')).toBeNull()
  })
})
