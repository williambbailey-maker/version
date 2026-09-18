import { useState } from 'react'
import type { FormEvent } from 'react'
import { getContext } from '../engine/context'
import type { Bars, Loop, LoopKind } from '../engine/types'
import { parseTagInput, uploadLoop } from '../lib/loops'
import type { Bucket } from '../lib/loops'
import { readableSampleName } from '../lib/naming'
import { estimateLoop, guessBars, keyFromFilename } from '../lib/tempo'
import type { TempoSource } from '../lib/tempo'

type Props = {
  buckets: Bucket[]
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

/** Bare-bones add-a-loop form: detects bpm + bars, uploads the file as-is to Supabase. */
export function Uploader({ buckets, onAdded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [name, setName] = useState('')
  const [autoName, setAutoName] = useState('')
  const [bpm, setBpm] = useState('')
  const [bars, setBars] = useState<Bars>(2)
  const [barsTouched, setBarsTouched] = useState(false)
  const [kind, setKind] = useState<LoopKind>('sample')
  const [tags, setTags] = useState('')
  const [bucketId, setBucketId] = useState('')
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
    const raw = f.name.replace(/\.[^.]+$/, '')
    // Drums/sample heuristic from the name; cheap and easily overridden.
    const isDrums = /drum|beat|kick|perc|break/i.test(f.name)
    setKind(isDrums ? 'drums' : 'sample')
    const base = isDrums ? raw : readableSampleName(raw)
    if (!name || name === autoName) setName(base)
    setAutoName(base)
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
      const loop = await uploadLoop(
        file,
        {
          name: name.trim() || file.name,
          bpm: bpmNum,
          bars,
          kind,
          key: keyFromFilename(file.name),
          duration,
          tags: parseTagInput(tags),
          bucketId: bucketId || null,
        },
        buffer, // already decoded; skip the reload
      )
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
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="pill pill-outline cursor-pointer self-start">
        <input
          type="file"
          accept="audio/*,.wav,.aif,.aiff,.m4a,.mp3"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          className="sr-only"
        />
        {file ? file.name : 'Choose an audio file'}
      </label>

      {detecting && <p className="mono-label text-muted">Detecting tempo…</p>}
      {detected && !detecting && <p className="mono-label text-muted">Auto: {detected}. Edit anything below.</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <label className="mono-label flex flex-col gap-1 text-muted">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field text-ink"
          />
        </label>
        <label className="mono-label flex flex-col gap-1 text-muted">
          BPM
          <input
            inputMode="decimal"
            value={bpm}
            onChange={(e) => onBpm(e.target.value)}
            placeholder="e.g. 92"
            className="field text-ink"
          />
        </label>
        <label className="mono-label flex flex-col gap-1 text-muted">
          Bars
          <select
            value={bars}
            onChange={(e) => {
              setBars(Number(e.target.value) as Bars)
              setBarsTouched(true)
            }}
            className="field text-ink"
          >
            {BARS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="mono-label flex flex-col gap-1 text-muted">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as LoopKind)}
            className="field text-ink"
          >
            <option value="drums">drums</option>
            <option value="sample">sample</option>
          </select>
        </label>
        <label className="mono-label flex flex-col gap-1 text-muted">
          Tags
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="reggae, guitar"
            className="field text-ink"
          />
        </label>
        <label className="mono-label flex flex-col gap-1 text-muted">
          Bucket
          <select
            value={bucketId}
            onChange={(e) => setBucketId(e.target.value)}
            className="field text-ink"
          >
            <option value="">Unsorted</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {duration !== null && (
        <p className={['mono-label', mismatch ? 'tag' : 'text-muted'].join(' ')}>
          file {duration.toFixed(2)}s
          {expected !== null && ` · ${bars} bar${bars > 1 ? 's' : ''} @ ${bpmNum} = ${expected.toFixed(2)}s`}
          {mismatch && ' · lengths differ; bpm + bars will be trusted'}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button type="submit" disabled={!file || !bpmOk || busy || detecting} className="pill">
          {busy ? 'Uploading…' : 'Add to library'}
        </button>
        {error && <p className="mono-label">{error}</p>}
      </div>
    </form>
  )
}
