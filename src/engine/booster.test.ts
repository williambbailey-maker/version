import { describe, expect, it } from 'vitest'
import { BOOST_PRESETS, DEFAULT_BOOST, Booster, boostPreset, compressorSettings, ioGains, lowpassHz, shaperCurve, wowSettings } from './booster'

describe('booster parameter mapping', () => {
  it('maps compression amount to threshold, ratio and knee', () => {
    const lo = compressorSettings({ ...DEFAULT_BOOST, comp: 0 })
    const mid = compressorSettings(DEFAULT_BOOST)
    const hi = compressorSettings({ ...DEFAULT_BOOST, comp: 100 })
    expect(lo.threshold).toBe(-6)
    expect(hi.threshold).toBe(-48)
    expect(lo.ratio).toBe(2)
    expect(hi.ratio).toBe(20)
    expect(mid.knee).toBe(8)
    expect(mid.attack).toBeCloseTo(0.003, 6)
    expect(mid.release).toBeCloseTo(0.12, 6)
  })

  it('scales attack and release with the time constants and clamps them', () => {
    const c = compressorSettings({ ...DEFAULT_BOOST, attack: 3, release: 0.3 })
    expect(c.attack).toBeCloseTo(0.009, 9)
    expect(c.release).toBeCloseTo(0.036, 9)
    expect(compressorSettings({ ...DEFAULT_BOOST, attack: 0.01 }).attack).toBe(0.0005)
    expect(compressorSettings({ ...DEFAULT_BOOST, release: 100 }).release).toBe(1)
  })

  it('shaper curve is odd-symmetric, bounded, and harder with more lo-fi', () => {
    const soft = shaperCurve({ ...DEFAULT_BOOST, lofi: 10 }, 257)
    const hard = shaperCurve({ ...DEFAULT_BOOST, lofi: 100, crunch: 100 }, 257)
    expect(soft[128]).toBeCloseTo(0, 6)
    expect(soft[0]).toBeCloseTo(-soft[256]!, 6)
    for (const v of hard) expect(Math.abs(v)).toBeLessThanOrEqual(1)
    // at a quarter of full scale the hard curve has already climbed much higher
    expect(hard[192]!).toBeGreaterThan(soft[192]!)
    expect(hard[256]).toBeCloseTo(1, 6)
  })

  it('lowpass opens fully at 0% lo-fi and closes with amount and digital types', () => {
    expect(lowpassHz({ ...DEFAULT_BOOST, lofi: 0 })).toBe(18000)
    expect(lowpassHz({ ...DEFAULT_BOOST, lofi: 100 })).toBeLessThan(8000)
    expect(lowpassHz({ ...DEFAULT_BOOST, lofi: 0, type: 'digital80' })).toBe(7000)
  })

  it('wow rate follows the platter speed and wet is zero at 0% depth', () => {
    expect(wowSettings({ ...DEFAULT_BOOST, wowSpeed: 33.3 }).wowHz).toBeCloseTo(0.555, 3)
    expect(wowSettings({ ...DEFAULT_BOOST, wowSpeed: 78 }).wowHz).toBeCloseTo(1.3, 3)
    expect(wowSettings({ ...DEFAULT_BOOST, wow: 0 }).wet).toBe(0)
    expect(wowSettings({ ...DEFAULT_BOOST, wow: 50, wowMix: 100 }).wowDepth).toBeCloseTo(0.00125, 8)
  })

  it('a lower ref level drives the chain harder and pulls the output back by the same amount', () => {
    const d = ioGains(DEFAULT_BOOST)
    expect(d.pre).toBeCloseTo(1, 9)
    expect(d.post).toBeCloseTo(1, 9)
    const crushed = ioGains({ ...DEFAULT_BOOST, ref: -36 })
    expect(20 * Math.log10(crushed.pre)).toBeCloseTo(18, 6)
    expect(20 * Math.log10(crushed.post)).toBeCloseTo(-18, 6)
  })

  it('has unique preset ids and falls back to Default for unknown ids', () => {
    expect(new Set(BOOST_PRESETS.map((x) => x.id)).size).toBe(BOOST_PRESETS.length)
    expect(boostPreset('nope').id).toBe('default')
    expect(boostPreset('glue').params.mix).toBe(50)
  })
})

// ---- node chain against a fake context ---------------------------------------

type Param = { value: number; target: number | null; setTargetAtTime(v: number): void; setValueAtTime(v: number): void }
const param = (value = 0): Param => ({ value, target: null, setTargetAtTime(v) { this.target = v }, setValueAtTime(v) { this.value = v } })
type Node = { gain?: Param; connect(): void; disconnect(): void; [k: string]: unknown }

function fakeContext() {
  const gains: Node[] = []
  const node = (extra: Record<string, unknown> = {}): Node => ({ connect() {}, disconnect() {}, ...extra })
  const ctx = {
    currentTime: 0,
    createGain: () => { const g = node({ gain: param(1) }); gains.push(g); return g },
    createDynamicsCompressor: () => node({ threshold: param(-24), ratio: param(12), knee: param(30), attack: param(0.003), release: param(0.25) }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
    createBiquadFilter: () => node({ type: 'lowpass', frequency: param(350) }),
    createDelay: () => node({ delayTime: param(0) }),
    createOscillator: () => node({ type: 'sine', frequency: param(440), start() {}, stop() {} }),
  }
  return { ctx: ctx as unknown as BaseAudioContext, gains }
}

describe('Booster chain', () => {
  it('starts bypassed (dry 1, wet 0) and ramps to the preset mix when switched on', () => {
    const { ctx, gains } = fakeContext()
    const b = new Booster(ctx)
    // gains: input, output, dry, wet, pre, post, wowDry, wowWet, wowDepth, flutterDepth
    const dry = gains[2]!.gain!
    const wet = gains[3]!.gain!
    expect(wet.target).toBe(0)
    expect(dry.target).toBe(1)
    b.setOn(true)
    expect(wet.target).toBe(1)
    expect(dry.target).toBe(0)
    b.apply(boostPreset('glue').params)
    expect(wet.target).toBe(0.5)
    expect(dry.target).toBe(0.5)
    b.setOn(false)
    expect(wet.target).toBe(0)
    expect(dry.target).toBe(1)
    expect(b.on).toBe(false)
  })
})
