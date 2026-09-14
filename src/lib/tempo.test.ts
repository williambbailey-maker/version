import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bpmFromFilename, candidatesFromDuration, combineEstimates, estimateBPM, tidy } from './tempo'

const SR = 44100

/** Synthetic click track: decaying noise bursts on every beat, optional 8th-note hats. */
function clicks(bpm: number, seconds: number, hats = false): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  const beat = 60 / bpm
  const hit = (at: number, amp: number, decay: number) => {
    const s = Math.round(at * SR)
    for (let i = 0; i < 0.05 * SR && s + i < out.length; i++) {
      const t = i / SR
      out[s + i] = (out[s + i] ?? 0) + (Math.random() * 2 - 1) * amp * Math.exp(-t * decay)
    }
  }
  for (let t = 0; t < seconds; t += beat) {
    hit(t, 0.8, 60)
    if (hats) hit(t + beat / 2, 0.3, 120)
  }
  return out
}

/** Minimal 16-bit mono PCM WAV reader for the dev fixtures. */
function readWav(path: string): { samples: Float32Array; sampleRate: number } {
  const b = readFileSync(path)
  const sampleRate = b.readUInt32LE(24)
  const n = (b.length - 44) / 2
  const samples = new Float32Array(n)
  for (let i = 0; i < n; i++) samples[i] = b.readInt16LE(44 + i * 2) / 32768
  return { samples, sampleRate }
}

describe('bpmFromFilename', () => {
  it('reads explicit and Splice-style tempos', () => {
    expect(bpmFromFilename('groove 92bpm.wav')).toBe(92)
    expect(bpmFromFilename('groove_92_BPM.wav')).toBe(92)
    expect(bpmFromFilename('OS_TFP_128_synth_loop_Cmin.wav')).toBe(128)
    expect(bpmFromFilename('KSHMR_Drum_Loop-140-Am.wav')).toBe(140)
    expect(bpmFromFilename('sample-88.wav')).toBe(88)
  })
  it('refuses ambiguous or implausible numbers', () => {
    expect(bpmFromFilename('take 2.wav')).toBeNull()
    expect(bpmFromFilename('loop_92_120.wav')).toBeNull() // two plausible → unsure
    expect(bpmFromFilename('rec_20240912_1530.wav')).toBeNull()
    expect(bpmFromFilename('nice loop.wav')).toBeNull()
  })
})

describe('candidatesFromDuration', () => {
  it('lists exact bpm per power-of-two bar count', () => {
    const c = candidatesFromDuration(4.8)
    expect(c).toEqual([
      { bpm: 50, bars: 1 },
      { bpm: 100, bars: 2 },
      { bpm: 200, bars: 4 },
    ])
    expect(candidatesFromDuration(0)).toEqual([])
  })
})

describe('estimateBPM', () => {
  it.each([70, 93, 110, 128, 150])('finds %d bpm in a click track', (bpm) => {
    const est = estimateBPM(clicks(bpm, 8), SR)
    expect(est).not.toBeNull()
    expect(Math.abs(est! - bpm)).toBeLessThan(1.5)
  })

  it('is not fooled by 8th-note hats', () => {
    const est = estimateBPM(clicks(96, 8, true), SR)
    expect(Math.abs(est! - 96)).toBeLessThan(1.5)
  })

  it('returns null for silence', () => {
    expect(estimateBPM(new Float32Array(SR * 6), SR)).toBeNull()
  })

  it('agrees with the dev drum loop', () => {
    const { samples, sampleRate } = readWav('public/dev/drums-100.wav')
    const est = estimateBPM(samples, sampleRate)
    expect(Math.abs(est! - 100)).toBeLessThan(1.5)
  })

  it('lands within an octave on the dev melodic loops', () => {
    for (const [file, bpm] of [['sample-88', 88], ['sample-120', 120]] as const) {
      const { samples, sampleRate } = readWav(`public/dev/${file}.wav`)
      const est = estimateBPM(samples, sampleRate)!
      const oct = Math.abs(Math.log2(est / bpm))
      const nearest = Math.round(oct)
      expect(Math.abs(oct - nearest)).toBeLessThan(0.03)
    }
  })
})

describe('combineEstimates', () => {
  it('trusts the filename and derives bars from length', () => {
    expect(combineEstimates({ filenameBPM: 92, duration: 10.43, audioBPM: null })).toMatchObject({
      bpm: 92, bars: 4, source: 'filename',
    })
  })

  it('snaps analysis onto the exact length candidate', () => {
    // 2 bars at 88 = 5.4545 s; analysis says 87.3
    expect(combineEstimates({ filenameBPM: null, duration: 240 * 2 / 88, audioBPM: 87.3 })).toMatchObject({
      bpm: 88, bars: 2, source: 'length+audio',
    })
  })

  it('corrects an octave error in the analysis using length', () => {
    // 1 bar at 120 = 2 s; analysis said 60
    expect(combineEstimates({ filenameBPM: null, duration: 2, audioBPM: 60 })).toMatchObject({
      bpm: 120, bars: 1, source: 'length+audio',
    })
  })

  it('falls back to analysis when the file is not trimmed to a bar', () => {
    const r = combineEstimates({ filenameBPM: null, duration: 7.1, audioBPM: 101.2 })
    expect(r.source).toBe('audio')
    expect(r.bpm).toBe(101.2)
    expect(r.bars).toBe(4) // 7.1 s at 101 ≈ 3 bars → nearest power of two in ratio terms is 4
  })

  it('falls back to a typical-tempo length candidate with no analysis', () => {
    expect(combineEstimates({ filenameBPM: null, duration: 4.8, audioBPM: null })).toMatchObject({
      bpm: 100, bars: 2, source: 'length',
    })
  })

  it('gives up cleanly', () => {
    expect(combineEstimates({ filenameBPM: null, duration: null, audioBPM: null })).toMatchObject({
      bpm: null, source: 'none',
    })
  })
})

describe('tidy', () => {
  it('snaps near-integers and keeps one decimal otherwise', () => {
    expect(tidy(91.98)).toBe(92)
    expect(tidy(92.04)).toBe(92)
    expect(tidy(92.26)).toBe(92.3)
  })
})
