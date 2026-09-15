import { getContext } from '../engine/context'
import type { Bars, LoopKind } from '../engine/types'
import { WEB_MP3, encodeClick, encodeMp3 } from './encode'
import { existingSourcePaths, uploadBlob, uploadCalibration } from './loops'
import { estimateLoop, guessBars, keyFromFilename } from './tempo'
import type { TempoSource } from './tempo'

export type ItemStatus = 'queued' | 'detecting' | 'encoding' | 'uploading' | 'done' | 'skipped' | 'notempo' | 'failed'

export type BulkItem = {
  id: number
  file: File
  relPath: string
  pack: string | null
  status: ItemStatus
  bpm: number | null
  bars: Bars
  kind: LoopKind
  key: string | null
  source: TempoSource | null
  error: string | null
}

export type BulkOptions = {
  bucketId: string | null
  tags: string[]
  kind: LoopKind | 'auto'
  originals: boolean // upload the file as-is instead of an MP3 preview
}

const DRUMS_RE = /drum|beat|break|perc|kick|top/i

export function makeItems(files: FileList | File[]): BulkItem[] {
  const out: BulkItem[] = []
  let id = 0
  for (const file of Array.from(files)) {
    if (!/\.(wav|aif|aiff|flac|mp3|m4a)$/i.test(file.name)) continue
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    const parts = rel.split('/')
    const pack = parts.length >= 2 ? parts[parts.length - 2]! : null
    out.push({ id: id++, file, relPath: rel, pack, status: 'queued', bpm: null, bars: 2, kind: 'sample', key: null, source: null, error: null })
  }
  return out
}

/**
 * Import a batch in the browser: detect tempo, encode to MP3 off the main
 * thread, upload, register. Sequential, so a phone or laptop stays usable.
 * `update` is called after every status change with the current item.
 */
export async function runBulkImport(
  items: BulkItem[],
  opts: BulkOptions,
  update: (item: BulkItem) => void,
  shouldStop: () => boolean,
): Promise<void> {
  const existing = await existingSourcePaths()
  let calibrated = opts.originals

  for (const item of items) {
    if (shouldStop()) return
    if (item.status !== 'queued') continue
    if (existing.has(item.relPath)) {
      item.status = 'skipped'
      update(item)
      continue
    }
    try {
      item.status = 'detecting'
      update(item)
      const est = await estimateLoop(item.file, (bytes) => getContext().decodeAudioData(bytes))
      if (!est.buffer) throw new Error('Could not decode this file')
      item.key = keyFromFilename(item.file.name)
      item.kind = opts.kind !== 'auto' ? opts.kind : DRUMS_RE.test(item.relPath) ? 'drums' : 'sample'
      item.source = est.source
      if (est.bpm === null) {
        if (item.bpm === null) {
          item.status = 'notempo'
          update(item)
          continue
        }
        item.bars = guessBars(est.buffer.duration, item.bpm) // user-supplied bpm
      } else {
        item.bpm = est.bpm
        item.bars = est.bars
      }

      let blob: Blob = item.file
      let ext = (item.file.name.split('.').pop() ?? 'wav').toLowerCase()
      let contentType = item.file.type || 'application/octet-stream'
      if (!opts.originals) {
        item.status = 'encoding'
        update(item)
        if (!calibrated) {
          await uploadCalibration(WEB_MP3, await encodeClick(est.buffer.sampleRate), 'audio/mpeg')
          calibrated = true
        }
        blob = await encodeMp3(est.buffer)
        ext = WEB_MP3
        contentType = 'audio/mpeg'
      }

      item.status = 'uploading'
      update(item)
      const name = item.file.name.replace(/\.[^.]+$/, '')
      await uploadBlob(blob, ext, contentType, {
        name,
        bpm: item.bpm,
        bars: item.bars,
        kind: item.kind,
        key: item.key,
        duration: est.buffer.duration,
        tags: opts.tags,
        bucketId: opts.bucketId,
        sourcePath: item.relPath,
        pack: item.pack,
      })
      item.status = 'done'
    } catch (e) {
      item.status = 'failed'
      item.error = e instanceof Error ? e.message : String(e)
    }
    update(item)
  }
}
