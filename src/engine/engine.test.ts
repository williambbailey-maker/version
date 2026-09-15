import { describe, expect, it } from 'vitest'
import { Engine } from './engine'
import type { Loop } from './types'

/** Minimal fake of the Web Audio surface the engine touches. */
type Call = { kind: 'start' | 'stop'; loop: string; at: number; offset?: number; rate?: number }
type GainNodeFake = { gain: { value: number; target: number | null; setTargetAtTime(v: number): void; setValueAtTime(v: number): void }; connect(): void; disconnect(): void }

function fakeContext(calls: Call[], gains: GainNodeFake[] = []) {
  const param = (value = 1) => ({ value, target: null as number | null, setTargetAtTime(v: number) { this.target = v }, setValueAtTime(v: number) { this.value = v } })
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    async resume() {},
    createGain: () => {
      const g: GainNodeFake = { gain: param(1), connect() {}, disconnect() {} }
      gains.push(g)
      return g
    },
    createBufferSource() {
      const node = {
        buffer: null as { id: string } | null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        playbackRate: param(1),
        onended: null as null | (() => void),
        connect() {},
        disconnect() {},
        start(at: number, offset?: number) {
          const c: Call = { kind: 'start', loop: node.buffer!.id, at, rate: node.playbackRate.value }
          if (offset !== undefined) c.offset = offset
          calls.push(c)
        },
        stop(at: number) {
          calls.push({ kind: 'stop', loop: node.buffer!.id, at })
        },
      }
      return node
    },
    decodeAudioData: () => Promise.reject(new Error('not used')),
  }
  return ctx as unknown as AudioContext
}

function loop(id: string, kind: Loop['kind'], bpm: number, bars: Loop['bars'] = 2, gain = 0.8): Loop {
  const buffer = { id, duration: (bars * 240) / bpm, length: 1, sampleRate: 44100 } as unknown as AudioBuffer
  return { id, name: id, url: `/${id}`, bpm, bars, kind, gain, buffer }
}

function make() {
  const calls: Call[] = []
  const gains: GainNodeFake[] = []
  const ctx = fakeContext(calls, gains)
  const engine = new Engine(ctx)
  // gains[0] is the master; slot gain nodes follow in creation order (drums first).
  const targets = () => gains.slice(1).map((g) => g.gain.target)
  return { engine, calls, gains, targets, ctx: ctx as unknown as { currentTime: number } }
}

describe('Engine', () => {
  it('starts drums and every selected sample on the same timestamp', async () => {
    const { engine, calls, ctx } = make()
    await engine.select(loop('d', 'drums', 100))
    await engine.select(loop('a', 'sample', 88))
    await engine.select(loop('b', 'sample', 120, 1))
    expect(engine.state.samples.map((s) => s.pending?.id)).toEqual(['a', 'b'])
    ctx.currentTime = 10
    await engine.play()
    const starts = calls.filter((c) => c.kind === 'start')
    expect(starts.map((c) => c.loop)).toEqual(['d', 'a', 'b'])
    expect(new Set(starts.map((c) => c.at)).size).toBe(1)
    expect(starts[1]!.rate).toBeCloseTo(100 / 88, 10)
    expect(starts[2]!.rate).toBeCloseTo(100 / 120, 10)
    expect(engine.state.masterBPM).toBe(100)
  })

  it('toggles a sample in and out on bar boundaries while playing', async () => {
    const { engine, calls, ctx } = make()
    await engine.select(loop('d', 'drums', 100))
    await engine.play()
    const t0 = engine.transport.transportStart!
    ctx.currentTime = t0 + 1 // mid bar 0 (barSec 2.4)
    await engine.select(loop('a', 'sample', 88))
    const start = calls.find((c) => c.kind === 'start' && c.loop === 'a')!
    expect(start.at).toBeCloseTo(t0 + 2.4, 10)
    ctx.currentTime = t0 + 3
    await engine.select(loop('a', 'sample', 88)) // toggle off
    const stop = calls.find((c) => c.kind === 'stop' && c.loop === 'a')!
    expect(stop.at).toBeCloseTo(t0 + 4.8, 10)
    expect(engine.state.samples).toEqual([])
    expect(engine.isActive('a')).toBe(false)
  })

  it('keeps sample selections across stop and play', async () => {
    const { engine, ctx } = make()
    await engine.select(loop('d', 'drums', 100))
    await engine.select(loop('a', 'sample', 88))
    await engine.play()
    ctx.currentTime = 1
    engine.stop()
    expect(engine.playing).toBe(false)
    expect(engine.state.samples[0]?.pending?.id).toBe('a')
    ctx.currentTime = 20
    await engine.play()
    expect(engine.state.samples[0]?.loop?.id).toBe('a')
  })

  it('remembers per-slot gain and starts from the loop gain', async () => {
    const { engine } = make()
    await engine.select(loop('d', 'drums', 100))
    await engine.select(loop('a', 'sample', 88, 2, 0.6))
    expect(engine.state.samples[0]?.gain).toBe(0.6)
    engine.setGain('a', 0.25)
    expect(engine.state.samples[0]?.gain).toBe(0.25)
    engine.setGain('d', 0.5)
    expect(engine.state.drums.gain).toBe(0.5)
    engine.setGain('zzz', 0.1) // unknown id: ignored
  })

  it('re-pitches samples when a drum swap changes the tempo', async () => {
    const { engine, calls, ctx } = make()
    await engine.select(loop('d', 'drums', 100))
    await engine.select(loop('a', 'sample', 88))
    await engine.play()
    ctx.currentTime = engine.transport.transportStart! + 0.5
    await engine.select(loop('d2', 'drums', 120))
    expect(engine.state.masterBPM).toBe(120)
    const swap = calls.find((c) => c.kind === 'start' && c.loop === 'd2')!
    expect(engine.transport.transportStart).toBeCloseTo(swap.at, 10)
    expect(engine.transport.rateFor(88)).toBeCloseTo(120 / 88, 10)
  })

  it('mute silences one slot, solo silences the others, faders come back intact', async () => {
    const { engine, targets } = make()
    await engine.select(loop('d', 'drums', 100, 2, 0.8))
    await engine.select(loop('a', 'sample', 88, 2, 0.6))
    await engine.select(loop('b', 'sample', 120, 1, 0.4))
    await engine.play()
    expect(targets()).toEqual([0.8, 0.6, 0.4])

    engine.setMuted('a', true)
    expect(targets()).toEqual([0.8, 0, 0.4])
    expect(engine.state.samples[0]?.muted).toBe(true)

    engine.setSolo('b', true)
    expect(targets()).toEqual([0, 0, 0.4]) // drums silenced by solo, a still muted
    engine.setSolo('d', true)
    expect(targets()).toEqual([0.8, 0, 0.4]) // two solos: both audible
    engine.setSolo('b', false)
    engine.setSolo('d', false)
    engine.setMuted('a', false)
    expect(targets()).toEqual([0.8, 0.6, 0.4])

    engine.setGain('a', 0.2)
    engine.setMuted('a', true)
    expect(engine.state.samples[0]?.gain).toBe(0.2) // fader position survives mute
    expect(targets()[1]).toBe(0)
  })

  it('removing a soloed sample releases the others', async () => {
    const { engine, targets } = make()
    await engine.select(loop('d', 'drums', 100, 2, 0.8))
    await engine.select(loop('a', 'sample', 88, 2, 0.6))
    await engine.play()
    engine.setSolo('a', true)
    expect(targets()[0]).toBe(0)
    engine.removeSample('a')
    expect(targets()[0]).toBe(0.8)
  })

  it('honours a codec start offset', async () => {
    const { engine, calls } = make()
    await engine.select(loop('d', 'drums', 100))
    await engine.select({ ...loop('a', 'sample', 88), startOffset: 0.025 })
    await engine.play()
    const a = calls.find((c) => c.kind === 'start' && c.loop === 'a')!
    expect(a.offset).toBeCloseTo(0.025, 10)
  })
})
