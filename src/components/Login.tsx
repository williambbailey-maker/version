import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Mark } from './Mark'
import { Wordmark } from './Wordmark'

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

  const forgot = () => {
    void run(async () => {
      if (!email) return 'Enter your email first, then tap Forgot password.'
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      return error ? error.message : 'Reset link sent. Open it on this device to choose a new password.'
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
    <main className="min-h-screen bg-cream text-ink">
      <header className="px-4 pt-4 md:px-6">
        <Wordmark />
        <div className="mono-label flex justify-between pt-2 text-muted">
          <span>Loop auditioning</span>
          <span className="hidden sm:inline">Varispeed</span>
          <span className="hidden sm:inline">Bar-quantized</span>
          <span>Access</span>
        </div>
      </header>
      <section className="grid grid-cols-1 gap-10 px-4 py-12 md:grid-cols-2 md:px-6 md:py-20">
        <div className="flex items-start gap-4">
          <Mark />
          <div className="flex flex-col gap-1">
            <span className="tag">Loop Lab</span>
            <span className="tag">A private loop library</span>
          </div>
        </div>
        <div className="flex flex-col gap-8">
          <h1 className="headline text-4xl md:text-5xl">Your loops, locked to your drums.</h1>
          <form onSubmit={signIn} className="grid max-w-md gap-4">
            <label className="mono-label flex flex-col gap-1 text-muted">
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field text-ink" required />
            </label>
            <label className="mono-label flex flex-col gap-1 text-muted">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field text-ink"
                minLength={6}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="submit" disabled={busy} className="pill">
                Sign in
              </button>
              <button type="button" onClick={signUp} disabled={busy || !email || password.length < 6} className="pill pill-outline">
                Create account
              </button>
              <button type="button" onClick={forgot} disabled={busy} className="pill pill-outline">
                Forgot password?
              </button>
            </div>
          </form>
          {msg && <p className="mono-label max-w-md text-muted">{msg}</p>}
        </div>
      </section>
    </main>
  )
}
