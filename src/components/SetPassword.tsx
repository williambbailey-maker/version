import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Wordmark'

type Props = { onDone: () => void }

/** Shown after arriving via a password-reset link. */
export function SetPassword({ onDone }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setMsg(error.message)
    else onDone()
  }

  return (
    <main className="min-h-screen bg-cream text-ink">
      <header className="px-4 pt-4 md:px-6">
        <Wordmark />
        <div className="mono-label flex justify-between pt-2 text-muted">
          <span>Loop auditioning</span>
          <span>Recovery</span>
        </div>
      </header>
      <section className="grid grid-cols-1 gap-10 px-4 py-12 md:grid-cols-2 md:px-6 md:py-20">
        <div className="flex flex-col items-start gap-1">
          <span className="tag">Recovery</span>
          <span className="tag">Choose a new password</span>
        </div>
        <form onSubmit={submit} className="grid max-w-md gap-4">
          <h1 className="headline text-4xl">Choose a new password.</h1>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="NEW PASSWORD (6+ CHARACTERS)"
            className="field"
            required
            minLength={6}
          />
          <div>
            <button type="submit" disabled={busy || password.length < 6} className="pill">
              Save password
            </button>
          </div>
          {msg && <p className="mono-label">{msg}</p>}
        </form>
      </section>
    </main>
  )
}
