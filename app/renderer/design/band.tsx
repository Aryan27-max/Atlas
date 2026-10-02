import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef, useState } from 'react'
import { cx } from './cx'

// ---------------------------------------------------------------------- Chip

export interface ChipProps {
  pressed?: boolean
  onClick: () => void
  children: ReactNode
  /** Extra text for screen readers, e.g. a count. */
  description?: string
}

/** A small toggle (templates, department filters). */
export function Chip({ pressed, onClick, children, description }: ChipProps) {
  return (
    <button type="button" className="atl-chip" aria-pressed={pressed} onClick={onClick} aria-description={description}>
      {children}
    </button>
  )
}

// ----------------------------------------------------------------- ScoreBand

export interface Band {
  shortlist: number
  band: number
}

export interface ScoreBandProps {
  value: Band
  onChange: (value: Band) => void
  label?: string
}

type Handle = 'band' | 'shortlist'

const HANDLE_LABEL: Record<Handle, string> = {
  band: 'Cutoff band starts at',
  shortlist: 'Shortlist score',
}

/**
 * 0–100 with two handles: where the cutoff band starts and where the
 * shortlist starts. The three zones are labelled and coloured by bucket.
 * The handles can't cross (the band always starts at or below the shortlist);
 * whether the values are valid is still the engine's call.
 */
export function ScoreBand({ value, onChange, label = 'Score bands' }: ScoreBandProps) {
  const track = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<Handle | null>(null)
  const { shortlist, band } = value
  // What the handles last asked for. A key press that arrives before the parent
  // re-renders builds on it, so every press counts however busy the screen is.
  const latest = useRef(value)
  latest.current = value

  const set = (handle: Handle, raw: number): void => {
    const v = Math.round(Math.min(100, Math.max(0, raw)))
    const now = latest.current
    const next =
      handle === 'shortlist'
        ? { shortlist: Math.max(v, now.band), band: now.band }
        : { shortlist: now.shortlist, band: Math.min(v, now.shortlist) }
    latest.current = next
    onChange(next)
  }

  const valueAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return ((clientX - rect.left) / rect.width) * 100
  }

  const onKey =
    (handle: Handle) =>
    (event: KeyboardEvent<HTMLElement>): void => {
      const current = latest.current[handle]
      const next = {
        ArrowRight: current + 1,
        ArrowUp: current + 1,
        ArrowLeft: current - 1,
        ArrowDown: current - 1,
        PageUp: current + 10,
        PageDown: current - 10,
        Home: 0,
        End: 100,
      }[event.key]
      if (next === undefined) return
      event.preventDefault()
      set(handle, next)
    }

  const onTrackDown = (event: PointerEvent<HTMLDivElement>): void => {
    if ((event.target as HTMLElement).closest('.atl-band-thumb')) return
    const v = valueAt(event.clientX)
    const handle: Handle = Math.abs(v - shortlist) <= Math.abs(v - band) ? 'shortlist' : 'band'
    set(handle, v)
  }

  const thumb = (handle: Handle): ReactNode => {
    const current = handle === 'shortlist' ? shortlist : band
    return (
      <span
        className={cx('atl-band-thumb', `atl-band-thumb--${handle}`)}
        role="slider"
        tabIndex={0}
        aria-label={HANDLE_LABEL[handle]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={current}
        style={{ left: `${current}%` }}
        onKeyDown={onKey(handle)}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.focus()
          setDragging(handle)
        }}
        onPointerMove={(event) => {
          if (dragging === handle) set(handle, valueAt(event.clientX))
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          setDragging(null)
        }}
      >
        <span className="atl-band-value" aria-hidden>
          {current}
        </span>
      </span>
    )
  }

  const zones = [
    { key: 'rejected', name: 'Rejected', from: 0, to: band },
    { key: 'cutoff', name: 'Cutoff', from: band, to: shortlist },
    { key: 'shortlisted', name: 'Shortlisted', from: shortlist, to: 100 },
  ]
  return (
    <div className={cx('atl-band', dragging && 'atl-band--dragging')} role="group" aria-label={label}>
      <div className="atl-band-track" ref={track} onPointerDown={onTrackDown}>
        {zones.map((zone) => (
          <div
            key={zone.key}
            className={`atl-band-zone atl-band-zone--${zone.key}`}
            style={{ left: `${zone.from}%`, width: `${Math.max(0, zone.to - zone.from)}%` }}
          >
            {zone.to - zone.from >= 8 && <span>{zone.name}</span>}
          </div>
        ))}
        {thumb('band')}
        {thumb('shortlist')}
      </div>
      <div className="atl-band-scale" aria-hidden>
        {[0, 25, 50, 75, 100].map((tick) => (
          <span key={tick} style={{ left: `${tick}%` }}>
            {tick}
          </span>
        ))}
      </div>
    </div>
  )
}
