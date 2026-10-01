/**
 * The contract between the renderer and Electron main: `window.atlas`.
 *
 * The renderer never talks to the engine directly and never sees the API
 * token: every call goes through main, which adds the token, checks the
 * route against the engine's own schema, and hands back `{ ok, data }` or
 * `{ ok: false, error }` with the engine's recruiter-readable message.
 */

import type { ExportOut, PreflightOut } from './api-types'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiErrorBody {
  code: string
  message: string
}

export type ApiResult<T> = { ok: true; status: number; data: T } | { ok: false; status: number; error: ApiErrorBody }

export type EngineStateName = 'starting' | 'ready' | 'restarting' | 'failed' | 'stopped'

export interface EngineState {
  state: EngineStateName
  /** Shown on the error screen when the engine can't be started. */
  message?: string
}

/** One Server-Sent Event from the engine, forwarded by main. */
export interface AtlasEvent {
  stream: 'run' | 'app'
  runId: number | null
  id: number
  kind: string
  data: unknown
}

/** A file chosen in the native open dialog. The path stays in main. */
export interface FileHandle {
  handle: string
  name: string
  size: number
}

export type UploadSource = { handle: string } | { name: string; bytes: ArrayBuffer }

export type ExportView = 'all' | 'shortlisted' | 'cutoff' | 'rejected' | 'failed'

export type Theme = 'system' | 'light' | 'dark'

export type FolderTarget = { kind: 'export'; path: string } | { kind: 'data' } | { kind: 'logs' }

export interface AppInfo {
  platform: 'darwin' | 'win32' | 'linux'
  version: string
  packaged: boolean
  /** True under the Playwright end-to-end tests (fixed materials, no dialogs). */
  e2e: boolean
  /** True when the window has a native material (vibrancy / Mica) behind the sidebar. */
  material: boolean
}

export interface NotificationRequest {
  title: string
  body: string
}

export type NavigateTarget = 'settings' | 'welcome'

export interface AtlasBridge {
  api: {
    request<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<ApiResult<T>>
  }
  events: {
    /** `runId` = that run's events; `null` = app events (model pulls, run status). Returns unsubscribe. */
    subscribe(runId: number | null, onEvent: (event: AtlasEvent) => void): () => void
  }
  files: {
    openTable(): Promise<FileHandle | null>
    uploadTable(runId: number, source: UploadSource): Promise<ApiResult<PreflightOut>>
    /** Native save dialog, then the engine writes the CSV there. `null` if cancelled. */
    saveExport(runId: number, view: ExportView, defaultName: string): Promise<ApiResult<ExportOut> | null>
    showInFolder(target: FolderTarget): Promise<void>
  }
  app: {
    info(): Promise<AppInfo>
    setTheme(theme: Theme): Promise<void>
    engineState(): Promise<EngineState>
    onEngineState(listener: (state: EngineState) => void): () => void
    onNavigate(listener: (target: NavigateTarget) => void): () => void
    restartEngine(): Promise<void>
    /** Opens https://ollama.com/download in the browser (the URL is fixed in main). */
    openOllamaDownload(): Promise<void>
  }
  notifications: {
    show(notification: NotificationRequest): Promise<void>
  }
}

/** IPC channel names (main ↔ preload). */
export const Channels = {
  apiRequest: 'atlas:api-request',
  subscribe: 'atlas:subscribe',
  unsubscribe: 'atlas:unsubscribe',
  event: 'atlas:event',
  openTable: 'atlas:open-table',
  uploadTable: 'atlas:upload-table',
  saveExport: 'atlas:save-export',
  showInFolder: 'atlas:show-in-folder',
  appInfo: 'atlas:app-info',
  setTheme: 'atlas:set-theme',
  engineState: 'atlas:engine-state',
  engineStateChanged: 'atlas:engine-state-changed',
  navigate: 'atlas:navigate',
  restartEngine: 'atlas:restart-engine',
  openOllamaDownload: 'atlas:open-ollama-download',
  notify: 'atlas:notify',
} as const
