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
  created_at: string
}

export type Bucket = { id: string; name: string }

const LOOP_COLUMNS = 'id,name,storage_path,original_path,pack,bpm,bars,kind,key,gain,duration,tags,bucket_id,created_at'

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
  }
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

export type LoopPatch = Partial<Pick<Loop, 'name' | 'tags' | 'bucketId' | 'gain' | 'bpm' | 'bars' | 'kind'>>

export async function updateLoop(id: string, patch: LoopPatch): Promise<void> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.tags !== undefined) row.tags = normalizeTags(patch.tags)
  if (patch.bucketId !== undefined) row.bucket_id = patch.bucketId
  if (patch.gain !== undefined) row.gain = patch.gain
  if (patch.bpm !== undefined) row.bpm = patch.bpm
  if (patch.bars !== undefined) row.bars = patch.bars
  if (patch.kind !== undefined) row.kind = patch.kind
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
  const uid = await currentUserId()
  const id = crypto.randomUUID()
  const ext = (file.name.split('.').pop() ?? 'wav').toLowerCase()
  const path = `${uid}/${id}.${ext}`

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || EXT_MIME[ext] || 'application/octet-stream',
    upsert: false,
  })
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`)

  const row = {
    id,
    name: meta.name,
    storage_path: path,
    bpm: meta.bpm,
    bars: meta.bars,
    kind: meta.kind,
    key: meta.key ?? null,
    duration: meta.duration ?? buffer?.duration ?? null,
    size_bytes: file.size,
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
