import { ensureRunning, getContext } from './context'
import { Loader } from './loader'
import { Slot } from './slot'
import { Transport } from './transport'
import type { LoadedLoop, Loop, LoopKind } from './types'
import { isPowerOfTwoBars } from './types'

/** Seconds ahead of `currentTime` that a fresh play() starts. */
const START_LEAD = 0.05
/** A bar boundary closer than this is skipped when scheduling a swap. */
const SWAP_MIN_LEAD = 0.02

export type SlotState = {
  loop: Loop | null    // sounding (or scheduled)
  pending: Loop | null // chosen while stopped
}

export type EngineState = {
  playing: boolean
  masterBPM: number
  barSec: number
  drums: SlotState
  sample: SlotState
  loading: readonly string[] // loop ids currently being fetched/decoded
  error: string | null
}

type Listener = () => void

/**
 * Composes the transport and two slots (drums, sample) behind one API.
 * Drums are the master clock: masterBPM is always the drum loop's bpm.
 */
export class Engine {
  readonly ctx: AudioContext
  readonly transport: Transport
  readonly loader: Loader
  readonly master: GainNode

  private slots: Record<LoopKind, Slot>
  private listeners = new Set<Listener>()
  private loading = new Set<string>()
  private error: string | null = null
  /** Scheduled stop boundary, if a bar-quantized stop is in flight. */
  private stopAt: number | null = null
  private _state: EngineState

  constructor(ctx: AudioContext = getContext()) {
    this.ctx = ctx
    this.transport = new Transport(120) // placeholder until a drum loop is chosen
    this.loader = new Loader(ctx)
    this.master = ctx.createGain()
    this.master.gain.value = 1
    this.master.connect(ctx.destination)
    this.slots = {
      drums: new Slot(ctx, 'drums', this.master),
      sample: new Slot(ctx, 'sample', this.master),
    }
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

  // ---- actions -----------------------------------------------------------

  /**
   * Choose a loop for its slot (by `loop.kind`). While playing this is a
   * bar-quantized swap; while stopped it just becomes the slot's pending loop.
   */
  async select(loop: Loop): Promise<void> {
    if (!isPowerOfTwoBars(loop.bars)) {
      throw new RangeError(`Loop "${loop.name}" has ${loop.bars} bars; must be 1, 2, 4 or 8`)
    }
    const slot = this.slots[loop.kind]
    if (slot.loop?.id === loop.id || slot.pending?.id === loop.id) return

    const loaded = await this.load(loop)
    if (!this.playing) {
      slot.setPending(loaded)
      if (loop.kind === 'drums') this.transport.setMasterBPM(loaded.bpm)
      this.emit()
      return
    }

    const at = this.transport.nextBar(this.ctx.currentTime, SWAP_MIN_LEAD)
    if (loop.kind === 'drums') this.swapDrums(loaded, at)
    else slot.swap(loaded, at, this.transport.rateFor(loaded.bpm))
    this.emit()
  }

  /** Start everything, locked to the same timestamp. Call from a user gesture. */
  async play(): Promise<void> {
    if (this.playing) return
    await ensureRunning()
    const drums = this.slots.drums.pending
    if (!drums) throw new Error('Choose a drum loop before pressing play')

    // If a quantized stop is still in flight, pick up exactly where it lands.
    const now = this.ctx.currentTime
    const at = this.stopAt !== null && this.stopAt > now ? this.stopAt : now + START_LEAD
    this.stopAt = null

    this.transport.setMasterBPM(drums.bpm)
    this.transport.start(at)
    this.slots.drums.start(drums, at, 1)

    const sample = this.slots.sample.pending
    if (sample) this.slots.sample.start(sample, at, this.transport.rateFor(sample.bpm))

    this.emit()
  }

  /** Bar-quantized stop: audio runs to the end of the current bar. */
  stop(): void {
    if (!this.playing) return
    const at = this.transport.nextBar(this.ctx.currentTime, SWAP_MIN_LEAD)
    this.stopAt = at
    this.slots.drums.stop(at)
    this.slots.sample.stop(at)
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

  /**
   * Drums define tempo, so a drum swap may change masterBPM. The grid is
   * re-anchored at the swap boundary and the sample slot is re-pitched at
   * the same instant so the two stay locked.
   */
  private swapDrums(loaded: LoadedLoop, at: number): void {
    this.slots.drums.swap(loaded, at, 1)
    if (loaded.bpm !== this.transport.masterBPM) {
      this.transport.setMasterBPM(loaded.bpm, at)
      const sample = this.slots.sample.loop
      if (sample) this.slots.sample.setRate(this.transport.rateFor(sample.bpm), at)
    }
  }

  private snapshot(): EngineState {
    const s = (slot: Slot): SlotState => ({ loop: slot.loop, pending: slot.pending })
    return {
      playing: this.playing,
      masterBPM: this.transport.masterBPM,
      barSec: this.transport.barSec,
      drums: s(this.slots.drums),
      sample: s(this.slots.sample),
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
