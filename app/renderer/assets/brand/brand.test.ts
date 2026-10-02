/**
 * The brand SVGs are untrusted input (supplied files): the app ships sanitised
 * working copies of them (logo.svg, hello.svg) and shows them only as images.
 * This fails if a working copy gains anything active or external, or if the
 * renderer starts putting SVG markup into the page as HTML.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BRAND = __dirname
const RENDERER = join(__dirname, '..', '..')
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

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
  return problems
}

const copies = ['logo.svg', 'hello.svg'].map((name) => ({ name, svg: readFileSync(join(BRAND, name), 'utf8') }))

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
    expect(/viewBox="0 0 256 256"/.test(logo)).toBe(true)
    const hello = copies[1]?.svg ?? ''
    expect(/<animate|<set\b|<animateTransform/i.test(hello)).toBe(false)
    expect(/stroke="#000000"/.test(hello)).toBe(true) // dark on off-white
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
