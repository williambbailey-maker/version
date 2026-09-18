import { Fragment, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Loop, LoopKind } from '../engine/types'
import type { Bucket, LoopPatch, Pack, PackPatch } from '../lib/loops'
import { parseTagInput } from '../lib/loops'
import { matches, parseQuery, tagCounts } from '../lib/search'
import { PackEditor } from './Packs'
import { ROW_COLS, SampleRow } from './SampleRow'

/** Applied when it changes: lets the studio open "#percussion, closest tempo first". */
export type LibraryPreset = { query: string; sort: 'name' | 'tempo'; nonce: number }

type Props = {
  loops: Loop[]
  buckets: Bucket[]
  packs: Pack[]
  packFilter: string | null
  onPackFilter: (id: string | null) => void
  onEditPack: (pack: Pack, patch: PackPatch) => Promise<void>
  preset?: LibraryPreset | null
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

/**
 * Drums first as a plain list (a pack picked on the shelf narrows it), then
 * the sample tools — search, buckets, stretch, sort, keys, tags — and the
 * sample ledger they apply to.
 */
export function Library(props: Props) {
  const { loops, buckets, packs, packFilter, onPackFilter, onEditPack, preset, masterBPM, isActive, loadingIds, onSelect, onRemove, onEdit, onCreateBucket, onDeleteBucket } = props
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
  const [editingPack, setEditingPack] = useState(false)
  const [shown, setShown] = useState<Record<LoopKind, number>>({ drums: PAGE, sample: PAGE })
  const [open, setOpen] = useState<Record<LoopKind, boolean>>({ drums: true, sample: true })
  const [key, setKey] = useState<string | null>(null)
  const [tight, setTight] = useState(false) // ≤ 20% stretch
  const [sort, setSort] = useState<'name' | 'tempo'>('name')

  useEffect(() => {
    if (!preset) return
    setQ(preset.query)
    setSort(preset.sort)
    setOpen({ drums: true, sample: true })
  }, [preset])

  const query = useMemo(() => parseQuery(q), [q])
  const stretch = (l: Loop) => Math.abs(masterBPM / l.bpm - 1)

  // Drums: only the pack filter applies.
  const drums = useMemo(() => loops.filter((l) => l.kind === 'drums' && (!packFilter || l.packId === packFilter)), [loops, packFilter])

  // Samples, everything but the key filter, so the key chips reflect what's in view.
  const base = useMemo(() => {
    const lo = Number(minBpm) || 0
    const hi = Number(maxBpm) || Infinity
    return loops.filter((l) => {
      if (l.kind !== 'sample') return false
      if (l.bpm < lo || l.bpm > hi) return false
      if (bucket === UNSORTED && l.bucketId) return false
      if (bucket && bucket !== UNSORTED && l.bucketId !== bucket) return false
      if (packFilter && l.packId !== packFilter) return false
      if (tight && stretch(l) > 0.2) return false
      return matches(l, query, extra)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loops, query, minBpm, maxBpm, bucket, packFilter, packById, tight, masterBPM])

  const keys = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of base) if (l.key) m.set(l.key, (m.get(l.key) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [base])

  const samples = useMemo(() => {
    const rows = key ? base.filter((l) => l.key === key) : base
    if (sort !== 'tempo') return rows
    return [...rows].sort((a, b) => stretch(a) - stretch(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, key, sort, masterBPM])

  const tags = useMemo(() => tagCounts(base).slice(0, 24), [base])

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

  const heading = (kind: LoopKind, title: string, n: number) => {
    const isOpen = open[kind]
    return (
      <button
        type="button"
        onClick={() => setOpen((o) => ({ ...o, [kind]: !o[kind] }))}
        aria-expanded={isOpen}
        className="flex w-full items-baseline justify-between border-b border-ink pb-2 text-left"
      >
        <h2 className="headline text-3xl md:text-4xl">
          <span className="mr-3 inline-block text-xl transition-transform duration-200 ease-linear" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} aria-hidden="true">
            ▸
          </span>
          {title}
        </h2>
        <span className="mono-label text-muted">
          {String(n).padStart(3, '0')}
          {!isOpen && ' · collapsed'}
        </span>
      </button>
    )
  }

  const more = (kind: LoopKind, total: number, visible: number) =>
    open[kind] && total > visible ? (
      <button type="button" onClick={() => setShown((s) => ({ ...s, [kind]: s[kind] + PAGE }))} className="pill pill-outline mt-4">
        Show more · {total - visible} left
      </button>
    ) : null

  const drumsVisible = drums.slice(0, shown.drums)
  const samplesVisible = samples.slice(0, shown.sample)

  return (
    <div className="flex flex-col gap-10">
      {selectedPack && (
        <div className="flex flex-col gap-3 border border-line p-4">
          <div className="flex gap-4">
            {selectedPack.coverUrl ? (
              <img src={selectedPack.coverUrl} alt="" className="h-24 w-24 shrink-0 border-[1.5px] border-ink object-cover" />
            ) : (
              <span className="block h-24 w-24 shrink-0 border-[1.5px] border-ink" aria-hidden="true" />
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
                {selectedPack.url && (
                  <a href={selectedPack.url} target="_blank" rel="noreferrer" className="pill pill-outline min-h-7 px-3">
                    Open link
                  </a>
                )}
                <button type="button" onClick={() => setEditingPack((v) => !v)} className="pill pill-outline min-h-7 px-3">
                  {editingPack ? 'Close' : 'Edit pack'}
                </button>
                <button type="button" onClick={() => onPackFilter(null)} className="pill pill-outline min-h-7 px-3">
                  All packs
                </button>
              </div>
            </div>
          </div>
          {editingPack && (
            <PackEditor
              pack={selectedPack}
              onSave={async (patch) => {
                await onEditPack(selectedPack, patch)
                setEditingPack(false)
              }}
              onCancel={() => setEditingPack(false)}
            />
          )}
        </div>
      )}

      {/* ---- Drums */}
      <div>
        {heading('drums', 'Drums', drums.length)}
        {open.drums && drums.length === 0 && <p className="mono-label py-6 text-muted">No drum loops{selectedPack ? ' in this pack' : ' yet'}.</p>}
        {open.drums && (
          <ul>
            {drumsVisible.map((loop, i) => {
              const active = isActive(loop)
              const loading = loadingIds.includes(loop.id)
              return (
                <li key={loop.id} className="border-b border-line">
                  <div className={['grid grid-cols-[2.5rem_1fr] items-start gap-x-2 md:grid-cols-[2.5rem_1fr_auto_auto]', loading ? 'opacity-60' : ''].join(' ')}>
                    <span className="mono-label pt-4 text-muted">{String(i + 1).padStart(3, '0')}</span>
                    <button type="button" onClick={() => onSelect(loop)} aria-pressed={active} className="group min-w-0 py-3 text-left">
                      <span className={['headline inline-block max-w-full truncate text-2xl md:text-3xl', active ? 'bg-ink px-2 text-cream' : 'group-hover:text-accent'].join(' ')}>
                        {loop.name}
                      </span>
                      <span className="mono-label mt-2 block truncate text-muted">
                        {active ? <span className="text-ink">Clock · </span> : ''}
                        {(loop.packId && packById.get(loop.packId)?.name) ?? loop.pack ?? ''}
                        {loop.category ? ` / ${loop.category}` : ''}
                        {(loop.tags ?? []).map((t) => (
                          <span key={t} className="ml-2">#{t}</span>
                        ))}
                      </span>
                    </button>
                    <span className="mono-label col-start-2 pb-3 md:col-start-auto md:py-4 md:text-right">
                      {loop.bpm} · {loop.bars}b
                    </span>
                    <span className="col-start-2 flex gap-2 pb-3 md:col-start-auto md:py-4 md:pl-4">
                      {loop.storagePath && (
                        <button type="button" aria-label={`Edit ${loop.name}`} onClick={() => setEditing(editing === loop.id ? null : loop.id)} className="pill pill-outline min-h-7 px-3">
                          Edit
                        </button>
                      )}
                      <button type="button" aria-label={`Remove ${loop.name}`} onClick={() => onRemove(loop)} className="pill pill-outline min-h-7 px-3">
                        Del
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
        )}
        {more('drums', drums.length, drumsVisible.length)}
      </div>

      {/* ---- Samples */}
      <div className="flex flex-col gap-4">
        {heading('sample', 'Samples', samples.length)}
        {open.sample && (
          <>
            <div className="flex gap-4">
              <input id="sample-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="SEARCH · #TAG TO FILTER BY TAG" className="field min-w-0 flex-1" />
              <input value={minBpm} onChange={(e) => setMinBpm(e.target.value)} placeholder="MIN" inputMode="numeric" className="field w-16" />
              <input value={maxBpm} onChange={(e) => setMaxBpm(e.target.value)} placeholder="MAX" inputMode="numeric" className="field w-16" />
            </div>

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

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setTight((v) => !v)} aria-pressed={tight} className={pill(tight)} title="Only samples within 20% of the drum tempo">
                ≤ 20% stretch
              </button>
              <button type="button" onClick={() => setSort((v) => (v === 'tempo' ? 'name' : 'tempo'))} aria-pressed={sort === 'tempo'} className={pill(sort === 'tempo')}>
                Closest tempo first
              </button>
              {keys.length > 0 && (
                <label className="mono-label ml-2 flex items-center gap-2 text-muted">
                  Key
                  <select
                    id="key-filter"
                    value={key ?? ''}
                    onChange={(e) => setKey(e.target.value || null)}
                    className={['pill min-h-8 cursor-pointer appearance-none pr-7', key ? '' : 'pill-outline'].join(' ')}
                    style={{ backgroundImage: 'none' }}
                  >
                    <option value="">Any key</option>
                    {keys.map(([k, n]) => (
                      <option key={k} value={k}>
                        {k} ({n})
                      </option>
                    ))}
                  </select>
                </label>
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

            {samples.length === 0 && <p className="mono-label py-4 text-muted">Nothing matches.</p>}
            {samples.length > 0 && (
              <div className={['mono-label hidden gap-3 border-b border-line py-2 text-muted md:grid', ROW_COLS].join(' ')}>
                <span />
                <span>Loop</span>
                <span>Key</span>
                <span>BPM</span>
                <span>Stretch</span>
                <span />
              </div>
            )}
            <ul className="grid gap-2 md:block md:gap-0">
              {samplesVisible.map((loop, i) => (
                <Fragment key={loop.id}>
                  <SampleRow
                    loop={loop}
                    index={i + 1}
                    packName={loop.packId ? (packById.get(loop.packId)?.name ?? null) : null}
                    masterBPM={masterBPM}
                    active={isActive(loop)}
                    loading={loadingIds.includes(loop.id)}
                    onSelect={() => onSelect(loop)}
                    onEdit={loop.storagePath ? () => setEditing(editing === loop.id ? null : loop.id) : null}
                    onRemove={() => onRemove(loop)}
                    removeLabel={isActive(loop) ? '×' : 'Del'}
                  />
                  {editing === loop.id && (
                    <li>
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
                    </li>
                  )}
                </Fragment>
              ))}
            </ul>
          </>
        )}
        {more('sample', samples.length, samplesVisible.length)}
      </div>
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
        {error && <p className="mono-label">{error}</p>}
      </div>
    </form>
  )
}
