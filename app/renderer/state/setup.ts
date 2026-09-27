/**
 * What the setup flow holds between steps that the engine doesn't keep for us:
 * the pre-flight report of the file just checked (the engine keeps the file,
 * not the report) and the model the recruiter is choosing. Everything else
 * (name, model once chosen, criteria, cutoffs, filters) is saved on the draft
 * run in the engine as the recruiter goes.
 */

import { create } from 'zustand'
import type { PreflightOut } from '@shared/api-types'

interface SetupState {
  runId: number | null
  report: PreflightOut | null
  model: string | null
  forRun: (runId: number) => void
  setReport: (report: PreflightOut | null) => void
  setModel: (model: string | null) => void
}

export const useSetup = create<SetupState>((set, get) => ({
  runId: null,
  report: null,
  model: null,
  forRun: (runId) => {
    if (get().runId !== runId) set({ runId, report: null, model: null })
  },
  setReport: (report) => set({ report }),
  setModel: (model) => set({ model }),
}))
