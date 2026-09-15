import { describe, expect, it } from 'vitest'
import type { Loop } from '../engine/types'
import { packFromPath, packStats } from './packs'

describe('packFromPath', () => {
  it('uses the first folder as the pack and the rest as category', () => {
    expect(packFromPath('Island Vibes/skank.wav', 'packs')).toEqual({ pack: 'Island Vibes', category: null })
    expect(packFromPath('Island Vibes/Drums/Loops/beat.wav', 'packs')).toEqual({ pack: 'Island Vibes', category: 'Drums/Loops' })
  })
  it('falls back to the root folder name for a single-pack import', () => {
    expect(packFromPath('skank.wav', 'Island Vibes')).toEqual({ pack: 'Island Vibes', category: null })
    expect(packFromPath('skank.wav', null)).toEqual({ pack: null, category: null })
  })
})

describe('packStats', () => {
  const L = (packId: string | null, kind: Loop['kind'], bpm: number, key: string | null, category: string | null): Loop => ({
    id: `${packId}-${bpm}`, name: 'x', url: '', bpm, bars: 2, kind, gain: 0.8, packId, key, category,
  })
  it('rolls up counts, tempo range, keys and categories per pack', () => {
    const s = packStats([L('p1', 'drums', 90, null, 'Drums'), L('p1', 'sample', 120, 'Amin', 'Bass'), L('p2', 'sample', 100, 'Cmaj', null)])
    expect(s.get('p1')).toEqual({ count: 2, drums: 1, samples: 1, bpmMin: 90, bpmMax: 120, keys: ['Amin'], categories: ['Bass', 'Drums'] })
    expect(s.get('p2')?.count).toBe(1)
  })
})
