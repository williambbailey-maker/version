import type { Bars, Loop, LoopKind } from '../engine/types'
import { DEFAULT_GAIN } from '../engine/types'

/**
 * Stopgap library: audio files stored as Blobs in IndexedDB so uploads
 * survive reloads. Phase 3 replaces this with Supabase.
 */

const DB_NAME = 'loop-lab'
const STORE = 'loops'

type StoredLoop = {
  id: string
  name: string
  bpm: number
  bars: Bars
  kind: LoopKind
  gain: number
  blob: Blob
  createdAt: number
}

export type NewLoopMeta = {
  name: string
  bpm: number
  bars: Bars
  kind: LoopKind
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
        t.oncomplete = () => db.close()
      }),
  )
}

const urls = new Map<string, string>()

function toLoop(s: StoredLoop): Loop {
  let url = urls.get(s.id)
  if (!url) {
    url = URL.createObjectURL(s.blob)
    urls.set(s.id, url)
  }
  return { id: s.id, name: s.name, url, bpm: s.bpm, bars: s.bars, kind: s.kind, gain: s.gain }
}

export async function listLocalLoops(): Promise<Loop[]> {
  const all = await tx<StoredLoop[]>('readonly', (s) => s.getAll())
  return all.sort((a, b) => a.createdAt - b.createdAt).map(toLoop)
}

export async function addLocalLoop(file: Blob, meta: NewLoopMeta): Promise<Loop> {
  const stored: StoredLoop = {
    id: crypto.randomUUID(),
    ...meta,
    gain: DEFAULT_GAIN,
    blob: file,
    createdAt: Date.now(),
  }
  await tx('readwrite', (s) => s.put(stored))
  return toLoop(stored)
}

export async function removeLocalLoop(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
  const url = urls.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    urls.delete(id)
  }
}

/** Duration of an audio file in seconds, via a throwaway <audio> element. */
export function audioDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const a = new Audio()
    const done = (v: number | null) => {
      URL.revokeObjectURL(url)
      resolve(v)
    }
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => done(null)
    a.src = url
  })
}

/** Nearest power-of-two bar count for a file of `seconds` at `bpm`. */
export function guessBars(seconds: number, bpm: number): Bars {
  const bars = (seconds * bpm) / 240
  let best: Bars = 1
  for (const b of [1, 2, 4, 8] as const) {
    if (Math.abs(Math.log2(bars) - Math.log2(b)) < Math.abs(Math.log2(bars) - Math.log2(best))) best = b
  }
  return best
}
