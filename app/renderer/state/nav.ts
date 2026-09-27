/**
 * Where the recruiter is. Plain navigation state only: which screen, which
 * run, which setup step. Everything about the run itself comes from the engine.
 */

import { create } from 'zustand'

export type SetupStep = 'upload' | 'criteria' | 'cutoffs' | 'review'
export const SETUP_STEPS: readonly SetupStep[] = ['upload', 'criteria', 'cutoffs', 'review']

export type View =
  | { name: 'welcome' }
  | { name: 'setup'; runId: number; step: SetupStep }
  | { name: 'progress'; runId: number }
  | { name: 'results'; runId: number }
  | { name: 'settings' }

interface NavState {
  view: View
  /** Where Settings returns to. */
  previous: View
  go: (view: View) => void
  back: () => void
}

export const useNav = create<NavState>((set) => ({
  view: { name: 'welcome' },
  previous: { name: 'welcome' },
  go: (view) => set((state) => ({ view, previous: view.name === 'settings' ? state.view : state.previous })),
  back: () => set((state) => ({ view: state.previous, previous: { name: 'welcome' } })),
}))

/** Screen for a run, by its status. */
export function viewForRun(run: { id: number; status: string }): View {
  if (run.status === 'draft') return { name: 'setup', runId: run.id, step: 'upload' }
  if (run.status === 'running' || run.status === 'paused') return { name: 'progress', runId: run.id }
  return { name: 'results', runId: run.id }
}
