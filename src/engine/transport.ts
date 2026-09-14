/**
 * Transport: the single source of musical time.
 *
 * Pure TypeScript, no AudioContext. Time values are AudioContext.currentTime
 * seconds; the caller passes `now` in so this can be unit-tested.
 */

/** Seconds per 4/4 bar at a given tempo. */
export function barSeconds(bpm: number): number {
  return 240 / bpm
}

/**
 * Varispeed ratio for playing `loopBPM` material at `masterBPM`.
 * Pitch follows tempo; this is intentional.
 */
export function playbackRate(masterBPM: number, loopBPM: number): number {
  if (!(masterBPM > 0) || !(loopBPM > 0)) {
    throw new RangeError(`playbackRate: bpm must be > 0 (master=${masterBPM}, loop=${loopBPM})`)
  }
  return masterBPM / loopBPM
}

/**
 * The next bar boundary at or after `now`, on the grid anchored at
 * `transportStart` with bars of `barSec` seconds.
 *
 *   nextBar = transportStart + ceil((now - transportStart) / barSec) * barSec
 *
 * `minLead` (seconds) guards against scheduling a boundary that is so close
 * it may already be in the past by the time `.start()` runs on the audio
 * thread; such a boundary is skipped and the following one returned.
 * Before the transport has started (now < transportStart) the answer is
 * always transportStart itself.
 */
export function nextBar(transportStart: number, now: number, barSec: number, minLead = 0): number {
  if (!(barSec > 0)) throw new RangeError(`nextBar: barSec must be > 0 (got ${barSec})`)
  const elapsed = now - transportStart
  if (elapsed <= 0) return transportStart
  let bars = Math.ceil(elapsed / barSec)
  // Float noise: if we're a hair past a boundary, ceil() already moves us to
  // the next one; if we're a hair before, ceil() lands on it. Both are fine.
  let t = transportStart + bars * barSec
  if (t - now < minLead) {
    bars += 1
    t = transportStart + bars * barSec
  }
  return t
}

/** Zero-based index of the bar that contains `now`. -1 before the transport starts. */
export function barIndex(transportStart: number, now: number, barSec: number): number {
  const elapsed = now - transportStart
  if (elapsed < 0) return -1
  return Math.floor(elapsed / barSec)
}

export class Transport {
  private _start: number | null = null
  private _bpm: number

  constructor(masterBPM: number) {
    if (!(masterBPM > 0)) throw new RangeError(`Transport: masterBPM must be > 0 (got ${masterBPM})`)
    this._bpm = masterBPM
  }

  get masterBPM(): number {
    return this._bpm
  }

  get barSec(): number {
    return barSeconds(this._bpm)
  }

  get running(): boolean {
    return this._start !== null
  }

  /** The anchor timestamp every scheduled start derives from. */
  get transportStart(): number | null {
    return this._start
  }

  start(at: number): void {
    this._start = at
  }

  stop(): void {
    this._start = null
  }

  /**
   * Change tempo. If running, the grid is re-anchored at `at` (a bar
   * boundary on the old grid) so bar math stays exact with the new barSec.
   */
  setMasterBPM(bpm: number, at?: number): void {
    if (!(bpm > 0)) throw new RangeError(`setMasterBPM: bpm must be > 0 (got ${bpm})`)
    this._bpm = bpm
    if (this._start !== null && at !== undefined) this._start = at
  }

  nextBar(now: number, minLead = 0): number {
    if (this._start === null) throw new Error('Transport.nextBar: transport is not running')
    return nextBar(this._start, now, this.barSec, minLead)
  }

  barIndex(now: number): number {
    if (this._start === null) return -1
    return barIndex(this._start, now, this.barSec)
  }

  rateFor(loopBPM: number): number {
    return playbackRate(this._bpm, loopBPM)
  }
}
