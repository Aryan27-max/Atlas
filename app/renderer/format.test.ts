import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, formatRange, greeting, plural } from './format'

describe('format', () => {
  it('greets by the time of day', () => {
    const at = (hour: number): Date => new Date(2026, 8, 28, hour, 0)
    expect(greeting(at(8))).toBe('Good morning')
    expect(greeting(at(14))).toBe('Good afternoon')
    expect(greeting(at(20))).toBe('Good evening')
    expect(greeting(at(2))).toBe('Good evening')
  })

  it('bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(5_225_388_164)).toBe('4.9 GB')
    expect(formatBytes(1_048_576 * 12.3)).toBe('12 MB')
  })

  it('durations and ranges', () => {
    expect(formatDuration(30)).toBe('under a minute')
    expect(formatDuration(45 * 60)).toBe('45 min')
    expect(formatDuration(2 * 3600 + 10 * 60)).toBe('2 h 10 min')
    expect(formatRange(3 * 3600, 5 * 3600)).toBe('About 3–5 hours')
    expect(formatRange(40 * 60, 55 * 60)).toBe('About 40–55 minutes')
    expect(formatRange(3500, 3700)).toBe('About 1 hour')
    expect(formatRange(0, 0)).toBe('Under a minute')
  })

  it('plurals', () => {
    expect(plural(1, 'student')).toBe('1 student')
    expect(plural(1200, 'student')).toBe('1,200 students')
  })
})
