import { useCallback, useEffect, useRef, useState } from 'react'
import { Library } from './components/Library'
import { Login } from './components/Login'
import { Mixer } from './components/Mixer'
import { SetPassword } from './components/SetPassword'
import { Uploader } from './components/Uploader'
import { useEngine } from './hooks/useEngine'
import { useSession } from './hooks/useSession'
import { codecStartOffset } from './lib/calibration'
import { DEV_LOOPS } from './lib/devLoops'
import { createBucket, deleteBucket, deleteLoop, ensureUrl, fileExt, isCompressed, listBuckets, listLoops, updateLoop } from './lib/loops'
import type { Bucket, LoopPatch } from './lib/loops'
import { supabase } from './lib/supabase'
import type { Loop } from './engine/types'

export default function App() {
  const { session, recovering, finishRecovery } = useSession()
  if (session === undefined) return null
  if (!session) return <Login />
  if (recovering) return <SetPassword onDone={finishRecovery} />
  return <Studio />
}

function Studio() {
  const engine = useEngine()
  const [loops, setLoops] = useState<Loop[] | null>(null)
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showUploader, setShowUploader] = useState(false)
  const gainTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  const reload = useCallback(() => {
    Promise.all([listLoops(), listBuckets()]).then(([ls, bs]) => {
      setLoops(ls)
      setBuckets(bs)
    }, fail)
  }, [])

  useEffect(reload, [reload])

  // Demo loops only until the library has something in it.
  const library = loops && loops.length > 0 ? loops : [...DEV_LOOPS]

  const isActive = (loop: Loop) => engine.isActive(loop.id)

  const onSelect = (loop: Loop) => {
    void (async () => {
      try {
        setError(null)
        await ensureUrl(loop)
        if (isCompressed(loop) && loop.startOffset === undefined) loop.startOffset = await codecStartOffset(fileExt(loop))
        await engine.select(loop)
      } catch (e) {
        fail(e)
      }
    })()
  }

  /** Fader moves ramp immediately; the value is saved to the library after a short pause. */
  const onGain = (loop: Loop, value: number) => {
    engine.setGain(loop.id, value)
    loop.gain = value
    if (!loop.storagePath) return
    const timers = gainTimers.current
    clearTimeout(timers.get(loop.id))
    timers.set(
      loop.id,
      setTimeout(() => {
        timers.delete(loop.id)
        updateLoop(loop.id, { gain: value }).catch(fail)
      }, 600),
    )
  }

  const onRemove = (loop: Loop) => {
    if (!loop.storagePath) return // demo loop
    if (isActive(loop)) {
      if (loop.kind === 'drums') return
      engine.removeSample(loop.id)
      return
    }
    if (!window.confirm(`Delete "${loop.name}" from the library?`)) return
    deleteLoop(loop).then(() => setLoops((ls) => (ls ? ls.filter((l) => l.id !== loop.id) : ls)), fail)
  }

  const onEdit = async (loop: Loop, patch: LoopPatch) => {
    await updateLoop(loop.id, patch)
    setLoops((ls) => (ls ? ls.map((l) => (l.id === loop.id ? { ...l, ...patch } : l)) : ls))
    Object.assign(loop, patch) // keep the engine's reference in sync
  }

  const onCreateBucket = async (name: string) => {
    const b = await createBucket(name)
    setBuckets((bs) => [...bs, b].sort((x, y) => x.name.localeCompare(y.name)))
  }

  const onDeleteBucket = (bucket: Bucket) => {
    if (!window.confirm(`Delete bucket "${bucket.name}"? Its loops become unsorted.`)) return
    deleteBucket(bucket.id).then(() => {
      setBuckets((bs) => bs.filter((b) => b.id !== bucket.id))
      setLoops((ls) => (ls ? ls.map((l) => (l.bucketId === bucket.id ? { ...l, bucketId: null } : l)) : ls))
    }, fail)
  }

  const onAdded = (loop: Loop) => {
    setLoops((ls) => [...(ls ?? []), loop])
    setShowUploader(false)
  }

  const onToggle = () => {
    void engine.toggle().catch(fail)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 bg-stone-50 p-6 text-stone-900">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl">Loop Lab</h1>
        <div className="flex items-baseline gap-4">
          <span className="font-mono text-sm text-stone-600">{engine.masterBPM} bpm</span>
          <button type="button" onClick={() => void supabase.auth.signOut()} className="text-xs text-stone-500 underline">
            sign out
          </button>
        </div>
      </header>

      <button
        type="button"
        onClick={onToggle}
        className={[
          'min-h-16 rounded-lg px-6 text-xl text-white',
          engine.playing ? 'bg-stone-900' : 'bg-orange-600',
        ].join(' ')}
      >
        {engine.playing ? 'Stop' : 'Play'}
      </button>

      <Mixer
        masterBPM={engine.masterBPM}
        drums={engine.drums}
        samples={engine.samples}
        onGain={onGain}
        onRemove={(loop) => engine.removeSample(loop.id)}
      />

      {showUploader ? (
        <Uploader buckets={buckets} onAdded={onAdded} />
      ) : (
        <button
          type="button"
          onClick={() => setShowUploader(true)}
          className="min-h-12 rounded-lg border border-dashed border-stone-400 text-stone-600"
        >
          + Add a loop
        </button>
      )}

      {loops === null && !error ? (
        <p className="text-sm text-stone-500">Loading library…</p>
      ) : (
        <Library
          loops={library}
          buckets={buckets}
          masterBPM={engine.masterBPM}
          isActive={isActive}
          loadingIds={engine.loading}
          onSelect={onSelect}
          onRemove={onRemove}
          onEdit={onEdit}
          onCreateBucket={onCreateBucket}
          onDeleteBucket={onDeleteBucket}
        />
      )}

      {(error ?? engine.error) && <p className="text-sm text-red-700">{error ?? engine.error}</p>}
    </main>
  )
}
