import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Circle, Download, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { ModelOut, ModelsOut } from '@shared/api-types'
import { api, messageOf } from '../../api/client'
import { type PullEvent, isPullEvent, useAppEvents } from '../../api/events'
import { Banner, Button, Chip, List, ListRow, ProgressBar, Sheet, Spinner, TextField } from '../../design'
import { formatBytes } from '../../format'

interface ModelPickerProps {
  data: ModelsOut | undefined
  loading: boolean
  checking: boolean
  selected: string | null
  onSelect: (name: string) => void
  onRefresh: () => void
}

const STATUS_TEXT: Record<ModelOut['precheck']['status'], string> = {
  ready: 'Ready',
  not_checked: 'Not tested on this computer yet',
  cant_use: "Can't be used",
}

export function ModelPicker({ data, loading, checking, selected, onSelect, onRefresh }: ModelPickerProps) {
  const client = useQueryClient()
  const [pullOpen, setPullOpen] = useState(false)
  const precheck = useMutation({
    mutationFn: (name: string) => api('POST /models/{name}/precheck', { params: { name } }),
    onSettled: () => void client.invalidateQueries({ queryKey: ['models'] }),
  })

  if (loading) {
    return (
      <div className="model-note">
        <Spinner size={16} /> Looking for models…
      </div>
    )
  }
  if (!data?.ollama_running) {
    return (
      <Banner
        tone="warning"
        title="Ollama isn't running"
        action={{ label: 'Check again', onClick: onRefresh, loading: checking }}
      >
        Atlas uses Ollama to read résumés on this computer. Open the Ollama app (or run “ollama serve”), then check
        again.
      </Banner>
    )
  }

  const choose = (model: ModelOut): void => {
    onSelect(model.name)
    if (model.precheck.status !== 'ready' && !precheck.isPending) precheck.mutate(model.name)
  }
  const testing = precheck.isPending ? precheck.variables : null
  const chosen = data.models.find((m) => m.name === selected)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {data.models.length === 0 ? (
        <p className="atl-callout atl-secondary">No models are installed yet. Get one to start screening.</p>
      ) : (
        <List label="Installed models" choice>
          {data.models.map((model) => (
            <ListRow
              key={model.name}
              title={model.name}
              subtitle={`${formatBytes(model.size_bytes)} · ${testing === model.name ? 'Testing…' : STATUS_TEXT[model.precheck.status]}`}
              icon={
                model.precheck.status === 'ready'
                  ? CheckCircle2
                  : model.precheck.status === 'cant_use'
                    ? XCircle
                    : Circle
              }
              detail={testing === model.name ? <Spinner size={16} label={`Testing ${model.name}`} /> : undefined}
              selectable
              selected={model.name === selected}
              onClick={() => choose(model)}
            />
          ))}
        </List>
      )}

      {testing && (
        <div className="model-note" role="status">
          <Spinner size={14} /> Testing this model… (usually under 2 minutes)
        </div>
      )}
      {!testing && chosen?.precheck.status === 'cant_use' && (
        <Banner
          tone="error"
          title={`${chosen.name} can't be used`}
          action={{ label: 'Test again', onClick: () => precheck.mutate(chosen.name) }}
        >
          {chosen.precheck.message}
        </Banner>
      )}
      {precheck.isError && <Banner tone="error" title={messageOf(precheck.error)} />}

      <div>
        <Button variant="plain" icon={Download} onClick={() => setPullOpen(true)}>
          Get another model
        </Button>
      </div>
      <PullSheet
        open={pullOpen}
        suggestions={data.suggestions}
        onClose={() => setPullOpen(false)}
        onDone={(name) => {
          setPullOpen(false)
          void client.invalidateQueries({ queryKey: ['models'] }).then(() => {
            const full = name.includes(':') ? name : `${name}:latest`
            onSelect(full)
            precheck.mutate(full)
          })
        }}
      />
    </div>
  )
}

const FRIENDLY: Array<[RegExp, string]> = [
  [/^pulling manifest/, 'Starting the download…'],
  [/^pulling/, 'Downloading…'],
  [/^verifying/, 'Checking the download…'],
  [/^writing|^removing/, 'Finishing…'],
  [/^success/, 'Done'],
  [/^cancelled/, 'Cancelled'],
]

function friendly(status: string): string {
  return FRIENDLY.find(([pattern]) => pattern.test(status))?.[1] ?? 'Downloading…'
}

interface PullSheetProps {
  open: boolean
  suggestions: string[]
  onClose: () => void
  onDone: (name: string) => void
}

function PullSheet({ open, suggestions, onClose, onDone }: PullSheetProps) {
  const [name, setName] = useState('')
  const [pulling, setPulling] = useState<string | null>(null)
  const [progress, setProgress] = useState<PullEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useAppEvents((event) => {
    if (!isPullEvent(event) || event.data.name !== pulling) return
    setProgress(event.data)
    if (event.data.done) {
      setPulling(null)
      if (event.data.error) setError(event.data.error)
      else if (event.data.status === 'success') onDone(event.data.name)
    }
  })

  const start = useMutation({
    mutationFn: (model: string) => api('POST /models/{name}/pull', { params: { name: model } }),
    onMutate: (model) => {
      setError(null)
      setProgress(null)
      setPulling(model)
    },
    onError: (failure) => {
      setPulling(null)
      setError(messageOf(failure))
    },
  })

  const cancel = (): void => {
    if (pulling) void api('DELETE /models/{name}/pull', { params: { name: pulling } }).catch(() => undefined)
    setPulling(null)
    setProgress(null)
  }
  const close = (): void => {
    if (pulling) cancel()
    onClose()
  }
  const clean = name.trim()
  const fraction = progress && progress.total > 0 ? progress.completed / progress.total : undefined

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Get another model"
      description="Ollama downloads it from its model library. Models are several gigabytes, so this can take a while."
      footer={
        pulling ? (
          <Button onClick={cancel}>Cancel download</Button>
        ) : (
          <>
            <Button onClick={close}>Close</Button>
            <Button variant="primary" icon={Download} disabled={!clean} onClick={() => start.mutate(clean)}>
              Download
            </Button>
          </>
        )
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <TextField
          label="Model name"
          value={name}
          onChange={setName}
          placeholder="e.g. qwen3:8b"
          onEnter={() => clean && !pulling && start.mutate(clean)}
        />
        {suggestions.length > 0 && (
          <div className="chips" role="group" aria-label="Suggested models">
            {suggestions.map((suggestion) => (
              <Chip key={suggestion} pressed={clean === suggestion} onClick={() => setName(suggestion)}>
                {suggestion}
              </Chip>
            ))}
          </div>
        )}
        {pulling && (
          <div className="pull-progress" role="status">
            <ProgressBar value={fraction} label={`Downloading ${pulling}`} />
            <div className="pull-progress-text">
              <span>{friendly(progress?.status ?? 'pulling manifest')}</span>
              {progress && progress.total > 0 && (
                <span>
                  {formatBytes(progress.completed)} of {formatBytes(progress.total)}
                </span>
              )}
            </div>
          </div>
        )}
        {error && (
          <Banner tone="error" title="The model couldn't be downloaded">
            {error}
          </Banner>
        )}
      </div>
    </Sheet>
  )
}
