import { CLICK_AT_SEC } from './calibration'

/** Calibration key for previews encoded in the browser (see calibration.ts). */
export const WEB_MP3 = 'web.mp3'
const KBPS = 192

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, (mp3: Uint8Array) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./mp3.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; mp3: Uint8Array }>) => {
      const done = pending.get(e.data.id)
      pending.delete(e.data.id)
      done?.(e.data.mp3)
    }
  }
  return worker
}

function encodeChannels(channels: Float32Array[], sampleRate: number): Promise<Blob> {
  return new Promise((resolve) => {
    const id = ++seq
    pending.set(id, (mp3) => resolve(new Blob([mp3.buffer as ArrayBuffer], { type: 'audio/mpeg' })))
    getWorker().postMessage({ id, channels, sampleRate, kbps: KBPS }, channels.map((c) => c.buffer))
  })
}

/** Encode a decoded buffer (mono or stereo) to an MP3 preview. */
export function encodeMp3(buffer: AudioBuffer): Promise<Blob> {
  const n = Math.min(2, buffer.numberOfChannels)
  const channels: Float32Array[] = []
  for (let c = 0; c < n; c++) channels.push(new Float32Array(buffer.getChannelData(c))) // copy: buffers are transferred
  return encodeChannels(channels, buffer.sampleRate)
}

/** One second of silence with a click at CLICK_AT_SEC, encoded like the previews. */
export function encodeClick(sampleRate = 44100): Promise<Blob> {
  const s = new Float32Array(sampleRate)
  const at = Math.round(CLICK_AT_SEC * sampleRate)
  for (let i = 0; i < 8; i++) s[at + i] = 0.9 * (i % 2 === 0 ? 1 : -1)
  return encodeChannels([s], sampleRate)
}
