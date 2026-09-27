import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/**
 * A count that glides to its new value (e.g. bucket counts while cutoffs
 * move). Instant for people who ask for reduced motion.
 */
export function AnimatedNumber({ value }: { value: number }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reduce || from.current === value) {
      from.current = value
      setShown(value)
      return
    }
    const controls = animate(from.current, value, {
      duration: 0.3,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setShown(Math.round(latest)),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <span className="atl-tabular">{shown.toLocaleString()}</span>
}
