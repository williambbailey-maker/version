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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-stone-50 p-6 text-stone-900">
      <h1 className="text-2xl">Choose a new password</h1>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (6+ characters)"
          className="rounded border border-stone-300 px-3 py-3"
          required
          minLength={6}
        />
        <button type="submit" disabled={busy || password.length < 6} className="min-h-12 rounded bg-orange-600 text-white disabled:opacity-40">
          Save password
        </button>
      </form>
      {msg && <p className="text-sm text-red-700">{msg}</p>}
    </main>
  )
}
