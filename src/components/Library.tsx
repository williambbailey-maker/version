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

  const chip = (label: string, active: boolean, onClick: () => void, extra = '') => (
    <button
      type="button"
      onClick={onClick}
      className={[
        'min-h-9 rounded-full border px-3 text-sm',
        active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700',
        extra,
      ].join(' ')}
    >
      {label}
    </button>
  )

  const section = (kind: LoopKind, title: string) => {
    const rows = filtered.filter((l) => l.kind === kind)
    const visible = rows.slice(0, shown[kind])
    return (
      <section className="flex flex-col gap-2">
        <h2 className="flex items-baseline justify-between text-sm uppercase tracking-wide text-stone-500">
          {title}
          <span className="font-mono text-xs normal-case">{rows.length}</span>
        </h2>
        {rows.length === 0 && <p className="text-sm text-stone-500">Nothing here.</p>}
        <ul className="flex flex-col gap-1">
          {visible.map((loop) => {
            const active = isActive(loop)
            const loading = loadingIds.includes(loop.id)
            const ratio = masterBPM / loop.bpm
            return (
              <li key={loop.id} className="flex flex-col gap-1">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(loop)}
                    aria-pressed={active}
                    className={[
                      'flex min-h-14 flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left',
                      active ? 'border-orange-600 bg-orange-100' : 'border-stone-300 bg-white hover:bg-stone-100',
                      loading ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{loop.name}</span>
                      <span className="block truncate text-xs text-stone-500">
                        {loop.pack ?? ''}
                        {(loop.tags ?? []).map((t) => (
                          <span key={t} className="ml-1 text-stone-400">#{t}</span>
                        ))}
                      </span>
                    </span>
                    <span className="shrink-0 text-right font-mono text-xs text-stone-600">
                      {loop.bpm} · {loop.bars}b{loop.key ? ` · ${loop.key}` : ''}
                      {kind === 'sample' && (
                        <span className="block">{ratio >= 1 ? '+' : ''}{Math.round((ratio - 1) * 100)}%</span>
                      )}
                    </span>
                  </button>
                  {loop.storagePath && (
                    <button
                      type="button"
                      aria-label={`Edit ${loop.name}`}
                      onClick={() => setEditing(editing === loop.id ? null : loop.id)}
                      className="w-9 shrink-0 rounded text-stone-400 hover:bg-stone-200 hover:text-stone-900"
                    >
                      ✎
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${loop.name}`}
                    onClick={() => onRemove(loop)}
                    className="w-9 shrink-0 rounded text-stone-400 hover:bg-stone-200 hover:text-stone-900"
                  >
                    ×
                  </button>
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
            className="min-h-10 rounded border border-stone-300 text-sm text-stone-600"
          >
            Show more ({rows.length - visible.length} left)
          </button>
        )}
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search… use #tag to filter by tag"
          className="min-h-12 min-w-0 flex-1 rounded border border-stone-300 px-3"
        />
        <input
          value={minBpm}
          onChange={(e) => setMinBpm(e.target.value)}
          placeholder="min"
          inputMode="numeric"
          className="min-h-12 w-16 rounded border border-stone-300 px-2 font-mono text-sm"
        />
        <input
          value={maxBpm}
          onChange={(e) => setMaxBpm(e.target.value)}
          placeholder="max"
          inputMode="numeric"
          className="min-h-12 w-16 rounded border border-stone-300 px-2 font-mono text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chip('All', bucket === null, () => setBucket(null))}
        {chip('Unsorted', bucket === UNSORTED, () => setBucket(UNSORTED))}
        {buckets.map((b) => (
          <span key={b.id} className="flex items-center">
            {chip(b.name, bucket === b.id, () => setBucket(bucket === b.id ? null : b.id), 'rounded-r-none')}
            <button
              type="button"
              aria-label={`Delete bucket ${b.name}`}
              onClick={() => onDeleteBucket(b)}
              className={[
                'min-h-9 rounded-r-full border border-l-0 px-2 text-xs',
                bucket === b.id ? 'border-stone-900 bg-stone-900 text-stone-300' : 'border-stone-300 bg-white text-stone-400',
              ].join(' ')}
            >
              ×
            </button>
          </span>
        ))}
        {newBucket === null ? (
          chip('+ New bucket', false, () => setNewBucket(''), 'border-dashed')
        ) : (
          <form onSubmit={submitBucket} className="flex gap-1">
            <input
              autoFocus
              value={newBucket}
              onChange={(e) => setNewBucket(e.target.value)}
              placeholder="Bucket name"
              className="min-h-9 w-36 rounded border border-stone-300 px-2 text-sm"
            />
            <button type="submit" className="min-h-9 rounded bg-stone-900 px-3 text-sm text-white">Add</button>
            <button type="button" onClick={() => setNewBucket(null)} className="min-h-9 px-2 text-sm text-stone-500">Cancel</button>
          </form>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map(([t, n]) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={[
                'rounded-full px-2 py-1 text-xs',
                query.tags.includes(t) ? 'bg-orange-600 text-white' : 'bg-stone-200 text-stone-700',
              ].join(' ')}
            >
              #{t} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}

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
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-stone-300 bg-stone-100 p-3">
      <label className="flex flex-col gap-1 text-xs text-stone-600">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-stone-600">
        Tags (comma or space separated)
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="reggae, guitar, warm"
          className="rounded border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-stone-600">
        Bucket
        <select value={bucketId} onChange={(e) => setBucketId(e.target.value)} className="rounded border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900">
          <option value="">Unsorted</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="min-h-10 rounded bg-stone-900 px-4 text-sm text-white disabled:opacity-40">Save</button>
        <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm text-stone-600">Cancel</button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  )
}
