/**
 * Electron main: one window, one engine (ARCHITECTURE §2).
 *
 * Environment (development and tests only; ignored when packaged):
 *   ATLAS_USER_DATA      use this folder instead of the OS app-data folder
 *   ATLAS_E2E=1          Playwright: no window materials (stable screenshots)
 *   ATLAS_PYTHON, ATLAS_ENGINE_MODULE, ATLAS_OLLAMA_URL   see main/engine.ts
 */

import { join } from 'node:path'
import {
  BrowserWindow,
  Menu,
  Notification,
  type MenuItemConstructorOptions,
  app,
  dialog,
  nativeTheme,
  powerSaveBlocker,
  screen,
  session,
} from 'electron'
import type { AppInfo, NavigateTarget, Theme } from '@shared/bridge'
import { Channels } from '@shared/bridge'
import { EngineProcess, engineCommand } from './engine'
import { registerIpc } from './ipc'
import { RunWatcher, type RunStatus } from './runs'
import { hardenContents, hardenSession } from './security'
import { followEvents } from './sse'
import { MIN_HEIGHT, MIN_WIDTH, loadBounds, saveBounds } from './window-state'

const isMac = process.platform === 'darwin'
const isWin = process.platform === 'win32'
const devServer = !app.isPackaged ? (process.env.ELECTRON_RENDERER_URL ?? null) : null
const e2e = !app.isPackaged && process.env.ATLAS_E2E === '1'

if (!app.isPackaged && process.env.ATLAS_USER_DATA) app.setPath('userData', process.env.ATLAS_USER_DATA)
if (isWin) app.setAppUserModelId('com.atlas.screening')

let window: BrowserWindow | null = null
let allowQuit = false

const userData = app.getPath('userData')
const engine = new EngineProcess(
  engineCommand({
    packaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    dataDir: userData,
    platform: process.platform,
    env: process.env,
  }),
)

const watcher = new RunWatcher({
  request: (method, path) => engine.request(method, path),
  keepAwake: {
    start: () => powerSaveBlocker.start('prevent-app-suspension'),
    stop: (id) => powerSaveBlocker.stop(id),
  },
  notify: (title, body) => {
    if (Notification.isSupported()) new Notification({ title, body }).show()
  },
  windowFocused: () => window?.isFocused() ?? false,
})

const material = !e2e && (isMac || isWin)

function overlayColors(): { color: string; symbolColor: string; height: number } {
  const dark = nativeTheme.shouldUseDarkColors
  if (material) return { color: '#00000000', symbolColor: dark ? '#f5f5f7' : '#1d1d1f', height: 52 }
  return { color: dark ? '#1c1c1e' : '#f5f5f7', symbolColor: dark ? '#f5f5f7' : '#1d1d1f', height: 52 }
}

function setTheme(theme: Theme): void {
  nativeTheme.themeSource = theme
  if (isWin && window) window.setTitleBarOverlay(overlayColors())
  if (!material && window) window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7')
}

function navigate(target: NavigateTarget): void {
  window?.webContents.send(Channels.navigate, target)
}

function rendererUrl(): string {
  return devServer ?? `file://${join(__dirname, '../renderer/index.html').replace(/\\/g, '/')}`
}

function isAppUrl(url: string): boolean {
  const base = rendererUrl().toLowerCase()
  const target = url.split('#')[0]?.toLowerCase() ?? ''
  return target === base || target === base.replace(/^file:\/\/\//, 'file:///')
}

const webPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: false,
  devTools: !app.isPackaged,
} as const

function createWindow(): void {
  const bounds = loadBounds(
    userData,
    screen.getAllDisplays().map((d) => d.workArea),
  )
  window = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: 'Atlas',
    backgroundColor: material ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f5f5f7',
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 20, y: 18 },
          ...(material ? { vibrancy: 'sidebar' as const, visualEffectState: 'followWindow' as const } : {}),
        }
      : {}),
    ...(isWin
      ? {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: overlayColors(),
          backgroundMaterial: material ? ('mica' as const) : ('none' as const),
        }
      : {}),
    webPreferences,
  })
  if (bounds.maximized) window.maximize()
  hardenContents(window.webContents, isAppUrl)
  window.once('ready-to-show', () => window?.show())

  let saveTimer: NodeJS.Timeout | null = null
  const remember = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!window || window.isDestroyed()) return
      const b = window.getNormalBounds()
      saveBounds(userData, { ...b, maximized: window.isMaximized() })
    }, 400)
  }
  window.on('resize', remember)
  window.on('move', remember)
  window.on('close', (event) => {
    if (window && !window.isDestroyed()) {
      const b = window.getNormalBounds()
      saveBounds(userData, { ...b, maximized: window.isMaximized() })
    }
    if (!allowQuit) {
      event.preventDefault()
      void confirmAndQuit()
    }
  })
  window.on('closed', () => {
    window = null
  })

  if (devServer) void window.loadURL(devServer)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))
}

async function confirmAndQuit(): Promise<void> {
  if (watcher.anyRunning()) {
    const options = {
      type: 'question' as const,
      buttons: ['Close Atlas', 'Keep Screening'],
      defaultId: 1,
      cancelId: 1,
      message: 'Screening is running. Close Atlas?',
      detail: 'It will pause and continue where it left off when you reopen it.',
    }
    const { response } = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)
    if (response !== 0) return
  }
  allowQuit = true
  watcher.release()
  await engine.stop()
  app.quit()
}

function buildMenu(): void {
  const settings: MenuItemConstructorOptions = {
    label: isMac ? 'Settings…' : 'Settings',
    accelerator: 'CmdOrCtrl+,',
    click: () => navigate('settings'),
  }
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              settings,
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        ...(isMac ? [] : [settings, { type: 'separator' as const }]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        ...(!app.isPackaged ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }] : []),
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function followRunStatuses(): void {
  const controller = new AbortController()
  app.once('will-quit', () => controller.abort())
  void followEvents({
    url: () => (engine.baseUrl ? `${engine.baseUrl}/events` : null),
    headers: () => engine.authHeaders(),
    lastId: 0,
    engineGeneration: () => engine.processGeneration,
    resetOnNewEngine: true,
    signal: controller.signal,
    onMessage: (message) => {
      if (message.event !== 'run_status') return
      try {
        void watcher.handle(JSON.parse(message.data) as RunStatus)
      } catch {
        // ignore a malformed event
      }
    },
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  app.on('before-quit', (event) => {
    if (allowQuit) return
    event.preventDefault()
    void confirmAndQuit()
  })

  app.on('window-all-closed', () => {
    if (allowQuit) app.quit()
  })

  app.on('web-contents-created', (_event, contents) => hardenContents(contents, isAppUrl))

  void app.whenReady().then(() => {
    hardenSession(session.defaultSession, devServer)
    const info: AppInfo = {
      platform: process.platform === 'darwin' || process.platform === 'win32' ? process.platform : 'linux',
      version: app.getVersion(),
      packaged: app.isPackaged,
      e2e,
      material,
    }
    registerIpc({
      engine,
      getWindow: () => window,
      dataDir: userData,
      logsDir: join(userData, 'logs'),
      info,
      setTheme,
      onSettingsChanged: () => void watcher.preferencesChanged(),
    })
    buildMenu()
    engine.on('state', (state) => window?.webContents.send(Channels.engineStateChanged, state))
    engine.on('ready', () => void watcher.seed())
    nativeTheme.on('updated', () => {
      if (isWin && window) window.setTitleBarOverlay(overlayColors())
    })
    createWindow()
    engine.start()
    followRunStatuses()
    if (e2e) {
      // Main-process hooks for the Playwright tests (never in a packaged app).
      Object.assign(globalThis, {
        __atlasTest: { token: () => engine.tokenForTests(), watcher, engine, webPreferences },
      })
    }
  })
}
