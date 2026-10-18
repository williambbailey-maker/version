/**
 * WAV encoding for exports: PCM, 16 or 24 bit, interleaved, at the
 * buffer's own sample rate. Pure, so the header maths is unit-tested.
 */

export type Bits = 16 | 24

export function wavHeaderSize(): number {
  return 44
}

/** Byte size of a WAV file holding `frames` frames of `channels` channels. */
export function wavSize(frames: number, channels: number, bits: Bits): number {
  return wavHeaderSize() + frames * channels * (bits / 8)
}

/** Encode planar float channels (-1..1) into a WAV ArrayBuffer. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number, bits: Bits = 24): ArrayBuffer {
  const nCh = channels.length
  const frames = channels[0]?.length ?? 0
  const bytesPerSample = bits / 8
  const blockAlign = nCh * bytesPerSample
  const dataSize = frames * blockAlign
  const out = new ArrayBuffer(44 + dataSize)
  const v = new DataView(out)
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, nCh, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * blockAlign, true)
  v.setUint16(32, blockAlign, true)
  v.setUint16(34, bits, true)
  str(36, 'data')
  v.setUint32(40, dataSize, true)
  let off = 44
  const max = bits === 16 ? 32767 : 8388607
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      const x = Math.max(-1, Math.min(1, channels[c]![i] ?? 0))
      const n = Math.round(x < 0 ? x * (max + 1) : x * max)
      if (bits === 16) {
        v.setInt16(off, n, true)
        off += 2
      } else {
        v.setUint8(off, n & 0xff)
        v.setUint8(off + 1, (n >> 8) & 0xff)
        v.setUint8(off + 2, (n >> 16) & 0xff)
        off += 3
      }
    }
  }
  return out
}

/** Convenience for an AudioBuffer. */
export function audioBufferToWav(buffer: AudioBuffer, bits: Bits = 24): Blob {
  const chans: Float32Array[] = []
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c))
  return new Blob([encodeWav(chans, buffer.sampleRate, bits)], { type: 'audio/wav' })
}
