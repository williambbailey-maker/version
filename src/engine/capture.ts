/**
 * Recording maths: where a take sits on the bar grid and inside the
 * captured input stream. Pure TypeScript, no Web Audio, so every rule
 * here is unit-tested.
 *
 * The input is captured on the same AudioContext the loops play on, so a
 * captured sample's position is a context frame. What you played against a
 * bar that was scheduled at context time T arrives late by the round trip
 * (output latency + input latency); a take is therefore cut from
 * (T + latency) for exactly bars × barSec.
 */

/** One chunk of captured input: `frame` is the context frame of its first sample. */
export type Block = { frame: number; channels: Float32Array[] }

/** Which interface inputs a take keeps. */
export type ChannelMode = 'in1' | 'in2' | 'stereo'

/** Exact length of a take in frames. */
export function takeFrames(bars: number, barSec: number, sampleRate: number): number {
  return Math.round(bars * barSec * sampleRate)
}

/** Context frame at which a take scheduled for `atTime` starts in the captured stream. */
export function captureStartFrame(atTime: number, latencySec: number, sampleRate: number): number {
  return Math.round((atTime + latencySec) * sampleRate)
}

/**
 * When recording should start: the first bar that is at least `minLead`
 * seconds away, not before bar `minBar`, and a whole number of phrases
 * from the transport start. Starting on a phrase boundary is what lets a
 * 4-bar take loop back in the same place it was played.
 */
export function phraseStart(transportStart: number, now: number, barSec: number, phraseBars: number, minLead = 0, minBar = 0): { at: number; bar: number } {
  if (!(barSec > 0)) throw new RangeError(`phraseStart: barSec must be > 0 (got ${barSec})`)
  if (!(phraseBars >= 1)) throw new RangeError(`phraseStart: phraseBars must be >= 1 (got ${phraseBars})`)
  const earliest = Math.max(0, Math.ceil((now + minLead - transportStart) / barSec - 1e-9))
  const from = Math.max(earliest, minBar)
  const bar = Math.ceil(from / phraseBars) * phraseBars
  return { at: transportStart + bar * barSec, bar }
}

/**
 * Rotate a cut so its first bar is one the grid counts as a multiple of
 * the cut's length (`firstBar` is the grid bar the cut starts on). A loop is circular, so nothing is lost, and
 * the take then loops in exactly the place it was played against the drums.
 */
export function rotateToPhrase(channels: readonly Float32Array[], firstBar: number, bars: number): Float32Array[] {
  const k = (bars - (firstBar % bars)) % bars // bars to skip to reach the next phrase start
  return channels.map((c) => {
    const shift = Math.round((k * c.length) / bars)
    if (shift === 0) return c.slice()
    const out = new Float32Array(new ArrayBuffer(c.length * 4))
    out.set(c.subarray(shift), 0)
    out.set(c.subarray(0, shift), c.length - shift)
    return out
  })
}

/** Loop lengths a selection may have, in bars. */
export const LOOP_LENGTHS = [1, 2, 4, 8, 16] as const
export type LoopLength = (typeof LOOP_LENGTHS)[number]

/** The lengths that fit inside a recording of `total` bars. */
export function lengthsFor(total: number): LoopLength[] {
  return LOOP_LENGTHS.filter((l) => l <= total)
}

/**
 * Keep a selection inside the recording: `start` is pulled back so the
 * whole run of `length` bars fits. Null when the recording is shorter
 * than `length`.
 */
export function clampSelection(start: number, length: number, total: number): { start: number; length: number } | null {
  if (!(length >= 1) || length > total) return null
  return { start: Math.max(0, Math.min(Math.round(start), total - length)), length }
}

/** Cut `length` consecutive bars, starting at bar `start`, out of a recording of `total` bars. */
export function cutBars(channels: readonly Float32Array[], start: number, length: number, total: number): Float32Array[] {
  return channels.map((c) => {
    const from = Math.round((start * c.length) / total)
    const to = Math.round(((start + length) * c.length) / total)
    return c.slice(from, to)
  })
}

/**
 * A small waveform per bar, for the bar picker: `bins` peak values (0..1)
 * across each bar, taken over all channels.
 */
export function barPeaks(channels: readonly Float32Array[], bars: number, bins = 16): number[][] {
  const frames = channels[0]?.length ?? 0
  const out: number[][] = []
  for (let b = 0; b < bars; b++) {
    const row: number[] = []
    for (let k = 0; k < bins; k++) {
      const from = Math.floor(((b * bins + k) * frames) / (bars * bins))
      const to = Math.floor(((b * bins + k + 1) * frames) / (bars * bins))
      let p = 0
      // A stride keeps a 64-bar recording quick to scan; peaks do not need every sample.
      const step = Math.max(1, Math.floor((to - from) / 64))
      for (const c of channels) for (let i = from; i < to; i += step) p = Math.max(p, Math.abs(c[i]!))
      row.push(Math.min(1, p))
    }
    out.push(row)
  }
  return out
}

/** True once the captured blocks reach `endFrame` (exclusive). */
export function covers(blocks: readonly Block[], endFrame: number): boolean {
  const last = blocks[blocks.length - 1]
  return !!last && last.frame + (last.channels[0]?.length ?? 0) >= endFrame
}

/**
 * Cut [start, start + frames) out of the captured blocks. Anything the
 * blocks do not cover (a dropped chunk) stays silent rather than shifting
 * later audio earlier. Returns one channel for 'in1'/'in2', two for 'stereo'.
 */
export function sliceBlocks(blocks: readonly Block[], start: number, frames: number, mode: ChannelMode): Float32Array[] {
  const picks = mode === 'stereo' ? [0, 1] : mode === 'in2' ? [1] : [0]
  const out = picks.map(() => new Float32Array(new ArrayBuffer(Math.max(0, frames) * 4)))
  const end = start + frames
  for (const b of blocks) {
    const len = b.channels[0]?.length ?? 0
    const from = Math.max(start, b.frame)
    const to = Math.min(end, b.frame + len)
    if (to <= from) continue
    picks.forEach((ch, i) => {
      // A mono source has no second channel: 'in2' and the right side stay silent.
      const src = b.channels[ch]
      if (src) out[i]!.set(src.subarray(from - b.frame, to - b.frame), from - start)
    })
  }
  return out
}

/** Largest absolute sample across the channels (0..1+). */
export function peakOf(channels: readonly Float32Array[]): number {
  let p = 0
  for (const c of channels) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]!))
  return p
}

/** Peak as decibels below full scale, e.g. -6. Silence reads -Infinity. */
export function toDb(peak: number): number {
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity
}

export type LatencyResult = { latencySec: number; heard: number; spreadSec: number }

/**
 * Measure the round trip from a loopback recording of clicks.
 * `signal` starts at context time `signalStart`; `clickTimes` are the
 * context times the clicks were scheduled. Each click is searched for in
 * the `window` seconds after it; its arrival is the first sample that
 * reaches half that window's peak. Returns null when fewer than half the
 * clicks stand clear of the noise (no cable, input turned down).
 */
export function measureLatency(signal: Float32Array, sampleRate: number, signalStart: number, clickTimes: readonly number[], window = 0.35, floor = 0.01): LatencyResult | null {
  const found: number[] = []
  for (const t of clickTimes) {
    const a = Math.max(0, Math.round((t - signalStart) * sampleRate))
    const b = Math.min(signal.length, a + Math.round(window * sampleRate))
    let peak = 0
    for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(signal[i]!))
    if (peak < floor) continue
    // Noise just before the click: a click must clearly beat it.
    let noise = 0
    const n0 = Math.max(0, a - Math.round(0.02 * sampleRate))
    for (let i = n0; i < a; i++) noise = Math.max(noise, Math.abs(signal[i]!))
    if (peak < noise * 4) continue
    for (let i = a; i < b; i++) {
      if (Math.abs(signal[i]!) >= peak / 2) {
        found.push(i / sampleRate + signalStart - t)
        break
      }
    }
  }
  if (found.length === 0 || found.length < clickTimes.length / 2) return null
  const sorted = [...found].sort((x, y) => x - y)
  const mid = sorted.length >> 1
  const latencySec = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  return { latencySec, heard: found.length, spreadSec: sorted[sorted.length - 1]! - sorted[0]! }
}

/** "27NOV26", the date style the library's own recordings use. */
export function takeDate(d: Date): string {
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()]!
  return `${String(d.getDate()).padStart(2, '0')}${mon}${String(d.getFullYear()).slice(-2)}`
}

/** "27NOV26 - Take 3". */
export function takeName(d: Date, n: number): string {
  return `${takeDate(d)} - Take ${n}`
}

/** "27NOV26 - Take 3 88bpm 4bar.wav": tempo and length in the name so it drops onto a grid. */
export function takeFileName(name: string, bpm: number, bars: number): string {
  return `${name} ${Math.round(bpm * 100) / 100}bpm ${bars}bar.wav`
}

/** The next free take number for a day, given names already in use. */
export function nextTakeNumber(names: readonly string[], d: Date): number {
  const prefix = `${takeDate(d)} - Take `
  let max = 0
  for (const n of names) {
    if (!n.startsWith(prefix)) continue
    const v = Number.parseInt(n.slice(prefix.length), 10)
    if (Number.isFinite(v) && v > max) max = v
  }
  return max + 1
}
