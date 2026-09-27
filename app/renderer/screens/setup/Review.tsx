import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BatteryCharging, Clock, Coffee, Play } from 'lucide-react'
import type { RunOut } from '@shared/api-types'
import { api, messageOf } from '../../api/client'
import { Banner, Button, Card, KeyValue } from '../../design'
import { formatPerResume, formatRange, plural } from '../../format'
import { type SetupStep, useNav } from '../../state/nav'
import { useSetup } from '../../state/setup'
import { SetupBar, useFlow } from './SetupFlow'

export function Review() {
  const { run } = useFlow()
  const go = useNav((state) => state.go)
  const client = useQueryClient()
  const report = useSetup((state) => state.report)
  const estimate = useQuery({
    queryKey: ['estimate', run.id],
    queryFn: () => api('GET /runs/{run_id}/estimate', { params: { run_id: run.id } }),
  })
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api('GET /runs') })
  const busy = runs.data?.find((other) => other.id !== run.id && other.status === 'running')

  // configure → confirm → start, in that order (the engine checks each step).
  const start = useMutation({
    mutationFn: async () => {
      await api('PATCH /runs/{run_id}', {
        params: { run_id: run.id },
        body: {
          name: run.name,
          model_name: run.model_name,
          criteria_prompt: run.criteria_prompt,
          shortlist_cutoff: run.shortlist_cutoff,
          maybe_cutoff: run.maybe_cutoff,
          min_shortlist: run.min_shortlist,
          cgpa_min: run.cgpa_min,
          departments_allowed: run.departments_allowed,
        },
      })
      if (run.total === 0) await api('POST /runs/{run_id}/table/confirm', { params: { run_id: run.id } })
      return api('POST /runs/{run_id}/start', { params: { run_id: run.id } })
    },
    onSuccess: (started) => {
      void client.invalidateQueries({ queryKey: ['runs'] })
      go({ name: 'progress', runId: started.id })
    },
  })

  const edit = (step: SetupStep) => (
    <Button size="small" variant="plain" onClick={() => go({ name: 'setup', runId: run.id, step })}>
      Edit
    </Button>
  )
  const needsFile = run.total === 0 && !report
  const e = estimate.data?.estimate

  return (
    <>
      <div className="screen-scroll">
        <main className="screen-column">
          <div className="screen-head">
            <h1 className="atl-large-title">Review</h1>
            <p className="atl-body atl-secondary">
              Check everything once. After you start, only the cutoffs can change.
            </p>
          </div>

          {busy && (
            <Banner tone="warning" title={`“${busy.name}” is screening right now`}>
              Atlas screens one list at a time. Pause it, or wait until it finishes, then start this one.
            </Banner>
          )}
          {needsFile && (
            <Banner
              tone="warning"
              title="Add the student list again"
              action={{ label: 'Go to step 1', onClick: () => go({ name: 'setup', runId: run.id, step: 'upload' }) }}
            >
              Atlas was restarted during setup, so the file needs to be added once more.
            </Banner>
          )}
          {start.isError && <Banner tone="error" title={messageOf(start.error)} />}
          <Card title="How long it will take" labelledBy="review-time">
            <div className="estimate">
              <Clock className="atl-tertiary" aria-hidden size={22} strokeWidth={1.75} />
              <div className="status-line-text">
                <span className="atl-title">
                  {e
                    ? formatRange(e.low_seconds, e.high_seconds)
                    : estimate.isLoading
                      ? 'Working it out…'
                      : 'Not known yet'}
                </span>
                <span className="atl-footnote atl-secondary">
                  {e
                    ? `${e.basis === 'precheck' ? '' : `${e.label} · `}About ${formatPerResume(e.per_resume_seconds)} per résumé on this computer`
                    : ''}
                </span>
              </div>
            </div>
            <p className="atl-footnote atl-secondary" style={{ marginTop: 'var(--space-3)' }}>
              Rough estimate based on this computer. After the first 5 résumés, Atlas shows a measured time.
            </p>
          </Card>
          <div className="status-lines">
            <div className="status-line">
              <BatteryCharging className="atl-tertiary" aria-hidden size={18} strokeWidth={1.75} />
              <span className="atl-callout atl-secondary">
                Keep your laptop plugged in. Atlas keeps it awake while screening.
              </span>
            </div>
            <div className="status-line">
              <Coffee className="atl-tertiary" aria-hidden size={18} strokeWidth={1.75} />
              <span className="atl-callout atl-secondary">
                You can close Atlas; it continues where it left off when you reopen it.
              </span>
            </div>
          </div>

          <Card title="Students and model" accessory={edit('upload')} labelledBy="review-file">
            <KeyValue
              items={[
                { key: 'Name', value: run.name },
                {
                  key: 'Student list',
                  value: report
                    ? `${report.source} · ${plural(report.summary.ready, 'student')} ready`
                    : run.total
                      ? plural(run.total, 'student')
                      : 'Not added',
                },
                { key: 'Model', value: run.model_name ?? 'Not chosen' },
              ]}
            />
          </Card>
          <Card title="Criteria" accessory={edit('criteria')} labelledBy="review-criteria">
            <p className="atl-callout review-criteria atl-selectable">{run.criteria_prompt || 'Not written yet'}</p>
          </Card>
          <Card title="Cutoffs and filters" accessory={edit('cutoffs')} labelledBy="review-cutoffs">
            <KeyValue items={cutoffItems(run)} />
          </Card>
        </main>
      </div>
      <SetupBar
        primary={
          <Button
            variant="primary"
            size="large"
            icon={Play}
            disabled={needsFile || !run.model_name || !run.criteria_prompt}
            loading={start.isPending}
            onClick={() => start.mutate()}
          >
            Start screening
          </Button>
        }
      />
    </>
  )
}

function cutoffItems(run: RunOut): Array<{ key: string; value: string }> {
  const items = [
    { key: 'Shortlist', value: `${run.shortlist_cutoff} and above` },
    {
      key: 'Cutoff band',
      value: run.maybe_cutoff < run.shortlist_cutoff ? `${run.maybe_cutoff} to ${run.shortlist_cutoff - 1}` : 'None',
    },
    { key: 'Minimum shortlisted', value: run.min_shortlist ? plural(run.min_shortlist, 'candidate') : 'None' },
    { key: 'Minimum CGPA', value: run.cgpa_min !== null ? run.cgpa_min.toFixed(1) : 'Any' },
    { key: 'Departments', value: run.departments_allowed?.length ? run.departments_allowed.join(', ') : 'All' },
  ]
  return items
}
