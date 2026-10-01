/**
 * IPC between the renderer (via preload) and main. Every handler first checks
 * that the call comes from the app's own window, then validates its
 * arguments (main/validate.ts), then acts. File paths chosen in native
 * dialogs stay in main; the renderer only ever holds opaque handles.
 */

import { randomBytes } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  type BrowserWindow,
  type IpcMainInvokeEvent,
  Menu,
  Notification,
  app,
  clipboard,
  dialog,
  ipcMain,
  shell,
} from 'electron'
import type { ExportOut } from '@shared/api-types'
import type { ApiResult, AppInfo, AtlasEvent, RowMenuChoice } from '@shared/bridge'
import { Channels } from '@shared/bridge'
import type { EngineProcess } from './engine'
import { rowMenuTemplate } from './menus'
import { followEvents } from './sse'
import {
  InvalidArgument,
  MAX_UPLOAD_BYTES,
  TABLE_EXTENSIONS,
  validateApiRequest,
  validateFileName,
  validateFolderTarget,
  validateNotification,
  validateRunId,
  validateRowMenu,
  validateRunIdOrNull,
  validateTheme,
  validateUploadSource,
  settingsWrite,
  validateView,
} from './validate'

export interface IpcContext {
  engine: EngineProcess
  getWindow: () => BrowserWindow | null
  dataDir: string
  logsDir: string
  info: AppInfo
  setTheme: (theme: 'system' | 'light' | 'dark') => void
  /** After a successful PUT /settings or DELETE /data. */
  onSettingsChanged?: () => void
}

const TOO_LARGE: ApiResult<never> = {
  ok: false,
  status: 413,
  error: {
    code: 'file_too_large',
    message: 'This file is larger than 20 MB. Save just the student sheet as .xlsx or CSV and try again.',
  },
}

export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'

export function registerIpc(ctx: IpcContext): void {
  const tables = new Map<string, { path: string; name: string }>()
  const exported = new Set<string>()
  const subscriptions = new Map<string, AbortController>()

  function handle(channel: string, fn: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      const window = ctx.getWindow()
      if (!window || event.sender !== window.webContents) throw new InvalidArgument('Not from the Atlas window.')
      return fn(event, ...args)
    })
  }

  handle(Channels.apiRequest, async (_event, method, path, body) => {
    const checked = validateApiRequest(method, path, body)
    const result = await ctx.engine.request(checked.method, checked.path, checked.body)
    if (result.ok && settingsWrite(checked.method, checked.path)) ctx.onSettingsChanged?.()
    return result
  })

  handle(Channels.subscribe, (event, id, runId) => {
    if (typeof id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(id) || subscriptions.has(id)) {
      throw new InvalidArgument('Bad subscription.')
    }
    const run = validateRunIdOrNull(runId)
    const controller = new AbortController()
    subscriptions.set(id, controller)
    const sender = event.sender
    sender.once('destroyed', () => controller.abort())
    void followEvents({
      url: () => {
        const base = ctx.engine.baseUrl
        return base ? `${base}${run === null ? '/events' : `/runs/${run}/events`}` : null
      },
      headers: () => ctx.engine.authHeaders(),
      lastId: 0,
      engineGeneration: () => ctx.engine.processGeneration,
      resetOnNewEngine: run === null,
      signal: controller.signal,
      onMessage: (message) => {
        if (sender.isDestroyed()) return
        let data: unknown = null
        try {
          data = JSON.parse(message.data)
        } catch {
          return
        }
        const payload: AtlasEvent = {
          stream: run === null ? 'app' : 'run',
          runId: run,
          id: message.id ?? 0,
          kind: message.event,
          data,
        }
        sender.send(Channels.event, id, payload)
      },
    })
    return true
  })

  handle(Channels.unsubscribe, (_event, id) => {
    if (typeof id !== 'string') throw new InvalidArgument('Bad subscription.')
    subscriptions.get(id)?.abort()
    subscriptions.delete(id)
    return true
  })

  handle(Channels.openTable, async () => {
    const window = ctx.getWindow()
    const options = {
      title: 'Choose the student list',
      properties: ['openFile' as const],
      filters: [{ name: 'Student list (CSV or Excel)', extensions: TABLE_EXTENSIONS.map((e) => e.slice(1)) }],
    }
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const path = result.filePaths[0]
    if (result.canceled || !path) return null
    const info = await stat(path)
    const handle = randomBytes(16).toString('hex')
    tables.set(handle, { path, name: basename(path) })
    return { handle, name: basename(path), size: info.size }
  })

  handle(Channels.uploadTable, async (_event, runId, source) => {
    const run = validateRunId(runId)
    const checked = validateUploadSource(source)
    let name: string
    let bytes: ArrayBuffer
    if ('handle' in checked) {
      const file = tables.get(checked.handle)
      if (!file) throw new InvalidArgument('Choose the file again.')
      if ((await stat(file.path)).size > MAX_UPLOAD_BYTES) return TOO_LARGE
      const buffer = await readFile(file.path)
      name = file.name
      bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    } else {
      name = checked.name
      bytes = checked.bytes
      if (bytes.byteLength > MAX_UPLOAD_BYTES) return TOO_LARGE
    }
    return ctx.engine.upload(`/runs/${run}/table`, name, bytes)
  })

  handle(Channels.saveExport, async (_event, runId, view, defaultName) => {
    const run = validateRunId(runId)
    const which = validateView(view)
    const name = validateFileName(defaultName)
    const window = ctx.getWindow()
    const options = {
      title: 'Export results',
      defaultPath: join(app.getPath('documents'), name.toLowerCase().endsWith('.csv') ? name : `${name}.csv`),
      filters: [{ name: 'CSV (opens in Excel)', extensions: ['csv'] }],
    }
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    const path = result.filePath.toLowerCase().endsWith('.csv') ? result.filePath : `${result.filePath}.csv`
    const response = await ctx.engine.request<ExportOut>(
      'POST',
      `/runs/${run}/export`,
      JSON.stringify({ view: which, path }),
    )
    if (response.ok) exported.add(response.data.path)
    return response
  })

  handle(Channels.showInFolder, async (_event, target) => {
    const where = validateFolderTarget(target, exported)
    if (where.kind === 'export') shell.showItemInFolder(where.path)
    else await shell.openPath(where.kind === 'data' ? ctx.dataDir : ctx.logsDir)
    return true
  })

  handle(Channels.appInfo, () => ctx.info)

  handle(Channels.setTheme, (_event, theme) => {
    ctx.setTheme(validateTheme(theme))
    return true
  })

  handle(Channels.engineState, () => ctx.engine.state)

  handle(Channels.restartEngine, () => {
    ctx.engine.restart()
    return true
  })

  // The only web page Atlas opens. Fixed here: the renderer can't choose a URL.
  handle(Channels.openOllamaDownload, async () => {
    await shell.openExternal(OLLAMA_DOWNLOAD_URL)
    return true
  })

  // The native right-click menu for Results rows. "Copy RA number" is done
  // here (the renderer has no clipboard access); the rest goes back to it.
  handle(Channels.rowMenu, (_event, request) => {
    const checked = validateRowMenu(request)
    const window = ctx.getWindow() ?? undefined
    return new Promise<RowMenuChoice>((resolve) => {
      let settled = false
      const finish = (choice: RowMenuChoice): void => {
        if (settled) return
        settled = true
        resolve(choice)
      }
      const template = rowMenuTemplate(checked, process.platform, finish, (text) => clipboard.writeText(text))
      // On macOS the menu can report "closed" just before the click: give the click a moment to land.
      Menu.buildFromTemplate(template).popup({ window, callback: () => setTimeout(() => finish(null), 150) })
    })
  })

  handle(Channels.notify, (_event, request) => {
    const note = validateNotification(request)
    if (Notification.isSupported()) new Notification({ title: note.title, body: note.body }).show()
    return true
  })
}
