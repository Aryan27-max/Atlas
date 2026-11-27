import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api, messageOf } from '../../api/client'
import { Banner, Button, Card, Chip, ScoreBand, Stepper, TextField, Toggle } from '../../design'
import { plural } from '../../format'
import { useSetup } from '../../state/setup'
import { SetupBar, useFlow } from './SetupFlow'

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

export function Cutoffs() {
  const { run, next } = useFlow()
  const client = useQueryClient()
  const report = useSetup((state) => state.report)
  const [band, setBand] = useState({ shortlist: run.shortlist_cutoff, band: run.maybe_cutoff })
  const [useMinimum, setUseMinimum] = useState(run.min_shortlist > 0)
  const [minimum, setMinimum] = useState(run.min_shortlist > 0 ? run.min_shortlist : 10)
  const [useCgpa, setUseCgpa] = useState(run.cgpa_min !== null)
  const [cgpa, setCgpa] = useState(run.cgpa_min ?? 7.0)
  const [departments, setDepartments] = useState<string[]>(run.departments_allowed ?? [])

  const available = report?.departments ?? []
  const filters = useDebounced(
    { cgpa_min: useCgpa ? cgpa : undefined, departments: departments.length ? departments : undefined },
    150,
  )
  const preview = useQuery({
    queryKey: ['filter-preview', run.id, filters],
    queryFn: () => api('GET /runs/{run_id}/filters/preview', { params: { run_id: run.id }, query: filters }),
    placeholderData: keepPreviousData,
  })
  const byCgpa = useQuery({
    queryKey: ['filter-preview', run.id, { cgpa_min: useCgpa ? cgpa : undefined }],
    queryFn: () => api('GET /runs/{run_id}/filters/preview', { params: { run_id: run.id }, query: { cgpa_min: cgpa } }),
    enabled: useCgpa,
    placeholderData: keepPreviousData,
  })
  const byDepartment = useQuery({
    queryKey: ['filter-preview', run.id, { departments }],
    queryFn: () => api('GET /runs/{run_id}/filters/preview', { params: { run_id: run.id }, query: { departments } }),
    enabled: departments.length > 0,
    placeholderData: keepPreviousData,
  })

  const removeDepartment = (name: string): void => setDepartments((all) => all.filter((d) => d !== name))

  // The recruiter types a department; the engine says whether the student list has it
  // (same matching as the filter: "cse" finds "C.S.E."). Only departments in the file can be added.
  const [typed, setTyped] = useState('')
  const [typedError, setTypedError] = useState<string | undefined>()
  const addDepartment = useMutation({
    mutationFn: (name: string) =>
      api('GET /runs/{run_id}/departments/match', { params: { run_id: run.id }, query: { name } }),
    onSuccess: (match) => {
      if (match.name === null) {
        setTypedError(match.message ?? undefined)
      } else if (departments.includes(match.name)) {
        setTypedError(`${match.name} is already added.`)
      } else {
        setDepartments((all) => [...all, match.name as string])
        setTyped('')
        setTypedError(undefined)
      }
    },
    onError: (error) => setTypedError(messageOf(error)),
  })
  const submitDepartment = (): void => {
    const name = typed.trim()
    if (!name) {
      setTypedError('Type a department first.')
      return
    }
    addDepartment.mutate(name)
  }
  const countOf = (name: string): number | undefined => available.find((d) => d.name === name)?.count

  const save = useMutation({
    mutationFn: () =>
      api('PATCH /runs/{run_id}', {
        params: { run_id: run.id },
        body: {
          shortlist_cutoff: band.shortlist,
          maybe_cutoff: band.band,
          min_shortlist: useMinimum ? minimum : 0,
          cgpa_min: useCgpa ? cgpa : null,
          departments_allowed: departments.length ? departments : null,
        },
      }),
    onSuccess: (updated) => {
      // The engine's answer is the run now; the next step must not see an older copy.
      client.setQueryData(['run', run.id], updated)
      next()
    },
  })

  const total = preview.data?.total ?? report?.summary.ready ?? 0
  const remaining = preview.data?.remaining ?? total
  const zones = useMemo(
    () =>
      `Shortlisted: ${band.shortlist} and above. Cutoff: ${band.band} to ${Math.max(band.band, band.shortlist - 1)}. Rejected: below ${band.band}.`,
    [band],
  )

  return (
    <>
      <div className="screen-scroll">
        <main className="screen-column">
          <div className="screen-head">
            <h1 className="atl-large-title">Cutoffs</h1>
            <p className="atl-body atl-secondary">Choose which scores go where. The model scores; these decide.</p>
          </div>

          <Card title="Score bands" subtitle={zones} labelledBy="bands-title">
            <ScoreBand value={band} onChange={setBand} />
            <div className="cutoff-steppers">
              <div className="cutoff-stepper">
                <span className="atl-callout">Shortlist at</span>
                <Stepper
                  label="Shortlist score"
                  value={band.shortlist}
                  min={0}
                  max={100}
                  onChange={(v) => setBand({ shortlist: v, band: Math.min(band.band, v) })}
                />
              </div>
              <div className="cutoff-stepper">
                <span className="atl-callout">Cutoff band starts at</span>
                <Stepper
                  label="Cutoff band starts at"
                  value={band.band}
                  min={0}
                  max={100}
                  onChange={(v) => setBand({ shortlist: Math.max(band.shortlist, v), band: v })}
                />
              </div>
            </div>
          </Card>

          <Card title="Minimum shortlisted" labelledBy="minimum-title">
            <div className="status-lines">
              <Toggle
                checked={useMinimum}
                onChange={setUseMinimum}
                label="Always shortlist at least"
                description="If fewer candidates reach the shortlist score, Atlas fills up to this number by rank. Filled candidates are marked, and ties are all included."
              />
              {useMinimum && (
                <Stepper label="Minimum shortlisted" value={minimum} min={1} max={10000} onChange={setMinimum} />
              )}
            </div>
          </Card>

          <Card
            title="Filters"
            subtitle="Optional. Students removed here are never downloaded or scored."
            labelledBy="filters-title"
          >
            <div className="status-lines">
              <Toggle
                checked={useCgpa}
                onChange={setUseCgpa}
                label="Minimum CGPA"
                description={
                  useCgpa && byCgpa.data
                    ? `Removes ${plural(byCgpa.data.removed_by_cgpa, 'student')}. Students without a CGPA are kept.`
                    : 'Students without a CGPA are kept.'
                }
              />
              {useCgpa && <Stepper label="Minimum CGPA" value={cgpa} min={0} max={10} step={0.1} onChange={setCgpa} />}

              <div className="field-group">
                <span className="atl-callout">Only these departments</span>
                {available.length ? (
                  <>
                    <div className="department-add">
                      <TextField
                        label="Add a department"
                        hideLabel
                        placeholder="Department, as in the student list"
                        value={typed}
                        maxLength={200}
                        onChange={(value) => {
                          setTyped(value)
                          setTypedError(undefined)
                        }}
                        onEnter={submitDepartment}
                        error={typedError}
                      />
                      <Button loading={addDepartment.isPending} onClick={submitDepartment}>
                        Add
                      </Button>
                    </div>
                    {departments.length > 0 && (
                      <div className="chips" role="group" aria-label="Departments">
                        {departments.map((name) => {
                          const count = countOf(name)
                          return (
                            <Chip
                              key={name}
                              pressed
                              onClick={() => removeDepartment(name)}
                              description={`Remove ${name}${count === undefined ? '' : `, ${plural(count, 'student')}`}`}
                            >
                              {name}
                              {count !== undefined && <span className="atl-tabular chip-count">{count}</span>}
                              <X aria-hidden size={12} strokeWidth={2} />
                            </Chip>
                          )
                        })}
                      </div>
                    )}
                    <span className="atl-footnote atl-secondary">
                      {departments.length === 0
                        ? 'None selected: every department is included.'
                        : byDepartment.data
                          ? `Removes ${plural(byDepartment.data.removed_by_department, 'student')} from other departments.`
                          : ''}
                    </span>
                  </>
                ) : (
                  <span className="atl-footnote atl-secondary">
                    {report
                      ? 'The file has no department column.'
                      : 'Add the student list again (step 1) to filter by department.'}
                  </span>
                )}
              </div>
            </div>
          </Card>

          {total > 0 && (
            <p className="atl-callout" role="status" aria-live="polite">
              <strong className="atl-tabular">{remaining.toLocaleString()}</strong> of {plural(total, 'student')} will
              be screened.
            </p>
          )}

          <div className="status-line">
            <Info className="atl-tertiary" aria-hidden size={18} strokeWidth={1.75} />
            <span className="atl-callout atl-secondary">
              You can change cutoffs later on the results screen. Filters can't be changed after starting.
            </span>
          </div>
          {save.isError && <Banner tone="error" title={messageOf(save.error)} />}
        </main>
      </div>
      <SetupBar
        primary={
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Continue
          </Button>
        }
      />
    </>
  )
}
