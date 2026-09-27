import { MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import type { EngineState } from '@shared/bridge'
import { Button, Spinner, ToastProvider } from './design'
import { Gallery } from './design/Gallery'
import './app.css'

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

/** Platform facts on <html> so CSS can follow the OS (fonts, window chrome, materials). */
function usePlatform(): void {
  useEffect(() => {
    void window.atlas.app.info().then((info) => {
      const root = document.documentElement
      root.dataset.platform = info.platform
      root.dataset.material = String(info.material)
    })
  }, [])
}

function useEngineState(): EngineState {
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
  return engine
}

export function App() {
  usePlatform()
  const route = useHashRoute()
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>{route.startsWith('#/design') ? <Gallery /> : <Shell />}</ToastProvider>
    </MotionConfig>
  )
}

/** Engine gate; the screens (steps 2.4–2.8) render inside it. */
function Shell() {
  const engine = useEngineState()
  if (engine.state === 'failed') {
    return (
      <main className="gate" role="alert">
        <h1 className="atl-title">Atlas couldn't start</h1>
        <p className="atl-callout atl-secondary">
          {engine.message ?? "Atlas's engine stopped and couldn't be restarted."}
        </p>
        <Button variant="primary" onClick={() => void window.atlas.app.restartEngine()}>
          Restart Atlas
        </Button>
      </main>
    )
  }
  if (engine.state !== 'ready') {
    return (
      <main className="gate" aria-busy="true">
        <Spinner size={24} />
        <p className="atl-callout atl-secondary">
          {engine.state === 'restarting' ? 'Reconnecting…' : 'Starting Atlas…'}
        </p>
      </main>
    )
  }
  return (
    <main className="gate" data-engine="ready">
      <h1 className="atl-title">Atlas</h1>
      <p className="atl-callout atl-secondary">Ready.</p>
    </main>
  )
}
