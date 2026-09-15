import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Loop, LoopKind } from '../engine/types'
import type { Bucket, LoopPatch } from '../lib/loops'
import { parseTagInput } from '../lib/loops'
import { matches, parseQuery, tagCounts } from '../lib/search'

type Props = {
  loops: Loop[]
  buckets: Bucket[]
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

const chipClass = (active: boolean, extra = '') =>
  [
    'label-caps min-h-10 border px-3 transition-colors duration-300 ease-linear',
    active ? 'border-jet bg-jet text-cream' : 'border-line text-ink hover:border-jet',
    extra,
  ].join(' ')

/** Searchable, taggable, bucketed list of the whole library. */
export function Library(props: Props) {
  const { loops, buckets, masterBPM, isActive, loadingIds, onSelect, onRemove, onEdit, onCreateBucket, onDeleteBucket } = props
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
      return matches(l, query)
    })
  }, [loops, query, minBpm, maxBpm, bucket])

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
        <h2 className="flex items-baseline justify-between border-b border-jet pb-2">
          <span className="text-4xl font-bold leading-[0.9] tracking-[-0.03em] md:text-5xl">{title}</span>
          <span className="font-mono text-sm text-muted">{String(rows.length).padStart(3, '0')}</span>
        </h2>
        {rows.length === 0 && <p className="py-6 text-lg text-ink">Nothing here.</p>}
        <ul>
          {visible.map((loop, i) => {
            const active = isActive(loop)
            const loading = loadingIds.includes(loop.id)
            const ratio = masterBPM / loop.bpm
            return (
              <li key={loop.id} className="border-b border-line">
                <div
                  className={[
                    'group grid grid-cols-[3rem_1fr] items-start gap-x-3 transition-colors duration-300 ease-linear hover:bg-white/20 md:grid-cols-[3rem_1fr_auto_auto]',
                    active ? 'bg-white/30' : '',
                    loading ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <span className="pt-4 font-mono text-xs text-muted">{String(i + 1).padStart(3, '0')}</span>
                  <button type="button" onClick={() => onSelect(loop)} aria-pressed={active} className="min-w-0 py-4 text-left">
                    <span
                      className={[
                        'block truncate text-2xl font-bold leading-[0.95] tracking-[-0.02em] transition-colors duration-300 ease-linear md:text-3xl',
                        active ? 'text-cobalt' : 'group-hover:text-cobalt',
                      ].join(' ')}
                    >
                      {loop.name}
                    </span>
                    <span className="label-caps mt-2 block truncate">
                      {active ? <span className="text-cobalt">On · </span> : ''}
                      {loop.pack ?? ''}
                      {(loop.tags ?? []).map((t) => (
                        <span key={t} className="ml-2">#{t}</span>
                      ))}
                    </span>
                  </button>
                  <span className="col-start-2 pb-4 font-mono text-sm md:col-start-auto md:py-4 md:text-right">
                    {loop.bpm} · {loop.bars}B{loop.key ? ` · ${loop.key.toUpperCase()}` : ''}
                    {kind === 'sample' && <span className="ml-3 md:ml-0 md:block">{ratio >= 1 ? '+' : ''}{Math.round((ratio - 1) * 100)}%</span>}
                  </span>
                  <span className="col-start-2 flex gap-4 pb-4 md:col-start-auto md:py-4 md:pl-4">
                    {loop.storagePath && (
                      <button
                        type="button"
                        aria-label={`Edit ${loop.name}`}
                        onClick={() => setEditing(editing === loop.id ? null : loop.id)}
                        className="label-caps transition-colors duration-300 ease-linear hover:text-cobalt"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${loop.name}`}
                      onClick={() => onRemove(loop)}
                      className="label-caps transition-colors duration-300 ease-linear hover:text-cobalt"
                    >
                      {active && kind === 'sample' ? 'Out' : 'Del'}
                    </button>
                  </span>
                </div>
                {editing === loop.id && (
                  <LoopEditor
                    loop={loop}
                    buckets={buckets}
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
          <button
            type="button"
            onClick={() => setShown((s) => ({ ...s, [kind]: s[kind] + PAGE }))}
            className="label-caps mt-4 border border-line px-4 py-3 transition-colors duration-300 ease-linear hover:border-jet"
          >
            Show more · {rows.length - visible.length} left
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search · #tag to filter by tag"
            className="field min-w-0 flex-1"
          />
          <input value={minBpm} onChange={(e) => setMinBpm(e.target.value)} placeholder="MIN" inputMode="numeric" className="field w-20 font-mono text-sm" />
          <input value={maxBpm} onChange={(e) => setMaxBpm(e.target.value)} placeholder="MAX" inputMode="numeric" className="field w-20 font-mono text-sm" />
        </div>

        <div className="flex flex-wrap items-stretch gap-2">
          <button type="button" onClick={() => setBucket(null)} className={chipClass(bucket === null)}>All</button>
          <button type="button" onClick={() => setBucket(UNSORTED)} className={chipClass(bucket === UNSORTED)}>Unsorted</button>
          {buckets.map((b) => (
            <span key={b.id} className="flex">
              <button type="button" onClick={() => setBucket(bucket === b.id ? null : b.id)} className={chipClass(bucket === b.id, 'border-r-0')}>
                {b.name}
              </button>
              <button
                type="button"
                aria-label={`Delete bucket ${b.name}`}
                onClick={() => onDeleteBucket(b)}
                className={chipClass(bucket === b.id, 'px-2')}
              >
                ×
              </button>
            </span>
          ))}
          {newBucket === null ? (
            <button type="button" onClick={() => setNewBucket('')} className={chipClass(false, 'border-dashed')}>
              + New bucket
            </button>
          ) : (
            <form onSubmit={submitBucket} className="flex gap-2">
              <input
                autoFocus
                value={newBucket}
                onChange={(e) => setNewBucket(e.target.value)}
                placeholder="Bucket name"
                className="field min-h-10 w-40 text-sm"
              />
              <button type="submit" className="btn bg-cobalt px-4 py-0 text-cream hover:bg-jet">Add</button>
              <button type="button" onClick={() => setNewBucket(null)} className="label-caps px-2 hover:text-cobalt">Cancel</button>
            </form>
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map(([t, n]) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={[
                  'font-mono text-xs transition-colors duration-300 ease-linear',
                  query.tags.includes(t) ? 'text-cobalt' : 'text-ink hover:text-cobalt',
                ].join(' ')}
              >
                #{t} <span className="text-muted">{n}</span>
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

function LoopEditor({
  loop,
  buckets,
  onSave,
  onCancel,
}: {
  loop: Loop
  buckets: Bucket[]
  onSave: (patch: LoopPatch) => Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState(loop.name)
  const [tags, setTags] = useState((loop.tags ?? []).join(', '))
  const [bucketId, setBucketId] = useState<string>(loop.bucketId ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({ name: name.trim() || loop.name, tags: parseTagInput(tags), bucketId: bucketId || null })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 border-t border-line py-4 md:grid-cols-3">
      <label className="label-caps flex flex-col gap-2">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className="field text-base normal-case tracking-normal text-jet" />
      </label>
      <label className="label-caps flex flex-col gap-2">
        Tags
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="reggae, guitar, warm"
          className="field text-base normal-case tracking-normal text-jet"
        />
      </label>
      <label className="label-caps flex flex-col gap-2">
        Bucket
        <select value={bucketId} onChange={(e) => setBucketId(e.target.value)} className="field text-base normal-case tracking-normal text-jet">
          <option value="">Unsorted</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-4 md:col-span-3">
        <button type="submit" disabled={busy} className="btn bg-jet text-cream hover:bg-cobalt disabled:opacity-40">Save</button>
        <button type="button" onClick={onCancel} className="label-caps hover:text-cobalt">Cancel</button>
        {error && <p className="text-sm text-cobalt">{error}</p>}
      </div>
    </form>
  )
}
