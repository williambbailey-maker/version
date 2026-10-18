import { useRef, useState } from 'react'
import { getContext } from '../engine/context'
import type { Bars } from '../engine/types'
import { makeDroppedItems, runBulkImport } from '../lib/bulk'
import type { BulkItem } from '../lib/bulk'
import { dragHasFiles, readDrop } from '../lib/drop'
import type { DroppedFile } from '../lib/drop'
import { download, exportName, renderAtTempo } from '../lib/retempo'
import { estimateLoop, guessBars } from '../lib/tempo'
import { audioBufferToWav } from '../lib/wav'
import { buildZip } from '../lib/zip'

type Row = {
  id: number
  file: File
  path: string
  buffer: AudioBuffer | null
  native: number | null // the loop's own BPM (editable)
  bars: Bars
  target: number | null // export BPM (editable)
  status: 'detecting' | 'ready' | 'notempo' | 'rendering' | 'done' | 'failed'
  note: string | null
}

type Props = {
  masterBPM: number
  onUploaded: () => void
}

const BARS: Bars[] = [1, 2, 4, 8]

/**
 * Drop loops in, see their tempo, type the tempo you want, and export
 * 24-bit WAVs at that tempo (varispeed, trimmed to the bar). The same
 * files can be sent to the library as untouched originals.
 */
export function Retempo({ masterBPM, onUploaded }: Props) {
  const [rows, setRows] = useState<Row[]>([])
  const [over, setOver] = useState(false)
  const [all, setAll] = useState('')
  const [busy, setBusy] = useState<'export' | 'upload' | null>(null)
  const [uploadNote, setUploadNote] = useState<string | null>(null)
  const nextId = useRef(0)

  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const add = async (files: DroppedFile[]) => {
    const fresh: Row[] = files
      .filter((f) => /\.(wav|aif|aiff|flac|mp3|m4a)$/i.test(f.file.name))
      .map((f) => ({ id: nextId.current++, file: f.file, path: f.path, buffer: null, native: null, bars: 2, target: null, status: 'detecting', note: null }))
    if (fresh.length === 0) return
    setRows((rs) => [...rs, ...fresh])
    const ctx = getContext()
    for (const r of fresh) {
      try {
        const est = await estimateLoop(r.file, (bytes) => ctx.decodeAudioData(bytes))
        if (!est.buffer) {
          patch(r.id, { status: 'failed', note: 'Could not decode this file.' })
          continue
        }
        patch(r.id, { buffer: est.buffer, native: est.bpm, bars: est.bars, target: est.bpm, status: est.bpm === null ? 'notempo' : 'ready', note: est.bpm === null ? 'No tempo found: type it.' : null })
      } catch (e) {
        patch(r.id, { status: 'failed', note: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  const pick = (list: FileList | null) => {
    if (!list) return
    void add(Array.from(list).map((file) => ({ file, path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name })))
  }

  const setNative = (r: Row, v: string) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n <= 0) {
      patch(r.id, { native: null, status: 'notempo' })
      return
    }
    const bars = r.buffer ? guessBars(r.buffer.duration, n) : r.bars
    patch(r.id, { native: n, bars, status: r.buffer ? 'ready' : r.status, note: null, target: r.target ?? n })
  }

  const setTarget = (r: Row, v: string) => {
    const n = Math.round(Number(v))
    patch(r.id, { target: Number.isFinite(n) && n > 0 ? n : null })
  }

  const applyAll = (v: number) => setRows((rs) => rs.map((r) => ({ ...r, target: v })))

  const exportable = rows.filter((r) => r.buffer && r.native !== null && r.target !== null)

  const renderRow = async (r: Row): Promise<Blob> => {
    if (!r.buffer || r.native === null || r.target === null) throw new Error('Set the BPMs first')
    const out = await renderAtTempo(r.buffer, r.native, r.bars, r.target)
    return audioBufferToWav(out, 24)
  }

  const exportOne = async (r: Row) => {
    patch(r.id, { status: 'rendering', note: null })
    try {
      download(await renderRow(r), exportName(r.file.name, r.target!))
      patch(r.id, { status: 'done', note: `Exported at ${r.target} BPM.` })
    } catch (e) {
      patch(r.id, { status: 'failed', note: e instanceof Error ? e.message : String(e) })
    }
  }

  const exportAll = async () => {
    if (exportable.length === 0) return
    setBusy('export')
    try {
      const entries = []
      for (const r of exportable) {
        patch(r.id, { status: 'rendering' })
        const blob = await renderRow(r)
        entries.push({ name: exportName(r.file.name, r.target!), data: new Uint8Array(await blob.arrayBuffer()) })
        patch(r.id, { status: 'done', note: `Exported at ${r.target} BPM.` })
      }
      const targets = new Set(exportable.map((r) => r.target))
      const label = targets.size === 1 ? `${[...targets][0]}bpm` : 'mixed'
      download(new Blob([buildZip(entries)], { type: 'application/zip' }), `looplab ${label}.zip`)
    } catch (e) {
      setUploadNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  /** Send the files to the library as they are (no MP3), with the BPMs shown here. */
  const upload = async () => {
    const ready = rows.filter((r) => r.buffer && r.native !== null)
    if (ready.length === 0) return
    setBusy('upload')
    setUploadNote(null)
    const items: BulkItem[] = makeDroppedItems(ready.map((r) => ({ file: r.file, path: r.path }))).map((it, i) => ({ ...it, bpm: ready[i]!.native, bars: ready[i]!.bars }))
    let done = 0
    try {
      await runBulkImport(
        items,
        { bucketId: null, tags: [], kind: 'sample', originals: true, keepBpm: true, packMode: 'folders', packName: null, packInfo: null },
        (it) => {
          if (it.status === 'done' || it.status === 'skipped' || it.status === 'failed') done++
          setUploadNote(`Uploading originals… ${done} / ${items.length}`)
        },
        () => false,
      )
      const failed = items.filter((it) => it.status === 'failed').length
      const skipped = items.filter((it) => it.status === 'skipped').length
      setUploadNote(`Uploaded ${items.length - failed - skipped} as WAV originals${skipped ? `, ${skipped} already there` : ''}${failed ? `, ${failed} failed` : ''}.`)
      onUploaded()
    } catch (e) {
      setUploadNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          if (!dragHasFiles(e.dataTransfer)) return
          e.preventDefault()
          setOver(true)
        }}
        onDragEnter={(e) => {
          if (!dragHasFiles(e.dataTransfer)) return
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void readDrop(e.dataTransfer).then(add)
        }}
        className={['flex flex-col items-center gap-3 border-[1.5px] border-dashed p-6 text-center transition-colors duration-200', over ? 'border-accent bg-accent/5' : 'border-line'].join(' ')}
      >
        <p className="headline text-2xl">Drop loops to re-tempo</p>
        <p className="mono-label max-w-md text-muted">Each file is read at full quality. Set the tempo you want, export 24-bit WAVs, and send the originals to the library if you like.</p>
        <label className="pill pill-outline cursor-pointer">
          <input type="file" multiple accept="audio/*,.wav,.aif,.aiff,.flac,.mp3,.m4a" onChange={(e) => pick(e.target.files)} className="sr-only" />
          Choose files
        </label>
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="mono-label flex flex-col gap-1 text-muted">
              Export everything at
              <input value={all} onChange={(e) => setAll(e.target.value)} placeholder={String(masterBPM)} inputMode="numeric" className="field w-24 text-ink" aria-label="BPM for every file" />
            </label>
            <button type="button" onClick={() => { const n = Math.round(Number(all)); if (n > 0) applyAll(n) }} disabled={!(Math.round(Number(all)) > 0)} className="pill pill-outline">
              Apply to all
            </button>
            <button type="button" onClick={() => applyAll(masterBPM)} className="pill pill-outline" title="Match the drum loop that's playing">
              Match drums · {masterBPM}
            </button>
            <span className="flex-1" />
            <button type="button" onClick={() => void exportAll()} disabled={busy !== null || exportable.length === 0} className="pill">
              {busy === 'export' ? 'Rendering…' : `Export ${exportable.length} as ZIP`}
            </button>
            <button type="button" onClick={() => void upload()} disabled={busy !== null || rows.every((r) => !r.buffer)} className="pill pill-outline">
              {busy === 'upload' ? 'Uploading…' : 'Upload originals to library'}
            </button>
            <button type="button" onClick={() => setRows([])} disabled={busy !== null} className="pill pill-outline">
              Clear
            </button>
          </div>
          {uploadNote && <p className="mono-label text-muted">{uploadNote}</p>}

          <div className="mono-label hidden grid-cols-[1fr_6rem_5rem_6rem_9rem_7rem] gap-3 border-b border-line py-2 text-muted md:grid">
            <span>File</span>
            <span>Its BPM</span>
            <span>Bars</span>
            <span>Export at</span>
            <span>Status</span>
            <span />
          </div>
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="grid grid-cols-2 items-center gap-3 border-b border-line py-2 md:grid-cols-[1fr_6rem_5rem_6rem_9rem_7rem]">
                <span className="col-span-2 min-w-0 truncate text-sm font-bold md:col-span-1" title={r.path}>
                  {r.file.name}
                  {r.buffer && <span className="mono-label ml-2 text-muted">{r.buffer.sampleRate / 1000}k · {r.buffer.numberOfChannels === 1 ? 'mono' : 'stereo'}</span>}
                </span>
                <input value={r.native ?? ''} onChange={(e) => setNative(r, e.target.value)} placeholder="BPM?" inputMode="numeric" aria-label={`Native BPM for ${r.file.name}`} className="field min-h-8 w-full py-0" />
                <select value={r.bars} onChange={(e) => patch(r.id, { bars: Number(e.target.value) as Bars })} aria-label={`Bars for ${r.file.name}`} className="field min-h-8 w-full py-0">
                  {BARS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <input value={r.target ?? ''} onChange={(e) => setTarget(r, e.target.value)} placeholder="BPM" inputMode="numeric" aria-label={`Export BPM for ${r.file.name}`} className="field min-h-8 w-full py-0" />
                <span className={['mono-label', r.status === 'failed' ? 'text-accent' : 'text-muted'].join(' ')}>
                  {r.status === 'detecting' ? 'Reading…' : r.status === 'rendering' ? 'Rendering…' : (r.note ?? (r.native !== null && r.target !== null ? `${r.target > r.native ? '+' : ''}${Math.round((r.target / r.native - 1) * 100)}%` : ''))}
                </span>
                <span className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => void exportOne(r)} disabled={!r.buffer || r.native === null || r.target === null || busy !== null} className="pill min-h-7 px-3">
                    WAV
                  </button>
                  <button type="button" aria-label={`Remove ${r.file.name}`} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="pill pill-outline min-h-7 px-2.5">
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
