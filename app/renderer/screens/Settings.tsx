/**
 * Settings (PLAN 2.8). Every value is the engine's (`GET/PUT /settings`) and
 * applies at once, as in System Settings: there is no Save button. Deleting
 * goes through the engine too (`DELETE /runs/{id}`, `DELETE /data`).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, FileText, FolderOpen, HardDrive, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { RunOut, SettingsOut } from '@shared/api-types'
import { api, messageOf } from '../api/client'
import {
  Alert,
  Badge,
  Banner,
  Button,
  Card,
  KeyValue,
  List,
  ListRow,
  ScoreBand,
  SegmentedControl,
  Select,
  Sheet,
  Spinner,
  Stepper,
  TextField,
  Toggle,
  Toolbar,
  useToast,
} from '../design'
import { formatBytes, formatDate, plural } from '../format'
import { useNav } from '../state/nav'
import { STATUS } from './Welcome'
import './settings.css'

type Changes = Partial<SettingsOut>

const PLATFORM: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }
const CONFIRM_WORD = 'DELETE'

export function Settings() {
  const back = useNav((state) => state.back)
  const previous = useNav((state) => state.previous)
  const client = useQueryClient()
  const toast = useToast()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api('GET /settings') })
  const system = useQuery({ queryKey: ['system'], queryFn: () => api('GET /system') })

  // Optimistic: the switch moves (and the theme changes) before the engine answers.
  const save = useMutation({
    mutationFn: (changes: Changes) => api('PUT /settings', { body: changes }),
    onMutate: async (changes) => {
      await client.cancelQueries({ queryKey: ['settings'] })
      const before = client.getQueryData<SettingsOut>(['settings'])
      if (before) client.setQueryData<SettingsOut>(['settings'], { ...before, ...changes })
      return { before }
    },
    onError: (error, _changes, context) => {
      if (context?.before) client.setQueryData(['settings'], context.before)
      toast({ message: messageOf(error), icon: AlertTriangle })
    },
    onSuccess: (saved) => client.setQueryData(['settings'], saved),
  })

  return (
    <div className="screen">
      <Toolbar
        windowEdgeLeft
        title="Settings"
        leading={
          <Button size="small" variant="plain" icon={ChevronLeft} onClick={back}>
            {previous.name === 'welcome' ? 'Home' : 'Back'}
          </Button>
        }
      />
      <div className="screen-scroll">
        <main className="screen-column settings">
          {!settings.data ? (
            <div className="gate" aria-busy="true">
              <Spinner size={24} />
            </div>
          ) : (
            <>
              <Appearance value={settings.data.appearance} onChange={(appearance) => save.mutate({ appearance })} />
              <Defaults settings={settings.data} onChange={(changes) => save.mutate(changes)} />
              <WhileScreening settings={settings.data} onChange={(changes) => save.mutate(changes)} />
              <Data dataDir={system.data?.data_dir ?? ''} storage={system.data?.storage_bytes ?? null} />
              <About
                engineVersion={system.data?.engine_version ?? '–'}
                ollama={system.data?.ollama ?? null}
                platform={system.data?.platform ?? ''}
                cores={system.data?.cpu_count ?? 0}
              />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ Appearance

function Appearance({
  value,
  onChange,
}: {
  value: SettingsOut['appearance']
  onChange: (v: SettingsOut['appearance']) => void
}) {
  return (
    <Card
      title="Appearance"
      subtitle="System follows your computer's light or dark setting."
      labelledBy="appearance-title"
    >
      <SegmentedControl
        label="Appearance"
        value={value}
        onChange={onChange}
        options={[
          { value: 'system', label: 'System' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </Card>
  )
}

// ------------------------------------------------------------ Defaults

function Defaults({ settings, onChange }: { settings: SettingsOut; onChange: (changes: Changes) => void }) {
  const models = useQuery({ queryKey: ['models'], queryFn: () => api('GET /models') })
  const [band, setBand] = useState({ shortlist: settings.default_shortlist, band: settings.default_band })
  const [minimum, setMinimum] = useState(settings.default_min > 0 ? settings.default_min : 10)
  const save = useRef(onChange)
  save.current = onChange

  // Dragging the band saves once it settles, not on every step.
  useEffect(() => {
    if (band.shortlist === settings.default_shortlist && band.band === settings.default_band) return
    const timer = setTimeout(() => save.current({ default_shortlist: band.shortlist, default_band: band.band }), 400)
    return () => clearTimeout(timer)
  }, [band.shortlist, band.band, settings.default_shortlist, settings.default_band])

  const installed = models.data?.models.map((m) => m.name) ?? []
  const current = settings.default_model
  const names = current && !installed.includes(current) ? [current, ...installed] : installed
  return (
    <Card
      title="New screenings start with"
      subtitle="You can still change these for each screening. A screening that has started keeps its own."
      labelledBy="defaults-title"
    >
      <div className="settings-stack">
        <div className="settings-model">
          <Select
            label="Model"
            value={current ?? ''}
            onChange={(value) => onChange({ default_model: value || null })}
            options={[
              { value: '', label: 'Choose for each screening' },
              ...names.map((name) => ({
                value: name,
                label: installed.includes(name) ? name : `${name} (not installed)`,
              })),
            ]}
          />
        </div>
        <div>
          <span className="atl-callout settings-label">Score bands</span>
          <ScoreBand value={band} onChange={setBand} />
        </div>
        <Toggle
          checked={settings.default_min > 0}
          onChange={(on) => onChange({ default_min: on ? minimum : 0 })}
          label="Always shortlist at least"
          description="Filled candidates are marked, and ties are all included."
        />
        {settings.default_min > 0 && (
          <Stepper
            label="Minimum shortlisted"
            value={settings.default_min}
            min={1}
            max={10000}
            onChange={(value) => {
              setMinimum(value)
              onChange({ default_min: value })
            }}
          />
        )}
      </div>
    </Card>
  )
}

// ------------------------------------------------------------ While screening

function WhileScreening({ settings, onChange }: { settings: SettingsOut; onChange: (changes: Changes) => void }) {
  return (
    <Card title="While screening" labelledBy="while-title">
      <div className="settings-stack">
        <Toggle
          checked={settings.keep_awake}
          onChange={(keep_awake) => onChange({ keep_awake })}
          label="Keep the computer awake"
          description="Only while a screening is running. The display can still turn off."
        />
        <Toggle
          checked={settings.notify_done}
          onChange={(notify_done) => onChange({ notify_done })}
          label="Notify me"
          description="When a screening finishes or needs you, and Atlas isn't in front."
        />
      </div>
    </Card>
  )
}

// ------------------------------------------------------------ Data

function Data({ dataDir, storage }: { dataDir: string; storage: number | null }) {
  const client = useQueryClient()
  const go = useNav((state) => state.go)
  const forget = useNav((state) => state.forget)
  const toast = useToast()
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api('GET /runs') })
  const [target, setTarget] = useState<RunOut | null>(null)
  const [wipeOpen, setWipeOpen] = useState(false)

  const remove = useMutation({
    mutationFn: (run: RunOut) => api('DELETE /runs/{run_id}', { params: { run_id: run.id } }),
    onSuccess: (_result, run) => {
      setTarget(null)
      forget(run.id)
      void client.invalidateQueries({ queryKey: ['runs'] })
      void client.invalidateQueries({ queryKey: ['system'] })
      toast({ message: `Deleted “${run.name}”`, icon: Trash2 })
    },
    onError: (error) => {
      setTarget(null)
      toast({ message: messageOf(error), icon: AlertTriangle })
    },
  })

  const wipe = useMutation({
    mutationFn: () => api('DELETE /data'),
    onSuccess: async () => {
      setWipeOpen(false)
      await client.resetQueries()
      go({ name: 'welcome' })
      toast({ message: 'All Atlas data was deleted from this computer.', icon: Trash2 })
    },
  })

  const all = runs.data ?? []
  const running = all.some((run) => run.status === 'running')
  return (
    <Card title="Data" subtitle="Everything Atlas keeps is in one folder on this computer." labelledBy="data-title">
      <div className="settings-stack">
        <List label="Data folder">
          <ListRow
            icon={HardDrive}
            title="Atlas data folder"
            subtitle={<span className="path">{dataDir}</span>}
            detail={
              <Button
                size="small"
                variant="plain"
                icon={FolderOpen}
                onClick={() => void window.atlas.files.showInFolder({ kind: 'data' })}
              >
                Show in folder
              </Button>
            }
          />
          <ListRow title="Storage used" detail={storage === null ? '–' : formatBytes(storage)} />
        </List>

        {all.length > 0 && (
          <List title="Screenings">
            {all.map((run) => (
              <ListRow
                key={run.id}
                title={run.name}
                subtitle={`${formatDate(run.created_at)} · ${run.total ? plural(run.total, 'student') : 'No students yet'}${
                  run.status === 'running' ? ' · Pause it to delete it' : ''
                }`}
                detail={
                  <span className="settings-run-actions">
                    <Badge tone={STATUS[run.status].tone}>{STATUS[run.status].label}</Badge>
                    <Button
                      size="small"
                      variant="plain"
                      icon={Trash2}
                      aria-label={`Delete ${run.name}`}
                      disabled={run.status === 'running'}
                      onClick={() => setTarget(run)}
                    >
                      Delete
                    </Button>
                  </span>
                }
              />
            ))}
          </List>
        )}

        <div className="settings-danger">
          <div>
            <p className="atl-callout">Delete all data</p>
            <p className="atl-footnote atl-secondary">
              Removes every screening, uploaded file, downloaded résumé, log and setting. CSV files you exported stay
              where you saved them.
            </p>
          </div>
          <Button variant="destructive" disabled={running} onClick={() => setWipeOpen(true)}>
            Delete all data…
          </Button>
        </div>
        {running && <Banner tone="info" title="Pause or cancel the running screening to delete data." />}
      </div>

      <Alert
        open={target !== null}
        title={`Delete “${target?.name ?? ''}”?`}
        message="Its students, scores and history are removed from this computer. CSV files you exported stay where you saved them."
        actions={[
          {
            label: 'Delete',
            variant: 'destructive',
            loading: remove.isPending,
            onClick: () => target && remove.mutate(target),
          },
        ]}
        cancel={{ label: 'Cancel', onClick: () => setTarget(null) }}
      />
      <WipeSheet
        open={wipeOpen}
        pending={wipe.isPending}
        error={wipe.isError ? messageOf(wipe.error) : null}
        onConfirm={() => wipe.mutate()}
        onClose={() => {
          setWipeOpen(false)
          wipe.reset()
        }}
      />
    </Card>
  )
}

function WipeSheet(props: {
  open: boolean
  pending: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (!props.open) setTyped('')
  }, [props.open])
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD
  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title="Delete all Atlas data?"
      description="Every screening, score, uploaded file, downloaded résumé, log and setting is removed from this computer. This can't be undone."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="destructive" disabled={!confirmed} loading={props.pending} onClick={props.onConfirm}>
            Delete everything
          </Button>
        </>
      }
    >
      <div className="settings-stack">
        <TextField
          label={`Type ${CONFIRM_WORD} to confirm`}
          value={typed}
          onChange={setTyped}
          onEnter={() => confirmed && props.onConfirm()}
          placeholder={CONFIRM_WORD}
        />
        {props.error && <Banner tone="error" title={props.error} />}
      </div>
    </Sheet>
  )
}

// ------------------------------------------------------------ About

function About(props: {
  engineVersion: string
  ollama: { running: boolean; version: string | null } | null
  platform: string
  cores: number
}) {
  const info = useQuery({ queryKey: ['app-info'], queryFn: () => window.atlas.app.info(), staleTime: Infinity })
  const ollama = props.ollama
  return (
    <Card
      title="About Atlas"
      labelledBy="about-title"
      accessory={
        <Button size="small" icon={FileText} onClick={() => void window.atlas.files.showInFolder({ kind: 'logs' })}>
          Open logs folder
        </Button>
      }
    >
      <KeyValue
        items={[
          { key: 'Atlas', value: info.data?.version ?? '–' },
          { key: 'Engine', value: `${props.engineVersion} · Running` },
          {
            key: 'Ollama',
            value: !ollama ? '–' : ollama.running ? `Running · ${ollama.version ?? 'unknown version'}` : 'Not running',
          },
          {
            key: 'This computer',
            value: `${PLATFORM[props.platform] ?? props.platform} · ${plural(props.cores, 'processor core')}`,
          },
        ]}
      />
      <p className="atl-footnote atl-secondary settings-note">
        Logs record what Atlas did, never résumé text or student details.
      </p>
    </Card>
  )
}
