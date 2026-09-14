import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AuthState = {
  /** `undefined` while loading, `null` when signed out. */
  session: Session | null | undefined
  /** True after arriving via a password-reset link; the user must set a new password. */
  recovering: boolean
  finishRecovery: () => void
}

export function useSession(): AuthState {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return { session, recovering, finishRecovery: () => setRecovering(false) }
}
