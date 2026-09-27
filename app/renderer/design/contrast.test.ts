/**
 * Text contrast ≥ 4.5:1 (WCAG AA) and non-text UI ≥ 3:1, in both themes,
 * computed from tokens.css itself. Translucent colours are blended over the
 * background they are actually drawn on.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8')

function block(selectorStart: string): Record<string, string> {
  const start = css.indexOf(selectorStart)
  if (start < 0) throw new Error(`no block ${selectorStart}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const tokens: Record<string, string> = {}
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tokens[match[1] ?? ''] = (match[2] ?? '').trim()
  return tokens
}

const THEMES = {
  light: block(":root,\n[data-theme='light']"),
  dark: block("[data-theme='dark'] {"),
}
const DARK_MEDIA = block(":root:not([data-theme='light'])")

type RGBA = [number, number, number, number]

function parse(value: string): RGBA {
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value)
  if (hex) {
    const h = hex[1] ?? ''
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)).concat(1) as RGBA
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value)
  if (rgba) {
    const parts = (rgba[1] ?? '').split(',').map((p) => Number(p.trim()))
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]
  }
  throw new Error(`can't parse colour ${value}`)
}

function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3]
  return [0, 1, 2].map((i) => (fg[i] ?? 0) * a + (bg[i] ?? 0) * (1 - a)).concat(1) as RGBA
}

function luminance([r, g, b]: RGBA): number {
  const channel = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: RGBA, b: RGBA): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** A colour token as drawn: layers listed top-first, the last one opaque. */
function resolve(tokens: Record<string, string>, layers: string[]): RGBA {
  const colours = layers.map((name) => {
    const value = tokens[name]
    if (!value) throw new Error(`missing token --${name}`)
    return parse(value)
  })
  return colours.reduceRight((below, layer) => over(layer, below))
}

const BACKGROUNDS = ['bg-window', 'bg-content', 'bg-elevated', 'bg-sidebar', 'bg-toolbar']

// [text token, background layers top-first, why]
const TEXT_PAIRS: Array<[string, string[], string]> = [
  ...['label-primary', 'label-secondary', 'label-tertiary'].flatMap((label) =>
    BACKGROUNDS.map((bg) => [label, [bg], 'labels on every surface'] as [string, string[], string]),
  ),
  ...['bg-content', 'bg-window', 'bg-elevated', 'bg-sidebar'].map(
    (bg) => ['accent-text', [bg], 'links and plain buttons'] as [string, string[], string],
  ),
  ['accent-text', ['accent-tint', 'bg-content'], 'accent badge'],
  ['label-primary', ['fill-primary', 'bg-sidebar'], 'selected sidebar row'],
  ['on-accent', ['accent-strong'], 'primary button'],
  ['on-accent', ['danger-strong'], 'destructive button'],
  ['label-primary', ['fill-tertiary', 'bg-content'], 'segmented control'],
  ['label-primary', ['control-selected'], 'selected segment'],
  ['label-primary', ['fill-secondary', 'bg-content'], 'secondary button'],
  ['label-primary', ['material', 'bg-window'], 'sheet'],
  ['label-secondary', ['material', 'bg-window'], 'sheet secondary text'],
  ['success-text', ['bg-content'], 'success text'],
  ['success-text', ['success-tint', 'bg-content'], 'success badge / banner'],
  ['warning-text', ['bg-content'], 'warning text'],
  ['warning-text', ['warning-tint', 'bg-content'], 'warning badge / banner'],
  ['danger-text', ['bg-content'], 'error text'],
  ['danger-text', ['bg-window'], 'error text on the window'],
  ['danger-text', ['danger-tint', 'bg-content'], 'error badge / banner'],
  ['label-primary', ['info-tint', 'bg-content'], 'info banner'],
  ['label-primary', ['warning-tint', 'bg-content'], 'warning banner body'],
  ['label-primary', ['danger-tint', 'bg-content'], 'error banner body'],
  ['bucket-shortlisted-text', ['bucket-shortlisted-bg'], 'Shortlisted pill'],
  ['bucket-cutoff-text', ['bucket-cutoff-bg'], 'Cutoff pill'],
  ['bucket-rejected-text', ['bucket-rejected-bg'], 'Rejected pill'],
]

// Non-text UI (focus ring, toggle, slider, progress): 3:1 against where it sits.
// --success (#34C759) is decorative only (2.2:1 on white); icons that carry
// meaning use --success-text.
const UI_PAIRS: Array<[string, string[]]> = [
  ['accent', ['bg-content']],
  ['accent', ['bg-window']],
  ['focus-ring', ['bg-content']],
  ['focus-ring', ['bg-window']],
  ['focus-ring', ['bg-sidebar']],
  ['success-text', ['bg-content']],
  ['danger', ['bg-content']],
]

describe.each(Object.entries(THEMES))('%s theme', (_theme, tokens) => {
  it.each(TEXT_PAIRS)('text %s on %j (%s) is at least 4.5:1', (text, layers) => {
    const bg = resolve(tokens, layers)
    const fg = over(parse(tokens[text] ?? ''), bg)
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(UI_PAIRS)('UI colour %s on %j is at least 3:1', (ui, layers) => {
    expect(contrast(resolve(tokens, [ui]), resolve(tokens, layers))).toBeGreaterThanOrEqual(3)
  })
})

describe('tokens.css', () => {
  it('has the same dark values for "follow the OS" as for the explicit dark theme', () => {
    expect(DARK_MEDIA).toEqual(THEMES.dark)
  })

  it('defines the same tokens in both themes', () => {
    expect(Object.keys(THEMES.dark).sort()).toEqual(Object.keys(THEMES.light).sort())
  })

  it("uses PLAN.md's accent and status colours", () => {
    expect([THEMES.light.accent, THEMES.dark.accent]).toEqual(['#007aff', '#0a84ff'])
    expect([THEMES.light.success, THEMES.dark.success]).toEqual(['#34c759', '#30d158'])
    expect([THEMES.light.warning, THEMES.dark.warning]).toEqual(['#ff9500', '#ff9f0a'])
    expect([THEMES.light.danger, THEMES.dark.danger]).toEqual(['#ff3b30', '#ff453a'])
  })
})
