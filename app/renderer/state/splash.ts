/**
 * The start-up screen ("hello", screens/Splash.tsx): when it shows and when it
 * hands over. UI only: nothing here decides anything about a screening.
 *
 * Once per launch, from the first frame (index.html marks <html data-splash>,
 * so the page is off-white before any script runs) until the engine is ready
 * **and** `minMs` have passed. Then it fades out over `fadeMs` onto whatever
 * the app shows underneath: Welcome (with its Resume card), or "Atlas couldn't
 * start" when the engine failed. It never hangs: at `maxMs` it hands over
 * whatever the engine is doing (the usual "Starting Atlas…" screen shows), and
 * from `slowMs` it says "Still starting…".
 *
 * Only the renderer decides this. Main keeps the window's own background
 * off-white until `window.atlas.app.splashDone()`, then restores it for the
 * theme.
 */

import { useEffect, useRef, useState } from 'react'
import type { EngineStateName } from '@shared/bridge'

export interface SplashTiming {
  /** Shown at least this long, however fast the engine is. */
  minMs: number
  /** From here, "Still starting…" under the art. */
  slowMs: number
  /** Hands over at this point, whatever the engine is doing. */
  maxMs: number
  /** The cross-fade onto the app. */
  fadeMs: number
}

export const SPLASH_TIMING: SplashTiming = { minMs: 1200, slowMs: 6000, maxMs: 15_000, fadeMs: 300 }

/** `showing` → `leaving` (fading out; the app underneath is live) → `gone` (removed). */
export type SplashPhase = 'showing' | 'leaving' | 'gone'

export interface SplashState {
  phase: SplashPhase
  /** Past `slowMs` and still showing. */
  slow: boolean
  /** performance.now() when it first showed, and when it started to leave (data-* attributes for the tests). */
  shownAt: number
  leftAt: number | null
}

const SHOWN_KEY = 'atlas.splash-shown'

/** This launch already showed it: a reload (development only) keeps sessionStorage, a new launch doesn't. */
function shownThisLaunch(): boolean {
  try {
    return sessionStorage.getItem(SHOWN_KEY) === '1'
  } catch {
    return false
  }
}

function rememberShown(): void {
  try {
    sessionStorage.setItem(SHOWN_KEY, '1')
  } catch {
    // No storage: a reload would show it again, nothing worse.
  }
}

/** The engine has answered one way or the other, so the app underneath has something to show. */
function settled(engine: EngineStateName): boolean {
  return engine === 'ready' || engine === 'failed'
}

export function useSplash(engine: EngineStateName, timing: SplashTiming = SPLASH_TIMING): SplashState {
  const [phase, setPhase] = useState<SplashPhase>(() => (shownThisLaunch() ? 'gone' : 'showing'))
  const [shownAt] = useState(() => performance.now())
  const [leftAt, setLeftAt] = useState<number | null>(null)
  const [minPassed, setMinPassed] = useState(false)
  const [slow, setSlow] = useState(false)
  const [capped, setCapped] = useState(false)
  const handedOver = useRef(false)

  // The clock runs while it shows.
  const showing = phase === 'showing'
  useEffect(() => {
    if (!showing) return
    const timers = [
      setTimeout(() => setMinPassed(true), timing.minMs),
      setTimeout(() => setSlow(true), timing.slowMs),
      setTimeout(() => setCapped(true), timing.maxMs),
    ]
    return () => timers.forEach(clearTimeout)
  }, [showing, timing])

  // Leave once the engine has answered and the minimum has passed, or at the cap. Latched:
  // a later engine restart never brings it back.
  const due = showing && (capped || (minPassed && settled(engine)))
  useEffect(() => {
    if (!due) return
    setLeftAt(performance.now())
    setPhase('leaving')
  }, [due])

  // Handing over (or nothing to show this launch): the page and the window take the app's colours.
  useEffect(() => {
    if (phase === 'showing' || handedOver.current) return
    handedOver.current = true
    delete document.documentElement.dataset.splash
    rememberShown()
    void window.atlas.app.splashDone()
  }, [phase])

  useEffect(() => {
    if (phase !== 'leaving') return
    const timer = setTimeout(() => setPhase('gone'), timing.fadeMs)
    return () => clearTimeout(timer)
  }, [phase, timing.fadeMs])

  return { phase, slow, shownAt, leftAt }
}
