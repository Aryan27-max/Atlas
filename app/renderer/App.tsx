import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import type { EngineState } from '@shared/bridge'
import { api } from './api/client'
import { Button, Spinner, ToastProvider } from './design'
import { Gallery } from './design/Gallery'
import { Placeholder } from './screens/Placeholder'
import { Progress } from './screens/Progress'
import { Welcome } from './screens/Welcome'
import { SetupFlow } from './screens/setup/SetupFlow'
import { useNav } from './state/nav'
import { applyTheme } from './state/theme'
import './app.css'
import './screens/screens.css'

const queries = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 2_000 } },
})

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
      <QueryClientProvider client={queries}>
        <ToastProvider>{route.startsWith('#/design') ? <Gallery /> : <Shell />}</ToastProvider>
      </QueryClientProvider>
    </MotionConfig>
  )
}

/** Engine gate: the screens render only once the engine is ready. */
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
  return <Screens />
}

function Screens() {
  const view = useNav((state) => state.view)
  const go = useNav((state) => state.go)
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api('GET /settings') })

  useEffect(() => {
    if (settings.data) applyTheme(settings.data.appearance)
  }, [settings.data])

  useEffect(() => {
    const stop = window.atlas.app.onNavigate((target) =>
      go(target === 'settings' ? { name: 'settings' } : { name: 'welcome' }),
    )
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault()
        go({ name: 'settings' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      stop()
      window.removeEventListener('keydown', onKey)
    }
  }, [go])

  return (
    <div className="screens" data-engine="ready">
      {view.name === 'welcome' && <Welcome />}
      {view.name === 'setup' && <SetupFlow key={view.runId} runId={view.runId} step={view.step} />}
      {view.name === 'progress' && <Progress key={view.runId} runId={view.runId} />}
      {view.name === 'results' && <Placeholder title="Results" />}
      {view.name === 'settings' && <Placeholder title="Settings" />}
    </div>
  )
}
