/**
 * Move one or several candidates to another bucket, with one note (Phase 3,
 * step 3.4). Each candidate is its own override request, so each move is
 * recorded, logged and shown in that candidate's history exactly like a move
 * made from the detail sheet. If some fail, trying again sends only those.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { ResultRowOut } from '@shared/api-types'
import type { MoveTarget } from '@shared/bridge'
import { api, messageOf } from '../../api/client'
import { Banner, Button, Select, Sheet, TextField } from '../../design'

const LABEL: Record<MoveTarget, string> = { shortlisted: 'Shortlisted', cutoff: 'Cutoff', rejected: 'Rejected' }
export const MOVE_TARGETS: readonly MoveTarget[] = ['shortlisted', 'cutoff', 'rejected']

export function isMoveTarget(bucket: string): bucket is MoveTarget {
  return (MOVE_TARGETS as readonly string[]).includes(bucket)
}

interface MoveSheetProps {
  runId: number
  /** The candidates to move, all from the bucket on screen; empty = closed. */
  rows: ResultRowOut[]
  /** The bucket chosen first (never the one they are in). */
  initial: MoveTarget
  onClose: () => void
  onMoved: () => void
}

interface Failure {
  row: ResultRowOut
  message: string
}

export function MoveSheet({ runId, rows, initial, onClose, onMoved }: MoveSheetProps) {
  const client = useQueryClient()
  const open = rows.length > 0
  const from = rows[0]?.bucket ?? ''
  const [target, setTarget] = useState<MoveTarget>(initial)
  const [note, setNote] = useState('')
  const [done, setDone] = useState(0)
  const [failures, setFailures] = useState<Failure[]>([])

  useEffect(() => {
    if (!open) return
    setTarget(initial)
    setNote('')
    setDone(0)
    setFailures([])
  }, [open, initial])

  const move = useMutation({
    mutationFn: async (batch: ResultRowOut[]) => {
      const failed: Failure[] = []
      setDone(0)
      for (const [i, row] of batch.entries()) {
        try {
          await api('POST /runs/{run_id}/candidates/{candidate_id}/override', {
            params: { run_id: runId, candidate_id: row.candidate_id },
            body: { to_bucket: target, note: note.trim() },
          })
        } catch (error) {
          failed.push({ row, message: messageOf(error) })
        }
        setDone(i + 1)
      }
      return failed
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['results-list', runId] })
      void client.invalidateQueries({ queryKey: ['results-counts', runId] })
      void client.invalidateQueries({ queryKey: ['candidate', runId] })
    },
    onSuccess: (failed) => {
      setFailures(failed)
      if (failed.length === 0) onMoved()
    },
  })

  // After a partial failure, only the ones that failed are sent again.
  const batch = failures.length > 0 ? failures.map((f) => f.row) : rows
  const submit = (): void => {
    if (!move.isPending) move.mutate(batch)
  }
  const one = rows.length === 1 ? rows[0] : undefined
  const moving = move.isPending
  return (
    <Sheet
      open={open}
      onClose={() => !moving && onClose()}
      title={one ? `Move ${one.name || one.ra_number}` : `Move ${rows.length} candidates`}
      description={
        isMoveTarget(from) ? `From ${LABEL[from]}. The note is saved with each move, for your records.` : undefined
      }
      footer={
        <>
          <Button onClick={onClose} disabled={moving}>
            Cancel
          </Button>
          <Button variant="primary" loading={moving} onClick={submit}>
            {failures.length > 0 ? 'Try again' : one ? 'Move' : `Move ${rows.length}`}
          </Button>
        </>
      }
    >
      <div className="override-form">
        <Select
          label="Move to"
          value={target}
          onChange={setTarget}
          options={MOVE_TARGETS.filter((b) => b !== from).map((b) => ({ value: b, label: LABEL[b] }))}
        />
        <TextField
          label="Note (optional)"
          value={note}
          onChange={setNote}
          maxLength={500}
          placeholder="Why, for your records"
          onEnter={submit}
        />
      </div>
      {moving && batch.length > 1 && (
        <p className="atl-footnote atl-secondary move-progress" role="status">
          Moving {done} of {batch.length}…
        </p>
      )}
      {!moving && failures.length > 0 && (
        <div className="move-progress">
          <Banner tone="error" title={`${failures.length} of ${rows.length} couldn't be moved`}>
            {failures[0]?.message}
          </Banner>
        </div>
      )}
    </Sheet>
  )
}
