import type { LoadedLoop, LoopKind } from './types'
import { loopLengthSec } from './types'

/** Time constant for gain ramps (setTargetAtTime). ~15 ms reaches ~95%. */
const GAIN_TAU = 0.005

/**
 * One slot = one playing loop.
 *
 * Holds the current Loop, its AudioBufferSourceNode and a per-slot GainNode.
 * A source node is single-use, so every start/swap builds a fresh one and
 * schedules it on the shared transport grid. The node loops natively
 * (`loop = true`); varispeed comes from `playbackRate`.
 */
export class Slot {
  readonly kind: LoopKind
  readonly gain: GainNode

  private ctx: BaseAudioContext
  private node: AudioBufferSourceNode | null = null
  private _loop: LoadedLoop | null = null
  private _pending: LoadedLoop | null = null
  private _gain = 1
  private gainFor: string | null = null // loop id the remembered gain belongs to

  constructor(ctx: BaseAudioContext, kind: LoopKind, destination: AudioNode) {
    this.ctx = ctx
    this.kind = kind
    this.gain = ctx.createGain()
    this.gain.gain.value = 1
    this.gain.connect(destination)
  }

  /** The loop currently sounding (or scheduled to start). */
  get loop(): LoadedLoop | null {
    return this._loop
  }

  /** Loop chosen while stopped; becomes `loop` on start(). */
  get pending(): LoadedLoop | null {
    return this._pending
  }

  get playing(): boolean {
    return this.node !== null
  }

  /** Current mix level, 0..1. */
  get level(): number {
    return this._gain
  }

  /** The loop this slot represents, sounding or pending. */
  get current(): LoadedLoop | null {
    return this._loop ?? this._pending
  }

  /** Choose a loop while the transport is stopped. */
  setPending(loop: LoadedLoop | null): void {
    this._pending = loop
    if (loop) this.rememberGain(loop)
  }

  /** Adopt the loop's stored gain the first time this slot sees it. */
  private rememberGain(loop: LoadedLoop): void {
    if (this.gainFor !== loop.id) {
      this.gainFor = loop.id
      this._gain = loop.gain
    }
  }

  /**
   * Start `loop` at `at` (a bar boundary) with the given varispeed rate.
   * If something is already playing it is stopped at the same instant,
   * which makes start() and swap() the same operation.
   */
  start(loop: LoadedLoop, at: number, rate: number): void {
    this.stopNode(at)

    const node = this.ctx.createBufferSource()
    node.buffer = loop.buffer
    node.loop = true
    // Compressed previews carry encoder priming at the start; skip it.
    const offset = Math.max(0, loop.startOffset ?? 0)
    node.loopStart = offset
    // Trust bpm + bars over the file's duration (exports may not be trimmed
    // exactly to the bar). Never exceed the buffer though.
    node.loopEnd = Math.min(offset + loopLengthSec(loop), loop.buffer.duration)
    node.playbackRate.value = rate
    node.connect(this.gain)
    node.start(at, offset)

    this.node = node
    this._loop = loop
    this._pending = null
    this.rememberGain(loop)
    this.setGain(this._gain, at)
  }

  /** Bar-quantized replacement. Alias of start(); kept for readability at call sites. */
  swap(loop: LoadedLoop, at: number, rate: number): void {
    this.start(loop, at, rate)
  }

  /** Re-pitch the running node (used when the master tempo changes). */
  setRate(rate: number, at: number): void {
    if (!this.node) return
    this.node.playbackRate.setValueAtTime(rate, at)
  }

  /** Stop at `at`; the loop stays pending so play() brings it back. */
  stop(at: number): void {
    this.stopNode(at)
    this._pending = this._loop ?? this._pending
    this._loop = null
  }

  /** Stop at `at` and release this slot's nodes once the audio has ended. */
  dispose(at: number): void {
    const node = this.node
    this._pending = null
    this._loop = null
    if (!node) {
      this.gain.disconnect()
      return
    }
    this.stopNode(at, () => this.gain.disconnect())
  }

  setGain(value: number, at: number = this.ctx.currentTime): void {
    this._gain = Math.max(0, Math.min(1, value))
    // Ramp, never set .value while playing.
    this.gain.gain.setTargetAtTime(this._gain, at, GAIN_TAU)
  }

  private stopNode(at: number, onEnded?: () => void): void {
    const node = this.node
    if (!node) return
    this.node = null
    try {
      node.stop(at)
    } catch {
      // already stopped / never started
    }
    node.onended = () => {
      node.disconnect()
      onEnded?.()
    }
  }
}
