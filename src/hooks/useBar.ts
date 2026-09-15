import { useEffect, useState } from 'react'
import type { Engine } from '../engine/engine'

/** Current bar index (1-based for display), polled with rAF while playing. */
export function useBar(engine: Engine, playing: boolean): number {
  const [bar, setBar] = useState(0)
  useEffect(() => {
    if (!playing) {
      setBar(0)
      return
    }
    let raf = 0
    const tick = () => {
      setBar(engine.currentBar() + 1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine, playing])
  return bar
}
