/**
 * Drum booster: a Vulf-style compressor chain for the drum slot.
 *
 * Modelled on the Goodhertz Vulf Compressor control set (Input Gain,
 * Compression Amount, Wow/Flutter, Lo-Fi, Output Gain, Master Mix, attack
 * and release time constants, lo-fi type, digital ref level) and mapped onto
 * Web Audio nodes:
 *
 *   input ─┬─ dry ─────────────────────────────────────────────┬─ output
 *          └─ pre ─ compressor ─ shaper ─ lowpass ─ wow ─ post ─┘
 *
 * Master Mix crossfades dry against wet; "off" is simply mix 0, so toggling
 * never re-patches the graph (no clicks). The chain is pure TypeScript with
 * no React, like the rest of the engine.
 */

export type LoFiType = 'analog' | 'digital90' | 'digital80'
export type WowSpeed = 33.3 | 45 | 78

export type BoostParams = {
  input: number // dB, pre-compression
  comp: number // 0..100 compression amount
  attack: number // time constant multiplier (1 = default)
  release: number // time constant multiplier (1 = default)
  lofi: number // 0..100 overall lo-fi amount
  crunch: number // 0..100 harmonic distortion
  type: LoFiType
  wow: number // 0..100 wow & flutter depth
  wowMix: number // 0..100 wet share of the wow stage
  wowSpeed: WowSpeed
  output: number // dB, post-compression
  mix: number // 0..100 master mix
  ref: number // digital ref level, dB (-18 default)
}

export type BoostPreset = { id: string; name: string; group: 'general' | 'vulfmon' | 'comp' | 'fx'; note?: string; params: BoostParams }

/** Manual defaults: comp 50, wow 15, lo-fi 50, mix 100, 1.0x constants, analog, -18 dB ref. */
export const DEFAULT_BOOST: BoostParams = {
  input: 0, comp: 50, attack: 1, release: 1, lofi: 50, crunch: 0, type: 'analog', wow: 15, wowMix: 100, wowSpeed: 33.3, output: 0, mix: 100, ref: -18,
}

const p = (over: Partial<BoostParams>): BoostParams => ({ ...DEFAULT_BOOST, ...over })

/**
 * Presets named after the plugin's factory list. The manual only publishes
 * the names, so the values are our drum-minded readings of each name.
 */
export const BOOST_PRESETS: BoostPreset[] = [
  { id: 'default', name: 'Default', group: 'general', params: p({}) },
  { id: 'master-bump', name: 'Master Bump', group: 'vulfmon', note: 'gentle glue, a little lift', params: p({ comp: 35, wow: 0, lofi: 20, attack: 1.5, release: 1.5, output: 1 }) },
  { id: 'master-hump', name: 'Master Hump', group: 'vulfmon', note: 'rounder, slower, warmer', params: p({ comp: 45, wow: 5, lofi: 35, attack: 2, release: 2.5, output: 1.5 }) },
  { id: 'glue', name: '2-Bus Glue (Parallel)', group: 'comp', note: 'half dry, half squeezed', params: p({ comp: 60, wow: 0, lofi: 15, attack: 2, release: 2, mix: 50 }) },
  { id: 'punch-crunch', name: "Punch 'n Crunch (Parallel)", group: 'comp', note: 'parallel dirt with transients kept', params: p({ comp: 80, wow: 0, lofi: 70, crunch: 60, attack: 2.5, release: 0.8, mix: 50 }) },
  { id: 'lots-attack', name: 'Lots of Attack', group: 'comp', note: 'slow attack lets the hits through', params: p({ comp: 65, wow: 0, lofi: 30, attack: 3, release: 1 }) },
  { id: 'dangerous-attack', name: 'Dangerous Attack', group: 'comp', note: 'hot input, slow attack, fast release', params: p({ comp: 90, wow: 0, lofi: 40, attack: 4, release: 0.6, input: 6 }) },
  { id: 'slam', name: 'Slam', group: 'comp', note: 'fast everything', params: p({ comp: 100, wow: 0, lofi: 50, attack: 0.4, release: 0.5, input: 6 }) },
  { id: 'crush', name: 'Crush', group: 'comp', note: 'low ref level: crushed and saturated', params: p({ comp: 100, wow: 0, lofi: 90, crunch: 80, attack: 0.5, release: 0.4, input: 6, ref: -36 }) },
  { id: 'heavy-clipping', name: 'Heavy Clipping', group: 'comp', note: 'the shaper does the work', params: p({ comp: 40, wow: 0, lofi: 100, crunch: 100, input: 12 }) },
  { id: 'vacuum', name: 'Vacuum Pumped', group: 'comp', note: 'audible pumping', params: p({ comp: 95, wow: 5, lofi: 30, attack: 0.3, release: 0.3 }) },
  { id: 'untamed', name: 'Untamed 26"', group: 'comp', note: 'big open kick, slow and wide', params: p({ comp: 55, wow: 0, lofi: 20, attack: 3.5, release: 2 }) },
  { id: 'le-freak', name: 'Le Freak Kick', group: 'comp', note: 'disco-era kick', params: p({ comp: 70, wow: 0, lofi: 40, attack: 1.2, release: 0.7 }) },
  { id: 'old-school', name: 'Old School Crunch', group: 'fx', note: 'analog dirt with a little wobble', params: p({ comp: 50, wow: 20, lofi: 80, crunch: 50 }) },
  { id: 'gentle-wow', name: 'Gentle Wow', group: 'fx', note: 'vinyl drift at 33', params: p({ comp: 30, wow: 25, lofi: 10 }) },
  { id: '1200-crunch', name: '1200 Crunch', group: 'fx', note: "1990's converter, sampler grit", params: p({ comp: 60, wow: 0, lofi: 85, crunch: 40, type: 'digital90' }) },
  { id: 'bad-80s', name: "Bad 1980's Digital", group: 'fx', note: 'harsh converter, dull top', params: p({ comp: 45, wow: 0, lofi: 90, crunch: 70, type: 'digital80' }) },
]

export const DEFAULT_PRESET_ID = 'default'

export function boostPreset(id: string): BoostPreset {
  return BOOST_PRESETS.find((x) => x.id === id) ?? BOOST_PRESETS[0]!
}

// ---- pure parameter mapping (unit-tested) ----------------------------------

export const dbToGain = (db: number): number => Math.pow(10, db / 20)
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Compression Amount → DynamicsCompressorNode settings. */
export function compressorSettings(params: BoostParams): { threshold: number; ratio: number; knee: number; attack: number; release: number } {
  const c = clamp(params.comp, 0, 100) / 100
  return {
    threshold: -6 - 42 * c, // 0% → -6 dB, 100% → -48 dB
    ratio: 2 + 18 * c, // 2:1 → 20:1
    knee: 12 - 8 * c, // softer knee at low amounts
    attack: clamp(0.003 * params.attack, 0.0005, 0.1), // 1.0x = 3 ms
    release: clamp(0.12 * params.release, 0.02, 1), // 1.0x = 120 ms
  }
}

/** Lo-Fi Amount + Crunch + Type → waveshaper transfer curve (odd symmetric). */
export function shaperCurve(params: BoostParams, n = 1024): Float32Array<ArrayBuffer> {
  const amount = clamp(params.lofi, 0, 100) / 100
  const crunch = clamp(params.crunch, 0, 100) / 100
  const drive = 1 + amount * 7 // 1 → linear-ish, 8 → hard
  const hard = params.type === 'digital80' ? 0.8 : params.type === 'digital90' ? 0.5 : crunch * 0.6
  const curve = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const soft = Math.tanh(drive * x) / Math.tanh(drive)
    const clipped = clamp(x * drive * 0.7, -1, 1)
    curve[i] = soft * (1 - hard) + clipped * hard
  }
  return curve
}

/** Lo-Fi Amount + Type → lowpass cutoff. */
export function lowpassHz(params: BoostParams): number {
  const amount = clamp(params.lofi, 0, 100) / 100
  const ceiling = params.type === 'digital80' ? 7000 : params.type === 'digital90' ? 11000 : 18000
  return ceiling - (ceiling - 3500) * amount * 0.75
}

/** Wow & flutter LFO rates (Hz) and depths (seconds). */
export function wowSettings(params: BoostParams): { wowHz: number; flutterHz: number; wowDepth: number; flutterDepth: number; base: number; wet: number } {
  const depth = clamp(params.wow, 0, 100) / 100
  const wowHz = params.wowSpeed / 60 // rotations per second
  return { wowHz, flutterHz: 6.5, wowDepth: depth * 0.0025, flutterDepth: depth * 0.00025, base: 0.008, wet: depth === 0 ? 0 : clamp(params.wowMix, 0, 100) / 100 }
}

/** Input/output gains after folding in the digital ref level. */
export function ioGains(params: BoostParams): { pre: number; post: number } {
  const shift = -18 - params.ref // lower ref = hotter into the chain, quieter out
  return { pre: dbToGain(params.input + shift), post: dbToGain(params.output - shift) }
}

// ---- the node chain ---------------------------------------------------------

const TAU = 0.01

export class Booster {
  readonly input: GainNode
  readonly output: GainNode
  private dry: GainNode
  private wet: GainNode
  private pre: GainNode
  private post: GainNode
  private comp: DynamicsCompressorNode
  private shaper: WaveShaperNode
  private lowpass: BiquadFilterNode
  private delay: DelayNode
  private wowDry: GainNode
  private wowWet: GainNode
  private wowLfo: OscillatorNode
  private wowDepth: GainNode
  private flutterLfo: OscillatorNode
  private flutterDepth: GainNode
  private ctx: BaseAudioContext
  private _on = false
  private _params: BoostParams = DEFAULT_BOOST

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx
    this.input = ctx.createGain()
    this.output = ctx.createGain()
    this.dry = ctx.createGain()
    this.wet = ctx.createGain()
    this.pre = ctx.createGain()
    this.post = ctx.createGain()
    this.comp = ctx.createDynamicsCompressor()
    this.shaper = ctx.createWaveShaper()
    this.shaper.oversample = '2x'
    this.lowpass = ctx.createBiquadFilter()
    this.lowpass.type = 'lowpass'
    this.delay = ctx.createDelay(0.05)
    this.wowDry = ctx.createGain()
    this.wowWet = ctx.createGain()
    this.wowLfo = ctx.createOscillator()
    this.wowLfo.type = 'sine'
    this.wowDepth = ctx.createGain()
    this.flutterLfo = ctx.createOscillator()
    this.flutterLfo.type = 'triangle'
    this.flutterDepth = ctx.createGain()

    // dry path
    this.input.connect(this.dry)
    this.dry.connect(this.output)
    // wet path
    this.input.connect(this.pre)
    this.pre.connect(this.comp)
    this.comp.connect(this.shaper)
    this.shaper.connect(this.lowpass)
    this.lowpass.connect(this.wowDry)
    this.lowpass.connect(this.delay)
    this.delay.connect(this.wowWet)
    this.wowDry.connect(this.post)
    this.wowWet.connect(this.post)
    this.post.connect(this.wet)
    this.wet.connect(this.output)
    // modulation
    this.wowLfo.connect(this.wowDepth)
    this.wowDepth.connect(this.delay.delayTime)
    this.flutterLfo.connect(this.flutterDepth)
    this.flutterDepth.connect(this.delay.delayTime)
    this.wowLfo.start()
    this.flutterLfo.start()

    this.dry.gain.value = 1
    this.wet.gain.value = 0
    this.apply(DEFAULT_BOOST)
  }

  get on(): boolean {
    return this._on
  }

  get params(): BoostParams {
    return this._params
  }

  /** Master on/off: ramps the mix instead of re-patching, so no clicks. */
  setOn(on: boolean, at: number = this.ctx.currentTime): void {
    this._on = on
    this.applyMix(at)
  }

  /** Load a full parameter set (a preset). Ramped where the node allows it. */
  apply(params: BoostParams, at: number = this.ctx.currentTime): void {
    this._params = params
    const c = compressorSettings(params)
    this.comp.threshold.setTargetAtTime(c.threshold, at, TAU)
    this.comp.ratio.setTargetAtTime(c.ratio, at, TAU)
    this.comp.knee.setTargetAtTime(c.knee, at, TAU)
    this.comp.attack.setTargetAtTime(c.attack, at, TAU)
    this.comp.release.setTargetAtTime(c.release, at, TAU)
    this.shaper.curve = shaperCurve(params)
    this.lowpass.frequency.setTargetAtTime(lowpassHz(params), at, TAU)
    const w = wowSettings(params)
    this.delay.delayTime.setTargetAtTime(w.base, at, TAU)
    this.wowLfo.frequency.setTargetAtTime(w.wowHz, at, TAU)
    this.flutterLfo.frequency.setTargetAtTime(w.flutterHz, at, TAU)
    this.wowDepth.gain.setTargetAtTime(w.wowDepth, at, TAU)
    this.flutterDepth.gain.setTargetAtTime(w.flutterDepth, at, TAU)
    this.wowWet.gain.setTargetAtTime(w.wet, at, TAU)
    this.wowDry.gain.setTargetAtTime(1 - w.wet, at, TAU)
    const io = ioGains(params)
    this.pre.gain.setTargetAtTime(io.pre, at, TAU)
    this.post.gain.setTargetAtTime(io.post, at, TAU)
    this.applyMix(at)
  }

  private applyMix(at: number): void {
    const mix = this._on ? clamp(this._params.mix, 0, 100) / 100 : 0
    this.wet.gain.setTargetAtTime(mix, at, TAU)
    this.dry.gain.setTargetAtTime(1 - mix, at, TAU)
  }

  dispose(): void {
    try {
      this.wowLfo.stop()
      this.flutterLfo.stop()
    } catch {
      // never started in a fake context
    }
    for (const n of [this.input, this.output, this.dry, this.wet, this.pre, this.post, this.comp, this.shaper, this.lowpass, this.delay, this.wowDry, this.wowWet, this.wowLfo, this.wowDepth, this.flutterLfo, this.flutterDepth]) n.disconnect()
  }
}
