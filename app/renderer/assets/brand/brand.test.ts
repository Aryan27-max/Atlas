/**
 * The brand SVGs are untrusted input (supplied files): the app ships sanitised
 * working copies of them (logo.svg, hello.svg, and hello-drawn.svg: hello's
 * draw-in from the original, played once) and shows them only as images.
 * This fails if a working copy gains anything active or external, or if the
 * renderer starts putting SVG markup into the page as HTML.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPLASH_TIMING } from '../../state/splash'

const BRAND = __dirname
const RENDERER = join(__dirname, '..', '..')
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
/** What an animation may change: how the line is drawn. (Animating an href is an attack.) */
const DRAWING = new Set(['d', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-width'])

/** What makes an SVG unsafe or untidy as an app asset; empty when it's clean. */
export function svgProblems(svg: string): string[] {
  const problems: string[] = []
  if (/<script\b/i.test(svg)) problems.push('a <script> element')
  if (/\son[a-z]+\s*=/i.test(svg)) problems.push('an on* event handler')
  if (/<foreignObject\b/i.test(svg)) problems.push('a <foreignObject>')
  for (const match of svg.matchAll(/\b(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) {
    if (!match[1]?.startsWith('#')) problems.push(`an external reference (${match[1]})`)
  }
  for (const match of svg.matchAll(/url\(\s*['"]?([^)'"]*)/gi)) {
    if (!match[1]?.startsWith('#')) problems.push(`an external url(${match[1]})`)
  }
  for (const match of svg.matchAll(/\b(?:https?|data|file|javascript):[^\s"')<>]*/gi)) {
    if (match[0] !== SVG_NAMESPACE) problems.push(`a URL (${match[0]})`)
  }
  if (/<\?xml|<!--|<metadata\b|<!DOCTYPE/i.test(svg)) problems.push('metadata, a comment or a prolog')
  if (/@import|<image\b|@font-face/i.test(svg)) problems.push('an embedded image, font or import')
  if (/<(?:set|animateMotion|animateTransform|discard)\b/i.test(svg)) problems.push('an animation other than <animate>')
  for (const match of svg.matchAll(/<animate\b[^>]*>/gi)) {
    const attribute = /\battributeName\s*=\s*["']([^"']*)["']/i.exec(match[0])?.[1] ?? ''
    if (!DRAWING.has(attribute)) problems.push(`an animated "${attribute}"`)
  }
  return problems
}

const copies = ['logo.svg', 'hello.svg', 'hello-drawn.svg'].map((name) => ({
  name,
  svg: readFileSync(join(BRAND, name), 'utf8'),
}))

describe('the brand SVG working copies', () => {
  it.each(copies)('$name has nothing active, external or extra', ({ svg }) => {
    expect(svgProblems(svg)).toEqual([])
  })

  it.each(copies)('$name has a viewBox, and a size with the same shape', ({ svg }) => {
    const root = /<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
    const viewBox =
      /viewBox="([^"]+)"/
        .exec(root)?.[1]
        ?.split(/[\s,]+/)
        .map(Number) ?? []
    expect(viewBox).toHaveLength(4)
    const [, , w = 0, h = 0] = viewBox
    expect(w).toBeGreaterThan(0)
    expect(h).toBeGreaterThan(0)
    const width = Number(/\swidth="([\d.]+)"/.exec(root)?.[1])
    const height = Number(/\sheight="([\d.]+)"/.exec(root)?.[1])
    expect(width / height).toBeCloseTo(w / h, 5) // an <img> gets a real intrinsic size
  })

  it('the logo is square, and "hello" is static art (the splash does the motion)', () => {
    const logo = copies[0]?.svg ?? ''
    // Square at any size, so a replacement logo can be dropped in (docs/SIGNING.md).
    const [, , w, h] =
      /viewBox="([^"]+)"/
        .exec(logo)?.[1]
        ?.split(/[\s,]+/)
        .map(Number) ?? []
    expect(w).toBeGreaterThan(0)
    expect(w).toBe(h)
    const hello = copies[1]?.svg ?? ''
    expect(/<animate|<set\b|<animateTransform/i.test(hello)).toBe(false)
    expect(/stroke="#000000"/.test(hello)).toBe(true) // dark on off-white
  })

  it('"hello-drawn" draws the lettering once, ends on the static art, and is done before the splash may leave', () => {
    const [, hello = '', drawn = ''] = copies.map((c) => c.svg)
    const animations = [...drawn.matchAll(/<animate\b[^>]*>/gi)].map((m) => m[0])
    expect(animations.length).toBeGreaterThan(0)
    for (const animation of animations) {
      expect(animation).not.toMatch(/repeatCount|repeatDur/) // once, never looping (the original erased itself)
      expect(animation).toMatch(/\bfill="freeze"/) // and stays drawn
      expect(animation).toMatch(/\bbegin="0s"/)
      const seconds = Number(/\bdur="([\d.]+)s"/.exec(animation)?.[1])
      expect(seconds * 1000).toBeLessThanOrEqual(SPLASH_TIMING.drawMs) // drawn by the time the app says so
    }
    // The finished word is held a moment before the splash may leave.
    expect(SPLASH_TIMING.minMs - SPLASH_TIMING.drawMs).toBeGreaterThanOrEqual(500)
    // The same frame and framing as the static art, and its last frame is that art.
    expect(/<svg\b[^>]*>/.exec(drawn)?.[0]).toBe(/<svg\b[^>]*>/.exec(hello)?.[0])
    const last = (name: string): string | undefined => {
      const animation = animations.find((a) => a.includes(`attributeName="${name}"`)) ?? ''
      return /\bvalues="([^"]*)"/.exec(animation)?.[1]?.split(';').at(-1)?.trim()
    }
    expect(last('d')).toBe(/<path d="([^"]+)"/.exec(hello)?.[1])
    expect(last('stroke-dasharray')).toBe('99 1')
    expect(last('stroke-dashoffset')).toBe('-1')
    expect(last('stroke-width')).toBe('9')
  })
})

describe('svgProblems', () => {
  it.each([
    ['<svg><script>alert(1)</script></svg>', 'a <script> element'],
    ['<svg onload="alert(1)"></svg>', 'an on* event handler'],
    ['<svg><foreignObject><div/></foreignObject></svg>', 'a <foreignObject>'],
    ['<svg><use href="https://example.com/x.svg#a"/></svg>', 'an external reference (https://example.com/x.svg#a)'],
    ['<svg><use xlink:href="other.svg#a"/></svg>', 'an external reference (other.svg#a)'],
    ['<svg><path fill="url(https://example.com/g)"/></svg>', 'an external url(https://example.com/g)'],
    ['<?xml version="1.0"?><svg></svg>', 'metadata, a comment or a prolog'],
    ['<svg><!-- generator --></svg>', 'metadata, a comment or a prolog'],
    ['<svg><image href="#x"/></svg>', 'an embedded image, font or import'],
    ['<svg><a><animate attributeName="href" values="javascript:alert(1)"/></a></svg>', 'an animated "href"'],
    ['<svg><set attributeName="d" to="M0 0"/></svg>', 'an animation other than <animate>'],
    ['<svg><path><animateTransform attributeName="transform"/></path></svg>', 'an animation other than <animate>'],
  ])('catches %s', (svg, problem) => {
    expect(svgProblems(svg)).toContain(problem)
  })

  it('accepts local references and the SVG namespace', () => {
    expect(svgProblems(`<svg xmlns="${SVG_NAMESPACE}"><path fill="url(#g)"/><use href="#a"/></svg>`)).toEqual([])
  })
})

describe('the renderer shows SVGs only as images', () => {
  const sources: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx|html)$/.test(name) && !/\.test\.tsx?$/.test(name)) sources.push(path)
    }
  }
  walk(RENDERER)

  it('never puts markup into the page as HTML, or imports an SVG as text', () => {
    for (const path of sources) {
      const text = readFileSync(path, 'utf8')
      expect(text, path).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|\.svg\?raw/)
    }
  })
})
