import { useCallback, useEffect, useRef, useState } from 'react'
import { Library } from './components/Library'
import { Login } from './components/Login'
import { Mark } from './components/Mark'
import { Section } from './components/Section'
import { Wordmark } from './components/Wordmark'
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
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <main className="min-h-screen bg-cream text-ink">
      <header className="px-4 pt-4 md:px-6">
        <Wordmark />
        <div className="mono-label flex justify-between pt-2 text-muted">
          <span>Loop auditioning</span>
          <span className="hidden sm:inline">{clock ? clock.name : 'No clock'}</span>
          <span>{engine.masterBPM} bpm</span>
          <span>{engine.playing ? `Playing · bar ${String(bar).padStart(2, '0')}` : 'Stopped'}</span>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-8 px-4 py-10 md:grid-cols-2 md:px-6 md:py-16">
        <div className="flex items-start gap-4">
          <Mark />
          <nav className="flex max-w-xs flex-wrap gap-2" aria-label="Sections">
            <button type="button" onClick={() => jump('mix')} className="pill">Mix</button>
            <button type="button" onClick={() => jump('library')} className="pill">Library</button>
            <button type="button" onClick={() => setShowUploader((v) => !v)} className="pill">{showUploader ? 'Close' : 'Add loop'}</button>
            <button type="button" onClick={() => void supabase.auth.signOut()} className="pill">Sign out</button>
          </nav>
        </div>
        <div className="flex flex-col items-start gap-6 md:items-end md:text-right">
          <h1 className="headline text-3xl md:text-5xl">Your loops, locked to your drums.</h1>
          <button
            type="button"
            onClick={onToggle}
            className={['pill min-h-14 px-10 text-base', engine.playing ? 'grain' : ''].join(' ')}
          >
            {engine.playing ? 'Stop' : 'Play'}
          </button>
        </div>
      </section>

      <Section id="mix" index="01" label="Mix" sub="What's playing">
        <Mixer
          masterBPM={engine.masterBPM}
          drums={engine.drums}
          samples={engine.samples}
          onGain={onGain}
          onRemove={(loop) => engine.removeSample(loop.id)}
        />
      </Section>

      {showUploader && (
        <Section index="02" label="Add" sub="Upload a loop">
          <Uploader buckets={buckets} onAdded={onAdded} />
        </Section>
      )}

      <Section id="library" index={showUploader ? '03' : '02'} label="Library" sub="Drums set the clock · samples follow">
        {loops === null && !error ? (
          <p className="mono-label text-muted">Loading library…</p>
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
          <p className="tag">{error ?? engine.error}</p>
        </div>
      )}
      <footer className="border-t border-line px-4 py-6 md:px-6">
        <div className="mono-label flex justify-between text-muted">
          <span>Loop Lab</span>
          <span>Varispeed · bar-quantized</span>
        </div>
      </footer>
    </main>
  )
}
