import { describe, expect, it } from 'vitest'
import { captureStartFrame, covers, lastBars, measureLatency, nextTakeNumber, peakOf, rotateToPhrase, phraseStart, sliceBlocks, takeFileName, takeFrames, takeName, toDb } from './capture'
import type { Block } from './capture'
import { matchDevice } from './recorder'

const ramp = (frame: number, len: number, chans = 2): Block => ({
  frame,
  channels: Array.from({ length: chans }, (_, c) => Float32Array.from({ length: len }, (_, i) => (frame + i) * (c === 0 ? 1 : -1))),
})

describe('take length and position', () => {
  it('a take is exactly bars × barSec frames', () => {
    expect(takeFrames(4, 240 / 100, 44100)).toBe(423360)
    expect(takeFrames(2, 240 / 88, 48000)).toBe(Math.round((2 * 240 * 48000) / 88))
  })
  it('the cut starts later by the round-trip latency', () => {
    expect(captureStartFrame(10, 0, 48000)).toBe(480000)
    expect(captureStartFrame(10, 0.0125, 48000)).toBe(480600)
  })
})

describe('phraseStart', () => {
  const barSec = 2.4 // 100 BPM
  it('waits for the next bar when recording by the bar', () => {
    expect(phraseStart(10, 11, barSec, 1)).toEqual({ at: 10 + barSec, bar: 1 })
  })
  it('waits for the next multiple of the take length', () => {
    // 5.2 bars in: a 4-bar take starts at bar 8, a 2-bar take at bar 6
    const now = 10 + 5.2 * barSec
    expect(phraseStart(10, now, barSec, 4).bar).toBe(8)
    expect(phraseStart(10, now, barSec, 2).bar).toBe(6)
    expect(phraseStart(10, now, barSec, 4).at).toBeCloseTo(10 + 8 * barSec, 9)
  })
  it('skips a boundary that is closer than the lead', () => {
    const now = 10 + 4 * barSec - 0.05
    expect(phraseStart(10, now, barSec, 4, 0.2).bar).toBe(8)
    expect(phraseStart(10, now, barSec, 4, 0.01).bar).toBe(4)
  })
  it('takes a boundary it is sitting exactly on', () => {
    expect(phraseStart(10, 10 + 4 * barSec, barSec, 4).bar).toBe(4)
  })
  it('gives a count-in when playback has only just been started', () => {
    // transport starts in 0.1 s; from stopped, one whole pass is the count-in
    expect(phraseStart(10, 9.9, barSec, 4, 0.15, 4)).toEqual({ at: 10 + 4 * barSec, bar: 4 })
    expect(phraseStart(10, 9.9, barSec, 1, 0.15, 1)).toEqual({ at: 10 + barSec, bar: 1 })
  })
})

describe('grabbing what was just played', () => {
  const grid = { start: 10, barSec: 2, end: null }
  it('takes the bars before the last bar line', () => {
    // 11.4 bars in: bars 3..10 are the last 8 complete ones
    expect(lastBars(grid, 10 + 11.4 * 2, 8)).toEqual({ at: 10 + 3 * 2, firstBar: 3 })
    expect(lastBars(grid, 10 + 16 * 2, 8)).toEqual({ at: 10 + 8 * 2, firstBar: 8 })
  })
  it('refuses until that many bars have been played', () => {
    expect(lastBars(grid, 10 + 7.9 * 2, 8)).toBeNull()
    expect(lastBars(grid, 10 + 8 * 2, 8)).toEqual({ at: 10, firstBar: 0 })
  })
  it('after a stop, counts no further than where playback ended', () => {
    const stopped = { start: 10, barSec: 2, end: 10 + 12 * 2 }
    expect(lastBars(stopped, 500, 8)).toEqual({ at: 10 + 4 * 2, firstBar: 4 })
    // the tail of the last bar has not arrived yet: hold at the bar before
    expect(lastBars(stopped, 10 + 11.5 * 2, 8)).toEqual({ at: 10 + 3 * 2, firstBar: 3 })
  })
  it('rotates a grab so it loops where it was played', () => {
    // 4 bars of 2 frames, each frame labelled with the grid bar it was played in
    const take = (first: number) => [Float32Array.from([first, first, first + 1, first + 1, first + 2, first + 2, first + 3, first + 3])]
    const barOf = (c: Float32Array[]) => [c[0]![0]! % 4, c[0]![2]! % 4, c[0]![4]! % 4, c[0]![6]! % 4]
    expect(barOf(rotateToPhrase(take(8), 8, 4))).toEqual([0, 1, 2, 3]) // already on the phrase
    expect(barOf(rotateToPhrase(take(5), 5, 4))).toEqual([0, 1, 2, 3])
    expect(barOf(rotateToPhrase(take(7), 7, 4))).toEqual([0, 1, 2, 3])
    expect(rotateToPhrase(take(5), 5, 4)[0]).toEqual(Float32Array.from([8, 8, 5, 5, 6, 6, 7, 7]))
  })
})

describe('sliceBlocks', () => {
  const blocks = [ramp(1000, 2048), ramp(3048, 2048), ramp(5096, 2048)]
  it('cuts across block edges without shifting a sample', () => {
    const [l, r] = sliceBlocks(blocks, 3000, 200, 'stereo')
    expect(l).toHaveLength(200)
    expect(l![0]).toBe(3000)
    expect(l![48]).toBe(3048)
    expect(l![199]).toBe(3199)
    expect(r![199]).toBe(-3199)
  })
  it('keeps one input for mono takes', () => {
    expect(sliceBlocks(blocks, 1000, 4, 'in1')).toEqual([Float32Array.from([1000, 1001, 1002, 1003])])
    expect(sliceBlocks(blocks, 1000, 4, 'in2')).toEqual([Float32Array.from([-1000, -1001, -1002, -1003])])
  })
  it('leaves a dropped chunk silent instead of closing the gap', () => {
    const gappy = [ramp(1000, 100), ramp(1200, 100)]
    const [m] = sliceBlocks(gappy, 1090, 120, 'in1')
    expect(m![9]).toBe(1099)
    expect(m![10]).toBe(0)
    expect(m![109]).toBe(0)
    expect(m![110]).toBe(1200)
  })
  it('leaves the second input silent on a mono source', () => {
    const mono = [ramp(0, 8, 1)]
    expect(sliceBlocks(mono, 0, 4, 'in2')).toEqual([new Float32Array(4)])
    expect(sliceBlocks(mono, 0, 2, 'stereo')[1]).toEqual(new Float32Array(2))
  })
  it('knows when the stream has reached the end of the take', () => {
    expect(covers(blocks, 7144)).toBe(true)
    expect(covers(blocks, 7145)).toBe(false)
    expect(covers([], 1)).toBe(false)
  })
})

describe('levels', () => {
  it('reports the peak and its decibels', () => {
    expect(peakOf([Float32Array.from([0.1, -0.5, 0.2])])).toBe(0.5)
    expect(toDb(0.5)).toBeCloseTo(-6.02, 2)
    expect(toDb(0)).toBe(-Infinity)
  })
})

describe('measureLatency', () => {
  const sr = 48000
  const clicks = [1.0, 1.5, 2.0, 2.5]
  const record = (latency: number, amp = 0.6, noise = 0) => {
    const sig = new Float32Array(Math.round(3 * sr))
    for (let i = 0; i < sig.length; i++) sig[i] = noise * Math.sin(i * 0.37)
    for (const t of clicks) {
      const at = Math.round((t - 0.9 + latency) * sr) // signal starts at 0.9 s
      for (let i = 0; i < 144; i++) sig[at + i]! += amp * Math.sin((2 * Math.PI * 2000 * i) / sr + Math.PI / 2)
    }
    return sig
  }
  it('finds the round trip to well under a millisecond', () => {
    const r = measureLatency(record(0.0123), sr, 0.9, clicks)
    expect(r).not.toBeNull()
    expect(r!.heard).toBe(4)
    expect(Math.abs(r!.latencySec - 0.0123)).toBeLessThan(0.0002)
  })
  it('still works with a noisy input', () => {
    const r = measureLatency(record(0.031, 0.5, 0.02), sr, 0.9, clicks)
    expect(Math.abs(r!.latencySec - 0.031)).toBeLessThan(0.0003)
  })
  it('reports nothing when no click comes back', () => {
    expect(measureLatency(new Float32Array(3 * sr), sr, 0.9, clicks)).toBeNull()
    expect(measureLatency(record(0.01, 0.004), sr, 0.9, clicks)).toBeNull()
  })
  it('reports nothing for steady noise with no clicks in it', () => {
    const sig = Float32Array.from({ length: 3 * sr }, (_, i) => 0.3 * Math.sin(i * 0.2))
    expect(measureLatency(sig, sr, 0.9, clicks)).toBeNull()
  })
})

describe('names', () => {
  const d = new Date(2026, 10, 27)
  it('names takes like the library recordings', () => {
    expect(takeName(d, 3)).toBe('27NOV26 - Take 3')
    expect(takeFileName('27NOV26 - Take 3', 88, 4)).toBe('27NOV26 - Take 3 88bpm 4bar.wav')
  })
  it('numbers a new take after the ones already made that day', () => {
    expect(nextTakeNumber([], d)).toBe(1)
    expect(nextTakeNumber(['27NOV26 - Take 1', '27NOV26 - Take 4', '26NOV26 - Take 9', 'Beat A'], d)).toBe(5)
  })
})

describe('matchDevice', () => {
  const devices = [{ id: 'a1', label: 'MacBook Pro Microphone' }, { id: 'b2', label: 'SSL 2+' }]
  it('uses the id when the list has it', () => {
    expect(matchDevice(devices, 'b2', 'SSL 2+')).toBe('b2')
  })
  it('finds the system default by its name', () => {
    expect(matchDevice(devices, 'default', 'Default - SSL 2+')).toBe('b2')
    expect(matchDevice(devices, 'default', 'Default - MacBook Pro Microphone')).toBe('a1')
  })
  it('keeps the id it was given when nothing matches', () => {
    expect(matchDevice(devices, 'zz', 'Something Else')).toBe('zz')
    expect(matchDevice([], null, 'Input')).toBeNull()
  })
})
