import { useCallback, useEffect, useRef, useState } from 'react'
import { Library } from './components/Library'
import { Login } from './components/Login'
import { Section } from './components/Section'
import { Mixer } from './components/Mixer'
import { SetPassword } from './components/SetPassword'
import { Uploader } from './components/Uploader'
import { useBar } from './hooks/useBar'
import { useEngine } from './hooks/useEngine'
import { getEngine } from './engine/engine'
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
  const bar = useBar(getEngine(), engine.playing)

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

  const clock = engine.drums.loop ?? engine.drums.pending

  return (
    <main className="min-h-screen bg-cream text-jet">
      <header className="sticky top-0 z-10 grid h-20 grid-cols-2 items-center border-b border-line bg-cream/95 px-4 backdrop-blur md:grid-cols-12 md:px-6">
        <span className="text-lg font-bold uppercase tracking-[-0.02em] md:col-span-3">Loop Lab</span>
        <span className="hidden font-mono text-xs uppercase tracking-[0.2em] text-muted md:col-span-6 md:block">
          {engine.playing ? (
            <>
              <span className="text-cobalt">● Playing</span> · Bar {String(bar).padStart(2, '0')}
            </>
          ) : (
            '○ Stopped'
          )}
          {clock ? ` · ${clock.name}` : ''}
        </span>
        <span className="flex justify-end gap-4 md:col-span-3">
          <button type="button" onClick={() => setShowUploader((v) => !v)} className="text-sm font-semibold transition-colors duration-300 ease-linear hover:text-cobalt">
            {showUploader ? 'Close' : 'Add loop'}
          </button>
          <button type="button" onClick={() => void supabase.auth.signOut()} className="text-sm font-semibold transition-colors duration-300 ease-linear hover:text-cobalt">
            Sign out
          </button>
        </span>
      </header>

      <Section index="01" label="Transport" className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="label-caps block">Master tempo</span>
          <span className="display-num mt-3 block text-[6rem] md:text-[9rem]">{engine.masterBPM}</span>
          <span className="label-caps mt-3 block">
            BPM{clock ? ` · ${clock.name}` : ' · choose a drum loop'}
            {engine.playing ? ` · bar ${String(bar).padStart(2, '0')}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={['btn min-w-48 py-5 text-base', engine.playing ? 'bg-jet text-cream hover:bg-cobalt' : 'bg-cobalt text-cream hover:bg-jet'].join(' ')}
        >
          {engine.playing ? 'Stop' : 'Play'}
        </button>
      </Section>

      <Section index="02" label="Mix">
        <Mixer
          masterBPM={engine.masterBPM}
          drums={engine.drums}
          samples={engine.samples}
          onGain={onGain}
          onRemove={(loop) => engine.removeSample(loop.id)}
        />
      </Section>

      {showUploader && (
        <Section index="03" label="Add">
          <Uploader buckets={buckets} onAdded={onAdded} />
        </Section>
      )}

      <Section index={showUploader ? '04' : '03'} label="Library">
        {loops === null && !error ? (
          <p className="font-mono text-xs text-muted">Loading library…</p>
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
      </Section>

      {(error ?? engine.error) && (
        <div className="border-t border-line px-4 py-4 md:px-6">
          <p className="font-mono text-sm text-cobalt">{error ?? engine.error}</p>
        </div>
      )}
      <footer className="border-t border-line px-4 py-6 md:px-6">
        <span className="label-caps">Loop Lab · varispeed · bar-quantized</span>
      </footer>
    </main>
  )
}
