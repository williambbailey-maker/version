import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

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
    <main className="min-h-screen bg-cream text-jet">
      <header className="sticky top-0 z-10 flex h-20 items-center border-b border-line bg-cream/95 px-4 backdrop-blur md:px-6">
        <span className="text-lg font-bold uppercase tracking-[-0.02em]">Loop Lab</span>
      </header>
      <section className="grid min-h-[calc(100vh-5rem)] grid-cols-1 md:grid-cols-12">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:items-start md:border-b-0 md:border-r md:px-6 md:py-8 md:col-span-3">
          <span className="label-caps text-jet md:[writing-mode:vertical-rl] md:rotate-180">Recovery</span>
        </div>
        <div className="flex flex-col justify-center gap-10 px-4 py-10 md:col-span-9 md:px-8">
          <h1 className="text-5xl font-bold leading-[0.9] tracking-[-0.03em] md:text-7xl">
            Choose a new <span className="text-cobalt">password</span>.
          </h1>
          <form onSubmit={submit} className="grid max-w-xl gap-3">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (6+ characters)"
              className="field text-base"
              required
              minLength={6}
            />
            <div>
              <button type="submit" disabled={busy || password.length < 6} className="btn bg-cobalt text-cream hover:bg-jet disabled:opacity-40">
                Save password
              </button>
            </div>
          </form>
          {msg && <p className="text-lg text-cobalt">{msg}</p>}
        </div>
      </section>
    </main>
  )
}
