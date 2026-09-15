import { useRef, useState } from 'react'
import type { LoopKind } from '../engine/types'
import { makeItems, rootFolderName, runBulkImport } from '../lib/bulk'
import type { BulkItem, BulkOptions } from '../lib/bulk'
import type { Bucket, PackPatch } from '../lib/loops'
import { parseTagInput } from '../lib/loops'
import { fetchPackInfo } from '../lib/packinfo'

type Props = {
  buckets: Bucket[]
  onDone: () => void
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
export function BulkImport({ buckets, onDone }: Props) {
  const [items, setItems] = useState<BulkItem[]>([])
  const [bucketId, setBucketId] = useState('')
  const [tags, setTags] = useState('')
  const [kind, setKind] = useState<LoopKind | 'auto'>('auto')
  const [originals, setOriginals] = useState(false)
  const [packMode, setPackMode] = useState<'one' | 'folders'>('one')
  const [packName, setPackName] = useState('')
  const [packUrl, setPackUrl] = useState('')
  const [packInfo, setPackInfo] = useState<PackPatch | null>(null)
  const [fetching, setFetching] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef(false)

  const pick = (files: FileList | null) => {
    if (!files) return
    setItems(makeItems(files))
    const root = rootFolderName(files)
    if (root && !packName) setPackName(root)
    setError(null)
  }

  const fetchInfo = async () => {
    if (!packUrl.trim()) return
    setFetching(true)
    setError(null)
    try {
      const info = await fetchPackInfo(packUrl)
      setPackInfo({ publisher: info.publisher, description: info.description, coverUrl: info.image, genres: info.genres, url: info.url })
      if (info.title && !packName) setPackName(info.title)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(false)
    }
  }

  const setBpm = (id: number, v: string) => {
    const n = Number(v)
    setItems((its) => its.map((it) => (it.id === id ? { ...it, bpm: Number.isFinite(n) && n > 0 ? n : null, status: 'queued' } : it)))
  }

  const start = async () => {
    stop.current = false
    setRunning(true)
    setError(null)
    const name = packName.trim()
    if (packMode === 'one' && !name) {
      setError('Give the pack a name first.')
      setRunning(false)
      return
    }
    const opts: BulkOptions = {
      bucketId: bucketId || null,
      tags: parseTagInput(tags),
      kind,
      originals,
      packMode,
      packName: packMode === 'one' ? name : null,
      packInfo: packMode === 'one' ? { ...(packInfo ?? {}), url: packInfo?.url ?? (packUrl.trim() || null) } : null,
    }
    const work = items.map((it) => ({ ...it, status: it.status === 'notempo' && it.bpm === null ? 'notempo' : it.status === 'done' || it.status === 'skipped' ? it.status : 'queued' })) as BulkItem[]
    setItems(work)
    try {
      await runBulkImport(work, opts, (item) => setItems((its) => its.map((it) => (it.id === item.id ? { ...item } : it))), () => stop.current)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      onDone()
    }
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
      <div className="flex flex-wrap gap-2">
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

      <div className="flex flex-col gap-3 border border-line p-4">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPackMode('one')} className={['pill', packMode === 'one' ? '' : 'pill-outline'].join(' ')} disabled={running}>
            This folder is one pack
          </button>
          <button type="button" onClick={() => setPackMode('folders')} className={['pill', packMode === 'folders' ? '' : 'pill-outline'].join(' ')} disabled={running}>
            One pack per sub-folder
          </button>
        </div>
        {packMode === 'one' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
            <label className="mono-label flex flex-col gap-1 text-muted">
              Pack name
              <input value={packName} onChange={(e) => setPackName(e.target.value)} placeholder="From the folder name" className="field text-ink" disabled={running} />
            </label>
            <label className="mono-label flex flex-col gap-1 text-muted">
              Pack link (Splice, shop page…)
              <input value={packUrl} onChange={(e) => setPackUrl(e.target.value)} placeholder="https://…" className="field text-ink" disabled={running} />
            </label>
            <button type="button" onClick={() => void fetchInfo()} disabled={fetching || running || !packUrl.trim()} className="pill pill-outline self-end">
              {fetching ? 'Reading…' : 'Fetch info'}
            </button>
            {packInfo && (
              <div className="flex gap-4 md:col-span-3">
                {packInfo.coverUrl && <img src={packInfo.coverUrl} alt="" className="grain h-20 w-20 object-cover" />}
                <div className="mono-label flex flex-col gap-1 text-muted">
                  {packInfo.publisher && <span className="text-ink">{packInfo.publisher}</span>}
                  {packInfo.genres && packInfo.genres.length > 0 && <span>{packInfo.genres.join(' · ')}</span>}
                  {packInfo.description && <span className="line-clamp-3 normal-case tracking-normal">{packInfo.description}</span>}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="mono-label text-muted">Each first-level folder becomes a pack; deeper folders become categories.</p>
        )}
      </div>

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
