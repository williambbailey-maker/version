import { useState } from 'react'
import type { FormEvent } from 'react'
import { getContext } from '../engine/context'
import type { Bars, Loop, LoopKind } from '../engine/types'
import { addLocalLoop, guessBars } from '../lib/localLibrary'
import { estimateLoop } from '../lib/tempo'
import type { TempoSource } from '../lib/tempo'

type Props = {
  onAdded: (loop: Loop) => void
}

const BARS: readonly Bars[] = [1, 2, 4, 8]

const SOURCE_LABEL: Record<TempoSource, string> = {
  filename: 'bpm from filename, bars from length',
  'length+audio': 'bpm from audio, snapped to file length',
  audio: 'bpm from audio (file is not trimmed to a bar)',
  length: 'bpm guessed from file length only',
  none: 'could not detect tempo',
}

/** Bare-bones add-a-loop form. Detects bpm + bars; every field stays editable. */
export function Uploader({ onAdded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [name, setName] = useState('')
  const [autoName, setAutoName] = useState('')
  const [bpm, setBpm] = useState('')
  const [bars, setBars] = useState<Bars>(2)
  const [barsTouched, setBarsTouched] = useState(false)
  const [kind, setKind] = useState<LoopKind>('sample')
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bpmNum = Number(bpm)
  const bpmOk = Number.isFinite(bpmNum) && bpmNum > 0
  const duration = buffer?.duration ?? null

  const onFile = async (f: File | null) => {
    setFile(f)
    setBuffer(null)
    setDetected(null)
    setError(null)
    setBarsTouched(false)
    if (!f) return
    const base = f.name.replace(/\.[^.]+$/, '')
    if (!name || name === autoName) setName(base)
    setAutoName(base)
    // Drums/sample heuristic from the name; cheap and easily overridden.
    setKind(/drum|beat|kick|perc|break/i.test(f.name) ? 'drums' : 'sample')
    setDetecting(true)
    try {
      const est = await estimateLoop(f, (bytes) => getContext().decodeAudioData(bytes))
      setBuffer(est.buffer)
      if (est.bpm !== null) {
        setBpm(String(est.bpm))
        setBars(est.bars)
        setDetected(SOURCE_LABEL[est.source])
      } else {
        setDetected(est.buffer ? SOURCE_LABEL.none : 'could not decode this file')
      }
    } catch (err) {
      setDetected(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDetecting(false)
    }
  }

  const onBpm = (v: string) => {
    setBpm(v)
    const n = Number(v)
    if (!barsTouched && duration && Number.isFinite(n) && n > 0) setBars(guessBars(duration, n))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !bpmOk) return
    setBusy(true)
    setError(null)
    try {
      const loop = await addLocalLoop(file, { name: name.trim() || file.name, bpm: bpmNum, bars, kind })
      if (buffer) loop.buffer = buffer // already decoded; skip the reload
      onAdded(loop)
      setFile(null)
      setBuffer(null)
      setName('')
      setAutoName('')
      setBpm('')
      setDetected(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const expected = bpmOk ? (bars * 240) / bpmNum : null
  const mismatch = duration !== null && expected !== null && Math.abs(duration - expected) / expected > 0.02

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-stone-300 bg-white p-4">
      <h2 className="text-sm uppercase tracking-wide text-stone-500">Add a loop</h2>

      <input
        type="file"
        accept="audio/*,.wav,.aif,.aiff,.m4a,.mp3"
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />

      {detecting && <p className="text-xs text-stone-500">Detecting tempo…</p>}
      {detected && !detecting && <p className="text-xs text-stone-500">Auto: {detected}. Edit anything below.</p>}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-stone-300 px-2 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          BPM
          <input
            inputMode="decimal"
            value={bpm}
            onChange={(e) => onBpm(e.target.value)}
            placeholder="e.g. 92"
            className="rounded border border-stone-300 px-2 py-2 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Bars
          <select
            value={bars}
            onChange={(e) => {
              setBars(Number(e.target.value) as Bars)
              setBarsTouched(true)
            }}
            className="rounded border border-stone-300 px-2 py-2 font-mono"
          >
            {BARS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LoopKind)}
            className="rounded border border-stone-300 px-2 py-2"
          >
            <option value="drums">drums</option>
            <option value="sample">sample</option>
          </select>
        </label>
      </div>

      {duration !== null && (
        <p className={['font-mono text-xs', mismatch ? 'text-amber-700' : 'text-stone-500'].join(' ')}>
          file {duration.toFixed(2)}s
          {expected !== null && ` · ${bars} bar${bars > 1 ? 's' : ''} @ ${bpmNum} = ${expected.toFixed(2)}s`}
          {mismatch && ' · lengths differ; bpm + bars will be trusted'}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || !bpmOk || busy || detecting}
        className="min-h-12 rounded bg-stone-900 px-4 text-white disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Add'}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  )
}
