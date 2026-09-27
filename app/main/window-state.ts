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

export const DEFAULT_BOUNDS: WindowBounds = { width: 1280, height: 800, maximized: false }
export const MIN_WIDTH = 1100
export const MIN_HEIGHT = 720

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Saved bounds if they are sane and at least partly on a screen we have now; else the default. */
export function restoreBounds(saved: unknown, workAreas: Rect[]): WindowBounds {
  if (typeof saved !== 'object' || saved === null) return { ...DEFAULT_BOUNDS }
  const s = saved as Record<string, unknown>
  const width = num(s.width)
  const height = num(s.height)
  if (width === null || height === null) return { ...DEFAULT_BOUNDS }
  const bounds: WindowBounds = {
    width: Math.max(MIN_WIDTH, Math.min(width, 10_000)),
    height: Math.max(MIN_HEIGHT, Math.min(height, 10_000)),
    maximized: s.maximized === true,
  }
  const x = num(s.x)
  const y = num(s.y)
  if (x !== null && y !== null) {
    const visible = workAreas.some(
      (a) => x + 100 > a.x && x < a.x + a.width - 100 && y + 40 > a.y && y < a.y + a.height - 40,
    )
    if (visible) Object.assign(bounds, { x, y })
  }
  return bounds
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

export function loadBounds(dir: string, workAreas: Rect[]): WindowBounds {
  try {
    return restoreBounds(JSON.parse(readFileSync(join(dir, 'window-state.json'), 'utf8')), workAreas)
  } catch {
    return { ...DEFAULT_BOUNDS }
  }
}

export function saveBounds(dir: string, bounds: WindowBounds): void {
  try {
    writeFileSync(join(dir, 'window-state.json'), JSON.stringify(bounds))
  } catch {
    // not worth interrupting anything for
  }
}
