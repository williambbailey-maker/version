import { describe, expect, it } from 'vitest'
import type { Loop } from '../engine/types'
import { neighborSample } from './neighbors'

const loop = (id: string, kind: Loop['kind'], packId: string | null): Loop => ({ id, name: id, url: '', bpm: 100, bars: 2, kind, gain: 0.15, packId })

const lib: Loop[] = [
  loop('d1', 'drums', null),
  loop('a1', 'sample', 'A'),
  loop('b1', 'sample', 'B'),
  loop('a2', 'sample', 'A'),
  loop('x1', 'sample', null),
  loop('a3', 'sample', 'A'),
  loop('x2', 'sample', null),
]

describe('neighborSample', () => {
  it('steps within the same pack in library order and wraps', () => {
    expect(neighborSample(lib, lib[1]!, 1)?.id).toBe('a2')
    expect(neighborSample(lib, lib[3]!, 1)?.id).toBe('a3')
    expect(neighborSample(lib, lib[5]!, 1)?.id).toBe('a1')
    expect(neighborSample(lib, lib[1]!, -1)?.id).toBe('a3')
  })
  it('loose samples step through the other loose samples', () => {
    expect(neighborSample(lib, lib[4]!, 1)?.id).toBe('x2')
    expect(neighborSample(lib, lib[6]!, 1)?.id).toBe('x1')
  })
  it('returns null when the pack has only this sample or the loop is unknown', () => {
    expect(neighborSample(lib, lib[2]!, 1)).toBeNull()
    expect(neighborSample(lib, loop('zz', 'sample', 'A'), 1)).toBeNull()
  })
})
