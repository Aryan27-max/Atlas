import type { RefObject } from 'react'
import type { BucketDeltaOut, CutoffsOut } from '@shared/api-types'
import { Banner, Button, Popover, ScoreBand, Stepper, Toggle } from '../../design'

interface CutoffPopoverProps {
  open: boolean
  anchor: RefObject<HTMLElement | null>
  value: CutoffsOut
  saved: CutoffsOut
  delta: BucketDeltaOut | undefined
  histogram: number[]
  saving: boolean
  error: string | null
  onChange: (value: CutoffsOut) => void
  onSave: () => void
  onReset: () => void
  onClose: () => void
}

const NAMES: Array<[keyof BucketDeltaOut, string]> = [
  ['shortlisted', 'Shortlisted'],
  ['cutoff', 'Cutoff'],
  ['rejected', 'Rejected'],
]

/** "+12 to Shortlisted, −12 from Cutoff" (the engine computes the numbers). */
export function describeDelta(delta: BucketDeltaOut | undefined): string {
  if (!delta) return ''
  const parts = NAMES.filter(([key]) => delta[key] !== 0).map(([key, name]) =>
    delta[key] > 0 ? `+${delta[key]} to ${name}` : `−${Math.abs(delta[key])} from ${name}`,
  )
  return parts.join(', ')
}

export function CutoffPopover(props: CutoffPopoverProps) {
  const { value, saved, delta } = props
  const changed = value.shortlist !== saved.shortlist || value.band !== saved.band || value.min !== saved.min
  const peak = Math.max(1, ...props.histogram)
  const moves = describeDelta(delta)
  return (
    <Popover open={props.open} onClose={props.onClose} anchor={props.anchor} label="Adjust cutoffs" width={480}>
      <div className="cutoff-pop">
        <h2 className="atl-headline">Adjust cutoffs</h2>
        <div className="histogram" aria-hidden>
          {props.histogram.map((count, i) => (
            <span key={i} style={{ height: `${(count / peak) * 100}%` }} />
          ))}
        </div>
        <ScoreBand
          value={{ shortlist: value.shortlist, band: value.band }}
          onChange={(band) => props.onChange({ ...value, shortlist: band.shortlist, band: band.band })}
        />
        <Toggle
          checked={value.min > 0}
          onChange={(on) => props.onChange({ ...value, min: on ? Math.max(1, saved.min || 10) : 0 })}
          label="Always shortlist at least"
          description="Filled candidates are marked, and ties are all included."
        />
        {value.min > 0 && (
          <Stepper
            label="Minimum shortlisted"
            value={value.min}
            min={1}
            max={100000}
            onChange={(min) => props.onChange({ ...value, min })}
          />
        )}
        <p className="cutoff-delta" role="status" aria-live="polite">
          {changed ? moves || 'No one moves.' : 'These are the saved cutoffs.'}
        </p>
        {props.error && <Banner tone="error" title={props.error} />}
        <div className="cutoff-pop-actions">
          <Button onClick={props.onReset} disabled={!changed}>
            Reset
          </Button>
          <Button variant="primary" onClick={props.onSave} disabled={!changed} loading={props.saving}>
            Save cutoffs
          </Button>
        </div>
      </div>
    </Popover>
  )
}
