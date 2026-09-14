import type { Loop } from '../engine/types'

export type Query = { text: string; tags: string[] }

/** "#reggae warm #skank" → { text: "warm", tags: ["reggae", "skank"] } */
export function parseQuery(q: string): Query {
  const tags: string[] = []
  const words: string[] = []
  for (const tok of q.trim().split(/\s+/)) {
    if (!tok) continue
    if (tok.startsWith('#') && tok.length > 1) tags.push(tok.slice(1).toLowerCase())
    else words.push(tok.toLowerCase())
  }
  return { text: words.join(' '), tags }
}

export function matches(loop: Loop, q: Query): boolean {
  const tags = loop.tags ?? []
  for (const t of q.tags) if (!tags.includes(t)) return false
  if (!q.text) return true
  const hay = `${loop.name} ${loop.pack ?? ''} ${loop.key ?? ''} ${loop.bpm} ${tags.join(' ')}`.toLowerCase()
  return hay.includes(q.text)
}

/** Tag → count over a set of loops, most common first. */
export function tagCounts(loops: readonly Loop[]): [string, number][] {
  const m = new Map<string, number>()
  for (const l of loops) for (const t of l.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
