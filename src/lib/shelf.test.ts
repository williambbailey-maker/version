import { describe, expect, it } from 'vitest'
import { SPINE_MAX_W, SPINE_MIN_W, layoutSpines, spineLabel, spineLabelSize } from './shelf'

describe('layoutSpines', () => {
  it('sorts by name, sizes by count, and never overflows the shelf', () => {
    const packs = [
      { id: 'c', name: 'Cumbia', count: 60 },
      { id: 'a', name: 'Al Hug', count: 140 },
      { id: 'b', name: 'Boleros', count: 24 },
    ]
    const spines = layoutSpines(packs, 100, 600)
    expect(spines.map((s) => s.name)).toEqual(['Al Hug', 'Boleros', 'Cumbia'])
    expect(spines[0]!.w).toBeGreaterThan(spines[2]!.w)
    expect(spines[2]!.w).toBeGreaterThan(spines[1]!.w)
    for (const s of spines) {
      expect(s.w).toBeGreaterThanOrEqual(SPINE_MIN_W)
      expect(s.w).toBeLessThanOrEqual(SPINE_MAX_W)
    }
    const last = spines[spines.length - 1]!
    expect(last.x + last.w).toBeLessThanOrEqual(700)
    expect(spines[0]!.x).toBe(100)
  })

  it('fits a hundred packs on one shelf', () => {
    const packs = Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `Pack ${String(i).padStart(3, '0')}`, count: 5 + (i % 7) * 10 }))
    const spines = layoutSpines(packs, 40, 880)
    const last = spines[spines.length - 1]!
    expect(spines).toHaveLength(100)
    expect(last.x + last.w).toBeLessThanOrEqual(920)
    for (const s of spines) expect(s.w).toBeGreaterThanOrEqual(6)
  })

  it('handles an empty shelf and zero counts', () => {
    expect(layoutSpines([], 40, 880)).toEqual([])
    const spines = layoutSpines([{ id: 'x', name: 'Empty', count: 0 }], 40, 880)
    expect(spines[0]!.w).toBe(SPINE_MIN_W)
  })
})

describe('spine labels', () => {
  it('needs width for a label and shrinks the font on narrow spines', () => {
    expect(spineLabelSize(40)).toBe(10)
    expect(spineLabelSize(22)).toBe(8.5)
    expect(spineLabelSize(12)).toBeNull()
  })
  it('trims long names to the spine height', () => {
    expect(spineLabel('Boleros', 150, 10)).toBe('BOLEROS')
    const long = spineLabel('Classic Riddims More 80s Dancehall Anthems', 150, 10)
    expect(long.endsWith('…')).toBe(true)
    expect(long.length).toBeLessThan(42)
  })
})
