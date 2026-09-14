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
  created_at: string
}

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
    .select('id,name,storage_path,original_path,pack,bpm,bars,kind,key,gain,duration,created_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as LoopRow[]).map(fromRow)
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
  }
  const ins = await supabase.from('loops').insert(row).select('*').single()
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
