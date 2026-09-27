/**
 * Main follows run status changes (the engine's `run_status` app events) to:
 *   - hold `powerSaveBlocker('prevent-app-suspension')` while any run is running
 *     (if "Keep computer awake" is on), and
 *   - show a notification when a run completes, or pauses for a reason that
 *     needs the recruiter, while the window isn't focused (if "Notify when done").
 * It also answers "is anything running?" for the close confirmation.
 */

import type { ApiResult } from '@shared/bridge'

export interface RunStatus {
  run_id: number
  name: string
  status: string
  pause_reason: string | null
  auto_resume: boolean
}

/** Pauses the recruiter caused or that resume by themselves don't need a notification. */
const QUIET_REASONS = new Set(['Paused by you', 'Atlas was closed'])

export function notificationFor(
  previous: RunStatus | undefined,
  next: RunStatus,
): { title: string; body: string } | null {
  const changed = previous?.status !== next.status || previous?.pause_reason !== next.pause_reason
  if (!changed) return null
  if (next.status === 'completed') {
    return { title: 'Screening complete', body: `"${next.name}" is ready to review.` }
  }
  if (next.status === 'paused' && !next.auto_resume && next.pause_reason && !QUIET_REASONS.has(next.pause_reason)) {
    return { title: 'Screening paused', body: `"${next.name}": ${next.pause_reason}` }
  }
  return null
}

interface Preferences {
  keep_awake: boolean
  notify_done: boolean
}

export interface RunWatcherDeps {
  request: <T>(method: string, path: string) => Promise<ApiResult<T>>
  keepAwake: { start(): number; stop(id: number): void }
  notify: (title: string, body: string) => void
  windowFocused: () => boolean
}

export class RunWatcher {
  private readonly statuses = new Map<number, RunStatus>()
  private blocker: number | null = null
  private preferences: Preferences = { keep_awake: true, notify_done: true }
  private preferencesAt = 0

  constructor(private readonly deps: RunWatcherDeps) {}

  /** Load the current runs (no notifications for what was already true). */
  async seed(): Promise<void> {
    const runs = await this.deps.request<Array<Record<string, unknown>>>('GET', '/runs')
    if (runs.ok) {
      for (const run of runs.data) {
        const status: RunStatus = {
          run_id: Number(run.id),
          name: String(run.name),
          status: String(run.status),
          pause_reason: (run.pause_reason as string | null) ?? null,
          auto_resume: Boolean(run.auto_resume),
        }
        this.statuses.set(status.run_id, status)
      }
    }
    await this.apply()
  }

  async handle(next: RunStatus): Promise<void> {
    const previous = this.statuses.get(next.run_id)
    this.statuses.set(next.run_id, next)
    await this.refreshPreferences()
    await this.apply()
    const note = notificationFor(previous, next)
    if (note && this.preferences.notify_done && !this.deps.windowFocused()) this.deps.notify(note.title, note.body)
  }

  anyRunning(): boolean {
    return [...this.statuses.values()].some((s) => s.status === 'running')
  }

  holdingKeepAwake(): boolean {
    return this.blocker !== null
  }

  private async refreshPreferences(force = false): Promise<void> {
    if (!force && Date.now() - this.preferencesAt < 5_000) return
    const result = await this.deps.request<Preferences>('GET', '/settings')
    if (result.ok) {
      this.preferences = { keep_awake: result.data.keep_awake, notify_done: result.data.notify_done }
      this.preferencesAt = Date.now()
    }
  }

  /** Settings changed (or were reset): re-read them now, not in five seconds. */
  async preferencesChanged(): Promise<void> {
    await this.refreshPreferences(true)
    await this.apply()
  }

  async apply(): Promise<void> {
    await this.refreshPreferences()
    const want = this.preferences.keep_awake && this.anyRunning()
    if (want && this.blocker === null) this.blocker = this.deps.keepAwake.start()
    if (!want && this.blocker !== null) {
      this.deps.keepAwake.stop(this.blocker)
      this.blocker = null
    }
  }

  release(): void {
    if (this.blocker !== null) this.deps.keepAwake.stop(this.blocker)
    this.blocker = null
  }
}
