import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'
import type { FailureGroupOut, ResultRowOut } from '@shared/api-types'
import { api, messageOf } from '../../api/client'
import { Alert, Badge, Banner, Button, Card, EmptyState } from '../../design'
import { plural } from '../../format'
import { useNav } from '../../state/nav'
import { linkLabel } from './ResultList'

/** Failures grouped by the engine's reason, with what to do and Retry. */
export function NeedsAttention({
  runId,
  status,
  rows,
  groups,
  onOpen,
}: {
  runId: number
  status: string
  rows: ResultRowOut[]
  groups: FailureGroupOut[]
  onOpen: (row: ResultRowOut) => void
}) {
  const go = useNav((state) => state.go)
  const client = useQueryClient()
  const [confirmAll, setConfirmAll] = useState(false)
  // Reasons contain spaces, so they can't be ID references.
  const idBase = useId()
  const retryable = groups.filter((g) => g.kind === 'retryable').reduce((sum, g) => sum + g.count, 0)
  const total = groups.reduce((sum, g) => sum + g.count, 0)
  const retry = useMutation({
    mutationFn: (includePermanent: boolean) =>
      api('POST /runs/{run_id}/retry-failed', {
        params: { run_id: runId },
        body: { include_permanent: includePermanent },
      }),
    onSuccess: (result) => {
      setConfirmAll(false)
      void client.invalidateQueries({ queryKey: ['runs'] })
      if (result.retried > 0) go({ name: 'progress', runId })
    },
  })

  if (!rows.length) {
    return (
      <div className="attention">
        <Card flush>
          <EmptyState icon={CheckCircle2} title="Every résumé was screened" message="Nothing needs your attention." />
        </Card>
      </div>
    )
  }
  const canRetry = status === 'completed'
  return (
    <div className="attention">
      <div className="attention-actions">
        <Button
          variant="primary"
          icon={RefreshCw}
          disabled={!canRetry || retryable === 0}
          loading={retry.isPending && retry.variables === false}
          onClick={() => retry.mutate(false)}
        >
          Retry failed ({retryable.toLocaleString()})
        </Button>
        <Button disabled={!canRetry} onClick={() => setConfirmAll(true)}>
          Retry all including fixed links ({total.toLocaleString()})
        </Button>
      </div>
      {!canRetry && <Banner tone="info" title="Retrying is possible once screening has finished." />}
      {retry.isError && <Banner tone="error" title={messageOf(retry.error)} />}
      {groups.map((group, index) => {
        const members = rows.filter((row) => row.failure_reason === group.reason)
        return (
          <Card
            key={group.reason}
            title={group.reason}
            subtitle={
              group.kind === 'retryable'
                ? `${plural(group.count, 'student')} · Usually temporary: Retry failed tries again.`
                : `${plural(group.count, 'student')} · Needs the student to fix it, then Retry all.`
            }
            labelledBy={`${idBase}-group-${index}`}
          >
            <ul className="attention-rows">
              {members.map((row) => (
                <li key={row.candidate_id}>
                  <span className="atl-callout">{row.ra_number}</span>
                  <button
                    type="button"
                    className="atl-button atl-button--plain atl-button--small"
                    onClick={() => onOpen(row)}
                  >
                    {row.name || <span className="atl-secondary">Name not given</span>}
                  </button>
                  <Badge>{linkLabel(row.link_kind)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
      <Alert
        open={confirmAll}
        title={`Retry all ${plural(total, 'student')}?`}
        message="Links that were private, missing or not a PDF are tried again too. Do this after the students have fixed their links."
        actions={[{ label: 'Retry all', loading: retry.isPending, onClick: () => retry.mutate(true) }]}
        cancel={{ label: 'Not now', onClick: () => setConfirmAll(false) }}
      />
    </div>
  )
}
