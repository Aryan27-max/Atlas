import { motion, useReducedMotion } from 'motion/react'
import helloUrl from '../assets/brand/hello.svg'
import { arrive, crossfade } from '../design/motion'
import type { SplashState } from '../state/splash'
import './splash.css'

/** How "hello" arrives: fading in while it grows from 98%, or with reduced motion a plain fade (no transform at all). */
export function arrival(reduced: boolean) {
  return reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: arrive }
    : { initial: { opacity: 0, scale: 0.98 }, animate: { opacity: 1, scale: 1 }, transition: arrive }
}

/**
 * The start-up screen: "hello" on off-white, edge to edge, in both themes
 * (state/splash.ts says when it shows). Nothing in it takes focus or answers
 * keys; the app underneath is inert until it leaves.
 */
export function Splash({ phase, slow, shownAt, leftAt }: SplashState) {
  const reduced = useReducedMotion() ?? false
  return (
    <motion.div
      className="splash"
      data-theme="light"
      data-phase={phase}
      data-shown-at={Math.round(shownAt)}
      data-left-at={leftAt === null ? undefined : Math.round(leftAt)}
      role="status"
      aria-label="Atlas is starting"
      initial={false}
      animate={{ opacity: phase === 'leaving' ? 0 : 1 }}
      transition={crossfade}
    >
      <div className="splash-art">
        <motion.img className="splash-hello" src={helloUrl} alt="hello" draggable={false} {...arrival(reduced)} />
        {slow && <p className="splash-note">Still starting…</p>}
      </div>
    </motion.div>
  )
}
