/**
 * Progress (ARCHITECTURE §18). Everything shown comes from the engine:
 * GET /runs/{id}/progress (refreshed on every run event, and every 5 s as a
 * fallback) and the run's event stream. Candidates appear by id and RA number
 * only, never by name: this screen may be visible over a shoulder.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleDashed,
  Download,
  FileText,
  Pause,
  Play,
  Sparkles,
  X,
} from 'lucide-react'
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import type { EventOut, ProgressOut } from '@shared/api-types'
import type { AtlasEvent } from '@shared/bridge'
import { api, messageOf } from '../api/client'
import { useRunEvents } from '../api/events'
import { Alert, Banner, Button, Card, EmptyState, ProgressRing, Spinner, Toolbar } from '../design'
import { formatClock, formatDuration, plural } from '../format'
import { useNav } from '../state/nav'
import './progress.css'

const STAGES: Array<{ key: keyof ProgressOut['stages']; label: string }> = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'downloading', label: 'Downloading' },
  { key: 'reading', label: 'Reading' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'done', label: 'Done' },
  { key: 'needs_attention', label: 'Needs attention' },
]

const ACTIVITY: Record<'downloading' | 'reading' | 'scoring', string> = {
  downloading: 'Downloading résumé',
  reading: 'Reading résumé',
  scoring: 'Scoring résumé',
}

export function Progress({ runId }: { runId: number }) {
  const go = useNav((state) => state.go)
  const client = useQueryClient()
  const progress = useQuery({
    queryKey: ['progress', runId],
    queryFn: () => api('GET /runs/{run_id}/progress', { params: { run_id: runId } }),
    refetchInterval: 5_000,
  })
  const [events, setEvents] = useState<EventOut[]>([])
  const pending = useRef<number | null>(null)

  const refresh = useCallback((): void => {
    if (pending.current !== null) return
    pending.current = window.setTimeout(() => {
      pending.current = null
      void client.invalidateQueries({ queryKey: ['progress', runId] })
    }, 250)
  }, [client, runId])

  useRunEvents(runId, (event: AtlasEvent) => {
    const data = event.data as EventOut
    setEvents((all) => (all.some((e) => e.id === data.id) ? all : [...all, data].slice(-500)))
    refresh()
  })

  const act = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'cancel') =>
      api(`POST /runs/{run_id}/${action}` as 'POST /runs/{run_id}/pause', { params: { run_id: runId } }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['progress', runId] })
      void client.invalidateQueries({ queryKey: ['runs'] })
    },
  })
  const [confirmCancel, setConfirmCancel] = useState(false)

  const data = progress.data
  if (!data) {
    return (
      <div className="screen">
        <Toolbar windowEdgeLeft />
        <div className="gate" aria-busy="true">
          <Spinner size={24} />
        </div>
      </div>
    )
  }

  const running = data.status === 'running'
  const paused = data.status === 'paused'
  const finished = data.status === 'completed' || data.status === 'cancelled'

  return (
    <div className="screen">
      <Toolbar
        windowEdgeLeft
        title={data.name}
        leading={
          <Button size="small" variant="plain" icon={ChevronLeft} onClick={() => go({ name: 'welcome' })}>
            Home
          </Button>
        }
        trailing={
          !finished && (
            <>
              {running && (
                <Button
                  size="small"
                  icon={Pause}
                  loading={act.isPending && act.variables === 'pause'}
                  onClick={() => act.mutate('pause')}
                >
                  Pause
                </Button>
              )}
              {paused && !data.auto_resume && (
                <Button
                  size="small"
                  variant="primary"
                  icon={Play}
                  loading={act.isPending && act.variables === 'resume'}
                  onClick={() => act.mutate('resume')}
                >
                  Resume
                </Button>
              )}
              <Button size="small" variant="plain" icon={X} onClick={() => setConfirmCancel(true)}>
                Cancel…
              </Button>
            </>
          )
        }
      />
      <div className="screen-scroll">
        <main className="screen-column screen-column--wide">
          {act.isError && <Banner tone="error" title={messageOf(act.error)} />}
          {paused && data.pause_reason && (
            <PauseBanner
              reason={data.pause_reason}
              automatic={data.auto_resume}
              onResume={() => act.mutate('resume')}
              resuming={act.isPending && act.variables === 'resume'}
            />
          )}
          {finished ? <Finished data={data} onResults={() => go({ name: 'results', runId })} /> : <Live data={data} />}
          {data.failures.length > 0 && (
            <NeedsAttention data={data} finished={finished} onResults={() => go({ name: 'results', runId })} />
          )}
          <Feed events={events} total={data.total} />
        </main>
      </div>
      <Alert
        open={confirmCancel}
        title="Cancel this screening?"
        message="Résumés already scored are kept, and you can still see and export them. The rest won't be screened, and this screening can't be started again."
        actions={[
          {
            label: 'Cancel screening',
            variant: 'destructive',
            loading: act.isPending && act.variables === 'cancel',
            onClick: () => act.mutate('cancel', { onSettled: () => setConfirmCancel(false) }),
          },
        ]}
        cancel={{ label: 'Keep screening', onClick: () => setConfirmCancel(false) }}
      />
    </div>
  )
}

function PauseBanner(props: { reason: string; automatic: boolean; onResume: () => void; resuming: boolean }) {
  if (props.automatic) {
    return (
      <Banner tone="warning" title={props.reason}>
        <span className="live-check">
          <Spinner size={12} /> Atlas will continue automatically when this is fixed. Nothing is lost.
        </span>
      </Banner>
    )
  }
  return (
    <Banner
      tone="warning"
      title={props.reason}
      action={{ label: 'Resume', onClick: props.onResume, loading: props.resuming }}
    >
      Nothing is lost. Press Resume to continue where it stopped.
    </Banner>
  )
}

function Live({ data }: { data: ProgressOut }) {
  const fraction = data.total ? data.done / data.total : 0
  const estimate = data.estimate
  const eta = useMemo(() => {
    if (!estimate || data.status !== 'running') return null
    const middle = (estimate.low_seconds + estimate.high_seconds) / 2
    return {
      left: formatDuration(middle),
      soon: middle < 60,
      at: formatClock(new Date(Date.now() + middle * 1000)),
    }
  }, [estimate, data.status])
  return (
    <section className="progress-hero" aria-label="Screening progress">
      <ProgressRing
        value={fraction}
        size={188}
        stroke={14}
        label="Screening progress"
        valueText={`${data.done} of ${data.total} done`}
      >
        <span className="progress-count atl-tabular">{data.done.toLocaleString()}</span>
        <span className="atl-footnote atl-secondary">of {plural(data.total, 'student')}</span>
      </ProgressRing>
      <div className="progress-side">
        <div className="progress-eta" aria-live="polite">
          {data.status === 'paused' ? (
            <span className="atl-title">Paused</span>
          ) : eta ? (
            <>
              <span className="atl-title">{eta.soon ? 'Less than a minute left' : `About ${eta.left} left`}</span>
              <span className="atl-callout atl-secondary">Done around {eta.at}</span>
            </>
          ) : (
            <span className="atl-title">Working out how long…</span>
          )}
          {estimate && (
            <span className={`eta-basis eta-basis--${estimate.basis}`}>
              {estimate.basis === 'measured'
                ? 'Measured'
                : estimate.basis === 'history'
                  ? 'From earlier runs'
                  : 'Rough'}
            </span>
          )}
        </div>
        <dl className="stage-grid">
          {STAGES.map((stage) => (
            <div key={stage.key} className={`stage stage--${stage.key}`} data-zero={data.stages[stage.key] === 0}>
              <dt>{stage.label}</dt>
              <dd className="atl-tabular">{data.stages[stage.key].toLocaleString()}</dd>
            </div>
          ))}
        </dl>
        <div className="activity" aria-live="polite">
          {data.activity.length === 0 ? (
            <span className="atl-callout atl-secondary">
              {data.status === 'running' ? 'Getting the next résumé…' : 'Nothing in progress.'}
            </span>
          ) : (
            data.activity.map((item) => (
              <span key={`${item.stage}-${item.candidate_id}`} className="activity-line">
                {item.stage === 'downloading' ? (
                  <Download aria-hidden size={14} />
                ) : item.stage === 'reading' ? (
                  <FileText aria-hidden size={14} />
                ) : (
                  <Sparkles aria-hidden size={14} />
                )}
                {ACTIVITY[item.stage]} #{item.candidate_id}
                <span className="atl-secondary"> · {item.ra_number}</span>
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function Finished({ data, onResults }: { data: ProgressOut; onResults: () => void }) {
  const cancelled = data.status === 'cancelled'
  return (
    <Card flush>
      <EmptyState
        icon={cancelled ? CircleDashed : CheckCircle2}
        title={cancelled ? 'Screening cancelled' : 'Screening complete'}
        message={`${plural(data.counts.scored, 'résumé')} scored${data.counts.failed ? ` · ${data.counts.failed.toLocaleString()} need attention` : ''}${data.counts.filtered ? ` · ${data.counts.filtered.toLocaleString()} filtered out` : ''}.`}
      />
      <div className="finished-actions">
        <Button variant="primary" size="large" onClick={onResults}>
          View results
        </Button>
      </div>
    </Card>
  )
}

function NeedsAttention({
  data,
  finished,
  onResults,
}: {
  data: ProgressOut
  finished: boolean
  onResults: () => void
}) {
  return (
    <Card
      title="Needs attention"
      subtitle={
        finished
          ? 'These couldn’t be screened. See them in Results to retry or follow up.'
          : 'These couldn’t be screened. You can retry them when screening finishes.'
      }
      accessory={
        finished ? (
          <Button size="small" variant="plain" onClick={onResults}>
            See in Results
          </Button>
        ) : undefined
      }
      labelledBy="needs-attention-title"
    >
      <ul className="failure-list">
        {data.failures.map((group) => (
          <li key={group.reason}>
            <AlertTriangle aria-hidden size={16} className="issue-warning" />
            <span className="failure-reason">{group.reason}</span>
            <span className="atl-tabular failure-count">{group.count.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

interface FeedLine {
  id: number
  time: string
  text: ReactNode
  tone: 'info' | 'warning'
}

/** Milestones and failures only: individual scores would be noise. */
function feedLines(events: EventOut[], total: number): FeedLine[] {
  const lines: FeedLine[] = []
  let scored = 0
  const step = Math.max(10, Math.ceil(total / 10 / 5) * 5)
  for (const event of events) {
    const time = formatClock(new Date(event.created_at))
    if (event.candidate_id === null) {
      lines.push({ id: event.id, time, text: event.message, tone: event.level === 'info' ? 'info' : 'warning' })
    } else if (event.message.startsWith('Failed')) {
      const reason = event.message.replace(/^Failed \((permanent|retryable)\): /, '')
      lines.push({ id: event.id, time, text: `Résumé #${event.candidate_id}: ${reason}`, tone: 'warning' })
    } else if (event.message.startsWith('Scored')) {
      scored += 1
      if (scored % step === 0)
        lines.push({ id: event.id, time, text: `${scored.toLocaleString()} résumés scored`, tone: 'info' })
    }
  }
  return lines.reverse()
}

function Feed({ events, total }: { events: EventOut[]; total: number }) {
  const [open, setOpen] = useState(true)
  const lines = useMemo(() => feedLines(events, total), [events, total])
  return (
    <section className="feed" aria-label="Activity">
      <button type="button" className="feed-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="atl-headline">Activity</span>
        <ChevronDown aria-hidden size={16} className="feed-chevron" />
      </button>
      {open && (
        <ol className="feed-lines" aria-live="off">
          {lines.length === 0 && <li className="atl-callout atl-secondary">Nothing yet.</li>}
          {lines.slice(0, 60).map((line) => (
            <li key={line.id} className={`feed-line feed-line--${line.tone}`}>
              <span className="feed-time atl-tabular">{line.time}</span>
              <span>{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
