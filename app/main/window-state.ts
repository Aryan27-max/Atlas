/**
 * Remember the window's size and position between launches (a small JSON
 * file in userData; the engine's database is not involved).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface WindowBounds {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export const DEFAULT_WIDTH = 1280
export const DEFAULT_HEIGHT = 800
export const MIN_WIDTH = 1100
export const MIN_HEIGHT = 720

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * A size that fits the work area (the screen less the menu bar, Dock or
 * taskbar), never below the minimum. Asking for more than the screen has lets
 * the OS shrink the window on its own terms (on a small Mac it ends at the
 * minimum), so the window opens at a size Atlas chose.
 */
export function fitSize(width: number, height: number, area?: Rect): { width: number; height: number } {
  return {
    width: Math.max(MIN_WIDTH, Math.min(width, area?.width ?? width)),
    height: Math.max(MIN_HEIGHT, Math.min(height, area?.height ?? height)),
  }
}

/** The first launch: 1280×800, or the primary display's work area if that is smaller. */
export function defaultBounds(primary?: Rect): WindowBounds {
  return { ...fitSize(DEFAULT_WIDTH, DEFAULT_HEIGHT, primary), maximized: false }
}

/**
 * Saved bounds if they are sane, kept on a screen we have now and no larger
 * than its work area; else the default. `workAreas[0]` is the primary display.
 */
export function restoreBounds(saved: unknown, workAreas: Rect[]): WindowBounds {
  const primary = workAreas[0]
  if (typeof saved !== 'object' || saved === null) return defaultBounds(primary)
  const s = saved as Record<string, unknown>
  const width = num(s.width)
  const height = num(s.height)
  if (width === null || height === null) return defaultBounds(primary)
  const x = num(s.x)
  const y = num(s.y)
  const area =
    x !== null && y !== null
      ? workAreas.find((a) => x + 100 > a.x && x < a.x + a.width - 100 && y + 40 > a.y && y < a.y + a.height - 40)
      : undefined
  const bounds: WindowBounds = {
    ...fitSize(Math.min(width, 10_000), Math.min(height, 10_000), area ?? primary),
    maximized: s.maximized === true,
  }
  if (area) Object.assign(bounds, { x, y })
  return bounds
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

export function loadBounds(dir: string, workAreas: Rect[]): WindowBounds {
  try {
    return restoreBounds(JSON.parse(readFileSync(join(dir, 'window-state.json'), 'utf8')), workAreas)
  } catch {
    return defaultBounds(workAreas[0])
  }
}

export function saveBounds(dir: string, bounds: WindowBounds): void {
  try {
    writeFileSync(join(dir, 'window-state.json'), JSON.stringify(bounds))
  } catch {
    // not worth interrupting anything for
  }
}
