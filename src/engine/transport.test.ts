import { describe, expect, it } from 'vitest'
import { Transport, barIndex, barSeconds, nextBar, playbackRate } from './transport'

describe('playbackRate', () => {
  it('is masterBPM / loopBPM (varispeed)', () => {
    expect(playbackRate(100, 88)).toBeCloseTo(100 / 88, 12)
    expect(playbackRate(100, 100)).toBe(1)
    expect(playbackRate(92, 104)).toBeCloseTo(0.884615, 5)
    expect(playbackRate(104, 92)).toBeCloseTo(1.130434, 5)
  })

  it('halves and doubles cleanly', () => {
    expect(playbackRate(60, 120)).toBe(0.5)
    expect(playbackRate(120, 60)).toBe(2)
  })

  it('rejects non-positive tempos', () => {
    expect(() => playbackRate(0, 100)).toThrow(RangeError)
    expect(() => playbackRate(100, -1)).toThrow(RangeError)
    expect(() => playbackRate(NaN, 100)).toThrow(RangeError)
  })
})

describe('barSeconds', () => {
  it('is 240 / bpm for 4/4', () => {
    expect(barSeconds(100)).toBeCloseTo(2.4, 12)
    expect(barSeconds(120)).toBe(2)
    expect(barSeconds(88)).toBeCloseTo(240 / 88, 12)
  })
})

describe('nextBar', () => {
  const start = 10
  const barSec = 2.4 // 100 BPM

  it('returns transportStart before the transport has started', () => {
    expect(nextBar(start, 9.5, barSec)).toBe(start)
    expect(nextBar(start, start, barSec)).toBe(start)
  })

  it('rounds up to the next boundary mid-bar', () => {
    expect(nextBar(start, 10.1, barSec)).toBeCloseTo(12.4, 12)
    expect(nextBar(start, 12.39, barSec)).toBeCloseTo(12.4, 12)
    expect(nextBar(start, 12.41, barSec)).toBeCloseTo(14.8, 12)
    expect(nextBar(start, 100, barSec)).toBeCloseTo(start + Math.ceil(90 / barSec) * barSec, 12)
  })

  it('returns the boundary itself when exactly on it', () => {
    expect(nextBar(0, 4.8, barSec)).toBeCloseTo(4.8, 12)
    expect(nextBar(0, 4, 2)).toBe(4)
  })

  it('skips a boundary that is too close to schedule safely', () => {
    // 5 ms before the boundary with a 20 ms lead → next one
    expect(nextBar(start, 12.395, barSec, 0.02)).toBeCloseTo(14.8, 12)
    // 50 ms before → still this one
    expect(nextBar(start, 12.35, barSec, 0.02)).toBeCloseTo(12.4, 12)
  })

  it('always lands on the grid: (t - start) / barSec is an integer', () => {
    for (let now = start; now < start + 100; now += 0.137) {
      const t = nextBar(start, now, barSec)
      const n = (t - start) / barSec
      expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9)
      expect(t).toBeGreaterThanOrEqual(now - 1e-9)
      expect(t - now).toBeLessThanOrEqual(barSec + 1e-9)
    }
  })

  it('rejects a non-positive bar length', () => {
    expect(() => nextBar(0, 1, 0)).toThrow(RangeError)
  })
})

describe('barIndex', () => {
  it('counts bars from zero and is -1 before start', () => {
    expect(barIndex(10, 9, 2.4)).toBe(-1)
    expect(barIndex(10, 10, 2.4)).toBe(0)
    expect(barIndex(10, 12.3, 2.4)).toBe(0)
    expect(barIndex(10, 12.4, 2.4)).toBe(1)
    expect(barIndex(10, 34, 2.4)).toBe(10)
  })
})

describe('Transport', () => {
  it('derives barSec and rates from masterBPM', () => {
    const t = new Transport(100)
    expect(t.barSec).toBeCloseTo(2.4, 12)
    expect(t.rateFor(88)).toBeCloseTo(100 / 88, 12)
    expect(t.running).toBe(false)
    expect(t.barIndex(5)).toBe(-1)
  })

  it('anchors nextBar on transportStart', () => {
    const t = new Transport(100)
    expect(() => t.nextBar(0)).toThrow()
    t.start(1)
    expect(t.transportStart).toBe(1)
    expect(t.nextBar(1.5)).toBeCloseTo(3.4, 12)
    expect(t.barIndex(3.5)).toBe(1)
    t.stop()
    expect(t.running).toBe(false)
    expect(t.transportStart).toBeNull()
  })

  it('re-anchors the grid when tempo changes mid-run', () => {
    const t = new Transport(100)
    t.start(0)
    const boundary = t.nextBar(5) // 7.2
    expect(boundary).toBeCloseTo(7.2, 12)
    t.setMasterBPM(120, boundary)
    expect(t.transportStart).toBeCloseTo(7.2, 12)
    expect(t.barSec).toBe(2)
    expect(t.nextBar(7.5)).toBeCloseTo(9.2, 12)
    expect(t.barIndex(11.2)).toBe(2)
  })

  it('does not move the anchor when tempo changes while stopped', () => {
    const t = new Transport(100)
    t.setMasterBPM(88)
    expect(t.masterBPM).toBe(88)
    expect(t.transportStart).toBeNull()
  })
})
