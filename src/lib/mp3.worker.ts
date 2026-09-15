import { Mp3Encoder } from '@breezystack/lamejs'

/**
 * Off-main-thread MP3 encoding for the in-browser importer.
 * In: { id, channels: Float32Array[], sampleRate, kbps }  Out: { id, mp3: Uint8Array }
 */
type Req = { id: number; channels: Float32Array[]; sampleRate: number; kbps: number }

function toInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(-1, Math.min(1, f[i] ?? 0))
    out[i] = v < 0 ? v * 32768 : v * 32767
  }
  return out
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, channels, sampleRate, kbps } = e.data
  const stereo = channels.length >= 2
  const left = toInt16(channels[0]!)
  const right = stereo ? toInt16(channels[1]!) : null
  const enc = new Mp3Encoder(stereo ? 2 : 1, sampleRate, kbps)
  const parts: Uint8Array[] = []
  const BLOCK = 1152
  for (let i = 0; i < left.length; i += BLOCK) {
    const chunk = right
      ? enc.encodeBuffer(left.subarray(i, i + BLOCK), right.subarray(i, i + BLOCK))
      : enc.encodeBuffer(left.subarray(i, i + BLOCK))
    if (chunk.length) parts.push(new Uint8Array(chunk))
  }
  const tail = enc.flush()
  if (tail.length) parts.push(new Uint8Array(tail))
  const total = parts.reduce((n, p) => n + p.length, 0)
  const mp3 = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    mp3.set(p, o)
    o += p.length
  }
  ;(self as unknown as Worker).postMessage({ id, mp3 }, [mp3.buffer])
}
