/**
 * Results (ARCHITECTURE §18). Buckets, ranks, ties, fills, notes and the sort
 * order all come from GET /runs/{id}/results. The renderer never computes
 * them (rule 16). Adjusting cutoffs previews live (nothing saved) until
 * "Save cutoffs". Rows can be selected like a native table and moved
 * together, from the selection bar or the native right-click menu.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  CircleSlash,
  Download,
  Filter,
  Inbox,
  Search,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CutoffsOut, ResultRowOut } from '@shared/api-types'
import type { MoveTarget } from '@shared/bridge'
import { api, messageOf } from '../../api/client'
import { Banner, Button, Card, EmptyState, Sidebar, Spinner, TextField, Toolbar, useToast } from '../../design'
import { useNav } from '../../state/nav'
import { CandidateSheet } from './CandidateSheet'
import { CutoffPopover } from './CutoffPopover'
import { ExportSheet } from './ExportSheet'
import { MOVE_TARGETS, MoveSheet, isMoveTarget } from './MoveSheet'
import { NeedsAttention } from './NeedsAttention'
import { ResultList, type SortColumn, type SortOrder } from './ResultList'
import './results.css'

type BucketId = 'shortlisted' | 'cutoff' | 'rejected' | 'failed' | 'filtered'

const TITLES: Record<BucketId, string> = {
  shortlisted: 'Shortlisted',
  cutoff: 'Cutoff',
  rejected: 'Rejected',
  failed: 'Needs attention',
  filtered: 'Filtered out',
}

const EMPTY: Record<BucketId, { title: string; message: string; icon: typeof Inbox }> = {
  shortlisted: {
    title: 'No one reached the shortlist',
    message: 'Lower the shortlist score, or set a minimum, in Adjust cutoffs.',
    icon: CheckCircle2,
  },
  cutoff: {
    title: 'No one is in the cutoff band',
    message: 'Widen the band in Adjust cutoffs to see more.',
    icon: CircleSlash,
  },
  rejected: { title: 'No one was rejected', message: 'Everyone scored at or above the cutoff band.', icon: XCircle },
  failed: { title: 'Every résumé was screened', message: 'Nothing needs your attention.', icon: CheckCircle2 },
  filtered: { title: 'No one was filtered out', message: 'No CGPA or department filter removed anyone.', icon: Filter },
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function Results({ runId }: { runId: number }) {
  const go = useNav((state) => state.go)
  const client = useQueryClient()
  const toast = useToast()
  const [bucket, setBucket] = useState<BucketId>('shortlisted')
  const [search, setSearch] = useState('')
  // The column asked for; `order: null` = that column's own first direction (the engine's choice).
  const [sort, setSort] = useState<{ column: SortColumn; order: SortOrder | null }>({ column: 'rank', order: null })
  const [selected, setSelected] = useState<number[]>([])
  const [moving, setMoving] = useState<{ rows: ResultRowOut[]; to: MoveTarget } | null>(null)
  const [preview, setPreview] = useState<CutoffsOut | null>(null)
  const [cutoffsOpen, setCutoffsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)

  const q = useDebounced(search.trim(), 200)
  const live = useDebounced(preview, 80)
  const cutoffQuery = live ? { shortlist: live.shortlist, band: live.band, min: live.min } : {}

  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api('GET /runs/{run_id}', { params: { run_id: runId } }),
  })
  // Counts, notes and the delta: a tiny request, so moving the handles feels instant.
  const summary = useQuery({
    queryKey: ['results-counts', runId, cutoffQuery],
    queryFn: () =>
      api('GET /runs/{run_id}/results', { params: { run_id: runId }, query: { ...cutoffQuery, limit: 1 } }),
    placeholderData: keepPreviousData,
  })
  const list = useQuery({
    queryKey: ['results-list', runId, bucket, q, sort, cutoffQuery],
    queryFn: () =>
      api('GET /runs/{run_id}/results', {
        params: { run_id: runId },
        query: { ...cutoffQuery, bucket, q, sort: sort.column, order: sort.order ?? undefined, limit: 5000 },
      }),
    placeholderData: keepPreviousData,
  })

  const saveCutoffs = useMutation({
    mutationFn: (value: CutoffsOut) =>
      api('PATCH /runs/{run_id}/cutoffs', {
        params: { run_id: runId },
        body: { shortlist_cutoff: value.shortlist, maybe_cutoff: value.band, min_shortlist: value.min },
      }),
    onSuccess: () => {
      setPreview(null)
      setCutoffsOpen(false)
      void client.invalidateQueries({ queryKey: ['run', runId] })
      void client.invalidateQueries({ queryKey: ['results-counts', runId] })
      void client.invalidateQueries({ queryKey: ['results-list', runId] })
    },
  })

  const counts = summary.data?.counts
  const saved = summary.data?.saved_cutoffs
  const rows = list.data?.rows ?? []
  const status = run.data?.status ?? 'completed'
  // Only rows on screen count as selected (a search or a move can hide some).
  const visibleSelected = useMemo(() => {
    const shown = new Set(rows.map((row) => row.candidate_id))
    return selected.filter((id) => shown.has(id))
  }, [rows, selected])

  const sections = useMemo(
    () => [
      {
        title: 'Results',
        items: [
          { id: 'shortlisted' as const, label: 'Shortlisted', icon: CheckCircle2, count: counts?.shortlisted ?? 0 },
          { id: 'cutoff' as const, label: 'Cutoff', icon: CircleSlash, count: counts?.cutoff ?? 0 },
          { id: 'rejected' as const, label: 'Rejected', icon: XCircle, count: counts?.rejected ?? 0 },
        ],
      },
      {
        title: 'Not scored',
        items: [
          { id: 'failed' as const, label: 'Needs attention', icon: AlertTriangle, count: counts?.failed ?? 0 },
          { id: 'filtered' as const, label: 'Filtered out', icon: Ban, count: counts?.filtered ?? 0 },
        ],
      },
    ],
    [counts],
  )

  if (!summary.data || !run.data) {
    return (
      <div className="screen">
        <Toolbar windowEdgeLeft />
        <div className="gate" aria-busy="true">
          <Spinner size={24} />
        </div>
      </div>
    )
  }

  const empty = EMPTY[bucket]
  const openRow = (row: ResultRowOut): void => setOpen(row.candidate_id)
  const sorted = list.data ? { column: list.data.sort, order: list.data.order } : undefined
  const sortBy = (column: SortColumn): void =>
    setSort(
      sorted?.column === column
        ? { column, order: sorted.order === 'asc' ? 'desc' : 'asc' } // clicked again: reverse
        : { column, order: null },
    )
  const rowsFor = (ids: number[]): ResultRowOut[] => {
    const wanted = new Set(ids)
    return rows.filter((row) => wanted.has(row.candidate_id))
  }
  const otherBuckets = (from: string): MoveTarget[] => MOVE_TARGETS.filter((target) => target !== from)
  const showMenu = async (row: ResultRowOut, ids: number[]): Promise<void> => {
    const chosen = rowsFor(ids)
    const choice = await window.atlas.menus.resultRows({
      raNumbers: chosen.map((r) => r.ra_number),
      moveTargets: isMoveTarget(row.bucket) ? otherBuckets(row.bucket) : [],
      details: true,
    })
    if (choice?.action === 'details') setOpen(row.candidate_id)
    if (choice?.action === 'move') setMoving({ rows: chosen, to: choice.to })
    if (choice?.action === 'copy_failed') toast({ message: choice.message })
  }
  const selectedRows = visibleSelected.length > 1 ? rowsFor(visibleSelected) : []
  const movableFrom = selectedRows[0] && isMoveTarget(selectedRows[0].bucket) ? selectedRows[0].bucket : null

  return (
    <div className="results">
      <Sidebar
        label="Buckets"
        sections={sections}
        selected={bucket}
        onSelect={(next) => {
          setBucket(next)
          setSelected([])
        }}
      />
      <div className="results-main">
        <Toolbar
          title={run.data.name}
          leading={
            <Button size="small" variant="plain" icon={ChevronLeft} onClick={() => go({ name: 'welcome' })}>
              Home
            </Button>
          }
          trailing={
            <>
              <div className="results-search">
                <TextField
                  label="Search by name or RA number"
                  hideLabel
                  type="search"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search name or RA"
                />
              </div>
              <Button ref={anchor} size="small" icon={SlidersHorizontal} onClick={() => setCutoffsOpen(true)}>
                Adjust cutoffs
              </Button>
              <Button size="small" variant="primary" icon={Download} onClick={() => setExportOpen(true)}>
                Export
              </Button>
            </>
          }
        />
        {(summary.data.notes.length > 0 || preview) && (
          <div className="results-notes">
            {preview && (
              <Banner
                tone="info"
                title="Previewing new cutoffs"
                action={{ label: 'Adjust cutoffs', onClick: () => setCutoffsOpen(true) }}
              >
                Nothing is saved until you choose Save cutoffs.
              </Banner>
            )}
            {summary.data.notes.map((note) => (
              <Banner key={note} tone="info" title={note} />
            ))}
          </div>
        )}
        <div className="results-head">
          <h2>{TITLES[bucket]}</h2>
          {selectedRows.length > 1 ? (
            <div className="results-selection" role="group" aria-label="Selected candidates">
              <span className="atl-callout" aria-live="polite">
                {selectedRows.length} selected
              </span>
              {movableFrom && (
                <Button
                  size="small"
                  onClick={() => setMoving({ rows: selectedRows, to: otherBuckets(movableFrom)[0] as MoveTarget })}
                >
                  Move to…
                </Button>
              )}
              <Button size="small" variant="plain" onClick={() => setSelected([])}>
                Deselect
              </Button>
            </div>
          ) : (
            <span className="atl-footnote atl-secondary" aria-live="polite">
              {q ? `${list.data?.total ?? 0} matching “${q}”` : ''}
            </span>
          )}
        </div>

        {bucket === 'failed' ? (
          <NeedsAttention
            runId={runId}
            status={status}
            rows={rows}
            groups={summary.data.failure_groups}
            onOpen={openRow}
          />
        ) : rows.length === 0 && !list.isFetching ? (
          <div className="attention">
            <Card flush>
              {q ? (
                <EmptyState
                  icon={Search}
                  title={`Nothing matches “${q}”`}
                  message="Search looks at names and RA numbers."
                />
              ) : (
                <EmptyState
                  icon={empty.icon}
                  title={empty.title}
                  message={empty.message}
                  action={
                    bucket === 'filtered' ? undefined : { label: 'Adjust cutoffs', onClick: () => setCutoffsOpen(true) }
                  }
                />
              )}
            </Card>
          </div>
        ) : (
          <ResultList
            key={bucket}
            rows={rows}
            label={`${TITLES[bucket]} candidates`}
            onOpen={openRow}
            variant={bucket === 'filtered' ? 'filtered' : 'scored'}
            sorted={sorted}
            onSort={sortBy}
            selected={visibleSelected}
            onSelect={setSelected}
            onMenu={(row, ids) => void showMenu(row, ids)}
          />
        )}
      </div>

      {saved && (
        <CutoffPopover
          open={cutoffsOpen}
          anchor={anchor}
          value={preview ?? saved}
          saved={saved}
          delta={preview ? summary.data.delta : undefined}
          histogram={summary.data.histogram}
          saving={saveCutoffs.isPending}
          error={saveCutoffs.isError ? messageOf(saveCutoffs.error) : null}
          onChange={setPreview}
          onSave={() => preview && saveCutoffs.mutate(preview)}
          onReset={() => setPreview(null)}
          onClose={() => {
            setCutoffsOpen(false)
            setPreview(null)
          }}
        />
      )}
      <ExportSheet
        open={exportOpen}
        runId={runId}
        runName={run.data.name}
        counts={counts}
        total={summary.data.total}
        onClose={() => setExportOpen(false)}
      />
      <CandidateSheet runId={runId} candidateId={open} onClose={() => setOpen(null)} />
      <MoveSheet
        runId={runId}
        rows={moving?.rows ?? []}
        initial={moving?.to ?? 'shortlisted'}
        onClose={() => setMoving(null)}
        onMoved={() => {
          setMoving(null)
          setSelected([])
        }}
      />
    </div>
  )
}
