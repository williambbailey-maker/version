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
    <main className="min-h-screen bg-cream text-jet">
      <header className="sticky top-0 z-10 flex h-20 items-center border-b border-line bg-cream/95 px-4 backdrop-blur md:px-6">
        <span className="text-lg font-bold uppercase tracking-[-0.02em]">Loop Lab</span>
      </header>
      <section className="grid min-h-[calc(100vh-5rem)] grid-cols-1 md:grid-cols-12">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:items-start md:border-b-0 md:border-r md:px-6 md:py-8 md:col-span-3">
          <span className="block h-4 w-4 bg-jet" aria-hidden="true" />
          <span className="label-caps text-jet md:[writing-mode:vertical-rl] md:rotate-180">Access</span>
        </div>
        <div className="flex flex-col justify-center gap-10 px-4 py-10 md:col-span-9 md:px-8">
          <h1 className="text-6xl font-bold leading-[0.85] tracking-[-0.04em] md:text-8xl">
            Your loops,
            <br />
            <span className="text-cobalt">locked</span> to
            <br />
            your drums.
          </h1>
          <form onSubmit={signIn} className="grid max-w-xl grid-cols-1 gap-3">
            <label className="label-caps flex flex-col gap-2">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field text-base normal-case tracking-normal text-jet"
                required
              />
            </label>
            <label className="label-caps flex flex-col gap-2">
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field text-base normal-case tracking-normal text-jet"
                minLength={6}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <button type="submit" disabled={busy} className="btn bg-cobalt text-cream hover:bg-jet disabled:opacity-40">
                Sign in
              </button>
              <button
                type="button"
                onClick={signUp}
                disabled={busy || !email || password.length < 6}
                className="btn bg-jet text-cream hover:bg-cobalt disabled:opacity-40"
              >
                Create account
              </button>
              <button type="button" onClick={forgot} disabled={busy} className="label-caps underline underline-offset-4 hover:text-cobalt">
                Forgot password?
              </button>
            </div>
          </form>
          {msg && <p className="max-w-[400px] text-lg leading-normal text-ink">{msg}</p>}
        </div>
      </section>
    </main>
  )
}
