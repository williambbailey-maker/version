import type { Loop } from '../engine/types'
import type { BoostState, EngineState } from '../engine/engine'
import { supabase } from './supabase'

export type SessionSample = { loopId: string; gain: number; muted: boolean; solo: boolean }

export type Session = {
  id: string
  name: string
  drumsLoopId: string | null
  samples: SessionSample[]
  boost: BoostState | null
  updatedAt: string
}

type Row = { id: string; name: string; drums_loop_id: string | null; samples: unknown; boost: unknown; updated_at: string }

function boostFrom(raw: unknown): BoostState | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  return { on: b.on === true, preset: typeof b.preset === 'string' ? b.preset : 'default' }
}

function fromRow(r: Row): Session {
  const raw = Array.isArray(r.samples) ? (r.samples as Record<string, unknown>[]) : []
  return {
    id: r.id,
    name: r.name,
    drumsLoopId: r.drums_loop_id,
    samples: raw
      .filter((s) => typeof s.loop_id === 'string')
      .map((s) => ({
        loopId: s.loop_id as string,
        gain: typeof s.gain === 'number' ? s.gain : 0.8,
        muted: s.muted === true,
        solo: s.solo === true,
      })),
    boost: boostFrom(r.boost),
    updatedAt: r.updated_at,
  }
}

/** What to save: the current stack as ids and levels. Pure, so it's testable. */
export function snapshotStack(state: EngineState): { drumsLoopId: string | null; samples: SessionSample[]; boost: BoostState } {
  const d = state.drums.loop ?? state.drums.pending
  const samples: SessionSample[] = []
  for (const s of state.samples) {
    const l = s.loop ?? s.pending
    if (l) samples.push({ loopId: l.id, gain: s.gain, muted: s.muted, solo: s.solo })
  }
  return { drumsLoopId: d?.id ?? null, samples, boost: state.boost }
}

/** Resolve a session against the loaded library; reports what's missing. */
export function resolveStack(session: Session, loops: readonly Loop[]): {
  drums: Loop | null
  samples: { loop: Loop; gain: number; muted: boolean; solo: boolean }[]
  boost: BoostState | null
  missing: number
} {
  const byId = new Map(loops.map((l) => [l.id, l]))
  let missing = 0
  const drums = session.drumsLoopId ? (byId.get(session.drumsLoopId) ?? null) : null
  if (session.drumsLoopId && !drums) missing++
  const samples: { loop: Loop; gain: number; muted: boolean; solo: boolean }[] = []
  for (const s of session.samples) {
    const loop = byId.get(s.loopId)
    if (!loop) {
      missing++
      continue
    }
    samples.push({ loop, gain: s.gain, muted: s.muted, solo: s.solo })
  }
  return { drums, samples, boost: session.boost, missing }
}

export async function listSessions(): Promise<Session[]> {
  const { data, error } = await supabase.from('sessions').select('id,name,drums_loop_id,samples,boost,updated_at').order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data as Row[]).map(fromRow)
}

export async function saveSession(name: string, stack: { drumsLoopId: string | null; samples: SessionSample[]; boost?: BoostState | null }, id?: string): Promise<Session> {
  const row = {
    name: name.trim(),
    drums_loop_id: stack.drumsLoopId,
    samples: stack.samples.map((s) => ({ loop_id: s.loopId, gain: s.gain, muted: s.muted, solo: s.solo })),
    boost: stack.boost ?? null,
    updated_at: new Date().toISOString(),
  }
  const q = id ? supabase.from('sessions').update(row).eq('id', id) : supabase.from('sessions').insert(row)
  const { data, error } = await q.select('id,name,drums_loop_id,samples,boost,updated_at').single()
  if (error) throw new Error(error.message)
  return fromRow(data as Row)
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('sessions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
