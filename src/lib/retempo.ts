/**
 * Re-tempo: render a loop at another BPM by varispeed (the app's one
 * tempo rule: pitch moves with tempo), trimmed exactly to its bars so the
 * result is still a clean loop. Pure maths here; the render needs an
 * OfflineAudioContext.
 */
import type { Bars } from '../engine/types'

/** playbackRate that turns `native` BPM into `target` BPM. */
export function rateFor(native: number, target: number): number {
  if (!(native > 0) || !(target > 0)) throw new RangeError('BPM must be > 0')
  return target / native
}

/** Seconds a `bars`-bar loop lasts at `bpm` (4/4). */
export function barsSeconds(bars: Bars, bpm: number): number {
  return (bars * 240) / bpm
}

/** Frames to render so the output is exactly `bars` bars at the target BPM. */
export function renderFrames(bars: Bars, target: number, sampleRate: number): number {
  return Math.round(barsSeconds(bars, target) * sampleRate)
}

/** File name for an export: "<name> 90bpm.wav". */
export function exportName(name: string, target: number): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/\s*\b\d{2,3}\s*bpm\b/i, '').trim()
  return `${base} ${target}bpm.wav`
}

/** Render `buffer` (a `bars` loop at `native` BPM) at `target` BPM, same sample rate and channels. */
export async function renderAtTempo(buffer: AudioBuffer, native: number, bars: Bars, target: number, startOffset = 0): Promise<AudioBuffer> {
  const rate = rateFor(native, target)
  const frames = renderFrames(bars, target, buffer.sampleRate)
  const ctx = new OfflineAudioContext(buffer.numberOfChannels, Math.max(1, frames), buffer.sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = rate
  src.loop = true
  src.loopStart = startOffset
  src.loopEnd = Math.min(startOffset + barsSeconds(bars, native), buffer.duration)
  src.connect(ctx.destination)
  src.start(0, startOffset)
  return ctx.startRendering()
}

/** Trigger a browser download of a blob. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
