/**
 * The renderer is untrusted by design (ARCHITECTURE §19): no Node, a sandbox,
 * a strict CSP (in renderer/index.html), no new windows, no navigation away
 * from the app, no permissions, and no network requests except the app's own
 * files (and the dev server in development).
 */

import { fileURLToPath } from 'node:url'
import type { Session, WebContents } from 'electron'
import { samePath } from './paths'

/**
 * Whether `url` is the app's own page: the dev server in development, else
 * renderer/index.html. Chromium reports a file URL percent-encoded (a space or a
 * non-ASCII letter in the Windows user name) and as file:///C:/… on Windows, so
 * it is turned back into a path and compared as a path, never as a string.
 */
export function isAppPage(url: string, devServer: string | null, rendererFile: string): boolean {
  const page = url.split('#')[0] ?? ''
  try {
    if (devServer !== null) return new URL(page).href === new URL(devServer).href
    return new URL(page).protocol === 'file:' && samePath(fileURLToPath(page), rendererFile)
  } catch {
    return false // not a URL at all
  }
}

export function isAllowedRequest(url: string, devServer: string | null): boolean {
  if (
    url.startsWith('file://') ||
    url.startsWith('devtools://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return true
  }
  return devServer !== null && (url.startsWith(devServer) || url.startsWith(devServer.replace(/^http/, 'ws')))
}

export function hardenSession(session: Session, devServer: string | null): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
  session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedRequest(details.url, devServer) })
  })
}

/** `appUrl` is the one page the window may show (reloading it is fine). */
export function hardenContents(contents: WebContents, isAppUrl: (url: string) => boolean): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event) => {
    if (!isAppUrl(event.url)) event.preventDefault()
  })
  contents.on('will-redirect', (event) => {
    if (!isAppUrl(event.url)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}
