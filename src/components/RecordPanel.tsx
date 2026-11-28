import { useEffect, useMemo, useRef, useState } from 'react'
import { barPeaks, clampSelection, cutBars, lengthsFor, nextTakeNumber, peakOf, rotateToPhrase, takeFileName, takeName, toDb } from '../engine/capture'
import type { ChannelMode } from '../engine/capture'
import { MAX_TAKE_BARS } from '../engine/recorder'
import type { RecordedTake } from '../engine/recorder'
import { DEFAULT_SAMPLE_GAIN } from '../engine/types'
import type { Bars, Loop } from '../engine/types'
import { useRecorder } from '../hooks/useRecorder'
import { ensurePack, uploadBlob } from '../lib/loops'
import { download } from '../lib/retempo'
import { encodeWav } from '../lib/wav'

/** A recording waiting to be kept or discarded. Lives in memory only. */
export type Take = Omit<RecordedTake, 'firstBar'> & {
  id: string
  name: string
  mode: ChannelMode
  /** The take as a loop, so it plays in the mix like any other. */
  loop: Loop
  status: 'new' | 'saving' | 'kept' | 'failed'
  note?: string | undefined
}

type Props = {
  takes: Take[]
  setTakes: (fn: (takes: Take[]) => Take[]) => void
  playing: boolean
  hasStack: boolean
  /** Names already in the library, so take numbers never repeat. */
  libraryNames: readonly string[]
  isActive: (loopId: string) => boolean
  /** Toggle a take in or out of the mix (bar-quantized, like tapping a sample). */
  onAudition: (loop: Loop) => void
  /** A take was saved to the library as `saved`; `temp` was its in-memory stand-in. The app adds `saved` to the mix. */
  onKept: (temp: Loop, saved: Loop) => void
}

const PACK = 'Takes'

const ms = (sec: number) => `${(sec * 1000).toFixed(1)} ms`

export function RecordPanel({ takes, setTakes, playing, hasStack, libraryNames, isActive, onAudition, onKept }: Props) {
  const rec = useRecorder()
  const [mode, setMode] = useState<ChannelMode>('in1')
  const [message, setMessage] = useState<string | null>(null)
  /** The long recording waiting for its bars to be picked. */
  const [raw, setRaw] = useState<RecordedTake | null>(null)
  const takesRef = useRef(takes)
  takesRef.current = takes
  const busy = rec.status === 'armed' || rec.status === 'recording'
  const open = rec.status !== 'closed' && rec.status !== 'opening'
  const mono = open && rec.inputChannels < 2

  // A built-in mic has one channel: fall back to it rather than record silence.
  useEffect(() => {
    if (mono && mode !== 'in1') setMode('in1')
  }, [mono, mode])

  const onRecord = async () => {
    setMessage(null)
    try {
      setRaw(await rec.record(mode))
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      if (text !== 'Take cancelled.') setMessage(text)
    }
  }

  /** The chosen bars become a loop in the stack; the rest of the recording is dropped. */
  const addToStack = (start: number, length: number) => {
    if (!raw) return
    // Rotated onto the phrase so it loops in the place it was played.
    const channels = rotateToPhrase(cutBars(raw.channels, start, length, raw.bars), raw.firstBar + start, length)
    const made = new Date()
    const name = takeName(made, nextTakeNumber([...libraryNames, ...takesRef.current.map((t) => t.name)], made))
    const id = `take-${crypto.randomUUID()}`
    const cut = { channels, sampleRate: raw.sampleRate, bpm: raw.bpm, bars: length, peak: peakOf(channels) }
    const loop: Loop = { id, name, url: '', bpm: raw.bpm, bars: length as Bars, kind: 'sample', gain: DEFAULT_SAMPLE_GAIN, buffer: rec.toBuffer(cut), tags: ['take'], pack: PACK }
    setTakes((ts) => [{ ...cut, id, name, mode, loop, status: 'new' }, ...ts])
    setRaw(null)
    setMessage(`Bars ${start + 1} to ${start + length} are in the stack as "${name}". Save it to keep it.`)
    onAudition(loop)
  }

  const onCalibrate = async () => {
    setMessage(null)
    const r = await rec.calibrate()
    setMessage(r.ok ? `Measured ${ms(r.latencySec)}. Takes are now shifted by that amount.` : r.message)
  }

  const patch = (id: string, p: Partial<Take>) => setTakes((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)))

  const keep = async (t: Take) => {
    const blob = new Blob([encodeWav(t.channels, t.sampleRate, 24)], { type: 'audio/wav' })
    download(blob, takeFileName(t.name, t.bpm, t.bars))
    patch(t.id, { status: 'saving', note: undefined })
    try {
      const packId = await ensurePack(PACK)
      const saved = await uploadBlob(blob, 'wav', 'audio/wav', { name: t.name, bpm: t.bpm, bars: t.loop.bars, kind: 'sample', tags: ['take'], pack: PACK, packId, duration: t.channels[0]!.length / t.sampleRate }, t.loop.buffer)
      patch(t.id, { status: 'kept', note: 'Saved to the library (pack "Takes") and to Downloads, and added to the mix.' })
      onKept(t.loop, saved)
    } catch (e) {
      patch(t.id, { status: 'failed', note: `Saved to Downloads, but the library upload failed: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  const discard = (t: Take) => {
    if (isActive(t.loop.id)) onAudition(t.loop) // take it out of the mix first
    setTakes((ts) => ts.filter((x) => x.id !== t.id))
  }

  return (
    <div className="flex flex-col gap-6">
      {!open ? (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-xl text-base leading-relaxed text-muted">
            Record your interface over the loops. Each take starts on the bar, is cut to an exact number of bars, and saves as a 24-bit WAV of your playing only.
          </p>
          <button type="button" onClick={() => void rec.open()} disabled={rec.status === 'opening'} className="pill">
            {rec.status === 'opening' ? 'Connecting…' : 'Connect input'}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="mono-label flex min-w-48 flex-1 flex-col gap-1 text-muted">
              Interface
              <select value={rec.deviceId ?? ''} onChange={(e) => void rec.open(e.target.value)} disabled={busy} aria-label="Audio input device" className="field min-h-9 w-full py-0 text-ink">
                {rec.devices.length === 0 && <option value={rec.deviceId ?? ''}>{rec.deviceLabel ?? 'Input'}</option>}
                {rec.devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mono-label flex flex-col gap-1 text-muted">
              Record from
              <select value={mode} onChange={(e) => setMode(e.target.value as ChannelMode)} disabled={busy} aria-label="Which inputs to record" className="field min-h-9 py-0 text-ink">
                <option value="in1">Input 1 · mono</option>
                <option value="in2" disabled={mono}>Input 2 · mono</option>
                <option value="stereo" disabled={mono}>Inputs 1 + 2 · stereo</option>
              </select>
            </label>
            <Meter levels={rec.levels} stereo={!mono} />
          </div>

          {raw ? (
            <BarPicker raw={raw} preview={rec.preview} onAdd={addToStack} onDiscard={() => setRaw(null)} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {!busy ? (
                <button type="button" onClick={() => void onRecord()} disabled={rec.status !== 'ready' || !hasStack} className="pill pill-accent min-h-11 px-6 text-[13px]">
                  ● Record
                </button>
              ) : (
                <>
                  <button type="button" onClick={rec.finish} disabled={rec.status !== 'recording' || rec.endsAt !== null} className="pill pill-accent min-h-11 px-6 text-[13px]">
                    ■ Stop recording
                  </button>
                  <button type="button" onClick={rec.cancel} className="pill pill-outline min-h-11 px-5">
                    Cancel
                  </button>
                </>
              )}
              <Progress status={rec.status} startsAt={rec.startsAt} endsAt={rec.endsAt} barSec={rec.barSec} max={rec.maxBars} now={rec.now} />
              {!busy && !hasStack && <span className="mono-label text-muted">Tap a drum loop or a sample first: it sets the tempo.</span>}
              {!busy && hasStack && (
                <span className="mono-label text-muted">
                  Records up to {MAX_TAKE_BARS} bars{playing ? ', from the next bar' : ', and starts playback'}. Stop when you are done, then pick the bars to keep.
                </span>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mono-label text-muted">Timing offset</span>
              <span className="mono-label font-bold" aria-live="polite">
                {ms(rec.latencySec)} · {rec.latencySource === 'measured' ? 'measured' : rec.latencySource === 'manual' ? 'set by hand' : 'estimated'}
              </span>
              <button type="button" onClick={() => rec.setLatency(rec.latencySec - 0.001)} disabled={busy} aria-label="Timing offset 1 millisecond earlier" className="pill pill-outline min-h-7 px-2.5">
                −1
              </button>
              <button type="button" onClick={() => rec.setLatency(rec.latencySec + 0.001)} disabled={busy} aria-label="Timing offset 1 millisecond later" className="pill pill-outline min-h-7 px-2.5">
                +1
              </button>
              <button type="button" onClick={() => void onCalibrate()} disabled={rec.status !== 'ready' || playing} className="pill pill-outline min-h-7 px-3" title={playing ? 'Stop playback first' : 'Play clicks and measure how late they come back'}>
                {rec.status === 'calibrating' ? 'Listening…' : 'Calibrate'}
              </button>
            </div>
            <p className="mono-label max-w-2xl normal-case leading-relaxed text-muted">
              Every interface adds a small delay. To measure yours once: stop playback, run a cable from an interface output into the input you record on, then press Calibrate. Hear yourself with the Monitor Mix knob on the interface; Loop Lab never plays your input back.
            </p>
          </div>
        </>
      )}

      {(message || rec.error) && (
        <p className="mono-label normal-case text-accent" role="status">
          {message ?? rec.error}
        </p>
      )}

      {takes.length > 0 && (
        <ul className="border-t border-line" aria-label="Takes">
          {takes.map((t) => {
            const inMix = isActive(t.loop.id)
            const db = toDb(t.peak)
            const level = t.peak < 0.001 ? 'no signal' : t.peak >= 0.999 ? 'clipped' : `peak ${db.toFixed(1)} dB`
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm font-bold">{t.name}</span>
                  <span className="mono-label text-muted">
                    {t.bars} bar{t.bars === 1 ? '' : 's'} · {t.bpm} bpm · {t.channels.length === 2 ? 'stereo' : t.mode === 'in2' ? 'input 2' : 'input 1'} · {t.sampleRate / 1000}k ·{' '}
                    <span className={t.peak < 0.001 || t.peak >= 0.999 ? 'text-accent' : ''}>{level}</span>
                  </span>
                  {t.note && <span className={['mono-label block normal-case', t.status === 'failed' ? 'text-accent' : 'text-muted'].join(' ')}>{t.note}</span>}
                </span>
                <span className="flex gap-1.5">
                  {t.status !== 'kept' && (
                    <button type="button" onClick={() => onAudition(t.loop)} aria-pressed={inMix} className={['pill min-h-9 px-4', inMix ? 'pill-accent' : 'pill-outline'].join(' ')}>
                      {inMix ? 'In the mix' : 'Hear it'}
                    </button>
                  )}
                  {t.status !== 'kept' && (
                    <button type="button" onClick={() => void keep(t)} disabled={t.status === 'saving'} className="pill min-h-9 px-4">
                      {t.status === 'saving' ? 'Saving…' : t.status === 'failed' ? 'Try again' : 'Save'}
                    </button>
                  )}
                  <button type="button" onClick={() => discard(t)} disabled={t.status === 'saving'} aria-label={t.status === 'kept' ? `Clear ${t.name} from this list` : `Discard ${t.name}`} className="pill pill-outline min-h-9 px-3">
                    {t.status === 'kept' ? 'Clear' : '×'}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Input level, drawn straight to the DOM so metering never re-renders the app. */
function Meter({ levels, stereo }: { levels: () => [number, number]; stereo: boolean }) {
  const bars = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)]
  const held = useRef([0, 0])
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const now = levels()
      for (let c = 0; c < 2; c++) {
        held.current[c] = Math.max(now[c]!, held.current[c]! * 0.9)
        const el = bars[c]!.current
        if (!el) continue
        // -60 dB..0 dB across the bar
        const db = toDb(held.current[c]!)
        el.style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`
        el.style.background = held.current[c]! >= 0.999 ? 'var(--color-accent)' : 'var(--color-ink)'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels])
  return (
    <div className="mono-label flex min-w-40 flex-1 flex-col gap-1 text-muted" aria-hidden="true">
      Input level
      <div className="flex min-h-9 flex-col justify-center gap-1">
        {[0, 1].slice(0, stereo ? 2 : 1).map((c) => (
          <span key={c} className="block h-2 bg-ink/10">
            <span ref={bars[c]} className="block h-full w-0" />
          </span>
        ))}
      </div>
    </div>
  )
}

/** "Starts on the next bar" / "Recording · bar 12 of 64 max", read off the audio clock. */
function Progress({ status, startsAt, endsAt, barSec, max, now }: { status: string; startsAt: number | null; endsAt: number | null; barSec: number; max: number; now: () => number }) {
  const [, force] = useState(0)
  const live = status === 'armed' || status === 'recording'
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => force((n) => n + 1), 100) // display only; timing is scheduled on the audio clock
    return () => clearInterval(t)
  }, [live])
  if (!live || startsAt === null || !(barSec > 0)) return null
  const t = now()
  let text: string
  if (t < startsAt) text = 'Starts on the next bar'
  else if (endsAt !== null) text = t >= endsAt ? 'Finishing…' : 'Ending on the bar…'
  else text = `Recording · bar ${Math.min(max, Math.floor((t - startsAt) / barSec) + 1)} of ${max} max`
  return (
    <span className="mono-label font-bold text-accent" role="status" aria-live="polite">
      {text}
    </span>
  )
}

/**
 * After a recording: every bar as a tile with its own small waveform.
 * Choose a length, tap the bar to start from, listen, then add the run of
 * bars to the stack. The rest of the recording is dropped.
 */
function BarPicker({
  raw,
  preview,
  onAdd,
  onDiscard,
}: {
  raw: RecordedTake
  preview: (channels: readonly Float32Array[], sampleRate: number, onEnded?: () => void) => () => void
  onAdd: (start: number, length: number) => void
  onDiscard: () => void
}) {
  const lengths = lengthsFor(raw.bars)
  // Start on the last 8 bars (or as many as there are): usually where the keeper is.
  const [length, setLength] = useState<number>(() => [...lengths].reverse().find((l) => l <= 8) ?? 1)
  const [start, setStart] = useState(() => Math.max(0, raw.bars - ([...lengths].reverse().find((l) => l <= 8) ?? 1)))
  const peaks = useMemo(() => barPeaks(raw.channels, raw.bars), [raw])
  const stopRef = useRef<(() => void) | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const sel = clampSelection(start, length, raw.bars) ?? { start: 0, length: 1 }

  const stopPreview = () => {
    stopRef.current?.()
    stopRef.current = null
  }
  useEffect(() => stopPreview, []) // leaving the picker silences a preview

  const pick = (s: number, l: number) => {
    stopPreview()
    const next = clampSelection(s, l, raw.bars)
    if (!next) return
    setStart(next.start)
    setLength(next.length)
  }

  const onPreview = () => {
    if (previewing) return stopPreview()
    setPreviewing(true)
    stopRef.current = preview(cutBars(raw.channels, sel.start, sel.length, raw.bars), raw.sampleRate, () => setPreviewing(false))
  }

  return (
    <div className="flex flex-col gap-4" aria-label="Pick the bars to keep">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm font-bold">
          Recorded {raw.bars} bar{raw.bars === 1 ? '' : 's'} at {raw.bpm} BPM. Pick the bars to loop.
        </p>
        <div className="flex items-center gap-1.5" role="group" aria-label="Loop length in bars">
          <span className="mono-label mr-1 text-muted">Length</span>
          {lengths.map((l) => (
            <button key={l} type="button" onClick={() => pick(sel.start, l)} aria-pressed={sel.length === l} className={['pill min-h-9 min-w-10 px-3', sel.length === l ? '' : 'pill-outline'].join(' ')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 sm:grid-cols-8 lg:grid-cols-16" role="group" aria-label="Bars">
        {peaks.map((row, b) => {
          const on = b >= sel.start && b < sel.start + sel.length
          return (
            <button
              key={b}
              type="button"
              onClick={() => pick(b, sel.length)}
              aria-pressed={on}
              aria-label={`Bar ${b + 1}${on ? ', selected' : ''}`}
              title={`Start the loop at bar ${b + 1}`}
              className={['relative flex h-14 items-end gap-px px-1 pb-1 pt-4 transition-colors duration-150', on ? 'bg-ink text-cream' : 'bg-ink/10 text-ink hover:bg-ink/20'].join(' ')}
            >
              <span className="mono-label absolute left-1 top-0.5 text-[9px] opacity-70">{b + 1}</span>
              {row.map((p, k) => (
                <span key={k} className="block flex-1 bg-current" style={{ height: `${Math.max(4, Math.sqrt(p) * 100)}%` }} />
              ))}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mono-label font-bold" aria-live="polite">
          {sel.length === 1 ? `Bar ${sel.start + 1}` : `Bars ${sel.start + 1} to ${sel.start + sel.length}`}
        </span>
        <button type="button" onClick={onPreview} aria-pressed={previewing} className={['pill min-h-11 px-5', previewing ? 'pill-accent' : 'pill-outline'].join(' ')}>
          {previewing ? '■ Stop' : '▶ Listen'}
        </button>
        <button
          type="button"
          onClick={() => {
            stopPreview()
            onAdd(sel.start, sel.length)
          }}
          className="pill min-h-11 px-6 text-[13px]"
        >
          Add to stack
        </button>
        <button
          type="button"
          onClick={() => {
            stopPreview()
            onDiscard()
          }}
          className="pill pill-outline min-h-11 px-5"
        >
          Discard recording
        </button>
      </div>
      <p className="mono-label max-w-2xl normal-case leading-relaxed text-muted">Tap a bar to start the loop there. The loop joins the stack in the same place you played it, and the rest of this recording is thrown away.</p>
    </div>
  )
}
