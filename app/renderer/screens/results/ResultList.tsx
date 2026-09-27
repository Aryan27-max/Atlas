/**
 * The candidate list: virtualised (only the visible rows exist in the DOM,
 * so 2,000 rows scroll smoothly) and keyboard-navigable as a listbox.
 * Every value shown comes from the engine's results rows.
 */

import { useVirtualizer } from '@tanstack/react-virtual'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type { ResultRowOut } from '@shared/api-types'
import { Badge, type PillBucket, ScorePill } from '../../design'

const ROW = 56
const HEADER = 32

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

interface ResultListProps {
  rows: ResultRowOut[]
  label: string
  onOpen: (row: ResultRowOut) => void
  variant: 'scored' | 'filtered'
}

export function ResultList({ rows, label, onOpen, variant }: ResultListProps) {
  const parent = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const virtual = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parent.current,
    estimateSize: () => ROW,
    overscan: 12,
    scrollMargin: HEADER, // the sticky header sits above the rows inside the scroll area
    scrollPaddingStart: HEADER,
  })

  useEffect(() => {
    if (active >= rows.length) setActive(Math.max(0, rows.length - 1))
  }, [rows.length, active])

  const move = (to: number): void => {
    const next = Math.max(0, Math.min(rows.length - 1, to))
    setActive(next)
    virtual.scrollToIndex(next, { align: 'auto' })
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
      move(target)
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && rows[active]) {
      event.preventDefault()
      onOpen(rows[active] as ResultRowOut)
    }
  }

  const activeRow = rows[active]
  return (
    <div
      ref={parent}
      className="result-list"
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={activeRow ? `row-${activeRow.candidate_id}` : undefined}
      onKeyDown={onKey}
    >
      <div className={variant === 'scored' ? 'result-header' : 'result-header result-row--simple'} aria-hidden>
        {variant === 'scored' ? (
          <>
            <span>RANK</span>
            <span>NAME</span>
            <span>DEPARTMENT</span>
            <span>CGPA</span>
            <span>SCORE</span>
            <span />
          </>
        ) : (
          <>
            <span>NAME</span>
            <span>DEPARTMENT</span>
            <span>WHY</span>
          </>
        )}
      </div>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index] as ResultRowOut
          return (
            <div
              key={row.candidate_id}
              id={`row-${row.candidate_id}`}
              role="option"
              aria-selected={item.index === active}
              aria-setsize={rows.length}
              aria-posinset={item.index + 1}
              className={variant === 'scored' ? 'result-row' : 'result-row result-row--simple'}
              style={{ transform: `translateY(${item.start - HEADER}px)` }}
              onClick={() => {
                setActive(item.index)
                onOpen(row)
              }}
            >
              {variant === 'scored' ? <ScoredCells row={row} /> : <FilteredCells row={row} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Name({ row }: { row: ResultRowOut }) {
  return (
    <span className="result-name">
      <span>{row.name || 'No name'}</span>
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
