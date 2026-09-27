import { useEffect, useState } from 'react'
import type { EngineState } from '@shared/bridge'

/**
 * Step 2.2 shell: follows the engine's state. The screens (steps 2.4–2.8)
 * replace the "ready" view; the starting and error views stay.
 */
export function App() {
  const [engine, setEngine] = useState<EngineState>({ state: 'starting' })

  useEffect(() => {
    let alive = true
    void window.atlas.app.engineState().then((state) => {
      if (alive) setEngine(state)
    })
    const stop = window.atlas.app.onEngineState(setEngine)
    return () => {
      alive = false
      stop()
    }
  }, [])

  if (engine.state === 'failed') {
    return (
      <main className="shell shell-error" role="alert">
        <h1>Atlas couldn't start</h1>
        <p>{engine.message ?? "Atlas's engine stopped and couldn't be restarted."}</p>
        <button type="button" onClick={() => void window.atlas.app.restartEngine()}>
          Restart Atlas
        </button>
      </main>
    )
  }
  if (engine.state !== 'ready') {
    return (
      <main className="shell" aria-busy="true">
        <p>{engine.state === 'restarting' ? 'Reconnecting…' : 'Starting Atlas…'}</p>
      </main>
    )
  }
  return (
    <main className="shell" data-engine="ready">
      <h1>Atlas</h1>
      <p>Ready.</p>
    </main>
  )
}
