import { describe, expect, it } from 'vitest'
import { SseParser } from './sse'

describe('SseParser', () => {
  it('parses events with ids, names and data', () => {
    const parser = new SseParser()
    const out = parser.feed('id: 7\nevent: run\ndata: {"message":"Scored 71"}\n\n')
    expect(out).toEqual([{ id: 7, event: 'run', data: '{"message":"Scored 71"}' }])
  })

  it('handles chunks split anywhere and CRLF line endings', () => {
    const parser = new SseParser()
    const text = 'id: 1\r\nevent: pull\r\ndata: {"a":1}\r\n\r\nid: 2\r\ndata: x\r\n\r\n'
    const out = [...text].flatMap((char) => parser.feed(char))
    expect(out).toEqual([
      { id: 1, event: 'pull', data: '{"a":1}' },
      { id: 2, event: 'message', data: 'x' },
    ])
  })

  it('ignores keep-alive comments and joins multi-line data', () => {
    const parser = new SseParser()
    expect(parser.feed(': keep-alive\n\n')).toEqual([])
    expect(parser.feed('data: a\ndata: b\n\n')).toEqual([{ id: null, event: 'message', data: 'a\nb' }])
  })

  it('keeps the last id for later events and ignores a bad id', () => {
    const parser = new SseParser()
    parser.feed('id: 5\ndata: x\n\n')
    expect(parser.feed('id: nope\ndata: y\n\n')).toEqual([{ id: 5, event: 'message', data: 'y' }])
  })
})
