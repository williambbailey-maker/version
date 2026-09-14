import type { Bars } from '../engine/types'
import { guessBars } from './localLibrary'

/**
 * Tempo + bar-count estimation for uploaded loops.
 *
 * Three sources, combined in `estimateLoop()`:
 *   1. filename  — Splice-style names carry the bpm ("..._92_Cmin.wav")
 *   2. duration  — a trimmed loop is exactly bars * 240 / bpm, so each bar
 *                  count gives an exact bpm candidate
 *   3. audio     — onset-strength autocorrelation, used to pick between
 *                  duration candidates (or on its own if nothing else fits)
 */

export type TempoSource = 'filename' | 'length+audio' | 'audio' | 'length' | 'none'

export type TempoEstimate = {
  bpm: number | null
  bars: Bars
  source: TempoSource
  /** Raw analysis result, for display. */
  audioBPM: number | null
}

const MIN_BPM = 50
const MAX_BPM = 220

// ---- 1. filename ----------------------------------------------------------

/** "92bpm", "92 BPM", "_92_", "-92-", "92_Cmin" → 92. Null if nothing plausible. */
export function bpmFromFilename(name: string): number | null {
  const base = name.replace(/\.[^.]+$/, '')
  const explicit = base.match(/(\d{2,3}(?:\.\d+)?)\s*bpm/i)
  if (explicit) {
    const v = Number(explicit[1])
    if (v >= MIN_BPM && v <= MAX_BPM) return v
  }
  // Standalone 2–3 digit tokens between separators, e.g. "Loop_92_Cmin" or "Loop-128-Am".
  const tokens = base.split(/[\s_\-.()\[\]]+/)
  const numeric = tokens
    .filter((t) => /^\d{2,3}$/.test(t))
    .map(Number)
    .filter((v) => v >= MIN_BPM && v <= MAX_BPM)
  if (numeric.length === 1) return numeric[0] ?? null
  return null
}

// ---- 2. duration ----------------------------------------------------------

export type Candidate = { bpm: number; bars: Bars }

/** Exact bpm each power-of-two bar count would imply for a trimmed file. */
export function candidatesFromDuration(seconds: number): Candidate[] {
  if (!(seconds > 0)) return []
  const out: Candidate[] = []
  for (const bars of [1, 2, 4, 8] as const) {
    const bpm = (bars * 240) / seconds
    if (bpm >= MIN_BPM && bpm <= MAX_BPM) out.push({ bpm, bars })
  }
  return out
}

// ---- 3. audio -------------------------------------------------------------

const FPS = 100 // onset envelope frames per second

/**
 * Onset-strength envelope: half-wave-rectified RMS flux, summed over the
 * full band and a first-difference (transient-emphasising) band. RMS rather
 * than log energy keeps quiet hats quieter than kicks, which is what stops
 * 8th-note hats from doubling the tempo.
 */
export function onsetEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate / FPS))
  const frames = Math.floor(samples.length / hop)
  const env = new Float32Array(frames)
  let prevFull = 0
  let prevHi = 0
  for (let f = 0; f < frames; f++) {
    let eFull = 0
    let eHi = 0
    const start = f * hop
    for (let i = start; i < start + hop; i++) {
      const x = samples[i] ?? 0
      const d = x - (samples[i - 1] ?? 0)
      eFull += x * x
      eHi += d * d
    }
    const lFull = Math.sqrt(eFull / hop)
    const lHi = Math.sqrt(eHi / hop)
    env[f] = Math.max(0, lFull - prevFull) + Math.max(0, lHi - prevHi)
    prevFull = lFull
    prevHi = lHi
  }
  // remove slow trend
  const win = FPS
  let acc = 0
  const out = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    acc += env[f] ?? 0
    if (f >= win) acc -= env[f - win] ?? 0
    const mean = acc / Math.min(f + 1, win)
    out[f] = Math.max(0, (env[f] ?? 0) - mean)
  }
  return out
}

/** Repeat a short loop so the autocorrelation has enough material. */
function tile(samples: Float32Array, sampleRate: number, minSeconds = 8): Float32Array {
  const want = minSeconds * sampleRate
  if (samples.length === 0 || samples.length >= want) return samples
  const reps = Math.ceil(want / samples.length)
  const out = new Float32Array(samples.length * reps)
  for (let r = 0; r < reps; r++) out.set(samples, r * samples.length)
  return out
}

/**
 * Estimate bpm from raw mono samples. Returns null when there is no usable
 * periodicity. Resolution is refined by parabolic interpolation; a soft
 * prior around 110 bpm discourages octave errors.
 */
export function estimateBPM(samples: Float32Array, sampleRate: number): number | null {
  const env = onsetEnvelope(tile(samples, sampleRate), sampleRate)
  const n = env.length
  const minLag = Math.floor((60 * FPS) / MAX_BPM)
  const maxLag = Math.ceil((60 * FPS) / MIN_BPM)
  if (n < maxLag * 2) return null

  let energy = 0
  for (let i = 0; i < n; i++) energy += (env[i] ?? 0) ** 2
  if (energy === 0) return null

  const ac = new Float32Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let i = lag; i < n; i++) s += (env[i] ?? 0) * (env[i - lag] ?? 0)
    ac[lag] = s / (n - lag)
  }

  // Autocorrelation shaped by a log-normal prior centred at 110 bpm.
  const score = (lag: number): number => {
    const bpm = (60 * FPS) / lag
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2)
    return (ac[lag] ?? 0) * prior
  }

  let bestLag = minLag
  let best = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const s = score(lag)
    if (s > best) {
      best = s
      bestLag = lag
    }
  }
  if (best <= 0) return null

  // parabolic interpolation on the raw autocorrelation around the peak
  const y0 = ac[bestLag - 1] ?? 0
  const y1 = ac[bestLag] ?? 0
  const y2 = ac[bestLag + 1] ?? 0
  const denom = y0 - 2 * y1 + y2
  const shift = denom !== 0 && bestLag > minLag && bestLag < maxLag ? (0.5 * (y0 - y2)) / denom : 0
  const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift))
  return (60 * FPS) / lag
}

/** Mono mixdown of the first `maxSeconds` of a buffer. */
export function monoSamples(buffer: AudioBuffer, maxSeconds = 30): Float32Array {
  const len = Math.min(buffer.length, Math.floor(maxSeconds * buffer.sampleRate))
  const out = new Float32Array(len)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const ch = buffer.getChannelData(c)
    for (let i = 0; i < len; i++) out[i] = (out[i] ?? 0) + (ch[i] ?? 0) / buffer.numberOfChannels
  }
  return out
}

// ---- combine --------------------------------------------------------------

/** |log2(a/b)|, i.e. distance in octaves. */
const octDist = (a: number, b: number) => Math.abs(Math.log2(a / b))

/** Same-tempo tolerance when matching analysis to a length candidate (~6%). */
const MATCH_TOL = 0.085

export function combineEstimates(input: {
  filenameBPM: number | null
  duration: number | null
  audioBPM: number | null
}): TempoEstimate {
  const { filenameBPM, duration, audioBPM } = input

  if (filenameBPM !== null) {
    const bars = duration ? guessBars(duration, filenameBPM) : 2
    return { bpm: filenameBPM, bars, source: 'filename', audioBPM }
  }

  const candidates = duration ? candidatesFromDuration(duration) : []

  if (audioBPM !== null && candidates.length > 0) {
    // Nearest candidate to the analysed tempo, allowing an octave error in
    // the analysis but preferring an exact match.
    let best: Candidate | null = null
    let bestD = Infinity
    for (const c of candidates) {
      const d = Math.min(octDist(c.bpm, audioBPM), octDist(c.bpm, audioBPM * 2) + 0.05, octDist(c.bpm, audioBPM / 2) + 0.05)
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    if (best && bestD <= MATCH_TOL) {
      return { bpm: tidy(best.bpm), bars: best.bars, source: 'length+audio', audioBPM }
    }
  }

  if (audioBPM !== null) {
    const bpm = tidy(audioBPM)
    return { bpm, bars: duration ? guessBars(duration, bpm) : 2, source: 'audio', audioBPM }
  }

  if (candidates.length > 0) {
    // No analysis: pick the candidate nearest a typical tempo.
    let best = candidates[0]!
    for (const c of candidates) if (octDist(c.bpm, 110) < octDist(best.bpm, 110)) best = c
    return { bpm: tidy(best.bpm), bars: best.bars, source: 'length', audioBPM }
  }

  return { bpm: null, bars: 2, source: 'none', audioBPM }
}

/** Snap to an integer when within 0.05, else one decimal. */
export function tidy(bpm: number): number {
  const r = Math.round(bpm)
  if (Math.abs(bpm - r) < 0.05) return r
  return Math.round(bpm * 10) / 10
}

/** Full pipeline for an uploaded file. `decode` is injected so this stays testable. */
export async function estimateLoop(
  file: { name: string; arrayBuffer(): Promise<ArrayBuffer> },
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>,
): Promise<TempoEstimate & { buffer: AudioBuffer | null }> {
  const filenameBPM = bpmFromFilename(file.name)
  let buffer: AudioBuffer | null = null
  let audioBPM: number | null = null
  try {
    buffer = await decode(await file.arrayBuffer())
    if (filenameBPM === null) audioBPM = estimateBPM(monoSamples(buffer), buffer.sampleRate)
  } catch {
    buffer = null
  }
  const duration = buffer ? buffer.duration : null
  return { ...combineEstimates({ filenameBPM, duration, audioBPM }), buffer }
}
