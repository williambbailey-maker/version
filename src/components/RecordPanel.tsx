import { useEffect, useRef, useState } from 'react'
import { takeFileName, takeName, nextTakeNumber, toDb } from '../engine/capture'
import type { ChannelMode } from '../engine/capture'
import type { RecordedTake, TakeLength } from '../engine/recorder'
import { DEFAULT_SAMPLE_GAIN } from '../engine/types'
import type { Bars, Loop } from '../engine/types'
import { useRecorder } from '../hooks/useRecorder'
import { ensurePack, uploadBlob } from '../lib/loops'
import { download } from '../lib/retempo'
import { encodeWav } from '../lib/wav'

/** A recording waiting to be kept or discarded. Lives in memory only. */
export type Take = RecordedTake & {
  id: string
  name: string
  mode: ChannelMode
  /** Set for fixed-length takes: lets the take play in the mix like any loop. */
  loop: Loop | null
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
  /** The app points this at the panel's grab action, so the G key can trigger it. */
  grabRef: { current: (() => void) | null }
  /** A take was saved to the library as `saved`; `temp` was its in-memory stand-in. The app adds `saved` to the mix. */
  onKept: (temp: Loop, saved: Loop) => void
}

const PACK = 'Takes'
/** How many bars the Grab button keeps. */
export const GRAB_BARS = 8
const LENGTHS: { value: TakeLength; label: string }[] = [
  { value: 1, label: '1 bar' },
  { value: 2, label: '2 bars' },
  { value: 4, label: '4 bars' },
  { value: 8, label: '8 bars' },
  { value: 'free', label: 'Free' },
]

const ms = (sec: number) => `${(sec * 1000).toFixed(1)} ms`

export function RecordPanel({ takes, setTakes, playing, hasStack, libraryNames, isActive, onAudition, onKept, grabRef }: Props) {
  const rec = useRecorder()
  const [length, setLength] = useState<TakeLength>(4)
  const [mode, setMode] = useState<ChannelMode>('in1')
  const [message, setMessage] = useState<string | null>(null)
  const takesRef = useRef(takes)
  takesRef.current = takes
  const busy = rec.status === 'armed' || rec.status === 'recording'
  const open = rec.status !== 'closed' && rec.status !== 'opening'
  const mono = open && rec.inputChannels < 2

  // A built-in mic has one channel: fall back to it rather than record silence.
  useEffect(() => {
    if (mono && mode !== 'in1') setMode('in1')
  }, [mono, mode])

  /** Put a finished recording at the top of the list. `loops` is false for free takes, which cannot loop in the mix. */
  const addTake = (r: RecordedTake, loops: boolean) => {
    const made = new Date()
    const name = takeName(made, nextTakeNumber([...libraryNames, ...takesRef.current.map((t) => t.name)], made))
    const id = `take-${crypto.randomUUID()}`
    const loop: Loop | null = loops ? { id, name, url: '', bpm: r.bpm, bars: r.bars as Bars, kind: 'sample', gain: DEFAULT_SAMPLE_GAIN, buffer: rec.toBuffer(r), tags: ['take'], pack: PACK } : null
    setTakes((ts) => [{ ...r, id, name, mode, loop, status: 'new' }, ...ts])
    return name
  }

  const onRecord = async () => {
    setMessage(null)
    try {
      // Fixed lengths start on a phrase boundary, so they can loop in the mix; free takes cannot.
      addTake(await rec.record(length, mode), length !== 'free')
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      if (text !== 'Take cancelled.') setMessage(text)
    }
  }

  /** Keep the bars that were just played, with nothing armed beforehand. */
  const onGrab = async () => {
    try {
      const name = addTake(await rec.grab(GRAB_BARS, mode), true)
      setMessage(`Grabbed the last ${GRAB_BARS} bars as "${name}".`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }
  const grabNow = useRef(onGrab)
  grabNow.current = onGrab
  useEffect(() => {
    grabRef.current = () => void grabNow.current()
    return () => {
      grabRef.current = null
    }
  }, [grabRef])

  const onCalibrate = async () => {
    setMessage(null)
    const r = await rec.calibrate()
    setMessage(r.ok ? `Measured ${ms(r.latencySec)}. Takes are now shifted by that amount.` : r.message)
  }

  const patch = (id: string, p: Partial<Take>) => setTakes((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)))

  const keep = async (t: Take) => {
    const blob = new Blob([encodeWav(t.channels, t.sampleRate, 24)], { type: 'audio/wav' })
    download(blob, takeFileName(t.name, t.bpm, t.bars))
    if (!t.loop) {
      patch(t.id, { status: 'kept', note: 'Saved to Downloads. Free takes are not added to the library or the mix, which hold 1, 2, 4 and 8 bar loops.' })
      return
    }
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
    if (t.loop && isActive(t.loop.id)) onAudition(t.loop) // take it out of the mix first
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
            <label className="mono-label flex flex-col gap-1 text-muted">
              Length
              <select value={String(length)} onChange={(e) => setLength(e.target.value === 'free' ? 'free' : (Number(e.target.value) as Bars))} disabled={busy} aria-label="Take length" className="field min-h-9 py-0 text-ink">
                {LENGTHS.map((l) => (
                  <option key={l.label} value={String(l.value)}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <Meter levels={rec.levels} stereo={!mono} />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!busy ? (
              <button type="button" onClick={() => void onRecord()} disabled={rec.status !== 'ready' || !hasStack} className="pill pill-accent min-h-11 px-6 text-[13px]">
                ● Record
              </button>
            ) : (
              <>
                {length === 'free' && rec.status === 'recording' && rec.endsAt === null && (
                  <button type="button" onClick={rec.finish} className="pill pill-accent min-h-11 px-6 text-[13px]">
                    ■ End on the bar
                  </button>
                )}
                <button type="button" onClick={rec.cancel} className="pill pill-outline min-h-11 px-5">
                  Cancel take
                </button>
              </>
            )}
            {!busy && (
              <button type="button" onClick={() => void onGrab()} disabled={rec.status !== 'ready'} className="pill min-h-11 px-6 text-[13px]" title="Keep the 8 bars you just played (G)">
                Grab last {GRAB_BARS} bars
                <span className="chip ml-2 border-current" aria-hidden="true">
                  G
                </span>
              </button>
            )}
            <Progress status={rec.status} startsAt={rec.startsAt} endsAt={rec.endsAt} barSec={rec.barSec} bars={rec.bars} now={rec.now} />
            {!busy && !hasStack && <span className="mono-label text-muted">Tap a drum loop or a sample first: it sets the tempo.</span>}
            {!busy && hasStack && !playing && <span className="mono-label text-muted">Playback starts with the take; you hear {length === 'free' ? 'one bar' : 'the phrase once'} before recording begins.</span>}
          </div>

          <p className="mono-label max-w-2xl normal-case leading-relaxed text-muted">
            Jamming? Loop Lab is always listening while the input is connected. Press G, or the Grab button, to keep the {GRAB_BARS} bars before the last bar line. It works after you stop too, for about a minute.
          </p>

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
            const inMix = !!t.loop && isActive(t.loop.id)
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
                  {t.loop && t.status !== 'kept' && (
                    <button type="button" onClick={() => onAudition(t.loop!)} aria-pressed={inMix} className={['pill min-h-9 px-4', inMix ? 'pill-accent' : 'pill-outline'].join(' ')}>
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

/** "Starts in 2 bars" / "Recording · bar 3 of 4", read off the audio clock. */
function Progress({ status, startsAt, endsAt, barSec, bars, now }: { status: string; startsAt: number | null; endsAt: number | null; barSec: number; bars: number | null; now: () => number }) {
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
  if (t < startsAt) {
    const left = Math.ceil((startsAt - t) / barSec - 1e-6)
    text = left <= 1 ? 'Starts on the next bar' : `Starts in ${left} bars`
  } else {
    const bar = Math.floor((t - startsAt) / barSec) + 1
    text = bars === null ? `Recording · bar ${bar}` : bar > bars ? 'Finishing…' : `Recording · bar ${bar} of ${bars}`
    if (endsAt !== null && bars !== null && t >= endsAt) text = 'Finishing…'
  }
  return (
    <span className="mono-label font-bold text-accent" role="status" aria-live="polite">
      {text}
    </span>
  )
}
