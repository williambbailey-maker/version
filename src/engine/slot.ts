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

  /** Choose a loop while the transport is stopped. */
  setPending(loop: LoadedLoop | null): void {
    this._pending = loop
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
    this.setGain(loop.gain, at)
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

  stop(at: number): void {
    this.stopNode(at)
    this._pending = this._loop
    this._loop = null
  }

  setGain(value: number, at: number = this.ctx.currentTime): void {
    // Ramp, never set .value while playing.
    this.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, value)), at, GAIN_TAU)
  }

  private stopNode(at: number): void {
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
    }
  }
}
