import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileSpreadsheet } from 'lucide-react'
import { type DragEvent, useEffect, useState } from 'react'
import type { PreflightOut } from '@shared/api-types'
import type { ApiResult, UploadSource } from '@shared/bridge'
import { ApiFailure, api, messageOf } from '../../api/client'
import { Badge, Banner, Button, Card, Spinner, TextField } from '../../design'
import { useSetup } from '../../state/setup'
import { ModelPicker } from './ModelPicker'
import { Preflight } from './Preflight'
import { SetupBar, useFlow } from './SetupFlow'

export function UploadModel() {
  const { run, next } = useFlow()
  const client = useQueryClient()
  const report = useSetup((state) => state.report)
  const setReport = useSetup((state) => state.setReport)
  const model = useSetup((state) => state.model)
  const setModel = useSetup((state) => state.setModel)
  const [name, setName] = useState(run.name)
  const models = useQuery({ queryKey: ['models'], queryFn: () => api('GET /models') })

  useEffect(() => {
    if (model === null && run.model_name) setModel(run.model_name)
  }, [model, run.model_name, setModel])

  const rename = useMutation({
    mutationFn: (value: string) => api('PATCH /runs/{run_id}', { params: { run_id: run.id }, body: { name: value } }),
    onSuccess: (updated) => client.setQueryData(['run', run.id], updated),
  })

  const upload = useMutation({
    mutationFn: async (source: UploadSource): Promise<PreflightOut> => {
      let result: ApiResult<PreflightOut>
      try {
        result = await window.atlas.files.uploadTable(run.id, source)
      } catch {
        throw new ApiFailure("This file can't be read. Choose it again.", 'unreadable', 0)
      }
      if (!result.ok) throw new ApiFailure(result.error.message, result.error.code, result.status)
      return result.data
    },
    onSuccess: (data) => setReport(data),
  })

  const choose = async (): Promise<void> => {
    const file = await window.atlas.files.openTable()
    if (file) upload.mutate({ handle: file.handle })
  }

  const discard = useMutation({
    mutationFn: () => api('DELETE /runs/{run_id}/table', { params: { run_id: run.id } }),
    onSettled: () => setReport(null),
  })

  const save = useMutation({
    mutationFn: () => api('PATCH /runs/{run_id}', { params: { run_id: run.id }, body: { model_name: model } }),
    onSuccess: (updated) => {
      // The engine's answer is the run now; the next step must not see an older copy.
      client.setQueryData(['run', run.id], updated)
      next()
    },
  })

  const selected = models.data?.models.find((m) => m.name === model)
  const modelReady = selected?.precheck.status === 'ready'
  const fileReady = Boolean(report?.ok)
  const hint = !fileReady
    ? report
      ? 'Fix the problems in the file to continue.'
      : 'Add the student list to continue.'
    : !modelReady
      ? 'Choose a model that is ready.'
      : undefined

  return (
    <>
      <div className="screen-scroll">
        <main className="screen-column">
          <div className="screen-head">
            <h1 className="atl-large-title">Students and model</h1>
            <p className="atl-body atl-secondary">
              Add the list of students, then choose the model that reads their résumés.
            </p>
          </div>

          <TextField
            label="Screening name"
            value={name}
            onChange={setName}
            hint="Shown on the Welcome screen."
            maxLength={120}
            onBlur={() => {
              const clean = name.trim()
              if (clean && clean !== run.name) rename.mutate(clean)
              else if (!clean) setName(run.name)
            }}
          />

          <Card
            title="Student list"
            subtitle="A CSV or Excel (.xlsx) file, up to 20 MB."
            labelledBy="student-list-title"
          >
            {upload.isPending ? (
              <div className="dropzone" aria-busy="true">
                <Spinner size={24} label="Checking the file" />
                <span className="atl-callout">Checking the file…</span>
              </div>
            ) : report ? (
              <Preflight report={report} onReplace={() => discard.mutate()} />
            ) : (
              <DropZone onFile={(source) => upload.mutate(source)} onChoose={() => void choose()} />
            )}
            {upload.isError && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <Banner tone="error" title="The file couldn't be checked">
                  {messageOf(upload.error)}
                </Banner>
              </div>
            )}
          </Card>

          <InputFields />

          <Card title="Model" subtitle="Runs on this computer. Nothing is sent anywhere." labelledBy="model-title">
            <ModelPicker
              data={models.data}
              loading={models.isLoading}
              checking={models.isFetching}
              selected={model}
              onSelect={setModel}
              onRefresh={() => void models.refetch()}
            />
          </Card>
          {save.isError && <Banner tone="error" title={messageOf(save.error)} />}
        </main>
      </div>
      <SetupBar
        hint={hint}
        primary={
          <Button
            variant="primary"
            disabled={!fileReady || !modelReady}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Continue
          </Button>
        }
      />
    </>
  )
}

/** The columns a student list must have, as the engine reads them (GET /input-format). */
function InputFields() {
  const format = useQuery({
    queryKey: ['input-format'],
    queryFn: () => api('GET /input-format'),
    staleTime: Infinity,
  })
  return (
    <Card
      title="Input fields"
      subtitle="The columns Atlas reads from the student list. Column order doesn’t matter, and neither do capitals, spaces or dots in the names. Other columns aren’t used."
      labelledBy="input-fields-title"
    >
      {format.isLoading ? (
        <Spinner size={20} label="Loading the input fields" />
      ) : format.data ? (
        <>
          <p className="atl-footnote atl-secondary">
            File types: {format.data.file_types.join(', ')}. Save an old .xls file as .xlsx first.
          </p>
          <ul className="input-fields" aria-label="Input fields">
            {format.data.columns.map((column) => (
              <li key={column.label} className="input-field">
                <div className="input-field-head">
                  <span className="atl-headline">{column.label}</span>
                  {column.required ? <Badge tone="accent">Required</Badge> : <Badge>Optional</Badge>}
                </div>
                <span className="atl-footnote atl-secondary">{column.help}</span>
                {column.also_accepted.length > 0 && (
                  <span className="atl-caption atl-tertiary">Also accepted: {column.also_accepted.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Banner tone="error" title="The input fields couldn’t be loaded">
          {messageOf(format.error)}
        </Banner>
      )}
    </Card>
  )
}

function DropZone({ onFile, onChoose }: { onFile: (source: UploadSource) => void; onChoose: () => void }) {
  const [over, setOver] = useState(false)
  const onDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    setOver(false)
    const file = event.dataTransfer.files[0]
    if (file) onFile({ name: file.name, bytes: await file.arrayBuffer() })
  }
  return (
    <div
      className="dropzone"
      data-over={over}
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => void onDrop(event)}
    >
      <FileSpreadsheet aria-hidden size={32} strokeWidth={1.5} />
      <span className="atl-headline">Drop the student list here</span>
      <span className="atl-footnote">Nothing is saved until you start screening.</span>
      <Button onClick={onChoose}>Choose file…</Button>
    </div>
  )
}
