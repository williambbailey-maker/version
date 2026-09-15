import type { Bars, Loop, LoopKind } from '../engine/types'
import { BUCKET, supabase } from './supabase'

/** Row shape of public.loops. */
type LoopRow = {
  id: string
  name: string
  storage_path: string
  original_path: string | null
  pack: string | null
  bpm: number | string
  bars: number
  kind: LoopKind
  key: string | null
  gain: number | string
  duration: number | string | null
  tags: string[] | null
  bucket_id: string | null
  pack_id: string | null
  category: string | null
  created_at: string
}

export type Bucket = { id: string; name: string }

export type Pack = {
  id: string
  name: string
  publisher: string | null
  description: string | null
  url: string | null
  coverUrl: string | null
  genres: string[]
  notes: string | null
}

const LOOP_COLUMNS = 'id,name,storage_path,original_path,pack,bpm,bars,kind,key,gain,duration,tags,bucket_id,pack_id,category,created_at'
const PACK_COLUMNS = 'id,name,publisher,description,url,cover_url,genres,notes'

function fromRow(r: LoopRow): Loop {
  return {
    id: r.id,
    name: r.name,
    url: '',
    bpm: Number(r.bpm),
    bars: r.bars as Bars,
    kind: r.kind,
    gain: Number(r.gain),
    storagePath: r.storage_path,
    key: r.key,
    pack: r.pack,
    tags: r.tags ?? [],
    bucketId: r.bucket_id,
    packId: r.pack_id,
    category: r.category,
  }
}

type PackRow = { id: string; name: string; publisher: string | null; description: string | null; url: string | null; cover_url: string | null; genres: string[] | null; notes: string | null }

function packFromRow(r: PackRow): Pack {
  return { id: r.id, name: r.name, publisher: r.publisher, description: r.description, url: r.url, coverUrl: r.cover_url, genres: r.genres ?? [], notes: r.notes }
}

export async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

export async function listLoops(): Promise<Loop[]> {
  const { data, error } = await supabase
    .from('loops')
    .select(LOOP_COLUMNS)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LoopRow[]).map(fromRow)
}

// ---- packs ------------------------------------------------------------------

export async function listPacks(): Promise<Pack[]> {
  const { data, error } = await supabase.from('packs').select(PACK_COLUMNS).order('name')
  if (error) throw new Error(error.message)
  return (data as PackRow[]).map(packFromRow)
}

export type PackPatch = Partial<Omit<Pack, 'id'>>

export async function updatePack(id: string, patch: PackPatch): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.publisher !== undefined) row.publisher = patch.publisher
  if (patch.description !== undefined) row.description = patch.description
  if (patch.url !== undefined) row.url = patch.url
  if (patch.coverUrl !== undefined) row.cover_url = patch.coverUrl
  if (patch.genres !== undefined) row.genres = normalizeTags(patch.genres)
  if (patch.notes !== undefined) row.notes = patch.notes
  const { error } = await supabase.from('packs').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Find or create a pack by name; returns its id. Optional info fills in
 * blanks on an existing pack (never overwrites what's already set).
 */
export async function ensurePack(name: string, info?: PackPatch): Promise<string> {
  const found = await supabase.from('packs').select(PACK_COLUMNS).eq('name', name).maybeSingle()
  if (found.error) throw new Error(found.error.message)
  if (found.data) {
    const existing = packFromRow(found.data as PackRow)
    if (info) {
      const fill: PackPatch = {}
      if (!existing.publisher && info.publisher) fill.publisher = info.publisher
      if (!existing.description && info.description) fill.description = info.description
      if (!existing.url && info.url) fill.url = info.url
      if (!existing.coverUrl && info.coverUrl) fill.coverUrl = info.coverUrl
      if (existing.genres.length === 0 && info.genres && info.genres.length) fill.genres = info.genres
      if (Object.keys(fill).length) await updatePack(existing.id, fill)
    }
    return existing.id
  }
  const row: Record<string, unknown> = { name }
  if (info?.publisher) row.publisher = info.publisher
  if (info?.description) row.description = info.description
  if (info?.url) row.url = info.url
  if (info?.coverUrl) row.cover_url = info.coverUrl
  if (info?.genres?.length) row.genres = normalizeTags(info.genres)
  const made = await supabase.from('packs').insert(row).select('id').single()
  if (made.error) throw new Error(made.error.message)
  return (made.data as { id: string }).id
}

/** Deletes the pack row; its loops keep playing but become unpacked. */
export async function deletePack(id: string): Promise<void> {
  const { error } = await supabase.from('packs').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- buckets ----------------------------------------------------------------

export async function listBuckets(): Promise<Bucket[]> {
  const { data, error } = await supabase.from('buckets').select('id,name').order('name')
  if (error) throw new Error(error.message)
  return data as Bucket[]
}

export async function createBucket(name: string): Promise<Bucket> {
  const { data, error } = await supabase.from('buckets').insert({ name: name.trim() }).select('id,name').single()
  if (error) throw new Error(error.message)
  return data as Bucket
}

/** Deletes the bucket; its loops become unsorted (bucket_id null). */
export async function deleteBucket(id: string): Promise<void> {
  const { error } = await supabase.from('buckets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- edits ------------------------------------------------------------------

export type LoopPatch = Partial<Pick<Loop, 'name' | 'tags' | 'bucketId' | 'gain' | 'bpm' | 'bars' | 'kind' | 'packId' | 'category'>>

export async function updateLoop(id: string, patch: LoopPatch): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.tags !== undefined) row.tags = normalizeTags(patch.tags)
  if (patch.bucketId !== undefined) row.bucket_id = patch.bucketId
  if (patch.gain !== undefined) row.gain = patch.gain
  if (patch.bpm !== undefined) row.bpm = patch.bpm
  if (patch.bars !== undefined) row.bars = patch.bars
  if (patch.kind !== undefined) row.kind = patch.kind
  if (patch.packId !== undefined) row.pack_id = patch.packId
  if (patch.category !== undefined) row.category = patch.category
  const { error } = await supabase.from('loops').update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Lower-case, trimmed, de-duplicated, no leading '#'. */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = []
  for (const t of tags) {
    const v = t.trim().replace(/^#/, '').toLowerCase()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

export function parseTagInput(text: string): string[] {
  return normalizeTags(text.split(/[,\s]+/))
}

// ---- signed URLs ------------------------------------------------------------

const SIGN_TTL = 60 * 60 // seconds
const signed = new Map<string, { url: string; expires: number }>()

export async function signedUrl(path: string): Promise<string> {
  const hit = signed.get(path)
  if (hit && hit.expires > Date.now() + 60_000) return hit.url
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGN_TTL)
  if (error) throw new Error(`Could not sign ${path}: ${error.message}`)
  signed.set(path, { url: data.signedUrl, expires: Date.now() + SIGN_TTL * 1000 })
  return data.signedUrl
}

/** Fill `loop.url` with a fresh signed URL (no-op for local /dev loops or already-decoded loops). */
export async function ensureUrl(loop: Loop): Promise<Loop> {
  if (loop.buffer || !loop.storagePath) return loop
  loop.url = await signedUrl(loop.storagePath)
  return loop
}

/** Lower-case extension of the playback file, e.g. "mp3". */
export function fileExt(loop: Loop): string {
  return (loop.storagePath ?? loop.url).split('?')[0]!.split('.').pop()!.toLowerCase()
}

export function isCompressed(loop: Loop): boolean {
  return ['m4a', 'mp4', 'aac', 'mp3'].includes(fileExt(loop))
}

// ---- write ------------------------------------------------------------------

export type NewLoopMeta = {
  name: string
  bpm: number
  bars: Bars
  kind: LoopKind
  key?: string | null
  duration?: number | null
  tags?: string[]
  bucketId?: string | null
}

const EXT_MIME: Record<string, string> = {
  wav: 'audio/wav',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
}

/** Upload a file as-is and register it. Returns the Loop (with `buffer` if given). */
export async function uploadLoop(file: File, meta: NewLoopMeta, buffer?: AudioBuffer | null): Promise<Loop> {
  const ext = (file.name.split('.').pop() ?? 'wav').toLowerCase()
  return uploadBlob(file, ext, file.type || EXT_MIME[ext] || 'application/octet-stream', meta, buffer)
}

export type SourceMeta = { sourcePath?: string | null; pack?: string | null; packId?: string | null; category?: string | null }

/**
 * Upload any audio blob under "<uid>/<id>.<ext>" and register it. `ext` may
 * be compound ("web.mp3") to mark browser-encoded previews for calibration.
 */
export async function uploadBlob(
  blob: Blob,
  ext: string,
  contentType: string,
  meta: NewLoopMeta & SourceMeta,
  buffer?: AudioBuffer | null,
): Promise<Loop> {
  const uid = await currentUserId()
  const id = crypto.randomUUID()
  const path = `${uid}/${id}.${ext}`

  const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: false })
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`)

  const row = {
    id,
    name: meta.name,
    storage_path: path,
    source_path: meta.sourcePath ?? null,
    pack: meta.pack ?? null,
    pack_id: meta.packId ?? null,
    category: meta.category ?? null,
    bpm: meta.bpm,
    bars: meta.bars,
    kind: meta.kind,
    key: meta.key ?? null,
    duration: meta.duration ?? buffer?.duration ?? null,
    size_bytes: blob.size,
    tags: normalizeTags(meta.tags ?? []),
    bucket_id: meta.bucketId ?? null,
  }
  const ins = await supabase.from('loops').insert(row).select(LOOP_COLUMNS).single()
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(`Could not save loop: ${ins.error.message}`)
  }
  const loop = fromRow(ins.data as LoopRow)
  if (buffer) loop.buffer = buffer
  return loop
}

/** Source paths already imported (for skipping reruns). */
export async function existingSourcePaths(): Promise<Set<string>> {
  const out = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('loops').select('source_path').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data as { source_path: string | null }[]) if (r.source_path) out.add(r.source_path)
    if (data.length < 1000) break
  }
  return out
}

/** Upload (upsert) a calibration click for a codec key, e.g. "web.mp3". */
export async function uploadCalibration(key: string, blob: Blob, contentType: string): Promise<void> {
  const uid = await currentUserId()
  const { error } = await supabase.storage.from(BUCKET).upload(`${uid}/calibration/click.${key}`, blob, { contentType, upsert: true })
  if (error) throw new Error(`Calibration upload failed: ${error.message}`)
}

export async function deleteLoop(loop: Loop): Promise<void> {
  const { data, error } = await supabase
    .from('loops')
    .delete()
    .eq('id', loop.id)
    .select('storage_path,original_path')
    .single()
  if (error) throw new Error(error.message)
  const paths = [data.storage_path, data.original_path].filter((p): p is string => !!p)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}
