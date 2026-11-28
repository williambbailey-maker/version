/**
 * Recorder: captures an audio input (a USB interface) on the engine's own
 * AudioContext and cuts bar-exact takes out of it.
 *
 * Signal path: MediaStream → AudioWorklet (raw float capture) → muted gain
 * → destination. The muted gain only keeps the worklet running; the input
 * is never played back, so monitoring is done on the interface itself.
 * Nothing here is lossy: takes are the float samples the interface sent.
 *
 * Pure TypeScript, no React. The bar and latency maths live in capture.ts.
 */
import { captureStartFrame, covers, measureLatency, peakOf, phraseStart, sliceBlocks, takeFrames } from './capture'
import type { Block, ChannelMode } from './capture'
import { ensureRunning } from './context'
import type { Engine } from './engine'

export type InputDevice = { id: string; label: string }
/** The longest recording, in bars. Bars are picked out of it afterwards. */
export const MAX_TAKE_BARS = 64
export type LatencySource = 'estimate' | 'measured' | 'manual'

export type RecorderStatus = 'closed' | 'opening' | 'ready' | 'armed' | 'recording' | 'calibrating'

export type RecorderState = {
  status: RecorderStatus
  devices: InputDevice[]
  deviceId: string | null
  deviceLabel: string | null
  /** Channels the open input really delivers (1 for a built-in mic, 2 for the SSL 2+). */
  inputChannels: number
  sampleRate: number
  latencySec: number
  latencySource: LatencySource
  /** Context time the take starts, and its first bar, while armed or recording. */
  startsAt: number | null
  startBar: number | null
  /** Context time the take ends; null for a free take that has not been stopped. */
  endsAt: number | null
  bars: number | null
  barSec: number
  /** The most bars the recording in progress may run. */
  maxBars: number
  error: string | null
}

/** A finished recording, held in memory until it is kept or discarded. */
export type RecordedTake = {
  channels: Float32Array[]
  sampleRate: number
  bpm: number
  bars: number
  peak: number
  /** Grid bar the recording starts on, so a cut from it can loop where it was played. */
  firstBar: number
}

type Listener = () => void

const WORKLET_NAME = 'looplab-capture'
/** Posts the input in ~2048-frame chunks stamped with the context frame they start on. */
const WORKLET_SOURCE = `
class LoopLabCapture extends AudioWorkletProcessor {
  constructor() { super(); this.size = 2048; this.n = 0; this.start = 0; this.bufs = [] }
  flush() {
    if (this.n === 0) return
    const channels = this.bufs.map((b) => b.slice(0, this.n))
    this.port.postMessage({ frame: this.start, channels }, channels.map((c) => c.buffer))
    this.n = 0
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const len = input[0].length
    if (this.bufs.length !== input.length) { this.flush(); this.bufs = input.map(() => new Float32Array(this.size)) }
    if (this.n + len > this.size) this.flush()
    if (this.n === 0) this.start = currentFrame
    for (let c = 0; c < input.length; c++) this.bufs[c].set(input[c], this.n)
    this.n += len
    if (this.n >= this.size) this.flush()
    return true
  }
}
registerProcessor('${WORKLET_NAME}', LoopLabCapture)
`

/** How far ahead a take may be scheduled; a nearer bar is skipped. */
const ARM_LEAD = 0.15
const LATENCY_KEY = 'looplab.latency'
const INPUT_KEY = 'looplab.input'
const CLICK_COUNT = 5
const CLICK_GAP = 0.4

const loaded = new WeakSet<BaseAudioContext>()

export class Recorder {
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private node: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private listeners = new Set<Listener>()
  /** Input captured for the take or calibration in progress. */
  private blocks: Block[] = []
  /** Capture is kept from this frame on; Infinity while nothing is being recorded. */
  private keepFrom = Infinity
  private waiters: { end: number; done: () => void }[] = []
  private cancelTake: ((reason: Error) => void) | null = null
  private freeEnd: ((endAt: number, bars: number) => void) | null = null
  private unwatch: (() => void) | null = null
  /** Rolling input peak per channel, for the meter. Read with `levels()`. */
  private peaks = [0, 0]
  private _state: RecorderState

  constructor(
    private readonly ctx: AudioContext,
    /** Where calibration clicks are sent. */
    private readonly clickOut: AudioNode = ctx.destination,
  ) {
    this._state = {
      status: 'closed',
      devices: [],
      deviceId: null,
      deviceLabel: null,
      inputChannels: 0,
      sampleRate: ctx.sampleRate,
      latencySec: 0,
      latencySource: 'estimate',
      startsAt: null,
      startBar: null,
      endsAt: null,
      bars: null,
      barSec: 0,
      maxBars: MAX_TAKE_BARS,
      error: null,
    }
  }

  get state(): RecorderState {
    return this._state
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Status check that TypeScript does not narrow across awaits. */
  private is(...statuses: RecorderStatus[]): boolean {
    return statuses.includes(this._state.status)
  }

  private set(patch: Partial<RecorderState>): void {
    this._state = { ...this._state, ...patch }
    for (const fn of this.listeners) fn()
  }

  /** Input peaks since the last call (0..1 per channel), for a level meter. */
  levels(): [number, number] {
    const out: [number, number] = [this.peaks[0]!, this.peaks[1]!]
    this.peaks = [0, 0]
    return out
  }

  /** Inputs the browser can see. Labels are only filled in after access is granted. */
  async refreshDevices(): Promise<InputDevice[]> {
    const all = await navigator.mediaDevices.enumerateDevices()
    const devices = all
      .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }))
    this.set({ devices })
    return devices
  }

  /**
   * Open an input. Call from a click: the browser asks for permission here.
   * `injected` is a test seam: a ready-made stream instead of a device.
   */
  async open(deviceId?: string | null, injected?: MediaStream): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia && !injected) {
      this.set({ error: 'This browser cannot record audio.' })
      return
    }
    this.closeInput()
    this.set({ status: 'opening', error: null })
    try {
      await ensureRunning(this.ctx)
      const request = (id: string | null) =>
        navigator.mediaDevices.getUserMedia({
          audio: {
            ...(id ? { deviceId: { exact: id } } : {}),
            // The raw input: none of the call-quality processing browsers add by default.
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: { ideal: 2 },
          },
        })
      let stream: MediaStream
      if (injected) stream = injected
      else if (deviceId) stream = await request(deviceId)
      else {
        // No choice made: go back to the interface used last time, if it is plugged in.
        const last = await this.rememberedDevice()
        stream = await request(last).catch(() => request(null))
      }
      if (!loaded.has(this.ctx)) {
        const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
        try {
          await this.ctx.audioWorklet.addModule(url)
        } finally {
          URL.revokeObjectURL(url)
        }
        loaded.add(this.ctx)
      }
      const track = stream.getAudioTracks()[0]
      const settings = track?.getSettings() ?? {}
      this.stream = stream
      this.source = this.ctx.createMediaStreamSource(stream)
      // Two discrete channels: input 1 and input 2 stay separate, never mixed.
      this.node = new AudioWorkletNode(this.ctx, WORKLET_NAME, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'discrete' })
      this.node.port.onmessage = (e: MessageEvent<Block>) => this.onBlock(e.data)
      this.sink = this.ctx.createGain()
      this.sink.gain.value = 0
      this.source.connect(this.node)
      this.node.connect(this.sink)
      this.sink.connect(this.ctx.destination)
      track?.addEventListener('ended', () => {
        this.fail(new Error('The input was disconnected.'))
        this.closeInput()
        this.set({ status: 'closed', error: 'The input was disconnected.' })
      })

      const label = track?.label || 'Input'
      const devices = injected ? [] : await this.refreshDevices()
      const id = matchDevice(devices, settings.deviceId ?? deviceId ?? null, label)
      if (deviceId) remember(INPUT_KEY, label) // an explicit pick becomes the default next time
      const saved = readLatency(label)
      const estimate = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0) + ((settings as { latency?: number }).latency ?? 0)
      this.set({
        status: 'ready',
        deviceId: id,
        deviceLabel: label,
        inputChannels: settings.channelCount ?? 2,
        sampleRate: this.ctx.sampleRate,
        latencySec: saved?.latencySec ?? estimate,
        latencySource: saved?.source ?? 'estimate',
      })
    } catch (e) {
      this.closeInput()
      this.set({ status: 'closed', error: describe(e) })
    }
  }

  /** Device id of the interface picked last time, when the browser can still see it. */
  private async rememberedDevice(): Promise<string | null> {
    const label = recall(INPUT_KEY)
    if (!label) return null
    const devices = await this.refreshDevices().catch(() => [])
    return devices.find((d) => d.label === label)?.id ?? null
  }

  close(): void {
    this.fail(new Error('Recording was closed.'))
    this.closeInput()
    this.set({ status: 'closed', deviceId: null, deviceLabel: null, inputChannels: 0 })
  }

  private closeInput(): void {
    this.unwatch?.()
    this.unwatch = null
    this.node?.port.close()
    this.source?.disconnect()
    this.node?.disconnect()
    this.sink?.disconnect()
    if (this.stream) for (const t of this.stream.getTracks()) t.stop()
    this.stream = this.source = this.node = this.sink = null
    this.blocks = []
    this.keepFrom = Infinity
  }

  private onBlock(b: Block): void {
    for (let c = 0; c < 2; c++) {
      const ch = b.channels[c]
      if (!ch) continue
      let p = this.peaks[c]!
      for (let i = 0; i < ch.length; i++) {
        const v = Math.abs(ch[i]!)
        if (v > p) p = v
      }
      this.peaks[c] = p
    }
    if (this.keepFrom === Infinity) return
    if (b.frame + (b.channels[0]?.length ?? 0) <= this.keepFrom) return
    this.blocks.push(b)
    for (const w of [...this.waiters]) {
      if (covers(this.blocks, w.end)) {
        this.waiters.splice(this.waiters.indexOf(w), 1)
        w.done()
      }
    }
  }

  /** Resolves once the stream has delivered everything before `endFrame`. */
  private until(endFrame: number): Promise<void> {
    if (covers(this.blocks, endFrame)) return Promise.resolve()
    return new Promise((done) => this.waiters.push({ end: endFrame, done }))
  }

  private fail(reason: Error): void {
    this.cancelTake?.(reason)
  }

  /** Set the timing offset by hand (seconds). */
  setLatency(latencySec: number, source: LatencySource = 'manual'): void {
    const v = Math.max(0, Math.min(0.5, latencySec))
    this.set({ latencySec: v, latencySource: source })
    if (this._state.deviceLabel) writeLatency(this._state.deviceLabel, v, source)
  }

  /**
   * Measure the round trip: play clicks, listen for them on the input.
   * Needs a cable (or a microphone) from an output to the input, and
   * playback stopped so nothing else is on the line.
   */
  async calibrate(): Promise<{ ok: true; latencySec: number; spreadSec: number } | { ok: false; message: string }> {
    if (this._state.status !== 'ready') return { ok: false, message: 'Connect an input first.' }
    this.set({ status: 'calibrating', error: null })
    const sr = this.ctx.sampleRate
    const t0 = this.ctx.currentTime + 0.25
    const times = Array.from({ length: CLICK_COUNT }, (_, i) => t0 + i * CLICK_GAP)
    const burst = this.ctx.createBuffer(1, Math.round(0.003 * sr), sr)
    const data = burst.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = 0.7 * Math.cos((2 * Math.PI * 2000 * i) / sr)
    for (const t of times) {
      const src = this.ctx.createBufferSource()
      src.buffer = burst
      src.connect(this.clickOut)
      src.start(t)
    }
    const from = Math.round((t0 - 0.1) * sr)
    const to = Math.round((times[times.length - 1]! + CLICK_GAP) * sr)
    this.blocks = []
    this.keepFrom = from
    try {
      await this.until(to)
      const both = sliceBlocks(this.blocks, from, to - from, 'stereo')
      // Use whichever input the cable is on: the louder one.
      const pick = peakOf([both[1]!]) > peakOf([both[0]!]) ? both[1]! : both[0]!
      const r = measureLatency(pick, sr, from / sr, times)
      if (!r) return { ok: false, message: 'No click came back on the input. Run a cable from an interface output to the input, turn the input gain up, and try again.' }
      if (r.spreadSec > 0.004) return { ok: false, message: 'The clicks came back unevenly, so the measurement is not trustworthy. Stop any other sound and try again.' }
      this.setLatency(r.latencySec, 'measured')
      return { ok: true, latencySec: r.latencySec, spreadSec: r.spreadSec }
    } finally {
      this.keepFrom = Infinity
      this.blocks = []
      if (this.is('calibrating')) this.set({ status: 'ready' })
    }
  }

  /**
   * Record a long take against the engine's transport: from the next bar
   * line until `finish()`, until playback stops, or until MAX_TAKE_BARS.
   * It always ends on a bar line, so the result is a whole number of bars
   * to pick a loop out of. Starts playback if it is stopped.
   */
  async record(engine: Engine, mode: ChannelMode, maxBars = MAX_TAKE_BARS): Promise<RecordedTake> {
    if (this._state.status !== 'ready') throw new Error('Connect an input first.')
    const wasPlaying = engine.playing
    if (!wasPlaying) await engine.play()
    const start = engine.transport.transportStart
    if (start === null) throw new Error('Playback did not start.')
    const barSec = engine.transport.barSec
    const bpm = engine.transport.masterBPM
    const sr = this.ctx.sampleRate
    const { at, bar } = phraseStart(start, this.ctx.currentTime, barSec, 1, ARM_LEAD)
    const startFrame = captureStartFrame(at, this._state.latencySec, sr)

    this.blocks = []
    this.keepFrom = startFrame
    this.set({ status: 'armed', startsAt: at, startBar: bar, endsAt: null, bars: null, barSec, maxBars, error: null })

    const cancelled = new Promise<never>((_, reject) => {
      this.cancelTake = reject
    })
    const ended = new Promise<number>((resolve) => {
      this.freeEnd = (endAt, n) => {
        this.set({ endsAt: endAt, bars: n })
        resolve(n)
      }
    })
    /** End on the bar line at `time` (playback stopped there, or the tempo changed there). */
    const endAt = (time: number) => {
      const n = Math.min(maxBars, Math.round((time - at) / barSec))
      if (n >= 1) this.freeEnd?.(at + n * barSec, n)
      else this.fail(new Error('Nothing was recorded: it stopped before the first bar finished.'))
    }
    // Recording follows the transport. Stopping playback ends the take on that
    // bar line; a tempo change ends it where the new tempo begins.
    this.unwatch = engine.subscribe(() => {
      if (this._state.endsAt !== null) return
      const grid = engine.grid()
      if (!engine.playing) endAt(grid?.end ?? this.ctx.currentTime)
      else if (engine.transport.masterBPM !== bpm) endAt(grid?.start ?? this.ctx.currentTime)
    })
    const flip = setTimeout(() => this.is('armed') && this.set({ status: 'recording' }), Math.max(0, (at - this.ctx.currentTime) * 1000))

    try {
      const full = this.until(startFrame + takeFrames(maxBars, barSec, sr)).then(() => maxBars)
      const bars = await Promise.race([ended, full, cancelled])
      if (this._state.endsAt === null) this.set({ endsAt: at + bars * barSec, bars })
      const frames = takeFrames(bars, barSec, sr)
      await Promise.race([this.until(startFrame + frames), cancelled])
      const channels = sliceBlocks(this.blocks, startFrame, frames, mode)
      return { channels, sampleRate: sr, bpm, bars, peak: peakOf(channels), firstBar: bar }
    } finally {
      clearTimeout(flip)
      this.unwatch?.()
      this.unwatch = null
      this.cancelTake = null
      this.freeEnd = null
      this.keepFrom = Infinity
      this.blocks = []
      this.waiters = []
      if (this.is('armed', 'recording')) {
        this.set({ status: 'ready', startsAt: null, startBar: null, endsAt: null, bars: null })
      }
    }
  }

  /** Stop recording: the take ends on the next bar line (at least one bar long). */
  finish(): void {
    const s = this._state
    if (!this.freeEnd || s.startsAt === null || s.endsAt !== null) return
    const played = (this.ctx.currentTime - s.startsAt) / s.barSec
    const bars = Math.min(s.maxBars, Math.max(1, Math.ceil(played - 1e-6)))
    this.freeEnd(s.startsAt + bars * s.barSec, bars)
  }

  /**
   * Play a stretch of recorded audio once, to check it before keeping it.
   * Starts on the next bar while the loops are playing. Returns a stop function.
   */
  preview(engine: Engine, channels: readonly Float32Array[], sampleRate: number, onEnded?: () => void): () => void {
    const buffer = this.ctx.createBuffer(channels.length, Math.max(1, channels[0]?.length ?? 1), sampleRate)
    channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i))
    const src = this.ctx.createBufferSource()
    const level = this.ctx.createGain()
    level.gain.value = 0.5
    src.buffer = buffer
    src.connect(level)
    level.connect(engine.master)
    const now = this.ctx.currentTime
    src.start(engine.playing ? engine.transport.nextBar(now, ARM_LEAD) : now + 0.05)
    let done = false
    const finish = () => {
      if (done) return
      done = true
      src.disconnect()
      level.disconnect()
      onEnded?.()
    }
    src.onended = finish
    return () => {
      try {
        src.stop()
      } catch {
        /* already ended */
      }
      finish()
    }
  }

  /** Abandon the take in progress. */
  cancel(): void {
    this.fail(new Error('Take cancelled.'))
  }
}

function describe(e: unknown): string {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError') return 'Loop Lab was not allowed to use the audio input. Allow microphone access for this site (or for the Loop Lab app in System Settings, Privacy & Security, Microphone) and try again.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'That input was not found. Check the interface is plugged in, then connect again.'
  if (name === 'NotReadableError') return 'The input is in use by another app. Close it there (or free the device) and try again.'
  return e instanceof Error ? e.message : String(e)
}

/**
 * The list entry for the open input. The system default reports its id as
 * "default" and its label as "Default - <device>", so fall back to the name.
 */
export function matchDevice(devices: readonly InputDevice[], id: string | null, label: string): string | null {
  if (id && devices.some((d) => d.id === id)) return id
  const bare = label.replace(/^(Default|Communications)\s*-\s*/i, '')
  return devices.find((d) => d.label === bare)?.id ?? devices.find((d) => bare.includes(d.label) || d.label.includes(bare))?.id ?? id
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: just not remembered */
  }
}

type SavedLatency = { latencySec: number; source: LatencySource }

function readLatency(label: string): SavedLatency | null {
  try {
    const all = JSON.parse(localStorage.getItem(LATENCY_KEY) ?? '{}') as Record<string, SavedLatency>
    const v = all[label]
    return v && typeof v.latencySec === 'number' && v.latencySec >= 0 && v.latencySec <= 0.5 ? v : null
  } catch {
    return null
  }
}

function writeLatency(label: string, latencySec: number, source: LatencySource): void {
  try {
    const all = JSON.parse(localStorage.getItem(LATENCY_KEY) ?? '{}') as Record<string, SavedLatency>
    all[label] = { latencySec, source }
    localStorage.setItem(LATENCY_KEY, JSON.stringify(all))
  } catch {
    /* private mode: just not remembered */
  }
}

let singleton: Recorder | null = null

/** App-wide recorder on the engine's context. */
export function getRecorder(ctx: AudioContext): Recorder {
  if (!singleton) singleton = new Recorder(ctx)
  return singleton
}
