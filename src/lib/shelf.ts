/**
 * Record-spine layout for the shelf: every pack on one shelf, width
 * proportional to its loop count, heights nudged so the row reads as a
 * real stack of records. Pure, so it is unit-tested and memoised.
 */

export type SpineInput = { id: string; name: string; count: number }
export type Spine = SpineInput & { x: number; w: number; h: number }

export const SPINE_MIN_W = 10
export const SPINE_MAX_W = 110
const GAP = 4
const BASE_H = 150
const HEIGHTS = [0, 18, 6, 24, 12] // deterministic wobble, in px

/** Lay packs out left to right inside [x0, x0 + width], sorted by name. */
export function layoutSpines(packs: readonly SpineInput[], x0: number, width: number): Spine[] {
  const sorted = [...packs].sort((a, b) => a.name.localeCompare(b.name))
  const n = sorted.length
  if (n === 0) return []
  const tight = n * (SPINE_MIN_W + GAP) > width
  const gap = tight ? 2 : GAP
  let widths: number[]
  if (tight) {
    // Too many for comfort: equal thin spines that still fit.
    const w = Math.max(3, Math.floor((width - (n - 1) * gap) / n))
    widths = sorted.map(() => w)
  } else {
    const total = sorted.reduce((s, p) => s + Math.max(0, p.count), 0) || 1
    const free = width - n * SPINE_MIN_W - (n - 1) * gap
    const extras = sorted.map((p) => (Math.max(0, p.count) / total) * free)
    // Keep proportions but never wider than SPINE_MAX_W.
    const k = Math.min(1, (SPINE_MAX_W - SPINE_MIN_W) / Math.max(1, ...extras))
    widths = extras.map((e) => SPINE_MIN_W + Math.round(e * k))
  }
  let x = x0
  return sorted.map((p, i) => {
    const w = widths[i]!
    const s: Spine = { ...p, x, w, h: BASE_H + HEIGHTS[i % HEIGHTS.length]! }
    x += w + gap
    return s
  })
}

/** Whether a spine is wide enough to carry its name vertically. */
export function spineLabelSize(w: number): number | null {
  if (w >= 28) return 10
  if (w >= 20) return 8.5
  return null
}

/** Trim a name so it fits the spine height at the given font size. */
export function spineLabel(name: string, h: number, fontSize: number): string {
  const maxChars = Math.floor((h - 16) / (fontSize * 0.62))
  const up = name.toUpperCase()
  return up.length > maxChars ? up.slice(0, Math.max(1, maxChars - 1)) + '…' : up
}
