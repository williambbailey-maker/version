import { useCallback, useEffect, useState } from 'react'
import { Library } from './components/Library'
import { Login } from './components/Login'
import { SetPassword } from './components/SetPassword'
import { Uploader } from './components/Uploader'
import { useEngine } from './hooks/useEngine'
import { useSession } from './hooks/useSession'
import { codecStartOffset } from './lib/calibration'
import { DEV_LOOPS } from './lib/devLoops'
import { deleteLoop, ensureUrl, fileExt, isCompressed, listLoops } from './lib/loops'
import { supabase } from './lib/supabase'
import type { Loop, LoopKind } from './engine/types'

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
  const [error, setError] = useState<string | null>(null)
  const [showUploader, setShowUploader] = useState(false)

  const reload = useCallback(() => {
    listLoops().then(setLoops, (e: Error) => setError(e.message))
  }, [])

  useEffect(reload, [reload])

  // Demo loops only until the library has something in it.
  const library = loops && loops.length > 0 ? loops : [...DEV_LOOPS]

  const activeIds: Record<LoopKind, string | null> = {
    drums: engine.drums.loop?.id ?? engine.drums.pending?.id ?? null,
    sample: engine.sample.loop?.id ?? engine.sample.pending?.id ?? null,
  }

  const onSelect = (loop: Loop) => {
    void (async () => {
      try {
        setError(null)
        await ensureUrl(loop)
        if (isCompressed(loop) && loop.startOffset === undefined) loop.startOffset = await codecStartOffset(fileExt(loop))
        await engine.select(loop)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }

  const onRemove = (loop: Loop) => {
    if (!loop.storagePath) return // demo loop
    if (activeIds[loop.kind] === loop.id && engine.playing) return
    if (!window.confirm(`Delete "${loop.name}" from the library?`)) return
    deleteLoop(loop).then(
      () => setLoops((ls) => (ls ? ls.filter((l) => l.id !== loop.id) : ls)),
      (e: Error) => setError(e.message),
    )
  }

  const onAdded = (loop: Loop) => {
    setLoops((ls) => [...(ls ?? []), loop])
    setShowUploader(false)
  }

  const onToggle = () => {
    void engine.toggle().catch((e: Error) => setError(e.message))
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

      {showUploader ? (
        <Uploader onAdded={onAdded} />
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
          masterBPM={engine.masterBPM}
          activeIds={activeIds}
          loadingIds={engine.loading}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      )}

      {(error ?? engine.error) && <p className="text-sm text-red-700">{error ?? engine.error}</p>}
    </main>
  )
}
