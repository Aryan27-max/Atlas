/**
 * Atlas's icon at run time. The icons are rendered from the logo by
 * packaging/icons/render-icons.mjs. Packaged, electron-builder also puts the
 * window and notification icons in <resources>/icons/ (the exe and the .app
 * bundle carry the app icon themselves); in development and in the e2e build
 * they are found in the repository's packaging/icons/.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type IconName = 'icon.ico' | 'icon-256.png' | 'icon-mac.png'

export interface IconPlace {
  packaged: boolean
  resourcesPath: string
  /** Where to start looking for the repository in development (main's own folder). */
  from: string
}

/** The icon file, or null when it isn't there (an icon is never worth failing for). */
export function iconPath(name: IconName, place: IconPlace): string | null {
  if (place.packaged) {
    const path = join(place.resourcesPath, 'icons', name)
    return existsSync(path) ? path : null
  }
  let dir = place.from
  for (let depth = 0; depth < 8; depth++) {
    const path = join(dir, 'packaging', 'icons', name)
    if (existsSync(path)) return path
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
