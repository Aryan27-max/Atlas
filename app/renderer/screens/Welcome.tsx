import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Cpu, FolderOpen, HardDrive, Plus, Settings as Gear } from 'lucide-react'
import type { RunOut } from '@shared/api-types'
import { api, messageOf } from '../api/client'
import { useAppEvents } from '../api/events'
import { Badge, type BadgeTone, Banner, Button, Card, List, ListRow, ProgressBar, Toolbar, useToast } from '../design'
import { defaultRunName, formatDate, greeting, plural } from '../format'
import { useNav, viewForRun } from '../state/nav'

export const STATUS: Record<RunOut['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Not started', tone: 'neutral' },
  running: { label: 'Screening', tone: 'accent' },
  paused: { label: 'Paused', tone: 'warning' },
  completed: { label: 'Done', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

export function Welcome() {
  const go = useNav((state) => state.go)
  const client = useQueryClient()
  const toast = useToast()
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api('GET /runs') })
  const system = useQuery({ queryKey: ['system'], queryFn: () => api('GET /system') })
  useAppEvents((event) => {
    if (event.kind === 'run_status') void client.invalidateQueries({ queryKey: ['runs'] })
  })

  const create = useMutation({
    mutationFn: () => api('POST /runs', { body: { name: defaultRunName() } }),
    onSuccess: (run) => {
      void client.invalidateQueries({ queryKey: ['runs'] })
      go({ name: 'setup', runId: run.id, step: 'upload' })
    },
    onError: (error) => toast({ message: messageOf(error), icon: AlertTriangle }),
  })

  const all = runs.data ?? []
  const unfinished = all.find((run) => run.status === 'running' || run.status === 'paused')
  const recent = all.filter((run) => run !== unfinished).slice(0, 8)

  return (
    <div className="screen">
      <Toolbar
        windowEdgeLeft
        trailing={
          <Button
            size="small"
            variant="plain"
            icon={Gear}
            aria-label="Settings"
            onClick={() => go({ name: 'settings' })}
          >
            Settings
          </Button>
        }
      />
      <div className="screen-scroll">
        <main className="screen-column">
          <div className="welcome-hero">
            <div>
              <h1 className="atl-large-title">{greeting()}</h1>
              <p className="atl-body atl-secondary">
                Atlas reads student résumés on this computer and sorts them into Shortlisted, Cutoff and Rejected.
              </p>
            </div>
            <Button
              variant="primary"
              size="large"
              icon={Plus}
              loading={create.isPending}
              onClick={() => create.mutate()}
            >
              New screening
            </Button>
          </div>

          {unfinished && <ResumeCard run={unfinished} onOpen={() => go(viewForRun(unfinished))} />}

          <SystemCard
            loading={system.isLoading}
            ollamaRunning={system.data?.ollama.running ?? false}
            ollamaVersion={system.data?.ollama.version ?? null}
            models={system.data?.models_installed ?? 0}
            dataDir={system.data?.data_dir ?? ''}
            checking={system.isFetching}
            onCheck={() => void system.refetch()}
          />

          {recent.length > 0 && (
            <List title="Recent screenings">
              {recent.map((run) => (
                <ListRow
                  key={run.id}
                  title={run.name}
                  subtitle={runSubtitle(run)}
                  detail={<Badge tone={STATUS[run.status].tone}>{STATUS[run.status].label}</Badge>}
                  navigates
                  onClick={() => go(viewForRun(run))}
                />
              ))}
            </List>
          )}
        </main>
      </div>
    </div>
  )
}

function runSubtitle(run: RunOut): string {
  const parts = [formatDate(run.created_at)]
  if (run.total) {
    parts.push(plural(run.total, 'student'))
    parts.push(`${run.counts.scored.toLocaleString()} screened`)
    if (run.counts.failed) parts.push(`${run.counts.failed.toLocaleString()} need attention`)
  } else if (run.status === 'draft') {
    parts.push('Setup not finished')
  }
  return parts.join(' · ')
}

function ResumeCard({ run, onOpen }: { run: RunOut; onOpen: () => void }) {
  const paused = run.status === 'paused'
  return (
    <Card
      className="resume-card"
      title={paused ? `Resume “${run.name}”` : `“${run.name}” is screening`}
      subtitle={`${run.done.toLocaleString()} of ${plural(run.total, 'student')} done`}
      labelledBy="resume-card-title"
      accessory={
        <Button variant="primary" onClick={onOpen}>
          {paused ? 'Resume' : 'Open'}
        </Button>
      }
    >
      <ProgressBar value={run.total ? run.done / run.total : 0} label={`Progress of ${run.name}`} />
      {paused && run.pause_reason && (
        <Banner tone={run.auto_resume ? 'info' : 'warning'} title={run.pause_reason}>
          {run.auto_resume
            ? 'Atlas will continue automatically when this is fixed.'
            : 'Nothing was lost. Open it and press Resume to continue.'}
        </Banner>
      )}
    </Card>
  )
}

interface SystemCardProps {
  loading: boolean
  ollamaRunning: boolean
  ollamaVersion: string | null
  models: number
  dataDir: string
  checking: boolean
  onCheck: () => void
}

function SystemCard({ loading, ollamaRunning, ollamaVersion, models, dataDir, checking, onCheck }: SystemCardProps) {
  return (
    <Card title="This computer" labelledBy="system-card-title">
      <div className="status-lines">
        <div className="status-line">
          {ollamaRunning ? (
            <CheckCircle2 className="status-ok" aria-hidden size={18} strokeWidth={1.75} />
          ) : (
            <AlertTriangle className="status-bad" aria-hidden size={18} strokeWidth={1.75} />
          )}
          <div className="status-line-text">
            <span className="atl-callout">
              {loading ? 'Checking Ollama…' : ollamaRunning ? 'Ollama is running' : "Ollama isn't running"}
              {ollamaRunning && ollamaVersion ? <span className="atl-secondary"> · {ollamaVersion}</span> : null}
            </span>
            {!loading && !ollamaRunning && (
              <span className="atl-footnote atl-secondary">
                Atlas uses Ollama to read résumés on this computer. Open the Ollama app (or run “ollama serve”), then
                check again.
              </span>
            )}
          </div>
          {!loading && !ollamaRunning && (
            <Button size="small" onClick={onCheck} loading={checking}>
              Check again
            </Button>
          )}
        </div>
        <div className="status-line">
          <Cpu className="atl-tertiary" aria-hidden size={18} strokeWidth={1.75} />
          <div className="status-line-text">
            <span className="atl-callout">
              {ollamaRunning ? `${plural(models, 'model')} installed` : 'Models appear when Ollama is running'}
            </span>
          </div>
        </div>
        <div className="status-line">
          <HardDrive className="atl-tertiary" aria-hidden size={18} strokeWidth={1.75} />
          <div className="status-line-text">
            <span className="atl-callout">Everything stays on this computer</span>
            <span className="path">{dataDir}</span>
          </div>
          <Button
            size="small"
            variant="plain"
            icon={FolderOpen}
            onClick={() => void window.atlas.files.showInFolder({ kind: 'data' })}
          >
            Show in folder
          </Button>
        </div>
      </div>
    </Card>
  )
}
