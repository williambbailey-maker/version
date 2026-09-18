import { Booster, DEFAULT_PRESET_ID, boostPreset } from './booster'
import { ensureRunning, getContext } from './context'
import { Loader } from './loader'
import { Slot } from './slot'
import { Transport } from './transport'
import type { LoadedLoop, Loop } from './types'
import { isPowerOfTwoBars } from './types'

/** Seconds ahead of `currentTime` that a fresh play() starts. */
const START_LEAD = 0.05
/** A bar boundary closer than this is skipped when scheduling a swap. */
const SWAP_MIN_LEAD = 0.02

export type BoostState = { on: boolean; preset: string }

export type SlotState = {
  loop: Loop | null    // sounding (or scheduled)
  pending: Loop | null // chosen while stopped
  gain: number         // fader position 0..1
  muted: boolean
  solo: boolean
  speed: 1 | 2         // 2 = double time (playbackRate doubled)
}

export type StackInput = {
  drums: Loop | null
  samples: { loop: Loop; gain: number; muted: boolean; solo: boolean; speed?: 1 | 2 }[]
  boost?: BoostState | null
}

export type EngineState = {
  playing: boolean
  masterBPM: number
  barSec: number
  drums: SlotState
  boost: BoostState // drum booster (compressor chain)
  samples: SlotState[] // one per active sample loop, in the order they were added
  loading: readonly string[] // loop ids currently being fetched/decoded
  error: string | null
}

type Listener = () => void

/**
 * One drum slot (the master clock) plus any number of sample slots, all
 * locked to the same transport grid. Selecting a sample toggles it in or
 * out on the next bar; each slot has its own gain.
 */
export class Engine {
  readonly ctx: AudioContext
  readonly transport: Transport
  readonly loader: Loader
  readonly master: GainNode

  private drums: Slot
  private booster: Booster | null = null // built on first use
  private boost: BoostState = { on: false, preset: DEFAULT_PRESET_ID }
  private samples = new Map<string, Slot>() // keyed by loop id
  private listeners = new Set<Listener>()
  private loading = new Set<string>()
  private error: string | null = null
  /** Scheduled stop boundary, if a bar-quantized stop is in flight. */
  private stopAt: number | null = null
  /** The drum loop still being fetched/decoded, so play() can wait for it. */
  private drumsLoading: Promise<unknown> | null = null
  private _state: EngineState

  constructor(ctx: AudioContext = getContext()) {
    this.ctx = ctx
    this.transport = new Transport(120) // placeholder until a drum loop is chosen
    this.loader = new Loader(ctx)
    this.master = ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(ctx.destination)
    this.drums = new Slot(ctx, 'drums', this.master)
    this._state = this.snapshot()
  }

  // ---- observation -------------------------------------------------------

  get state(): EngineState {
    return this._state
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  get playing(): boolean {
    return this.transport.running
  }

  /** Zero-based bar index since play(), -1 when stopped. */
  currentBar(): number {
    return this.transport.barIndex(this.ctx.currentTime)
  }

  isActive(loopId: string): boolean {
    return this.drums.current?.id === loopId || this.samples.has(loopId)
  }

  // ---- actions -----------------------------------------------------------

  /**
   * Drums: bar-quantized swap (or pending while stopped).
   * Samples: toggle in or out, bar-quantized while playing.
   */
  async select(loop: Loop): Promise<void> {
    if (!isPowerOfTwoBars(loop.bars)) {
      throw new RangeError(`Loop "${loop.name}" has ${loop.bars} bars; must be 1, 2, 4 or 8`)
    }
    if (loop.kind === 'drums') return this.selectDrums(loop)
    if (this.samples.has(loop.id)) this.removeSample(loop.id)
    else await this.addSample(loop)
  }

  /**
   * Replace the whole stack: drums, the set of samples, and their levels.
   * Bar-quantized while playing (everything changes on the same boundary).
   */
  async loadStack(stack: StackInput): Promise<void> {
    if (stack.drums) await this.selectDrums(stack.drums)
    if (stack.boost !== undefined) {
      const b = stack.boost ?? { on: false, preset: DEFAULT_PRESET_ID }
      if (b.on || this.booster) {
        this.setBoostPreset(b.preset)
        this.setBoost(b.on)
      }
    }
    const keep = new Set(stack.samples.map((s) => s.loop.id))
    for (const id of [...this.samples.keys()]) if (!keep.has(id)) this.removeSample(id)
    for (const s of stack.samples) {
      if (!this.samples.has(s.loop.id)) await this.addSample(s.loop)
      const slot = this.samples.get(s.loop.id)
      if (!slot) continue
      slot.setGain(s.gain)
      slot.muted = s.muted
      slot.solo = s.solo
      this.setSpeed(s.loop.id, s.speed ?? 1)
    }
    this.applyMix()
    this.emit()
  }

  /** Take a sample out (bar-quantized while playing). No-op if not active. */
  removeSample(loopId: string): void {
    const slot = this.samples.get(loopId)
    if (!slot) return
    this.samples.delete(loopId)
    slot.dispose(this.playing ? this.transport.nextBar(this.ctx.currentTime, SWAP_MIN_LEAD) : this.ctx.currentTime)
    this.settleClock()
    this.applyMix() // a removed solo releases the others
    this.emit()
  }

  private slotFor(loopId: string): Slot | undefined {
    return this.drums.current?.id === loopId ? this.drums : this.samples.get(loopId)
  }

  /** Fader position for an active loop (drums or sample), ramped. */
  setGain(loopId: string, value: number): void {
    const slot = this.slotFor(loopId)
    if (!slot) return
    slot.setGain(value)
    this.applyMix()
    this.emit()
  }

  /**
   * Double time (or back to matched): the sample's playbackRate doubles.
   * Applied on the next bar while playing so the loop stays on the grid.
   */
  setSpeed(loopId: string, speed: 1 | 2): void {
    const slot = this.samples.get(loopId)
    if (!slot || slot.speed === speed) return
    slot.speed = speed
    const loop = slot.loop
    if (this.playing && loop) slot.setRate(this.rateFor(slot, loop), this.transport.nextBar(this.ctx.currentTime, SWAP_MIN_LEAD))
    this.emit()
  }

  /** Tempo-match rate times the slot's speed multiplier. */
  private rateFor(slot: Slot, loop: Loop): number {
    return this.transport.rateFor(loop.bpm) * slot.speed
  }

  setMuted(loopId: string, muted: boolean): void {
    const slot = this.slotFor(loopId)
    if (!slot) return
    slot.muted = muted
    this.applyMix()
    this.emit()
  }

  /** Solo any number of slots; while any is soloed, the others are silent. */
  setSolo(loopId: string, solo: boolean): void {
    const slot = this.slotFor(loopId)
    if (!slot) return
    slot.solo = solo
    this.applyMix()
    this.emit()
  }

  /** Drum booster on/off. The chain is built the first time it's switched on. */
  setBoost(on: boolean): void {
    if (on && !this.booster) {
      this.booster = new Booster(this.ctx)
      this.booster.apply(boostPreset(this.boost.preset).params)
      this.drums.setInsert(this.booster)
    }
    this.boost = { ...this.boost, on }
    this.booster?.setOn(on)
    this.emit()
  }

  setBoostPreset(id: string): void {
    const preset = boostPreset(id)
    this.boost = { ...this.boost, preset: preset.id }
    this.booster?.apply(preset.params)
    this.emit()
  }

  /** Every slot: ramp to its effective gain given the current mute/solo state. */
  private applyMix(at?: number): void {
    const slots = [this.drums, ...this.samples.values()]
    const anySolo = slots.some((s) => s.solo && s.current)
    for (const s of slots) s.applyGain(s.effectiveGain(anySolo), at)
  }

  /** Start everything, locked to the same timestamp. Call from a user gesture. */
  async play(): Promise<void> {
    if (this.playing) return
    await ensureRunning(this.ctx)
    if (this.drumsLoading) await this.drumsLoading.catch(() => {})
    if (this.playing) return
    const drums = this.drums.pending
    const clockBPM = drums?.bpm ?? this.sampleClockBPM()
    if (clockBPM === null) throw new Error('Pick a drum loop or a sample before pressing play')

    // If a quantized stop is still in flight, pick up exactly where it lands.
    const now = this.ctx.currentTime
    const at = this.stopAt !== null && this.stopAt > now ? this.stopAt : now + START_LEAD
    this.stopAt = null

    this.transport.setMasterBPM(clockBPM)
    this.transport.start(at)
    if (drums) this.drums.start(drums, at, 1)
    for (const slot of this.samples.values()) {
      const loop = slot.pending
      if (loop) slot.start(loop, at, this.rateFor(slot, loop))
    }
    this.applyMix(at)
    this.emit()
  }

  /** Bar-quantized stop: audio runs to the end of the current bar. Selections are kept. */
  stop(): void {
    if (!this.playing) return
    const at = this.transport.nextBar(this.ctx.currentTime, SWAP_MIN_LEAD)
    this.stopAt = at
    this.drums.stop(at)
    for (const slot of this.samples.values()) slot.stop(at)
    this.transport.stop()
    this.emit()
  }

  async toggle(): Promise<void> {
    if (this.playing) this.stop()
    else await this.play()
  }

  setMasterGain(value: number): void {
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), this.ctx.currentTime, 0.01)
  }

  // ---- internals ---------------------------------------------------------

  private async selectDrums(loop: Loop): Promise<void> {
    if (this.drums.current?.id === loop.id) return
    const loading = this.load(loop)
    this.drumsLoading = loading
    let loaded: LoadedLoop
    try {
      loaded = await loading
    } finally {
      if (this.drumsLoading === loading) this.drumsLoading = null
    }
    if (!this.playing) {
      this.drums.setPending(loaded)
      this.transport.setMasterBPM(loaded.bpm)
      this.emit()
      return
    }
    const at = this.transport.nextBar(this.ctx.currentTime, SWAP_MIN_LEAD)
    this.drums.swap(loaded, at, 1)
    this.applyMix(at)
    if (loaded.bpm !== this.transport.masterBPM) {
      // Drums define tempo: re-anchor the grid and re-pitch every sample at
      // the same instant so everything stays locked.
      this.transport.setMasterBPM(loaded.bpm, at)
      for (const slot of this.samples.values()) {
        const s = slot.loop
        if (s) slot.setRate(this.rateFor(slot, s), at)
      }
    }
    this.emit()
  }

  private async addSample(loop: Loop): Promise<void> {
    const loaded = await this.load(loop)
    if (this.samples.has(loop.id)) return // toggled twice while loading
    const slot = new Slot(this.ctx, 'sample', this.master)
    this.samples.set(loop.id, slot)
    if (this.playing) {
      const at = this.transport.nextBar(this.ctx.currentTime, SWAP_MIN_LEAD)
      slot.start(loaded, at, this.rateFor(slot, loaded))
      this.applyMix(at)
    } else {
      slot.setPending(loaded)
      this.settleClock()
      this.applyMix()
    }
    this.emit()
  }

  /**
   * No drums chosen: the first sample is the clock, so it plays at its own
   * tempo and any others follow it. Drums take over the moment they are picked.
   */
  private sampleClockBPM(): number | null {
    for (const slot of this.samples.values()) {
      const l = slot.loop ?? slot.pending
      if (l) return l.bpm
    }
    return null
  }

  /** While stopped without drums, keep masterBPM on the sample that will lead. */
  private settleClock(): void {
    if (this.playing || this.drums.pending) return
    const bpm = this.sampleClockBPM()
    if (bpm !== null) this.transport.setMasterBPM(bpm)
  }

  private async load(loop: Loop): Promise<LoadedLoop> {
    this.loading.add(loop.id)
    this.error = null
    this.emit()
    try {
      return await this.loader.load(loop)
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      this.loading.delete(loop.id)
      this.emit()
    }
  }

  private snapshot(): EngineState {
    const s = (slot: Slot): SlotState => ({ loop: slot.loop, pending: slot.pending, gain: slot.level, muted: slot.muted, solo: slot.solo, speed: slot.speed })
    return {
      playing: this.playing,
      masterBPM: this.transport.masterBPM,
      barSec: this.transport.barSec,
      drums: s(this.drums),
      boost: this.boost,
      samples: [...this.samples.values()].map(s),
      loading: [...this.loading],
      error: this.error,
    }
  }

  private emit(): void {
    this._state = this.snapshot()
    for (const fn of this.listeners) fn()
  }
}

let singleton: Engine | null = null

/** App-wide engine instance (one AudioContext per page). */
export function getEngine(): Engine {
  if (!singleton) singleton = new Engine()
  return singleton
}
