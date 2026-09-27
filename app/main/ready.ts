/**
 * The engine announces itself with exactly one stdout line: `ATLAS_READY port=<n>`.
 * Output arrives in arbitrary chunks, so lines are reassembled first.
 */

const READY = /^ATLAS_READY port=(\d{1,5})$/

export class ReadyLineParser {
  private buffer = ''
  private done = false

  /** Feed stdout; returns the port once the ready line is complete, else null. */
  feed(chunk: string): number | null {
    if (this.done) return null
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '')
      this.buffer = this.buffer.slice(newline + 1)
      const match = READY.exec(line)
      if (match) {
        const port = Number(match[1])
        if (port >= 1 && port <= 65535) {
          this.done = true
          return port
        }
      }
      newline = this.buffer.indexOf('\n')
    }
    if (this.buffer.length > 64 * 1024) this.buffer = this.buffer.slice(-1024) // never grow without bound
    return null
  }
}
