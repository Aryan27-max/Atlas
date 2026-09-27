/**
 * Results (ARCHITECTURE §18). Buckets, ranks, ties, fills and notes all come
 * from GET /runs/{id}/results. The renderer never computes them (rule 16).
 * Adjusting cutoffs previews live (nothing saved) until "Save cutoffs".
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
import { api, messageOf } from '../../api/client'
import { Banner, Button, Card, EmptyState, Select, Sidebar, Spinner, TextField, Toolbar } from '../../design'
import { useNav } from '../../state/nav'
import { CandidateSheet } from './CandidateSheet'
import { CutoffPopover } from './CutoffPopover'
import { ExportSheet } from './ExportSheet'
import { NeedsAttention } from './NeedsAttention'
import { ResultList } from './ResultList'
import './results.css'

type BucketId = 'shortlisted' | 'cutoff' | 'rejected' | 'failed' | 'filtered'
type Sort = 'rank' | 'score' | 'name'

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
  const [bucket, setBucket] = useState<BucketId>('shortlisted')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('rank')
  const [preview, setPreview] = useState<CutoffsOut | null>(null)
  const [cutoffsOpen, setCutoffsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)

  const q = useDebounced(search.trim(), 200)
  const live = useDebounced(preview, 150)
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
        query: { ...cutoffQuery, bucket, q, sort, limit: 5000 },
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

  return (
    <div className="results">
      <Sidebar label="Buckets" sections={sections} selected={bucket} onSelect={setBucket} />
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
              <div className="results-sort">
                <Select
                  label="Sort"
                  hideLabel
                  value={sort}
                  onChange={setSort}
                  options={[
                    { value: 'rank', label: 'Sort by rank' },
                    { value: 'score', label: 'Sort by score' },
                    { value: 'name', label: 'Sort by name' },
                  ]}
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
          <span className="atl-footnote atl-secondary" aria-live="polite">
            {q ? `${list.data?.total ?? 0} matching “${q}”` : ''}
          </span>
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
            rows={rows}
            label={`${TITLES[bucket]} candidates`}
            onOpen={openRow}
            variant={bucket === 'filtered' ? 'filtered' : 'scored'}
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
    </div>
  )
}
