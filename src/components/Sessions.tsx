import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Loop } from '../engine/types'
import type { Session } from '../lib/sessions'

type Props = {
  sessions: Session[] | null
  loops: readonly Loop[]
  canSave: boolean
  onSave: (name: string, notes: string) => Promise<void>
  onNotes: (s: Session, notes: string) => Promise<void>
  onLoad: (s: Session) => void
  onDelete: (s: Session) => void
}

/** Saved stacks. */
export function Sessions({ sessions, loops, canSave, onSave, onNotes, onLoad, onDelete }: Props) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string | null) => (id ? (loops.find((l) => l.id === id)?.name ?? 'missing loop') : 'no drums')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSave(name.trim(), notes.trim())
      setName('')
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="mono-label flex min-w-0 flex-1 flex-col gap-1 text-muted">
          Save what's playing as
          <input id="session-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="SUNDAY DUB" className="field text-ink" disabled={!canSave} />
        </label>
        <button type="submit" disabled={!canSave || busy || !name.trim()} className="pill">
          {busy ? 'Saving…' : 'Save session'}
        </button>
        {!canSave && <span className="mono-label text-muted">Pick a loop first.</span>}
        {error && <span className="mono-label text-accent">{error}</span>}
        <label className="mono-label flex w-full flex-col gap-1 text-muted">
          Notes
          <textarea
            id="session-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What's working, what to try next, where the horns should come in…"
            rows={3}
            className="field min-h-20 resize-y text-ink normal-case tracking-normal"
            disabled={!canSave}
          />
        </label>
      </form>

      {sessions === null ? (
        <p className="mono-label text-muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="mono-label text-muted">Nothing saved yet. Build a stack, name it, and it'll be here and on the headphones.</p>
      ) : (
        <ul className="border-t border-line">
          {sessions.map((s) => (
            <SessionRow key={s.id} s={s} meta={`${nameOf(s.drumsLoopId)} · ${s.samples.length} sample${s.samples.length === 1 ? '' : 's'} · ${new Date(s.updatedAt).toLocaleDateString()}`} onLoad={onLoad} onDelete={onDelete} onNotes={onNotes} />
          ))}
        </ul>
      )}

    </div>
  )
}

/** One saved session with its notes window. */
function SessionRow({ s, meta, onLoad, onDelete, onNotes }: { s: Session; meta: string; onLoad: (s: Session) => void; onDelete: (s: Session) => void; onNotes: (s: Session, notes: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(s.notes)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = draft !== s.notes

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await onNotes(s, draft.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="border-b border-line py-3">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <button type="button" onClick={() => onLoad(s)} className="headline text-left text-xl hover:text-accent md:text-2xl">
            {s.name}
          </button>
          <p className="mono-label mt-1 text-muted">{meta}</p>
          {!open && s.notes && <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-ink">{s.notes}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onLoad(s)} className="pill min-h-7 px-3">Load</button>
          <button type="button" aria-expanded={open} aria-label={`Notes for ${s.name}`} onClick={() => setOpen((v) => !v)} className={['pill min-h-7 px-3', open ? '' : 'pill-outline'].join(' ')}>
            Notes{s.notes ? ' ·' : ''}
          </button>
          <button type="button" aria-label={`Delete session ${s.name}`} onClick={() => onDelete(s)} className="pill pill-outline min-h-7 px-3">Delete</button>
        </div>
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && dirty) void save()
            }}
            placeholder="Notes for this session…"
            rows={5}
            className="field min-h-28 w-full resize-y text-ink normal-case tracking-normal"
            aria-label={`Notes text for ${s.name}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={!dirty || busy} className="pill min-h-7 px-3">
              {busy ? 'Saving…' : 'Save notes'}
            </button>
            <button type="button" onClick={() => { setDraft(s.notes); setOpen(false) }} className="pill pill-outline min-h-7 px-3">Close</button>
            <span className="mono-label text-muted">{error ?? (dirty ? 'Unsaved · ⌘↵ saves' : 'Saved with the session')}</span>
          </div>
        </div>
      )}
    </li>
  )
}
