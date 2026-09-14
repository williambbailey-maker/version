import { useMemo, useState } from 'react'
import type { Loop, LoopKind } from '../engine/types'

type Props = {
  loops: Loop[]
  masterBPM: number
  activeIds: Record<LoopKind, string | null>
  loadingIds: readonly string[]
  onSelect: (loop: Loop) => void
  onRemove: (loop: Loop) => void
}

const PAGE = 60

/** Searchable, filterable list of the whole library. Bare-bones until phase 2. */
export function Library({ loops, masterBPM, activeIds, loadingIds, onSelect, onRemove }: Props) {
  const [q, setQ] = useState('')
  const [minBpm, setMinBpm] = useState('')
  const [maxBpm, setMaxBpm] = useState('')
  const [shown, setShown] = useState<Record<LoopKind, number>>({ drums: PAGE, sample: PAGE })

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const lo = Number(minBpm) || 0
    const hi = Number(maxBpm) || Infinity
    return loops.filter((l) => {
      if (l.bpm < lo || l.bpm > hi) return false
      if (!needle) return true
      return `${l.name} ${l.pack ?? ''} ${l.key ?? ''} ${l.bpm}`.toLowerCase().includes(needle)
    })
  }, [loops, q, minBpm, maxBpm])

  const section = (kind: LoopKind, title: string) => {
    const rows = filtered.filter((l) => l.kind === kind)
    const visible = rows.slice(0, shown[kind])
    return (
      <section className="flex flex-col gap-2">
        <h2 className="flex items-baseline justify-between text-sm uppercase tracking-wide text-stone-500">
          {title}
          <span className="font-mono text-xs normal-case">{rows.length}</span>
        </h2>
        {rows.length === 0 && <p className="text-sm text-stone-500">Nothing here yet.</p>}
        <ul className="flex flex-col gap-1">
          {visible.map((loop) => {
            const active = activeIds[kind] === loop.id
            const loading = loadingIds.includes(loop.id)
            const ratio = masterBPM / loop.bpm
            return (
              <li key={loop.id} className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(loop)}
                  aria-pressed={active}
                  className={[
                    'flex min-h-14 flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left',
                    active ? 'border-orange-600 bg-orange-100' : 'border-stone-300 bg-white hover:bg-stone-100',
                    loading ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{loop.name}</span>
                    <span className="block truncate text-xs text-stone-500">{loop.pack ?? ''}</span>
                  </span>
                  <span className="shrink-0 text-right font-mono text-xs text-stone-600">
                    {loop.bpm} · {loop.bars}b{loop.key ? ` · ${loop.key}` : ''}
                    {kind === 'sample' && (
                      <span className="block">{ratio >= 1 ? '+' : ''}{Math.round((ratio - 1) * 100)}%</span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${loop.name}`}
                  onClick={() => onRemove(loop)}
                  className="w-9 shrink-0 rounded text-stone-400 hover:bg-stone-200 hover:text-stone-900"
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
        {rows.length > visible.length && (
          <button
            type="button"
            onClick={() => setShown((s) => ({ ...s, [kind]: s[kind] + PAGE }))}
            className="min-h-10 rounded border border-stone-300 text-sm text-stone-600"
          >
            Show more ({rows.length - visible.length} left)
          </button>
        )}
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, pack, key…"
          className="min-h-12 flex-1 rounded border border-stone-300 px-3"
        />
        <input
          value={minBpm}
          onChange={(e) => setMinBpm(e.target.value)}
          placeholder="min"
          inputMode="numeric"
          className="min-h-12 w-16 rounded border border-stone-300 px-2 font-mono text-sm"
        />
        <input
          value={maxBpm}
          onChange={(e) => setMaxBpm(e.target.value)}
          placeholder="max"
          inputMode="numeric"
          className="min-h-12 w-16 rounded border border-stone-300 px-2 font-mono text-sm"
        />
      </div>
      {section('drums', 'Drums')}
      {section('sample', 'Samples')}
    </div>
  )
}
