import { createClient } from '@supabase/supabase-js'

/**
 * Project "loop-lab". The publishable key is designed to ship in the client
 * bundle; row-level security is what protects the data. Env vars override
 * these defaults for a different project.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://rwnxuaencumaftsvthim.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_uAACIh5IsM83Yl8pRZHjVQ_o8J9YV5V'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const BUCKET = 'loops'
