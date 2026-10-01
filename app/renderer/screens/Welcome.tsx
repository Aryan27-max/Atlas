import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  Play,
  Plus,
  Settings as Gear,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { RunOut, SystemOut } from '@shared/api-types'
import { api, messageOf } from '../api/client'
import { useAppEvents } from '../api/events'
import {
  Badge,
  type BadgeTone,
  Banner,
  Button,
  Card,
  List,
  ListRow,
  ProgressBar,
  Spinner,
  Toolbar,
  useToast,
} from '../design'
import { defaultRunName, formatDate, greeting, plural } from '../format'
import { useNav, viewForRun } from '../state/nav'
import { PullSheet } from './setup/ModelPicker'

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
  const { refetch } = system
  const refetchSystem = useCallback(() => void refetch(), [refetch])
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
            ollama={system.data?.ollama ?? null}
            models={system.data?.models_installed ?? 0}
            dataDir={system.data?.data_dir ?? ''}
            checking={system.isFetching}
            onCheck={refetchSystem}
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
  ollama: SystemOut['ollama'] | null
  models: number
  dataDir: string
  checking: boolean
  onCheck: () => void
}

type OllamaState = 'checking' | 'missing' | 'stopped' | 'no_model' | 'ready'

function ollamaState(loading: boolean, ollama: SystemOut['ollama'] | null, models: number): OllamaState {
  if (loading || !ollama) return 'checking'
  if (!ollama.running) return ollama.installed ? 'stopped' : 'missing'
  return models > 0 ? 'ready' : 'no_model'
}

/** Ollama, in the four states a first run can be in, then where the data lives. */
function SystemCard({ loading, ollama, models, dataDir, checking, onCheck }: SystemCardProps) {
  const client = useQueryClient()
  const [pullOpen, setPullOpen] = useState(false)
  const [waitingSince, setWaitingSince] = useState<number | null>(null)
  const state = ollamaState(loading, ollama, models)
  const suggestions = useQuery({
    queryKey: ['models'],
    queryFn: () => api('GET /models'),
    enabled: state === 'no_model',
  })
  const start = useMutation({
    mutationFn: () => api('POST /ollama/start'),
    onSuccess: () => setWaitingSince(Date.now()),
  })
  // After "Start Ollama", check every second until it answers (up to 30 s).
  const starting = waitingSince !== null && state === 'stopped' && Date.now() - waitingSince < 30_000
  useEffect(() => {
    if (!starting) return
    const timer = setInterval(onCheck, 1000)
    return () => clearInterval(timer)
  }, [starting, onCheck])
  useEffect(() => {
    if (state !== 'stopped') setWaitingSince(null)
  }, [state])
  const timedOut = waitingSince !== null && state === 'stopped' && !starting

  return (
    <Card title="This computer" labelledBy="system-card-title">
      <div className="status-lines">
        {state === 'checking' && (
          <div className="status-line">
            <Spinner size={18} />
            <div className="status-line-text">
              <span className="atl-callout">Checking Ollama…</span>
            </div>
          </div>
        )}
        {state === 'missing' && (
          <div className="status-line">
            <AlertTriangle className="status-bad" aria-hidden size={18} strokeWidth={1.75} />
            <div className="status-line-text">
              <span className="atl-callout">Install Ollama to start screening</span>
              <span className="atl-footnote atl-secondary">
                Atlas reads résumés with Ollama, a free app that runs AI models on this computer, so no résumé is sent
                to the internet. Download it, install it like any other app, then press Check again.
              </span>
              <div className="status-actions">
                <Button
                  size="small"
                  variant="primary"
                  icon={Download}
                  onClick={() => void window.atlas.app.openOllamaDownload()}
                >
                  Open download page
                </Button>
                <Button size="small" onClick={onCheck} loading={checking}>
                  Check again
                </Button>
              </div>
            </div>
          </div>
        )}
        {state === 'stopped' && (
          <div className="status-line">
            <AlertTriangle className="status-bad" aria-hidden size={18} strokeWidth={1.75} />
            <div className="status-line-text">
              <span className="atl-callout">Ollama isn't running</span>
              <span className="atl-footnote atl-secondary">
                {starting
                  ? 'Starting Ollama… this takes a few seconds.'
                  : "Ollama is installed on this computer but isn't running. Atlas can start it for you."}
              </span>
              <div className="status-actions">
                <Button
                  size="small"
                  variant="primary"
                  icon={Play}
                  loading={start.isPending || starting}
                  onClick={() => start.mutate()}
                >
                  Start Ollama
                </Button>
                <Button size="small" onClick={onCheck} loading={checking && !starting}>
                  Check again
                </Button>
              </div>
            </div>
          </div>
        )}
        {state === 'stopped' && (start.isError || timedOut) && (
          <Banner tone="warning" title="Ollama didn't start">
            {start.isError
              ? messageOf(start.error)
              : 'Open the Ollama app yourself (the Start menu on Windows, Applications on a Mac), wait a few seconds, then press Check again.'}
          </Banner>
        )}
        {state === 'no_model' && (
          <div className="status-line">
            <AlertTriangle className="status-bad" aria-hidden size={18} strokeWidth={1.75} />
            <div className="status-line-text">
              <span className="atl-callout">
                Ollama is running · no model yet
                {ollama?.version ? <span className="atl-secondary"> · {ollama.version}</span> : null}
              </span>
              <span className="atl-footnote atl-secondary">
                Atlas needs one AI model to read résumés. qwen3:8b is a good start (about 5 GB to download once).
              </span>
              <div className="status-actions">
                <Button size="small" variant="primary" icon={Download} onClick={() => setPullOpen(true)}>
                  Get a model
                </Button>
              </div>
            </div>
          </div>
        )}
        {state === 'ready' && (
          <>
            <div className="status-line">
              <CheckCircle2 className="status-ok" aria-hidden size={18} strokeWidth={1.75} />
              <div className="status-line-text">
                <span className="atl-callout">
                  Ollama is running
                  {ollama?.version ? <span className="atl-secondary"> · {ollama.version}</span> : null}
                </span>
              </div>
            </div>
            <div className="status-line">
              <Cpu className="atl-tertiary" aria-hidden size={18} strokeWidth={1.75} />
              <div className="status-line-text">
                <span className="atl-callout">{plural(models, 'model')} installed</span>
              </div>
            </div>
          </>
        )}
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
      <PullSheet
        open={pullOpen}
        suggestions={suggestions.data?.suggestions ?? ['qwen3:8b']}
        onClose={() => setPullOpen(false)}
        onDone={() => {
          setPullOpen(false)
          void client.invalidateQueries({ queryKey: ['models'] })
          onCheck()
        }}
      />
    </Card>
  )
}
