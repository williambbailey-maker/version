import { useEffect, useRef, useState } from 'react'
import type { LoopKind } from '../engine/types'
import { makeDroppedItems, makeItems, rootFolderName, runBulkImport } from '../lib/bulk'
import type { BulkItem, BulkOptions } from '../lib/bulk'
import { dragHasFiles, readDrop } from '../lib/drop'
import type { DroppedFile } from '../lib/drop'
import type { Bucket } from '../lib/loops'
import { parseTagInput } from '../lib/loops'

export type Drop = { files: DroppedFile[]; nonce: number }

type Props = {
  buckets: Bucket[]
  onDone: () => void
  /** Folders dropped elsewhere (the basket). A new nonce starts an import. */
  dropped?: Drop | null
}

const STATUS_LABEL: Record<BulkItem['status'], string> = {
  queued: 'Queued',
  detecting: 'Detecting…',
  encoding: 'Encoding…',
  uploading: 'Uploading…',
  done: 'Done',
  skipped: 'Already in library',
  notempo: 'No tempo found',
  failed: 'Failed',
}

/** Import a folder or a batch of files from the browser: detect, encode to MP3, upload. */
export function BulkImport({ buckets, onDone, dropped }: Props) {
  const [items, setItems] = useState<BulkItem[]>([])
  const [bucketId, setBucketId] = useState('')
  const [tags, setTags] = useState('')
  const [kind, setKind] = useState<LoopKind | 'auto'>('auto')
  const [originals, setOriginals] = useState(false)
  const [packMode, setPackMode] = useState<'one' | 'folders'>('one')
  const [packName, setPackName] = useState('')
  const [running, setRunning] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef(false)
  const runningRef = useRef(false)

  const pick = (files: FileList | null) => {
    if (!files) return
    setItems(makeItems(files))
    const root = rootFolderName(files)
    if (root && !packName) setPackName(root)
    setError(null)
  }

  const setBpm = (id: number, v: string) => {
    const n = Number(v)
    setItems((its) => its.map((it) => (it.id === id ? { ...it, bpm: Number.isFinite(n) && n > 0 ? n : null, status: 'queued' } : it)))
  }

  const optionsFor = (mode: 'one' | 'folders', name: string | null): BulkOptions => ({
    bucketId: bucketId || null,
    tags: parseTagInput(tags),
    kind,
    originals,
    packMode: mode,
    packName: mode === 'one' ? name : null,
    packInfo: null,
  })

  const run = async (source: BulkItem[], opts: BulkOptions) => {
    if (runningRef.current) return
    stop.current = false
    runningRef.current = true
    setRunning(true)
    setError(null)
    const work = source.map((it) => ({ ...it, status: it.status === 'notempo' && it.bpm === null ? 'notempo' : it.status === 'done' || it.status === 'skipped' ? it.status : 'queued' })) as BulkItem[]
    setItems(work)
    try {
      await runBulkImport(work, opts, (item) => setItems((its) => its.map((it) => (it.id === item.id ? { ...item } : it))), () => stop.current)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      runningRef.current = false
      setRunning(false)
      onDone()
    }
  }

  const start = async () => {
    const name = packName.trim()
    if (packMode === 'one' && !name) {
      setError('Give the pack a name first.')
      return
    }
    await run(items, optionsFor(packMode, name))
  }

  /** A dropped folder imports straight away: its name is the pack. */
  const importDrop = (files: DroppedFile[]) => {
    const next = makeDroppedItems(files)
    if (next.length === 0) {
      setError('No audio files in that drop (wav, aif, flac, mp3, m4a).')
      return
    }
    setPackMode('folders')
    void run(next, optionsFor('folders', null))
  }

  const lastNonce = useRef<number | null>(null)
  useEffect(() => {
    if (!dropped || dropped.nonce === lastNonce.current) return
    lastNonce.current = dropped.nonce
    importDrop(dropped.files)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropped])

  const onDragOver = (e: React.DragEvent) => {
    if (!dragHasFiles(e.dataTransfer)) return
    e.preventDefault()
    setOver(true)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    void readDrop(e.dataTransfer).then(importDrop, (err) => setError(err instanceof Error ? err.message : String(err)))
  }

  const counts = items.reduce(
    (c, it) => {
      c[it.status] = (c[it.status] ?? 0) + 1
      return c
    },
    {} as Partial<Record<BulkItem['status'], number>>,
  )
  const done = (counts.done ?? 0) + (counts.skipped ?? 0) + (counts.failed ?? 0) + (counts.notempo ?? 0)
  const pending = items.filter((it) => it.status === 'queued').length

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={['flex flex-col items-center gap-3 border-[1.5px] border-dashed p-6 text-center transition-colors duration-200', over ? 'border-accent bg-accent/5' : 'border-line'].join(' ')}
      >
        <p className="headline text-2xl">Drop folders here</p>
        <p className="mono-label max-w-md text-muted">Each folder becomes a pack and starts importing straight away. Sub-folders become categories. Or pick from your computer:</p>
        <div className="flex flex-wrap justify-center gap-2">
          <label className="pill pill-outline cursor-pointer">
            <input type="file" multiple accept="audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a" onChange={(e) => pick(e.target.files)} className="sr-only" disabled={running} />
            Choose files
          </label>
          <label className="pill pill-outline cursor-pointer">
            <input
              type="file"
              onChange={(e) => pick(e.target.files)}
              className="sr-only"
              disabled={running}
              // Folder picking; supported on desktop browsers.
              {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            />
            Choose a folder
          </label>
        </div>
      </div>

      {items.length > 0 && !running && (
        <div className="flex flex-col gap-3 border border-line p-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setPackMode('one')} className={['pill', packMode === 'one' ? '' : 'pill-outline'].join(' ')}>
              This folder is one pack
            </button>
            <button type="button" onClick={() => setPackMode('folders')} className={['pill', packMode === 'folders' ? '' : 'pill-outline'].join(' ')}>
              One pack per folder
            </button>
          </div>
          {packMode === 'one' ? (
            <label className="mono-label flex flex-col gap-1 text-muted md:max-w-sm">
              Pack name
              <input value={packName} onChange={(e) => setPackName(e.target.value)} placeholder="From the folder name" className="field text-ink" />
            </label>
          ) : (
            <p className="mono-label text-muted">Each top-level folder becomes a pack; deeper folders become categories.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <label className="mono-label flex flex-col gap-1 text-muted">
          Bucket
          <select value={bucketId} onChange={(e) => setBucketId(e.target.value)} className="field text-ink" disabled={running}>
            <option value="">Unsorted</option>
            {buckets.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
        <label className="mono-label flex flex-col gap-1 text-muted">
          Tags for all
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="reggae, guitar" className="field text-ink" disabled={running} />
        </label>
        <label className="mono-label flex flex-col gap-1 text-muted">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as LoopKind | 'auto')} className="field text-ink" disabled={running}>
            <option value="auto">Auto from name</option>
            <option value="drums">All drums</option>
            <option value="sample">All samples</option>
          </select>
        </label>
        <label className="mono-label flex items-end gap-2 pb-3 text-muted">
          <input type="checkbox" checked={originals} onChange={(e) => setOriginals(e.target.checked)} disabled={running} />
          Upload originals (no MP3, ~20× storage)
        </label>
      </div>

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {!running ? (
              <button type="button" onClick={() => void start()} disabled={pending === 0} className="pill">
                Import {pending} file{pending === 1 ? '' : 's'}
              </button>
            ) : (
              <button type="button" onClick={() => (stop.current = true)} className="pill pill-outline">
                Stop after this file
              </button>
            )}
            <span className="mono-label text-muted">
              {done} / {items.length} · done {counts.done ?? 0} · skipped {counts.skipped ?? 0} · no tempo {counts.notempo ?? 0} · failed {counts.failed ?? 0}
            </span>
          </div>
          <div className="h-1 w-full bg-ink/10">
            <div className="h-1 bg-ink transition-[width] duration-300 ease-linear" style={{ width: `${(done / items.length) * 100}%` }} />
          </div>
          <ul className="max-h-96 overflow-y-auto border-t border-line">
            {items.map((it) => (
              <li key={it.id} className="mono-label grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-2 md:grid-cols-[1fr_10rem_10rem]">
                <span className="min-w-0 truncate" title={it.relPath}>
                  {it.relPath}
                  {it.error && <span className="ml-2 text-muted">{it.error}</span>}
                </span>
                <span className="text-muted">
                  {it.bpm !== null ? `${it.bpm} · ${it.bars}b · ${it.kind}${it.key ? ' · ' + it.key : ''}` : it.status === 'notempo' ? (
                    <input
                      inputMode="decimal"
                      placeholder="BPM?"
                      onBlur={(e) => setBpm(it.id, e.target.value)}
                      className="field min-h-7 w-20 py-0"
                      aria-label={`BPM for ${it.relPath}`}
                    />
                  ) : ''}
                </span>
                <span className={['md:text-right', it.status === 'done' ? 'text-ink' : 'text-muted'].join(' ')}>{STATUS_LABEL[it.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="tag">{error}</p>}
    </div>
  )
}
