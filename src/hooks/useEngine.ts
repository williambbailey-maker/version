import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { getEngine } from '../engine/engine'
import type { EngineState } from '../engine/engine'
import type { Loop } from '../engine/types'

/**
 * The only React ↔ engine bridge. Returns the engine's state snapshot plus
 * gesture-safe actions. Everything musical happens inside the engine.
 */
export function useEngine(): EngineState & {
  play: () => Promise<void>
  stop: () => void
  toggle: () => Promise<void>
  select: (loop: Loop) => Promise<void>
} {
  const engine = useMemo(() => getEngine(), [])
  const subscribe = useCallback((fn: () => void) => engine.subscribe(fn), [engine])
  const state = useSyncExternalStore(subscribe, () => engine.state, () => engine.state)

  const play = useCallback(() => engine.play(), [engine])
  const stop = useCallback(() => engine.stop(), [engine])
  const toggle = useCallback(() => engine.toggle(), [engine])
  const select = useCallback((loop: Loop) => engine.select(loop), [engine])

  return { ...state, play, stop, toggle, select }
}
