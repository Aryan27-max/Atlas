/**
 * Spring presets (PLAN: spring-based, 200–350 ms, nothing decorative).
 * `MotionConfig reducedMotion="user"` at the app root turns movement off for
 * people who ask for reduced motion; CSS transitions follow tokens.css.
 */

import type { Transition } from 'motion/react'

/** Controls reacting to input: selection pills, toggles, counts. ~200 ms. */
export const snappy: Transition = { type: 'spring', stiffness: 520, damping: 40, mass: 1 }

/** Things arriving: sheets, popovers, toasts. ~320 ms, no bounce. */
export const gentle: Transition = { type: 'spring', stiffness: 300, damping: 32, mass: 1 }

/** A quick fade for scrims and cross-fades. */
export const fade: Transition = { type: 'tween', duration: 0.2, ease: [0.22, 1, 0.36, 1] }
