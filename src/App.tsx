import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BulkImport } from './components/BulkImport'
import { Favorites } from './components/Favorites'
import type { Drop } from './components/BulkImport'
import { Library } from './components/Library'
import type { LibraryPreset } from './components/Library'
import { Login } from './components/Login'
import { Mixer } from './components/Mixer'
import { Room } from './components/Room'
import { Section } from './components/Section'
import { Sessions } from './components/Sessions'
import { SetPassword } from './components/SetPassword'
import { TidyStorage } from './components/TidyStorage'
import { Uploader } from './components/Uploader'
import { ensureRunning, getContext } from './engine/context'
import { useEngine } from './hooks/useEngine'
import { neighborSample } from './lib/neighbors'
import { applyTheme, readTheme } from './lib/theme'
import type { Theme } from './lib/theme'
import { useSession } from './hooks/useSession'
import { codecKey, codecStartOffset } from './lib/calibration'
import { DEV_LOOPS } from './lib/devLoops'
import { createBucket, deleteBucket, deleteLoop, ensureUrl, isCompressed, listBuckets, listLoops, listPacks, updateLoop } from './lib/loops'
import type { Bucket, LoopPatch, Pack } from './lib/loops'
import { packStats } from './lib/packs'
import { DEFAULT_ROOM } from './lib/room'
import { tagCounts } from './lib/search'
import { deleteSession, listSessions, resolveStack, saveSession, snapshotStack } from './lib/sessions'
import type { Session } from './lib/sessions'
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
  const [packs, setPacks] = useState<Pack[]>([])
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [packFilter, setPackFilter] = useState<string | null>(() => {
    try {
      return localStorage.getItem('looplab.pack')
    } catch {
      return null
    }
  })
  useEffect(() => {
    try {
      if (packFilter) localStorage.setItem('looplab.pack', packFilter)
      else localStorage.removeItem('looplab.pack')
    } catch {
      // private mode
    }
  }, [packFilter])
  const [preset, setPreset] = useState<LibraryPreset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showUploader, setShowUploader] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => readTheme())
  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }
  const [addMode, setAddMode] = useState<'one' | 'many'>('many')
  const [dropped, setDropped] = useState<Drop | null>(null)
  const onDropFiles = (files: Drop['files']) => {
    setAddMode('many')
    setShowUploader(true)
    setDropped({ files, nonce: Date.now() })
    setTimeout(() => jump('add'), 30)
  }
  const gainTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const reload = useCallback(() => {
    Promise.all([listLoops(), listBuckets(), listPacks(), listSessions()]).then(([ls, bs, ps, ss]) => {
      setLoops(ls)
      setBuckets(bs)
      setPacks(ps)
      setSessions(ss)
    }, fail)
  }, [])

  useEffect(reload, [reload])

  // Demo loops only until the library has something in it.
  const library = loops && loops.length > 0 ? loops : [...DEV_LOOPS]
  const stats = useMemo(() => packStats(library), [library])
  const tagMap = useMemo(() => new Map(tagCounts(library)), [library])

  const isActive = (loop: Loop) => engine.isActive(loop.id)

  /** Signed URL + codec offset, needed before the engine can play a loop. */
  const prepare = async (loop: Loop) => {
    await ensureUrl(loop)
    if (isCompressed(loop) && loop.startOffset === undefined) loop.startOffset = await codecStartOffset(codecKey(loop.storagePath ?? loop.url))
  }

  /** Tapping a loop plays it: the transport starts itself on the first pick. */
  const onSelect = (loop: Loop) => {
    void ensureRunning(getContext()) // inside the click, so Safari lets audio through
    void (async () => {
      try {
        setError(null)
        await prepare(loop)
        await engine.select(loop)
        if (!engine.playing && engine.isActive(loop.id)) await engine.play()
      } catch (e) {
        fail(e)
      }
    })()
  }

  // ---- favorites
  const favorites = useMemo(() => library.filter((l) => l.kind === 'sample' && l.favorite), [library])
  const packNames = useMemo(() => new Map(packs.map((p) => [p.id, p.name])), [packs])
  const onFavorite = (loop: Loop) => {
    const next = !loop.favorite
    setLoops((ls) => (ls ? ls.map((l) => (l.id === loop.id ? { ...l, favorite: next } : l)) : ls))
    if (!loop.storagePath) return // demo loop
    updateLoop(loop.id, { favorite: next }).catch(fail)
  }
  const [showFavorites, setShowFavorites] = useState(false)
  const openFavorites = () => {
    setShowFavorites(true)
    setTimeout(() => jump('favorites'), 30)
  }

  /** ‹ › on a mixer column: swap in the previous/next sample from the same pack. */
  const onStep = (loop: Loop, dir: 1 | -1) => {
    const next = neighborSample(library, loop, dir)
    if (!next) {
      setNotice('Nothing else in this pack to step to.')
      return
    }
    void (async () => {
      try {
        setError(null)
        await prepare(next)
        await engine.replaceSample(loop.id, next)
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

  const onPackFilter = (id: string | null) => {
    setPackFilter(id) // the browser scrolls its group list into view when this changes
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

  // ---- sessions
  const clock = engine.drums.loop ?? engine.drums.pending
  const hasStack = !!clock || engine.samples.some((s) => s.loop ?? s.pending)
  const onSaveSession = async (name: string) => {
    const s = await saveSession(name, snapshotStack(engine))
    setSessions((ss) => [s, ...(ss ?? [])])
    setNotice(`Saved "${s.name}".`)
  }
  const onLoadSession = (s: Session) => {
    void (async () => {
      try {
        setError(null)
        const { drums, samples, boost, missing } = resolveStack(s, library)
        await Promise.all([...(drums ? [prepare(drums)] : []), ...samples.map((x) => prepare(x.loop))])
        await engine.loadStack({ drums, samples, boost })
        setNotice(missing ? `Loaded "${s.name}" · ${missing} loop${missing === 1 ? '' : 's'} missing from the library.` : `Loaded "${s.name}".`)
        jump('mix')
      } catch (e) {
        fail(e)
      }
    })()
  }
  const onDeleteSession = (s: Session) => {
    if (!window.confirm(`Delete session "${s.name}"?`)) return
    deleteSession(s.id).then(() => setSessions((ss) => (ss ? ss.filter((x) => x.id !== s.id) : ss)), fail)
  }

  // ---- studio actions
  const openTag = (tag: string) => {
    setPreset({ query: `#${tag}`, sort: 'tempo', nonce: Date.now() })
    jump('library')
  }
  const [showSessions, setShowSessions] = useState(false)
  const openSessions = () => {
    setShowSessions(true)
    // the section mounts on the next render; scroll once it exists
    setTimeout(() => {
      jump('sessions')
      setTimeout(() => document.getElementById('session-name')?.focus({ preventScroll: true }), 500)
    }, 30)
  }

  return (
    <main className="min-h-screen bg-cream pb-28 text-ink">
      <header className="grid grid-cols-1 items-center gap-2 px-4 pt-5 text-center md:grid-cols-3 md:px-6 md:text-left">
        <span className="hidden md:block" />
        <span className="headline text-center text-[2.8rem] leading-none">LOOP LAB</span>
        <span className="mono-label flex justify-center gap-4 text-muted md:justify-end">
          <button type="button" onClick={toggleTheme} aria-pressed={theme === 'dark'} className="underline underline-offset-4 hover:text-accent">
            {theme === 'dark' ? 'light mode' : 'dark mode'}
          </button>
          <button type="button" onClick={() => void supabase.auth.signOut()} className="underline underline-offset-4 hover:text-accent">
            sign out
          </button>
        </span>
      </header>

      <div id="studio" className="scroll-mt-4 px-4 pt-8 md:px-6 md:pt-10">
        <Room
          playing={engine.playing}
          masterBPM={engine.masterBPM}
          tagCounts={tagMap}
          packs={packs}
          packStats={stats}
          sessionsCount={sessions?.length ?? 0}
          roomMap={DEFAULT_ROOM}
          selectedPack={packFilter}
          favoritesCount={favorites.length}
          onFavorites={openFavorites}
          onSessions={openSessions}
          onAdd={() => { setShowUploader(true); setTimeout(() => jump('add'), 30) }}
          onDropFiles={onDropFiles}
          onTag={openTag}
          onPack={onPackFilter}
        />
      </div>

      {(notice || error || engine.error) && (
        <div className="px-4 pt-6 md:px-6">
          {notice && (
            <p className="caption">
              {notice}{' '}
              <button type="button" onClick={() => setNotice(null)} className="ml-2 underline">ok</button>
            </p>
          )}
          {(error ?? engine.error) && <p className="mono-label text-accent">{error ?? engine.error}</p>}
        </div>
      )}

      <div className="mt-8">
        {showFavorites && (
          <Section
            id="favorites"
            label="Favorites"
            aside={
              <button type="button" onClick={() => setShowFavorites(false)} className="pill pill-outline">
                Hide
              </button>
            }
          >
            <Favorites
              loops={favorites}
              packNames={packNames}
              masterBPM={engine.masterBPM}
              isActive={isActive}
              loadingIds={engine.loading}
              onSelect={onSelect}
              onRemove={onRemove}
              onFavorite={onFavorite}
            />
          </Section>
        )}
        {showSessions && (
          <Section
            id="sessions"
            label="Sessions"
            sub="save what's playing, or bring a stack back"
            aside={
              <button type="button" onClick={() => setShowSessions(false)} className="pill pill-outline">
                Hide
              </button>
            }
          >
            <Sessions
              sessions={sessions}
              loops={library}
              canSave={hasStack}
              onSave={onSaveSession}
              onLoad={onLoadSession}
              onDelete={onDeleteSession}
            />
          </Section>
        )}

        <Section
          id="mix"
          label="What's playing"
          sub="drums set the clock, samples follow"
          aside={
            <div className="flex gap-2">
              {engine.playing && (
                <button type="button" onClick={onToggle} className="pill pill-accent">
                  Stop
                </button>
              )}
              <button type="button" onClick={openSessions} disabled={!hasStack} className="pill pill-outline">
                Save stack
              </button>
            </div>
          }
        >
          <Mixer
            masterBPM={engine.masterBPM}
            drums={engine.drums}
            samples={engine.samples}
            onGain={onGain}
            onRemove={(loop) => engine.removeSample(loop.id)}
            onMute={(loop, m) => engine.setMuted(loop.id, m)}
            onSolo={(loop, v) => engine.setSolo(loop.id, v)}
            onSpeed={(loop, v) => engine.setSpeed(loop.id, v)}
            onStep={onStep}
            boost={engine.boost}
            onBoost={engine.setBoost}
            onBoostPreset={engine.setBoostPreset}
          />
        </Section>

        <Section id="library" label="Library" sub="tap a drum loop for the clock, tap samples to layer">
          {loops === null && !error ? (
            <p className="mono-label text-muted">Loading library…</p>
          ) : (
            <Library
              loops={library}
              buckets={buckets}
              packs={packs}
              packFilter={packFilter}
              onPackFilter={setPackFilter}
              preset={preset}
              masterBPM={engine.masterBPM}
              isActive={isActive}
              loadingIds={engine.loading}
              onSelect={onSelect}
              onFavorite={onFavorite}
              onRemove={onRemove}
              onEdit={onEdit}
              onCreateBucket={onCreateBucket}
              onDeleteBucket={onDeleteBucket}
            />
          )}
        </Section>
        {showUploader && (
        <Section
            id="add"
            label="Add loops"
            sub={showUploader ? (addMode === 'many' ? 'a folder becomes a pack' : 'one loop') : 'a folder becomes a pack'}
            aside={
              <button type="button" onClick={() => setShowUploader(false)} className="pill pill-outline">
                Hide
              </button>
            }
          >
            {(
              <>
                <div className="mb-6 flex gap-2">
                  <button type="button" onClick={() => setAddMode('many')} className={['pill', addMode === 'many' ? '' : 'pill-outline'].join(' ')}>
                    Many loops
                  </button>
                  <button type="button" onClick={() => setAddMode('one')} className={['pill', addMode === 'one' ? '' : 'pill-outline'].join(' ')}>
                    One loop
                  </button>
                </div>
                {addMode === 'many' ? <BulkImport buckets={buckets} onDone={reload} dropped={dropped} /> : <Uploader buckets={buckets} onAdded={onAdded} />}
              </>
            )}
            <div className="mt-6 border-t border-line pt-4">
              <TidyStorage />
            </div>
          </Section>
        )}

      </div>

      <footer className="border-t border-line px-4 py-6 md:px-6">
        <div className="mono-label flex justify-between text-muted">
          <span>Loop Lab</span>
          <span>Varispeed · bar-quantized</span>
        </div>
      </footer>
    </main>
  )
}
