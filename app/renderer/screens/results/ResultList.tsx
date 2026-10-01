/**
 * The candidate list: virtualised (only the visible rows exist in the DOM,
 * so 2,000 rows scroll smoothly) and keyboard-navigable as a listbox.
 * Every value shown comes from the engine's results rows, in the engine's
 * order: a column header asks the engine to sort, it doesn't sort here.
 *
 * Selection works like a native table: click selects one row (and opens it),
 * Shift-click selects a range, Cmd-click (macOS) or Ctrl-click (Windows) adds
 * or removes one row; Shift+arrows extend, Cmd/Ctrl+A selects all. A
 * right-click asks main for the native menu.
 */

import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { ResultRowOut, ResultsOut } from '@shared/api-types'
import { Badge, type PillBucket, ScorePill, cx } from '../../design'

const ROW = 56

export type SortColumn = ResultsOut['sort']
export type SortOrder = ResultsOut['order']

const LINK: Record<ResultRowOut['link_kind'], string> = {
  drive_file: 'Drive file',
  google_doc: 'Google Doc',
  folder: 'Drive folder',
  web: 'Web link',
  invalid: 'Not a link',
}

export function linkLabel(kind: ResultRowOut['link_kind']): string {
  return LINK[kind]
}

interface Column {
  label: string
  sort?: SortColumn
}

const COLUMNS: Record<'scored' | 'filtered', Column[]> = {
  scored: [
    { label: 'Rank', sort: 'rank' },
    { label: 'Name', sort: 'name' },
    { label: 'Department', sort: 'department' },
    { label: 'CGPA', sort: 'cgpa' },
    { label: 'Score', sort: 'score' },
    { label: '' },
  ],
  filtered: [{ label: 'Name', sort: 'name' }, { label: 'Department', sort: 'department' }, { label: 'Why' }],
}

const NO_SELECTION: readonly number[] = []

interface ResultListProps {
  rows: ResultRowOut[]
  label: string
  onOpen: (row: ResultRowOut) => void
  variant: 'scored' | 'filtered'
  /** How the engine sorted these rows (the header shows it). */
  sorted?: { column: SortColumn; order: SortOrder }
  onSort?: (column: SortColumn) => void
  /** Selected candidate ids (controlled). */
  selected?: readonly number[]
  onSelect?: (ids: number[]) => void
  /** Right-click (or the context-menu key) on a row: the row, and the ids the menu acts on. */
  onMenu?: (row: ResultRowOut, ids: number[]) => void
}

function isMac(): boolean {
  return document.documentElement.dataset.platform === 'darwin'
}

export function ResultList({
  rows,
  label,
  onOpen,
  variant,
  sorted,
  onSort,
  selected = NO_SELECTION,
  onSelect,
  onMenu,
}: ResultListProps) {
  const parent = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const anchor = useRef<number | null>(null) // where a Shift range starts
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => ROW,
    overscan: 12,
  })

  useEffect(() => {
    if (active >= rows.length) setActive(Math.max(0, rows.length - 1))
  }, [rows.length, active])

  const select = (ids: number[]): void => onSelect?.(ids)
  const range = (from: number, to: number): number[] =>
    rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((row) => row.candidate_id)

  const move = (to: number, extend: boolean): void => {
    const next = Math.max(0, Math.min(rows.length - 1, to))
    const row = rows[next]
    if (!row) return
    setActive(next)
    virtual.scrollToIndex(next, { align: 'auto' })
    if (extend) {
      select(range(anchor.current ?? active, next))
    } else {
      anchor.current = next
      select([row.candidate_id])
    }
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const page = Math.max(1, Math.floor((parent.current?.clientHeight ?? 400) / ROW) - 1)
    const target = {
      ArrowDown: active + 1,
      ArrowUp: active - 1,
      PageDown: active + page,
      PageUp: active - page,
      Home: 0,
      End: rows.length - 1,
    }[event.key]
    if (target !== undefined) {
      event.preventDefault()
      move(target, event.shiftKey)
      return
    }
    if ((isMac() ? event.metaKey : event.ctrlKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      select(rows.map((row) => row.candidate_id))
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && rows[active]) {
      event.preventDefault()
      onOpen(rows[active] as ResultRowOut)
    }
  }

  const onRowClick = (event: MouseEvent, index: number, row: ResultRowOut): void => {
    setActive(index)
    if (event.shiftKey && anchor.current !== null) {
      select(range(anchor.current, index))
      return
    }
    anchor.current = index
    if (isMac() ? event.metaKey : event.ctrlKey) {
      select(
        selectedSet.has(row.candidate_id)
          ? selected.filter((id) => id !== row.candidate_id)
          : [...selected, row.candidate_id],
      )
      return
    }
    select([row.candidate_id])
    onOpen(row)
  }

  // A right-click on a row, or the keyboard's context-menu key on the list (the active row).
  const onContextMenu = (event: MouseEvent<HTMLDivElement>): void => {
    if (!onMenu) return
    const hit = (event.target as HTMLElement).closest<HTMLElement>('[data-index]')
    const index = hit ? Number(hit.dataset.index) : active
    const row = rows[index]
    if (!row) return
    event.preventDefault()
    setActive(index)
    let ids = [...selected]
    if (!selectedSet.has(row.candidate_id)) {
      anchor.current = index
      ids = [row.candidate_id]
      select(ids)
    }
    onMenu(row, ids)
  }

  const activeRow = rows[active]
  return (
    <div className={cx('result-table', variant === 'filtered' && 'result-table--simple')}>
      <div className="result-header" role="group" aria-label="Sort by">
        {COLUMNS[variant].map((column, i) =>
          column.sort ? (
            <SortButton
              key={column.label}
              label={column.label}
              order={sorted?.column === column.sort ? sorted.order : null}
              onClick={() => onSort?.(column.sort as SortColumn)}
            />
          ) : (
            <span key={`column-${i}`}>{column.label}</span>
          ),
        )}
      </div>
      <div
        ref={parent}
        className="result-list"
        role="listbox"
        aria-label={label}
        aria-multiselectable="true"
        tabIndex={0}
        aria-activedescendant={activeRow ? `row-${activeRow.candidate_id}` : undefined}
        onKeyDown={onKey}
        onContextMenu={onContextMenu}
      >
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((item) => {
            const row = rows[item.index] as ResultRowOut
            return (
              <div
                key={row.candidate_id}
                id={`row-${row.candidate_id}`}
                data-index={item.index}
                role="option"
                aria-selected={selectedSet.has(row.candidate_id)}
                aria-setsize={rows.length}
                aria-posinset={item.index + 1}
                className={cx(
                  'result-row',
                  variant === 'filtered' && 'result-row--simple',
                  item.index === active && 'is-active',
                )}
                style={{ transform: `translateY(${item.start}px)` }}
                onClick={(event) => onRowClick(event, item.index, row)}
              >
                {variant === 'scored' ? <ScoredCells row={row} /> : <FilteredCells row={row} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SortButton({ label, order, onClick }: { label: string; order: SortOrder | null; onClick: () => void }) {
  const Arrow = order === 'asc' ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      className="result-sort"
      aria-pressed={order !== null}
      title={order === null ? `Sort by ${label.toLowerCase()}` : 'Click to reverse the order'}
      onClick={onClick}
    >
      {label}
      {order !== null && (
        <Arrow aria-label={order === 'asc' ? 'ascending' : 'descending'} size={12} strokeWidth={2.25} />
      )}
    </button>
  )
}

function Name({ row }: { row: ResultRowOut }) {
  return (
    <span className="result-name">
      {row.name ? <span>{row.name}</span> : <span className="result-name-missing">Name not given</span>}
      <span>{row.ra_number}</span>
    </span>
  )
}

function ScoredCells({ row }: { row: ResultRowOut }) {
  const bucket: PillBucket =
    row.bucket === 'shortlisted' || row.bucket === 'cutoff' || row.bucket === 'rejected' ? row.bucket : 'none'
  return (
    <>
      <span className="result-rank" aria-label={row.rank ? `Rank ${row.rank}` : undefined}>
        {row.rank ?? '–'}
      </span>
      <Name row={row} />
      <span className="result-cell">{row.department || '–'}</span>
      <span className="result-cell">{row.cgpa !== null ? row.cgpa.toFixed(2) : '–'}</span>
      <span>{row.score !== null ? <ScorePill score={row.score} bucket={bucket} /> : '–'}</span>
      <span className="result-badges">
        {row.how_placed === 'fill' && <Badge tone="accent">Filled to minimum</Badge>}
        {row.how_placed === 'override' && <Badge>Moved by you</Badge>}
        {row.tie && <Badge tone="warning">Tie</Badge>}
        {row.flags > 0 && <Badge tone="danger">{row.flags === 1 ? '1 flag' : `${row.flags} flags`}</Badge>}
      </span>
    </>
  )
}

function FilteredCells({ row }: { row: ResultRowOut }) {
  return (
    <>
      <Name row={row} />
      <span className="result-cell">{row.department || '–'}</span>
      <span className="result-reason">{row.filter_reason ?? 'Not screened yet'}</span>
    </>
  )
}
