import { describe, expect, it } from 'vitest'
import { ReadyLineParser } from './ready'

describe('ReadyLineParser', () => {
  it('finds the port in one chunk', () => {
    expect(new ReadyLineParser().feed('ATLAS_READY port=53817\n')).toBe(53817)
  })

  it('reassembles a line split across chunks', () => {
    const parser = new ReadyLineParser()
    expect(parser.feed('ATLAS_RE')).toBeNull()
    expect(parser.feed('ADY port=5')).toBeNull()
    expect(parser.feed('4321\n')).toBe(54321)
  })

  it('accepts a Windows line ending', () => {
    expect(new ReadyLineParser().feed('ATLAS_READY port=8080\r\n')).toBe(8080)
  })

  it('ignores other lines and waits for the newline', () => {
    const parser = new ReadyLineParser()
    expect(parser.feed('Warning: something\nATLAS_READY port=9000')).toBeNull()
    expect(parser.feed('\n')).toBe(9000)
  })

  it('rejects look-alikes and impossible ports', () => {
    for (const line of [
      'ATLAS_READY port=0',
      'ATLAS_READY port=70000',
      'XATLAS_READY port=80',
      'ATLAS_READY port=80 extra',
      'ATLAS_READY port=',
    ]) {
      expect(new ReadyLineParser().feed(`${line}\n`)).toBeNull()
    }
  })

  it('reports the port only once', () => {
    const parser = new ReadyLineParser()
    expect(parser.feed('ATLAS_READY port=1234\n')).toBe(1234)
    expect(parser.feed('ATLAS_READY port=5678\n')).toBeNull()
  })

  it('does not grow without bound on endless output without newlines', () => {
    const parser = new ReadyLineParser()
    for (let i = 0; i < 200; i++) parser.feed('x'.repeat(1024))
    expect(parser.feed('\nATLAS_READY port=4242\n')).toBe(4242)
  })
})
