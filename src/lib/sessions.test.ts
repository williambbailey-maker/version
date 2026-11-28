import { describe, expect, it } from 'vitest'
import type { EngineState } from '../engine/engine'
import type { Loop } from '../engine/types'
import { resolveStack, snapshotStack } from './sessions'

const L = (id: string, kind: Loop['kind'] = 'sample'): Loop => ({ id, name: id, url: '', bpm: 100, bars: 2, kind, gain: 0.8 })

describe('snapshotStack', () => {
  it('captures the clock and each sample with its level and flags', () => {
    const state: EngineState = {
      playing: true, masterBPM: 100, barSec: 2.4, loading: [], error: null,
      drums: { loop: L('d', 'drums'), pending: null, gain: 0.8, muted: false, solo: false },
      samples: [
        { loop: L('a'), pending: null, gain: 0.5, muted: true, solo: false },
        { loop: null, pending: L('b'), gain: 0.9, muted: false, solo: true },
      ],
    }
    expect(snapshotStack(state)).toEqual({
      drumsLoopId: 'd',
      samples: [{ loopId: 'a', gain: 0.5, muted: true, solo: false }, { loopId: 'b', gain: 0.9, muted: false, solo: true }],
    })
  })
})

describe('resolveStack', () => {
  it('maps ids back to loops and counts what is gone', () => {
    const lib = [L('d', 'drums'), L('a')]
    const r = resolveStack({ id: 's', name: 'x', drumsLoopId: 'd', updatedAt: '', samples: [{ loopId: 'a', gain: 0.5, muted: false, solo: false }, { loopId: 'zzz', gain: 1, muted: false, solo: false }] }, lib)
    expect(r.drums?.id).toBe('d')
    expect(r.samples.map((s) => s.loop.id)).toEqual(['a'])
    expect(r.missing).toBe(1)
  })
})

describe('track effects in sessions', () => {
  const off = { on: false, preset: 'default' }
  it('saves each track\'s effect and restores it', () => {
    const state = {
      playing: true, masterBPM: 100, barSec: 2.4, masterGain: 1, loading: [], error: null,
      drums: { loop: L('d', 'drums'), pending: null, gain: 0.8, muted: false, solo: false, speed: 1, boost: { on: true, preset: 'master-bump' } },
      samples: [
        { loop: L('a'), pending: null, gain: 0.5, muted: false, solo: false, speed: 1, boost: { on: true, preset: 'master-hump' } },
        { loop: L('b'), pending: null, gain: 0.5, muted: false, solo: false, speed: 2, boost: off },
      ],
    } as EngineState
    const snap = snapshotStack(state)
    expect(snap.boost).toEqual({ on: true, preset: 'master-bump' })
    expect(snap.samples.map((x) => x.boost)).toEqual([{ on: true, preset: 'master-hump' }, off])
    const r = resolveStack({ id: 's', name: 'x', drumsLoopId: 'd', updatedAt: '', notes: '', boost: snap.boost, samples: snap.samples }, [L('d', 'drums'), L('a'), L('b')])
    expect(r.boost).toEqual({ on: true, preset: 'master-bump' })
    expect(r.samples.map((x) => x.boost)).toEqual([{ on: true, preset: 'master-hump' }, off])
  })
})
