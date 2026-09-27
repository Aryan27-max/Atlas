import { beforeEach, describe, expect, it } from 'vitest'
import { useNav, viewForRun } from './nav'

beforeEach(() => useNav.setState({ view: { name: 'welcome' }, previous: { name: 'welcome' } }))

describe('nav', () => {
  it('Settings returns to where it was opened from', () => {
    const { go } = useNav.getState()
    go({ name: 'results', runId: 4 })
    go({ name: 'settings' })
    expect(useNav.getState().previous).toEqual({ name: 'results', runId: 4 })
    useNav.getState().back()
    expect(useNav.getState().view).toEqual({ name: 'results', runId: 4 })
  })

  it('forgets a deleted run, so Back goes Home instead', () => {
    const { go } = useNav.getState()
    go({ name: 'results', runId: 4 })
    go({ name: 'settings' })
    useNav.getState().forget(9)
    expect(useNav.getState().previous).toEqual({ name: 'results', runId: 4 })
    useNav.getState().forget(4)
    expect(useNav.getState().previous).toEqual({ name: 'welcome' })
    useNav.getState().back()
    expect(useNav.getState().view).toEqual({ name: 'welcome' })
  })

  it('opens a run on the screen for its status', () => {
    expect(viewForRun({ id: 1, status: 'draft' })).toEqual({ name: 'setup', runId: 1, step: 'upload' })
    expect(viewForRun({ id: 1, status: 'paused' })).toEqual({ name: 'progress', runId: 1 })
    expect(viewForRun({ id: 1, status: 'cancelled' })).toEqual({ name: 'results', runId: 1 })
  })
})
