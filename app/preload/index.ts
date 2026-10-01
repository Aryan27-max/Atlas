/**
 * The only bridge between the renderer and the rest of the app.
 *
 * Sandboxed preload: it can use `contextBridge` and `ipcRenderer`, nothing
 * else from Node. It exposes `window.atlas` (src/shared/bridge.ts) and holds
 * no secrets: the engine's credentials live in main only.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { type AtlasBridge, type AtlasEvent, Channels, type EngineState, type NavigateTarget } from '@shared/bridge'

const listeners = new Map<string, (event: AtlasEvent) => void>()

ipcRenderer.on(Channels.event, (_event: IpcRendererEvent, id: string, payload: AtlasEvent) => {
  listeners.get(id)?.(payload)
})

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function on<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const atlas: AtlasBridge = {
  api: {
    request: (method, path, body) => ipcRenderer.invoke(Channels.apiRequest, method, path, body),
  },
  events: {
    subscribe(runId, onEvent) {
      const id = newId()
      listeners.set(id, onEvent)
      void ipcRenderer.invoke(Channels.subscribe, id, runId)
      return () => {
        listeners.delete(id)
        void ipcRenderer.invoke(Channels.unsubscribe, id)
      }
    },
  },
  files: {
    openTable: () => ipcRenderer.invoke(Channels.openTable),
    uploadTable: (runId, source) => ipcRenderer.invoke(Channels.uploadTable, runId, source),
    saveExport: (runId, view, defaultName) => ipcRenderer.invoke(Channels.saveExport, runId, view, defaultName),
    showInFolder: (target) => ipcRenderer.invoke(Channels.showInFolder, target),
  },
  app: {
    info: () => ipcRenderer.invoke(Channels.appInfo),
    setTheme: (theme) => ipcRenderer.invoke(Channels.setTheme, theme),
    engineState: () => ipcRenderer.invoke(Channels.engineState),
    onEngineState: (listener) => on<EngineState>(Channels.engineStateChanged, listener),
    onNavigate: (listener) => on<NavigateTarget>(Channels.navigate, listener),
    restartEngine: () => ipcRenderer.invoke(Channels.restartEngine),
    openOllamaDownload: () => ipcRenderer.invoke(Channels.openOllamaDownload),
  },
  notifications: {
    show: (notification) => ipcRenderer.invoke(Channels.notify, notification),
  },
  menus: {
    resultRows: (request) => ipcRenderer.invoke(Channels.rowMenu, request),
  },
}

contextBridge.exposeInMainWorld('atlas', atlas)
