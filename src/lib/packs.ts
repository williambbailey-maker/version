import type { Loop } from '../engine/types'

/**
 * Pack detection from a file's path, shared by both importers.
 *
 *   segments = path relative to the import root, split on "/"
 *   ≥ 2 segments: pack = first, category = middle segments joined by "/"
 *   1 segment:    pack = the root folder's own name (importing a single pack)
 */
export function packFromPath(relPath: string, rootName: string | null): { pack: string | null; category: string | null } {
  const segs = relPath.split('/').filter(Boolean)
  if (segs.length >= 2) {
    return { pack: segs[0]!, category: segs.length > 2 ? segs.slice(1, -1).join('/') : null }
  }
  return { pack: rootName, category: null }
}

export type PackStats = {
  count: number
  drums: number
  samples: number
  bpmMin: number | null
  bpmMax: number | null
  keys: string[]
  categories: string[]
}

/** Per-pack rollups computed from the loaded library (cheap, no extra queries). */
export function packStats(loops: readonly Loop[]): Map<string, PackStats> {
  const m = new Map<string, PackStats>()
  for (const l of loops) {
    const id = l.packId ?? ''
    let s = m.get(id)
    if (!s) {
      s = { count: 0, drums: 0, samples: 0, bpmMin: null, bpmMax: null, keys: [], categories: [] }
      m.set(id, s)
    }
    s.count++
    if (l.kind === 'drums') s.drums++
    else s.samples++
    s.bpmMin = s.bpmMin === null ? l.bpm : Math.min(s.bpmMin, l.bpm)
    s.bpmMax = s.bpmMax === null ? l.bpm : Math.max(s.bpmMax, l.bpm)
    if (l.key && !s.keys.includes(l.key)) s.keys.push(l.key)
    if (l.category && !s.categories.includes(l.category)) s.categories.push(l.category)
  }
  for (const s of m.values()) {
    s.keys.sort()
    s.categories.sort()
  }
  return m
}
