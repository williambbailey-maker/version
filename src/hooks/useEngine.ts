import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { getEngine } from '../engine/engine'
import type { Engine, EngineState } from '../engine/engine'
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
  removeSample: (loopId: string) => void
  setGain: (loopId: string, value: number) => void
  setMuted: (loopId: string, muted: boolean) => void
  setSolo: (loopId: string, solo: boolean) => void
  isActive: (loopId: string) => boolean
  loadStack: Engine['loadStack']
} {
  const engine = useMemo(() => getEngine(), [])
  const subscribe = useCallback((fn: () => void) => engine.subscribe(fn), [engine])
  const state = useSyncExternalStore(subscribe, () => engine.state, () => engine.state)

  const play = useCallback(() => engine.play(), [engine])
  const stop = useCallback(() => engine.stop(), [engine])
  const toggle = useCallback(() => engine.toggle(), [engine])
  const select = useCallback((loop: Loop) => engine.select(loop), [engine])
  const removeSample = useCallback((id: string) => engine.removeSample(id), [engine])
  const setGain = useCallback((id: string, v: number) => engine.setGain(id, v), [engine])
  const setMuted = useCallback((id: string, m: boolean) => engine.setMuted(id, m), [engine])
  const setSolo = useCallback((id: string, v: boolean) => engine.setSolo(id, v), [engine])
  const isActive = useCallback((id: string) => engine.isActive(id), [engine])
  const loadStack = useCallback<Engine['loadStack']>((stack) => engine.loadStack(stack), [engine])

  return { ...state, play, stop, toggle, select, removeSample, setGain, setMuted, setSolo, isActive, loadStack }
}
