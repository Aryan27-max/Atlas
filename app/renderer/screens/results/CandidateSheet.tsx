import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { CandidateOut } from '@shared/api-types'
import { api, messageOf } from '../../api/client'
import { Badge, Banner, Button, KeyValue, Select, Sheet, Spinner, TextField } from '../../design'
import { formatClock, formatDate, formatPerResume } from '../../format'
import { linkLabel } from './ResultList'

const SUBSCORES: Array<[string, string]> = [
  ['technical', 'Technical'],
  ['projects', 'Projects'],
  ['experience', 'Experience'],
  ['achievements', 'Achievements'],
  ['communication', 'Communication'],
  ['criteria_fit', 'Criteria fit'],
]

const BUCKETS = [
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'cutoff', label: 'Cutoff' },
  { value: 'rejected', label: 'Rejected' },
] as const

type BucketName = (typeof BUCKETS)[number]['value']

const PLACED: Record<string, string> = { score: 'By score', fill: 'Filled to minimum', override: 'Moved by you' }

export function CandidateSheet({
  runId,
  candidateId,
  onClose,
}: {
  runId: number
  candidateId: number | null
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['candidate', runId, candidateId],
    queryFn: () =>
      api('GET /runs/{run_id}/candidates/{candidate_id}', {
        params: { run_id: runId, candidate_id: candidateId as number },
      }),
    enabled: candidateId !== null,
  })
  const data = detail.data
  return (
    <Sheet
      open={candidateId !== null}
      onClose={onClose}
      size="large"
      title={data ? data.candidate.name || data.candidate.ra_number : 'Candidate'}
      description={
        data
          ? [
              data.candidate.ra_number,
              data.candidate.department,
              data.candidate.cgpa !== null ? `CGPA ${data.candidate.cgpa.toFixed(2)}` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
    >
      {!data ? (
        <div className="model-note">
          <Spinner size={16} /> Loading…
        </div>
      ) : (
        <Detail data={data} runId={runId} />
      )}
    </Sheet>
  )
}

function Detail({ data, runId }: { data: CandidateOut; runId: number }) {
  const { candidate, evaluation, placement, resume } = data
  if (!evaluation || !placement) {
    return (
      <div className="detail">
        {candidate.failure_reason && (
          <Banner tone="error" title="Couldn't be screened">
            {candidate.failure_reason}
          </Banner>
        )}
        {candidate.filter_reason && (
          <Banner tone="info" title="Filtered out before scoring">
            {candidate.filter_reason}
          </Banner>
        )}
        <KeyValue
          items={[
            { key: 'Résumé link', value: linkLabel(candidate.link_kind) },
            { key: 'Attempts', value: String(candidate.attempts) },
            { key: 'Email', value: candidate.email || '–' },
            { key: 'Phone', value: candidate.phone || '–' },
          ]}
        />
        <History data={data} />
      </div>
    )
  }
  return (
    <div className="detail">
      <div className="detail-top">
        <div className="detail-score">
          <span className="detail-score-value" aria-label={`Score ${evaluation.overall_score} out of 100`}>
            {evaluation.overall_score}
          </span>
          <span className="atl-footnote atl-secondary">out of 100</span>
          <span className="atl-callout detail-rank">Rank {placement.rank}</span>
        </div>
        <dl className="subscores" aria-label="Sub-scores">
          {SUBSCORES.map(([key, label]) => {
            const value = evaluation.sub_scores[key] ?? 0
            return (
              <div key={key} style={{ display: 'contents' }}>
                <dt>{label}</dt>
                <dd>
                  <span className="subscore-bar" role="img" aria-label={`${label} ${value} out of 100`}>
                    <span style={{ width: `${value}%` }} />
                  </span>
                  <span className="subscore-value">{value}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      </div>

      <div className="gallery-row">
        <Badge
          tone={placement.bucket === 'shortlisted' ? 'success' : placement.bucket === 'cutoff' ? 'warning' : 'neutral'}
        >
          {BUCKETS.find((b) => b.value === placement.bucket)?.label}
        </Badge>
        <Badge tone={placement.how_placed === 'fill' ? 'accent' : 'neutral'}>{PLACED[placement.how_placed]}</Badge>
        {placement.tie && <Badge tone="warning">Tie</Badge>}
      </div>

      {evaluation.flags.map((flag) => (
        <Banner key={flag} tone="warning" title={flag} icon={AlertTriangle} />
      ))}

      {evaluation.summary && <p className="atl-body atl-selectable">{evaluation.summary}</p>}

      {evaluation.reasons.length > 0 && (
        <section>
          <h3>Why this score</h3>
          <ul>
            {evaluation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Evidence from the résumé</h3>
        {evaluation.evidence.length === 0 ? (
          <p className="atl-callout atl-secondary">The model gave no quote that could be found in the résumé.</p>
        ) : (
          <div className="evidence">
            {evaluation.evidence.map((item) => (
              <div key={item.claim + item.quote}>
                <span className="evidence-claim">{item.claim}</span>
                <blockquote>“{item.quote}”</blockquote>
              </div>
            ))}
          </div>
        )}
      </section>

      {evaluation.claim_mismatches.length > 0 && (
        <section>
          <h3>Listed in form but not found in résumé</h3>
          <ul className="atl-secondary">
            {evaluation.claim_mismatches.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      <KeyValue
        items={[
          { key: 'Pages', value: resume ? String(resume.pages) : '–' },
          { key: 'Text recognition (OCR)', value: resume?.ocr_used ? 'Used (scanned résumé)' : 'Not needed' },
          { key: 'Model', value: evaluation.model_name },
          {
            key: 'Time to score',
            value: evaluation.duration_seconds ? formatPerResume(evaluation.duration_seconds) : '–',
          },
          { key: 'Email', value: candidate.email || '–' },
          { key: 'Phone', value: candidate.phone || '–' },
        ]}
      />

      <Override runId={runId} data={data} />
      <History data={data} />
    </div>
  )
}

function Override({ runId, data }: { runId: number; data: CandidateOut }) {
  const client = useQueryClient()
  const current = data.placement?.bucket ?? 'rejected'
  const [target, setTarget] = useState<BucketName>(current === 'shortlisted' ? 'cutoff' : 'shortlisted')
  const [note, setNote] = useState('')
  const move = useMutation({
    mutationFn: () =>
      api('POST /runs/{run_id}/candidates/{candidate_id}/override', {
        params: { run_id: runId, candidate_id: data.candidate.id },
        body: { to_bucket: target, note: note.trim() },
      }),
    onSuccess: (updated) => {
      client.setQueryData(['candidate', runId, data.candidate.id], updated)
      void client.invalidateQueries({ queryKey: ['results-list', runId] })
      void client.invalidateQueries({ queryKey: ['results-counts', runId] })
      setNote('')
    },
  })
  return (
    <section>
      <h3>Move to another bucket</h3>
      <div className="override-form">
        <Select
          label="Move to…"
          value={target}
          onChange={setTarget}
          options={BUCKETS.filter((b) => b.value !== current).map((b) => ({ value: b.value, label: b.label }))}
        />
        <TextField
          label="Note (optional)"
          value={note}
          onChange={setNote}
          maxLength={500}
          placeholder="Why, for your records"
        />
        <Button onClick={() => move.mutate()} loading={move.isPending}>
          Move
        </Button>
      </div>
      {move.isError && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Banner tone="error" title={messageOf(move.error)} />
        </div>
      )}
    </section>
  )
}

function History({ data }: { data: CandidateOut }) {
  const lines = [...data.events.map((e) => ({ at: e.created_at, text: e.message }))].sort((a, b) =>
    a.at < b.at ? -1 : 1,
  )
  if (!lines.length) return null
  return (
    <section>
      <h3>History</h3>
      <ol className="history">
        {lines.map((line, i) => (
          <li key={`${line.at}-${i}`}>
            <span className="atl-tabular">
              {formatDate(line.at)} {formatClock(new Date(line.at))}
            </span>{' '}
            · {line.text}
          </li>
        ))}
      </ol>
    </section>
  )
}
