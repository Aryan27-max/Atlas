/**
 * Live events from the engine (forwarded by main over IPC).
 *   useRunEvents(runId, fn): that run's events table (Scored…, Failed…, status changes)
 *   useAppEvents(fn):        model pulls and run status changes
 */

import { useEffect, useRef } from 'react'
import type { AtlasEvent } from '@shared/bridge'

function useSubscription(runId: number | null, enabled: boolean, handler: (event: AtlasEvent) => void): void {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!enabled) return
    return window.atlas.events.subscribe(runId, (event) => latest.current(event))
  }, [runId, enabled])
}

export function useRunEvents(runId: number | null, handler: (event: AtlasEvent) => void): void {
  useSubscription(runId, runId !== null, handler)
}

export function useAppEvents(handler: (event: AtlasEvent) => void): void {
  useSubscription(null, true, handler)
}

export interface PullEvent {
  name: string
  status: string
  completed: number
  total: number
  done: boolean
  error: string | null
}

export function isPullEvent(event: AtlasEvent): event is AtlasEvent & { data: PullEvent } {
  return event.kind === 'pull' && typeof event.data === 'object' && event.data !== null && 'name' in event.data
}
