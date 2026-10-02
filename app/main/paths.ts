/**
 * Paths can't be compared as strings across platforms:
 *
 * - macOS: /var and /tmp are symlinks to /private/var and /private/tmp, and
 *   Electron makes `--user-data-dir` absolute with realpath(), so a folder made
 *   in os.tmpdir() comes back as /private/var/folders/….
 * - Windows: 8.3 short names (C:\Users\RUNNER~1\…), either slash, and drive
 *   letters in either case.
 * - Both default to case-insensitive file systems; trailing slashes and
 *   relative spellings name the same folder too.
 *
 * So compare real paths, never spellings. Used by main and by the e2e tests.
 */

import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/** The canonical path of an existing file or folder, or the absolute path when it doesn't exist. */
export function realPath(path: string): string {
  try {
    return realpathSync.native(path)
  } catch {
    return resolve(path)
  }
}

/** Whether two spellings name the same file or folder on this computer. */
export function samePath(a: string, b: string, platform: NodeJS.Platform = process.platform): boolean {
  const left = realPath(a)
  const right = realPath(b)
  // The default file systems on Windows (NTFS) and macOS (APFS) ignore case.
  return platform === 'win32' || platform === 'darwin' ? left.toLowerCase() === right.toLowerCase() : left === right
}
