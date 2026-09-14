import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true)
    setMsg(null)
    try {
      setMsg(await fn())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const signIn = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? error.message : null
    })
  }

  const signUp = () => {
    void run(async () => {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) return error.message
      return data.session ? null : 'Account created. Check your email for the confirmation link, then sign in.'
    })
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 bg-stone-50 p-6 text-stone-900">
      <h1 className="text-2xl">Loop Lab</h1>
      <form onSubmit={signIn} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-stone-300 px-3 py-3"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-stone-300 px-3 py-3"
            required
            minLength={6}
          />
        </label>
        <button type="submit" disabled={busy} className="min-h-12 rounded bg-orange-600 text-white disabled:opacity-40">
          Sign in
        </button>
        <button
          type="button"
          onClick={signUp}
          disabled={busy || !email || password.length < 6}
          className="min-h-12 rounded border border-stone-400 text-stone-700 disabled:opacity-40"
        >
          Create account
        </button>
      </form>
      {msg && <p className="text-sm text-stone-700">{msg}</p>}
    </main>
  )
}
