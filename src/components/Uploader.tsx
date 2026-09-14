import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Bars, Loop, LoopKind } from '../engine/types'
import { addLocalLoop, audioDuration, guessBars } from '../lib/localLibrary'

type Props = {
  onAdded: (loop: Loop) => void
}

const BARS: readonly Bars[] = [1, 2, 4, 8]

/** Bare-bones add-a-loop form. Stores the file locally; phase 3 uploads to Supabase. */
export function Uploader({ onAdded }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [bpm, setBpm] = useState('')
  const [bars, setBars] = useState<Bars>(2)
  const [kind, setKind] = useState<LoopKind>('sample')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return
    let cancelled = false
    void audioDuration(file).then((d) => {
      if (!cancelled) setDuration(d)
    })
    return () => {
      cancelled = true
    }
  }, [file])

  const bpmNum = Number(bpm)
  const bpmOk = Number.isFinite(bpmNum) && bpmNum > 0

  useEffect(() => {
    if (duration && bpmOk) setBars(guessBars(duration, bpmNum))
  }, [duration, bpmOk, bpmNum])

  const onFile = (f: File | null) => {
    setFile(f)
    setDuration(null)
    setError(null)
    if (f && !name) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !bpmOk) return
    setBusy(true)
    setError(null)
    try {
      const loop = await addLocalLoop(file, { name: name.trim() || file.name, bpm: bpmNum, bars, kind })
      onAdded(loop)
      setFile(null)
      setDuration(null)
      setName('')
      setBpm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const expected = bpmOk ? (bars * 240) / bpmNum : null

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg border border-stone-300 bg-white p-4">
      <h2 className="text-sm uppercase tracking-wide text-stone-500">Add a loop</h2>

      <input
        type="file"
        accept="audio/*,.wav,.aif,.aiff,.m4a,.mp3"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="text-sm"
      />

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
            onChange={(e) => setBpm(e.target.value)}
            placeholder="e.g. 92"
            className="rounded border border-stone-300 px-2 py-2 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Bars
          <select
            value={bars}
            onChange={(e) => setBars(Number(e.target.value) as Bars)}
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
        <p className="font-mono text-xs text-stone-500">
          file {duration.toFixed(2)}s
          {expected !== null && ` · ${bars} bar${bars > 1 ? 's' : ''} @ ${bpmNum} = ${expected.toFixed(2)}s`}
        </p>
      )}

      <button
        type="submit"
        disabled={!file || !bpmOk || busy}
        className="min-h-12 rounded bg-stone-900 px-4 text-white disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Add'}
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  )
}
