import { describe, expect, it } from 'vitest'
import { guessBars } from './localLibrary'

describe('guessBars', () => {
  it('snaps a file length to the nearest power-of-two bar count', () => {
    expect(guessBars(4.8, 100)).toBe(2)     // exactly 2 bars
    expect(guessBars(2.4, 100)).toBe(1)
    expect(guessBars(9.6, 100)).toBe(4)
    expect(guessBars(19.2, 100)).toBe(8)
    expect(guessBars(5.45, 88)).toBe(2)     // slightly untrimmed
    expect(guessBars(3.5, 100)).toBe(2)     // 1.46 bars: ratio 1.37 to 2 beats 1.46 to 1
    expect(guessBars(3.3, 100)).toBe(1)     // 1.375 bars: ratio 1.375 to 1 beats 1.45 to 2
    expect(guessBars(40, 100)).toBe(8)      // clamps at 8
  })
})
