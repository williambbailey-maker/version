import type { Loop } from '../engine/types'

/**
 * The sample after (or before) `current` in library order, staying inside
 * the same pack (loose samples step through the other loose samples).
 * Wraps around; null when there is nothing else to step to.
 */
export function neighborSample(library: readonly Loop[], current: Loop, dir: 1 | -1): Loop | null {
  const pool = library.filter((l) => l.kind === 'sample' && (l.packId ?? null) === (current.packId ?? null))
  const i = pool.findIndex((l) => l.id === current.id)
  if (i < 0 || pool.length < 2) return null
  return pool[(i + dir + pool.length) % pool.length]!
}
