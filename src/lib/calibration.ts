import { getContext } from '../engine/context'
import { currentUserId, signedUrl } from './loops'

/**
 * AAC/MP3 encoders add priming samples at the start of a file. Some decoders
 * trim them (edit lists), some don't. Rather than guess, the importer uploads
 * a click encoded with the same settings as the previews, and we measure
 * where the click actually lands after decoding. The difference is the
 * offset every compressed loop must skip.
 */

export const CLICK_AT_SEC = 0.1
/** Offsets below this are the click's own width, not codec priming. */
const IGNORE_BELOW_SEC = 0.002

const cached = new Map<string, Promise<number>>()

/** Start offset for previews with the given extension ("mp3", "m4a"). */
export function codecStartOffset(ext: string): Promise<number> {
  let p = cached.get(ext)
  if (!p) {
    p = measure(ext).catch(() => 0)
    cached.set(ext, p)
  }
  return p
}

async function measure(ext: string): Promise<number> {
  const uid = await currentUserId()
  const url = await signedUrl(`${uid}/calibration/click.${ext}`)
  const res = await fetch(url)
  if (!res.ok) return 0
  const buf = await getContext().decodeAudioData(await res.arrayBuffer())
  return offsetFromClick(buf.getChannelData(0), buf.sampleRate)
}

/**
 * Where the click's peak landed vs where it was written. The peak (not a
 * threshold crossing) is used so codec pre-echo can't trigger early.
 */
export function offsetFromClick(samples: Float32Array, sampleRate: number): number {
  let peak = 0
  let at = -1
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i] ?? 0)
    if (v > peak) {
      peak = v
      at = i
    }
  }
  if (at < 0 || peak < 0.1) return 0
  const off = at / sampleRate - CLICK_AT_SEC
  return off < IGNORE_BELOW_SEC ? 0 : off
}
