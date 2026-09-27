/**
 * The stepped setup flow (ARCHITECTURE §18): a slim step indicator at the
 * top, one primary button at the bottom right, Back on the left. Esc = Back.
 */

import { useQuery } from '@tanstack/react-query'
import { Check, ChevronLeft } from 'lucide-react'
import { type ReactNode, createContext, useContext, useEffect } from 'react'
import type { RunOut } from '@shared/api-types'
import { api } from '../../api/client'
import { Button, Spinner, Toolbar } from '../../design'
import { SETUP_STEPS, type SetupStep, useNav } from '../../state/nav'
import { useSetup } from '../../state/setup'
import { Placeholder } from '../Placeholder'
import { UploadModel } from './UploadModel'

const LABELS: Record<SetupStep, string> = {
  upload: 'Students & model',
  criteria: 'Criteria',
  cutoffs: 'Cutoffs',
  review: 'Review',
}

interface FlowContext {
  run: RunOut
  step: SetupStep
  next: () => void
  back: () => void
}

const Flow = createContext<FlowContext | null>(null)

export function useFlow(): FlowContext {
  const flow = useContext(Flow)
  if (!flow) throw new Error('useFlow outside SetupFlow')
  return flow
}

export function SetupFlow({ runId, step }: { runId: number; step: SetupStep }) {
  const go = useNav((state) => state.go)
  const forRun = useSetup((state) => state.forRun)
  useEffect(() => forRun(runId), [forRun, runId])
  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api('GET /runs/{run_id}', { params: { run_id: runId } }),
  })

  const index = SETUP_STEPS.indexOf(step)
  const back = (): void => {
    const previous = SETUP_STEPS[index - 1]
    go(previous ? { name: 'setup', runId, step: previous } : { name: 'welcome' })
  }
  const next = (): void => {
    const following = SETUP_STEPS[index + 1]
    if (following) go({ name: 'setup', runId, step: following })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        target.blur() // first Esc leaves the field; the next one goes back
        return
      }
      back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!run.data) {
    return (
      <div className="gate" aria-busy="true">
        <Spinner size={24} />
      </div>
    )
  }
  if (run.data.status !== 'draft') {
    return <Placeholder title={run.data.name} />
  }
  return (
    <Flow.Provider value={{ run: run.data, step, next, back }}>
      <div className="screen">
        <Toolbar windowEdgeLeft leading={<Steps current={step} />} />
        {step === 'upload' && <UploadModel />}
        {step !== 'upload' && <Placeholder title={LABELS[step]} />}
      </div>
    </Flow.Provider>
  )
}

function Steps({ current }: { current: SetupStep }) {
  const index = SETUP_STEPS.indexOf(current)
  return (
    <ol className="setup-steps" aria-label="Setup steps">
      {SETUP_STEPS.map((step, i) => (
        <li key={step} style={{ display: 'contents' }}>
          {i > 0 && <span className="setup-step-line" aria-hidden />}
          <span className="setup-step" aria-current={i === index ? 'step' : undefined} data-done={i < index}>
            <span className="setup-step-dot" aria-hidden>
              {i < index ? <Check size={12} strokeWidth={2.5} /> : i + 1}
            </span>
            {LABELS[step]}
            {i < index && <span className="atl-visually-hidden"> (done)</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** The bottom bar: Back on the left, one primary action on the right. */
export function SetupBar({ primary, hint }: { primary: ReactNode; hint?: ReactNode }) {
  const { back, step } = useFlow()
  return (
    <div className="setup-bar">
      <Button variant="secondary" icon={ChevronLeft} onClick={back}>
        {step === 'upload' ? 'Home' : 'Back'}
      </Button>
      {hint && <span className="setup-bar-hint">{hint}</span>}
      {primary}
    </div>
  )
}
