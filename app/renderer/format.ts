/**
 * Presentation only: turning engine numbers into words. No decisions here
 * (rule 16): the engine decides; this file only spells it out.
 */

export function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

/** "2 h 10 min", "45 min", "under a minute". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return 'under a minute'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/** "About 3–5 hours", "About 40–55 minutes". */
export function formatRange(low: number, high: number): string {
  if (high < 60) return 'Under a minute'
  if (high < 3600) {
    const lo = Math.max(1, Math.round(low / 60))
    const hi = Math.max(lo, Math.round(high / 60))
    return lo === hi ? `About ${lo} minutes` : `About ${lo}–${hi} minutes`
  }
  const lo = Math.max(1, Math.round(low / 3600))
  const hi = Math.max(lo, Math.round(high / 3600))
  if (lo === hi) return `About ${lo} hour${lo === 1 ? '' : 's'}`
  return `About ${lo}–${hi} hours`
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  return date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

export function defaultRunName(now = new Date()): string {
  return `Screening ${now.toLocaleDateString([], { day: 'numeric', month: 'short' })}`
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

/** "about 1 second", "about 45 seconds", "about 2 minutes" (time per résumé). */
export function formatPerResume(seconds: number): string {
  if (seconds < 90) {
    const s = Math.max(1, Math.round(seconds))
    return `${s} second${s === 1 ? '' : 's'}`
  }
  const m = Math.round(seconds / 60)
  return `${m} minute${m === 1 ? '' : 's'}`
}
