/**
 * Native right-click menus (Phase 3, step 3.4). They are built here with
 * Electron's Menu, so they look and behave like the operating system's own.
 * The renderer only asks for one through a validated IPC call
 * (validateRowMenu) and gets back what the recruiter chose.
 */

import type { MenuItemConstructorOptions } from 'electron'
import type { MoveTarget, RowMenuChoice, RowMenuRequest } from '@shared/bridge'

const BUCKET_LABEL: Record<MoveTarget, string> = { shortlisted: 'Shortlisted', cutoff: 'Cutoff', rejected: 'Rejected' }

// Short words that stay lower case in title case (Apple's Human Interface Guidelines).
const MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'via'])

/** Menus are in title case on macOS ("Copy RA Number") and sentence case on Windows ("Copy RA number"). */
export function menuLabel(text: string, platform: string): string {
  if (platform !== 'darwin') return text
  return text
    .split(' ')
    .map((word, i) => (i > 0 && MINOR.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}

/** The menu for one Results row, or for every selected row when several are selected. */
export function rowMenuTemplate(
  request: RowMenuRequest,
  platform: string,
  choose: (choice: RowMenuChoice) => void,
  copy: (text: string) => void,
): MenuItemConstructorOptions[] {
  const label = (text: string): string => menuLabel(text, platform)
  const count = request.raNumbers.length
  const items: MenuItemConstructorOptions[] = []
  if (count === 1 && request.details) {
    items.push({ label: label('Show details'), click: () => choose({ action: 'details' }) }, { type: 'separator' })
  }
  if (request.moveTargets.length > 0) {
    items.push({
      label: label(count === 1 ? 'Move to' : `Move ${count} candidates to`),
      // An ellipsis: a sheet follows, for the note.
      submenu: request.moveTargets.map((to) => ({
        label: `${BUCKET_LABEL[to]}…`,
        click: () => choose({ action: 'move', to }),
      })),
    })
  }
  items.push({
    label: label(count === 1 ? 'Copy RA number' : `Copy ${count} RA numbers`),
    click: () => {
      copy(request.raNumbers.join('\n'))
      choose({ action: 'copied' })
    },
  })
  return items
}
