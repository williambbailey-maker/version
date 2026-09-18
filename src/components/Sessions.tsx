import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Loop } from '../engine/types'
import type { Session } from '../lib/sessions'

type Props = {
  sessions: Session[] | null
  loops: readonly Loop[]
  canSave: boolean
  onSave: (name: string) => Promise<void>
  onLoad: (s: Session) => void
  onDelete: (s: Session) => void
}

/** Saved stacks. */
export function Sessions({ sessions, loops, canSave, onSave, onLoad, onDelete }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string | null) => (id ? (loops.find((l) => l.id === id)?.name ?? 'missing loop') : 'no drums')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSave(name.trim())
      setName('')
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
      </form>

      {sessions === null ? (
        <p className="mono-label text-muted">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="mono-label text-muted">Nothing saved yet. Build a stack, name it, and it'll be here and on the headphones.</p>
      ) : (
        <ul className="border-t border-line">
          {sessions.map((s) => (
            <li key={s.id} className="grid grid-cols-1 gap-2 border-b border-line py-3 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <button type="button" onClick={() => onLoad(s)} className="headline text-left text-xl hover:text-accent md:text-2xl">
                  {s.name}
                </button>
                <p className="mono-label mt-1 text-muted">
                  {nameOf(s.drumsLoopId)} · {s.samples.length} sample{s.samples.length === 1 ? '' : 's'} · {new Date(s.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => onLoad(s)} className="pill min-h-7 px-3">Load</button>
                <button type="button" aria-label={`Delete session ${s.name}`} onClick={() => onDelete(s)} className="pill pill-outline min-h-7 px-3">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

    </div>
  )
}
