import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Pack, PackPatch } from '../lib/loops'
import { parseTagInput } from '../lib/loops'
import type { PackStats } from '../lib/packs'

type Props = {
  packs: Pack[]
  stats: Map<string, PackStats>
  selected: string | null
  onSelect: (id: string | null) => void
  onEdit: (pack: Pack, patch: PackPatch) => Promise<void>
}

/** Every pack with its info and rollups; selecting one filters the library. */
export function Packs({ packs, stats, selected, onSelect, onEdit }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? packs.filter((p) => `${p.name} ${p.publisher ?? ''} ${p.genres.join(' ')} ${p.description ?? ''}`.toLowerCase().includes(needle))
    : packs

  if (packs.length === 0) return <p className="mono-label text-muted">No packs yet. Import a folder and each sub-folder becomes a pack.</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => onSelect(null)} className={['pill', selected === null ? '' : 'pill-outline'].join(' ')}>
          All packs · {packs.length}
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="FIND A PACK" className="field min-h-8 w-48 py-1" />
      </div>
      <ul className="border-t border-line">
        {shown.map((pack, i) => {
          const s = stats.get(pack.id)
          const active = selected === pack.id
          return (
            <li key={pack.id} className="border-b border-line">
              <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 py-4 md:grid-cols-[2.5rem_5rem_1fr_auto] md:gap-x-4">
                <span className="mono-label pt-1 text-muted">{String(i + 1).padStart(3, '0')}</span>
                <span className="hidden md:block">
                  {pack.coverUrl ? (
                    <img src={pack.coverUrl} alt="" className="grain h-20 w-20 object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  ) : (
                    <span className="grain block h-20 w-20 bg-ink" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <button type="button" onClick={() => onSelect(active ? null : pack.id)} aria-pressed={active} className="group text-left">
                    <span className={['headline inline-block max-w-full truncate text-2xl md:text-3xl', active ? 'grain bg-ink px-2 text-cream' : 'group-hover:underline group-hover:underline-offset-4'].join(' ')}>
                      {pack.name}
                    </span>
                  </button>
                  <div className="mono-label mt-2 flex flex-wrap gap-x-3 gap-y-1 text-muted">
                    {pack.publisher && <span className="text-ink">{pack.publisher}</span>}
                    {s && (
                      <>
                        <span>{s.count} loops · {s.drums} drums · {s.samples} samples</span>
                        {s.bpmMin !== null && <span>{s.bpmMin === s.bpmMax ? `${s.bpmMin} bpm` : `${s.bpmMin}–${s.bpmMax} bpm`}</span>}
                        {s.keys.length > 0 && <span>{s.keys.slice(0, 6).join(' ')}{s.keys.length > 6 ? ' …' : ''}</span>}
                      </>
                    )}
                  </div>
                  {pack.genres.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {pack.genres.map((g) => (
                        <span key={g} className="tag">{g}</span>
                      ))}
                    </div>
                  )}
                  {pack.description && <p className="mt-2 max-w-2xl text-base leading-snug text-ink">{pack.description}</p>}
                  {pack.notes && <p className="mono-label mt-2 max-w-2xl text-muted">Notes: {pack.notes}</p>}
                  {s && s.categories.length > 0 && <p className="mono-label mt-2 text-muted">Folders: {s.categories.join(' · ')}</p>}
                </div>
                <div className="col-start-2 mt-3 flex gap-2 md:col-start-auto md:mt-0 md:flex-col md:items-end">
                  <button type="button" onClick={() => onSelect(active ? null : pack.id)} className={['pill min-h-7 px-3', active ? '' : 'pill-outline'].join(' ')}>
                    {active ? 'Showing' : 'Show loops'}
                  </button>
                  {pack.url && (
                    <a href={pack.url} target="_blank" rel="noreferrer" className="pill pill-outline min-h-7 px-3">
                      Open link
                    </a>
                  )}
                  <button type="button" aria-label={`Edit pack ${pack.name}`} onClick={() => setEditing(editing === pack.id ? null : pack.id)} className="pill pill-outline min-h-7 px-3">
                    Edit
                  </button>
                </div>
              </div>
              {editing === pack.id && (
                <PackEditor
                  pack={pack}
                  onSave={async (patch) => {
                    await onEdit(pack, patch)
                    setEditing(null)
                  }}
                  onCancel={() => setEditing(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PackEditor({ pack, onSave, onCancel }: { pack: Pack; onSave: (patch: PackPatch) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(pack.name)
  const [publisher, setPublisher] = useState(pack.publisher ?? '')
  const [url, setUrl] = useState(pack.url ?? '')
  const [coverUrl, setCoverUrl] = useState(pack.coverUrl ?? '')
  const [genres, setGenres] = useState(pack.genres.join(', '))
  const [description, setDescription] = useState(pack.description ?? '')
  const [notes, setNotes] = useState(pack.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({
        name: name.trim() || pack.name,
        publisher: publisher.trim() || null,
        url: url.trim() || null,
        coverUrl: coverUrl.trim() || null,
        genres: parseTagInput(genres),
        description: description.trim() || null,
        notes: notes.trim() || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, placeholder = '') => (
    <label className="mono-label flex flex-col gap-1 text-muted">
      {label}
      <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="field text-ink" />
    </label>
  )

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 border-t border-line py-4 md:grid-cols-2">
      {field('Name', name, setName)}
      {field('Publisher / label', publisher, setPublisher, 'e.g. Splice, Loopmasters, an artist')}
      {field('Link', url, setUrl, 'https://…')}
      {field('Cover image URL', coverUrl, setCoverUrl, 'https://…jpg')}
      {field('Genres', genres, setGenres, 'reggae, dub')}
      <label className="mono-label flex flex-col gap-1 text-muted md:col-span-2">
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="field text-ink" />
      </label>
      <label className="mono-label flex flex-col gap-1 text-muted md:col-span-2">
        Your notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="What's good in here, what to avoid" className="field text-ink" />
      </label>
      <div className="flex items-center gap-2 md:col-span-2">
        <button type="submit" disabled={busy} className="pill">Save</button>
        <button type="button" onClick={onCancel} className="pill pill-outline">Cancel</button>
        {error && <p className="mono-label">{error}</p>}
      </div>
    </form>
  )
}
