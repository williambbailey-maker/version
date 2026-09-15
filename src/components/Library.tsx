import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Loop, LoopKind } from '../engine/types'
import type { Bucket, LoopPatch, Pack } from '../lib/loops'
import { parseTagInput } from '../lib/loops'
import { matches, parseQuery, tagCounts } from '../lib/search'

type Props = {
  loops: Loop[]
  buckets: Bucket[]
  packs: Pack[]
  packFilter: string | null
  onPackFilter: (id: string | null) => void
  masterBPM: number
  isActive: (loop: Loop) => boolean
  loadingIds: readonly string[]
  onSelect: (loop: Loop) => void
  onRemove: (loop: Loop) => void
  onEdit: (loop: Loop, patch: LoopPatch) => Promise<void>
  onCreateBucket: (name: string) => Promise<void>
  onDeleteBucket: (bucket: Bucket) => void
}

const PAGE = 60
const UNSORTED = '__unsorted__'

const pill = (active: boolean, extra = '') => ['pill', active ? '' : 'pill-outline', extra].join(' ')

/** Searchable, taggable, bucketed list of the whole library. */
export function Library(props: Props) {
  const { loops, buckets, packs, packFilter, onPackFilter, masterBPM, isActive, loadingIds, onSelect, onRemove, onEdit, onCreateBucket, onDeleteBucket } = props
  const packById = useMemo(() => new Map(packs.map((p) => [p.id, p])), [packs])
  const extra = (l: Loop) => {
    const p = l.packId ? packById.get(l.packId) : undefined
    return p ? `${p.name} ${p.publisher ?? ''} ${p.genres.join(' ')}` : ''
  }
  const selectedPack = packFilter ? packById.get(packFilter) : undefined
  const [q, setQ] = useState('')
  const [minBpm, setMinBpm] = useState('')
  const [maxBpm, setMaxBpm] = useState('')
  const [bucket, setBucket] = useState<string | null>(null) // null = all
  const [newBucket, setNewBucket] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<LoopKind, number>>({ drums: PAGE, sample: PAGE })

  const query = useMemo(() => parseQuery(q), [q])

  const filtered = useMemo(() => {
    const lo = Number(minBpm) || 0
    const hi = Number(maxBpm) || Infinity
    return loops.filter((l) => {
      if (l.bpm < lo || l.bpm > hi) return false
      if (bucket === UNSORTED && l.bucketId) return false
      if (bucket && bucket !== UNSORTED && l.bucketId !== bucket) return false
      if (packFilter && l.packId !== packFilter) return false
      return matches(l, query, extra)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loops, query, minBpm, maxBpm, bucket, packFilter, packById])

  const tags = useMemo(() => tagCounts(filtered).slice(0, 24), [filtered])

  const toggleTag = (t: string) => {
    const tok = `#${t}`
    const parts = q.split(/\s+/).filter(Boolean)
    setQ(parts.includes(tok) ? parts.filter((p) => p !== tok).join(' ') : [...parts, tok].join(' '))
  }

  const submitBucket = async (e: FormEvent) => {
    e.preventDefault()
    const name = (newBucket ?? '').trim()
    if (!name) return
    await onCreateBucket(name)
    setNewBucket(null)
  }

  const section = (kind: LoopKind, title: string) => {
    const rows = filtered.filter((l) => l.kind === kind)
    const visible = rows.slice(0, shown[kind])
    return (
      <div>
        <div className="flex items-baseline justify-between border-b border-ink pb-2">
          <h2 className="headline text-3xl md:text-4xl">{title}</h2>
          <span className="mono-label text-muted">{String(rows.length).padStart(3, '0')}</span>
        </div>
        {rows.length === 0 && <p className="mono-label py-6 text-muted">Nothing here.</p>}
        <ul>
          {visible.map((loop, i) => {
            const active = isActive(loop)
            const loading = loadingIds.includes(loop.id)
            const ratio = masterBPM / loop.bpm
            return (
              <li key={loop.id} className="border-b border-line">
                <div className={['grid grid-cols-[2.5rem_1fr] items-start gap-x-2 md:grid-cols-[2.5rem_1fr_auto_auto]', loading ? 'opacity-60' : ''].join(' ')}>
                  <span className="mono-label pt-4 text-muted">{String(i + 1).padStart(3, '0')}</span>
                  <button type="button" onClick={() => onSelect(loop)} aria-pressed={active} className="group min-w-0 py-3 text-left">
                    <span
                      className={[
                        'headline inline-block max-w-full truncate text-2xl md:text-3xl',
                        active ? 'grain bg-ink px-2 text-cream' : 'group-hover:underline group-hover:underline-offset-4',
                      ].join(' ')}
                    >
                      {loop.name}
                    </span>
                    <span className="mono-label mt-2 block truncate text-muted">
                      {active ? <span className="text-ink">On · </span> : ''}
                      {(loop.packId && packById.get(loop.packId)?.name) ?? loop.pack ?? ''}
                      {loop.category ? ` / ${loop.category}` : ''}
                      {(loop.tags ?? []).map((t) => (
                        <span key={t} className="ml-2">#{t}</span>
                      ))}
                    </span>
                  </button>
                  <span className="mono-label col-start-2 pb-3 md:col-start-auto md:py-4 md:text-right">
                    {loop.bpm} · {loop.bars}b{loop.key ? ` · ${loop.key}` : ''}
                    {kind === 'sample' && <span className="ml-3 md:ml-0 md:block">{ratio >= 1 ? '+' : ''}{Math.round((ratio - 1) * 100)}%</span>}
                  </span>
                  <span className="col-start-2 flex gap-2 pb-3 md:col-start-auto md:py-4 md:pl-4">
                    {loop.storagePath && (
                      <button
                        type="button"
                        aria-label={`Edit ${loop.name}`}
                        onClick={() => setEditing(editing === loop.id ? null : loop.id)}
                        className="pill pill-outline min-h-7 px-3"
                      >
                        Edit
                      </button>
                    )}
                    <button type="button" aria-label={`Remove ${loop.name}`} onClick={() => onRemove(loop)} className="pill pill-outline min-h-7 px-3">
                      {active && kind === 'sample' ? 'Out' : 'Del'}
                    </button>
                  </span>
                </div>
                {editing === loop.id && (
                  <LoopEditor
                    loop={loop}
                    buckets={buckets}
                    packs={packs}
                    onSave={async (patch) => {
                      await onEdit(loop, patch)
                      setEditing(null)
                    }}
                    onCancel={() => setEditing(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
        {rows.length > visible.length && (
          <button type="button" onClick={() => setShown((s) => ({ ...s, [kind]: s[kind] + PAGE }))} className="pill pill-outline mt-4">
            Show more · {rows.length - visible.length} left
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex gap-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SEARCH · #TAG TO FILTER BY TAG" className="field min-w-0 flex-1" />
          <input value={minBpm} onChange={(e) => setMinBpm(e.target.value)} placeholder="MIN" inputMode="numeric" className="field w-16" />
          <input value={maxBpm} onChange={(e) => setMaxBpm(e.target.value)} placeholder="MAX" inputMode="numeric" className="field w-16" />
        </div>

        {selectedPack && (
          <div className="flex gap-4 border border-line p-4">
            {selectedPack.coverUrl ? (
              <img src={selectedPack.coverUrl} alt="" className="grain h-24 w-24 shrink-0 object-cover" />
            ) : (
              <span className="grain block h-24 w-24 shrink-0 bg-ink" aria-hidden="true" />
            )}
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tag">Pack</span>
                <span className="headline text-2xl">{selectedPack.name}</span>
                {selectedPack.publisher && <span className="mono-label text-muted">{selectedPack.publisher}</span>}
              </div>
              {selectedPack.description && <p className="line-clamp-3 max-w-2xl text-sm text-ink">{selectedPack.description}</p>}
              <div className="flex flex-wrap gap-2">
                {selectedPack.genres.map((g) => (
                  <span key={g} className="tag">{g}</span>
                ))}
                <button type="button" onClick={() => onPackFilter(null)} className="pill pill-outline min-h-7 px-3">
                  All packs
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setBucket(null)} className={pill(bucket === null)}>All</button>
          <button type="button" onClick={() => setBucket(UNSORTED)} className={pill(bucket === UNSORTED)}>Unsorted</button>
          {buckets.map((b) => (
            <span key={b.id} className="flex">
              <button type="button" onClick={() => setBucket(bucket === b.id ? null : b.id)} className={pill(bucket === b.id, 'rounded-r-none pr-2')}>
                {b.name}
              </button>
              <button type="button" aria-label={`Delete bucket ${b.name}`} onClick={() => onDeleteBucket(b)} className={pill(bucket === b.id, 'rounded-l-none pl-2 pr-3')}>
                ×
              </button>
            </span>
          ))}
          {newBucket === null ? (
            <button type="button" onClick={() => setNewBucket('')} className="pill pill-outline">
              + New bucket
            </button>
          ) : (
            <form onSubmit={submitBucket} className="flex items-end gap-2">
              <input autoFocus value={newBucket} onChange={(e) => setNewBucket(e.target.value)} placeholder="BUCKET NAME" className="field min-h-8 w-40 py-1" />
              <button type="submit" className="pill">Add</button>
              <button type="button" onClick={() => setNewBucket(null)} className="pill pill-outline">Cancel</button>
            </form>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {tags.map(([t, n]) => (
              <button key={t} type="button" onClick={() => toggleTag(t)} className={['mono-label', query.tags.includes(t) ? 'tag' : 'text-ink hover:underline'].join(' ')}>
                #{t} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {section('drums', 'Drums')}
      {section('sample', 'Samples')}
    </div>
  )
}

function LoopEditor({ loop, buckets, packs, onSave, onCancel }: { loop: Loop; buckets: Bucket[]; packs: Pack[]; onSave: (patch: LoopPatch) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(loop.name)
  const [tags, setTags] = useState((loop.tags ?? []).join(', '))
  const [bucketId, setBucketId] = useState<string>(loop.bucketId ?? '')
  const [packId, setPackId] = useState<string>(loop.packId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({ name: name.trim() || loop.name, tags: parseTagInput(tags), bucketId: bucketId || null, packId: packId || null })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 border-t border-line py-4 md:grid-cols-4">
      <label className="mono-label flex flex-col gap-1 text-muted">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className="field text-ink" />
      </label>
      <label className="mono-label flex flex-col gap-1 text-muted">
        Tags
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="reggae, guitar, warm" className="field text-ink" />
      </label>
      <label className="mono-label flex flex-col gap-1 text-muted">
        Bucket
        <select value={bucketId} onChange={(e) => setBucketId(e.target.value)} className="field text-ink">
          <option value="">Unsorted</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      <label className="mono-label flex flex-col gap-1 text-muted">
        Pack
        <select value={packId} onChange={(e) => setPackId(e.target.value)} className="field text-ink">
          <option value="">None</option>
          {packs.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2 md:col-span-4">
        <button type="submit" disabled={busy} className="pill">Save</button>
        <button type="button" onClick={onCancel} className="pill pill-outline">Cancel</button>
        {error && <p className="mono-label text-ink">{error}</p>}
      </div>
    </form>
  )
}
