/**
 * Server-Sent Events from the engine, consumed in main (the renderer has no
 * network access at all). The parser is pure; `followEvents` reconnects with
 * `Last-Event-ID` until it is aborted.
 */

export interface SseMessage {
  id: number | null
  event: string
  data: string
}

export class SseParser {
  private buffer = ''
  private id: number | null = null
  private event = ''
  private data: string[] = []

  feed(chunk: string): SseMessage[] {
    this.buffer += chunk
    const out: SseMessage[] = []
    let newline = this.buffer.search(/\r\n|\n|\r/)
    while (newline >= 0) {
      // A "\r" at the very end may be the first half of "\r\n": wait for more.
      if (newline === this.buffer.length - 1 && this.buffer.endsWith('\r')) break
      const lineEnd = this.buffer.startsWith('\r\n', newline) ? 2 : 1
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + lineEnd)
      this.line(line, out)
      newline = this.buffer.search(/\r\n|\n|\r/)
    }
    return out
  }

  private line(line: string, out: SseMessage[]): void {
    if (line === '') {
      if (this.data.length) out.push({ id: this.id, event: this.event || 'message', data: this.data.join('\n') })
      this.event = ''
      this.data = []
      return
    }
    if (line.startsWith(':')) return // comment (keep-alive)
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') this.data.push(value)
    else if (field === 'event') this.event = value
    else if (field === 'id' && /^\d+$/.test(value)) this.id = Number(value)
  }
}

export interface FollowOptions {
  url: () => string | null // null while the engine isn't ready
  headers: () => Record<string, string>
  lastId: number
  onMessage: (message: SseMessage) => void
  signal: AbortSignal
  retryMs?: number
  /**
   * Changes when the engine process is replaced. App-level event ids live in
   * the engine's memory and start again at 1, so the resume point resets.
   * (Run events live in SQLite: pass `resetOnNewEngine: false`.)
   */
  engineGeneration?: () => number
  resetOnNewEngine?: boolean
}

/** Keep a stream open until aborted, resuming after the last id seen. */
export async function followEvents(options: FollowOptions): Promise<void> {
  let lastId = options.lastId
  let generation = options.engineGeneration?.() ?? 0
  const retry = options.retryMs ?? 1000
  while (!options.signal.aborted) {
    const url = options.url()
    const now = options.engineGeneration?.() ?? 0
    if (now !== generation) {
      generation = now
      if (options.resetOnNewEngine) lastId = 0
    }
    if (url) {
      try {
        const response = await fetch(url, {
          headers: { ...options.headers(), Accept: 'text/event-stream', 'Last-Event-ID': String(lastId) },
          signal: options.signal,
        })
        if (response.ok && response.body) {
          const parser = new SseParser()
          const decoder = new TextDecoder()
          const reader = response.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            for (const message of parser.feed(decoder.decode(value, { stream: true }))) {
              if (message.id !== null) lastId = message.id
              options.onMessage(message)
            }
          }
        }
      } catch {
        // connection refused, engine restarting, or aborted: try again below
      }
    }
    if (options.signal.aborted) return
    await sleep(retry, options.signal)
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}
