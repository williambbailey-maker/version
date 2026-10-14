import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Loop } from '../engine/types'
import { byBpm, groupPack, packList, stemLabel, stripPrefix } from '../lib/groups'
import type { Group } from '../lib/groups'

type Props = {
  /** Samples after the search and filters have been applied (all packs). */
  samples: Loop[]
  packNames: ReadonlyMap<string, string>
  selected: string | null // pack key
  onSelectPack: (key: string) => void
  masterBPM: number
  isActive: (loop: Loop) => boolean
  loadingIds: readonly string[]
  onToggle: (loop: Loop) => void
  onFavorite: (loop: Loop) => void
  /** The ledger rows (edit, delete, stretch meter) for a group's loops. */
  renderRows: (loops: Loop[]) => ReactNode
  /** True while any search/filter narrows the list: hide empty packs, auto-expand a lone group. */
  filtering: boolean
}

const BIG_FOLDER = 24

const fmt = (ratio: number) => `${ratio >= 1 ? '+' : '−'}${Math.abs(Math.round((ratio - 1) * 100))}%`

/**
 * Packs on the left, the chosen pack's groups on the right; phones show one
 * pane at a time. One group opens at a time and shows its loops as a grid
 * of toggles. Kits layer, folders audition one loop at a time.
 */
export function Browser(props: Props) {
  const { samples, packNames, selected, onSelectPack, masterBPM, isActive, loadingIds, onToggle, onFavorite, renderRows, filtering } = props
  const packs = useMemo(() => packList(samples, packNames), [samples, packNames])
  const current = useMemo(() => packs.find((p) => p.key === selected) ?? packs[0] ?? null, [packs, selected])
  const data = useMemo(() => (current ? groupPack(samples, current) : null), [samples, current])

  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState(false)
  const [pane, setPane] = useState<'packs' | 'groups'>(selected ? 'groups' : 'packs')

  // A lone group (after filtering) opens itself; a pack change closes whatever was open.
  useEffect(() => {
    if (!data) return
    if (filtering && data.groups.length === 1) setExpanded(data.groups[0]!.key)
    else if (expanded && !data.groups.some((g) => g.key === expanded)) setExpanded(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filtering])

  const pickPack = (key: string) => {
    onSelectPack(key)
    setExpanded(null)
    setDetails(false)
    setPane('groups')
  }

  const open = (group: Group) => {
    setExpanded(expanded === group.key ? null : group.key)
    setDetails(false)
  }

  /** Every tap adds (or removes) that loop; ‹ › in the mixer is the way to swap. */
  const tap = (_group: Group, loop: Loop) => onToggle(loop)

  const stem = (group: Group, loop: Loop) => {
    const on = isActive(loop)
    const loading = loadingIds.includes(loop.id)
    const label = group.kind === 'kit' ? stemLabel(loop.name, group.name) : stripPrefix(loop.name)
    const ratio = masterBPM / loop.bpm
    const fav = loop.favorite === true
    return (
      <div key={loop.id} className="relative min-w-0">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => tap(group, loop)}
          title={loop.name}
          className={[
            'flex min-h-11 w-full min-w-0 flex-col items-start justify-center gap-0.5 border-[1.5px] py-2 pl-3 pr-9 text-left transition-colors duration-150',
            on ? 'border-ink bg-ink text-cream' : 'border-line hover:border-ink',
            loading ? 'opacity-60' : '',
          ].join(' ')}
        >
          <span className="w-full truncate text-sm font-bold">{label}</span>
          <span className={['mono-label', on ? 'text-cream/80' : 'text-muted'].join(' ')}>
            {group.kind === 'folder' ? `${loop.bpm}${loop.key ? ` · ${loop.key}` : ''} · ` : ''}
            {fmt(ratio)}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={fav}
          aria-label={fav ? `Unfavourite ${loop.name}` : `Favourite ${loop.name}`}
          onClick={() => onFavorite(loop)}
          className={['absolute right-1 top-1 grid h-8 w-8 place-items-center text-base leading-none transition-colors duration-150', fav ? 'text-accent' : on ? 'text-cream/50 hover:text-cream' : 'text-line hover:text-accent'].join(' ')}
        >
          {fav ? '★' : '☆'}
        </button>
      </div>
    )
  }

  const grid = (group: Group, loops: Loop[]) => <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{loops.map((l) => stem(group, l))}</div>

  const groupBody = (group: Group) => {
    if (details) return <div className="mt-3">{renderRows(group.loops)}</div>
    if (group.kind === 'folder' && group.loops.length > BIG_FOLDER) {
      return (
        <div className="mt-3 flex flex-col gap-4">
          {byBpm(group.loops).map((bin) => (
            <div key={bin.bpm}>
              <p className="mono-label mb-2 text-muted">{bin.bpm} BPM · {bin.loops.length}</p>
              {grid(group, bin.loops)}
            </div>
          ))}
        </div>
      )
    }
    return <div className="mt-3">{grid(group, group.loops)}</div>
  }

  const packPane = (
    <div className="flex flex-col">
      <p className="mono-label border-b border-ink pb-2 text-muted">Packs · {packs.length}</p>
      {packs.length === 0 && <p className="mono-label py-4 text-muted">Nothing matches.</p>}
      <ul>
        {packs.map((p) => {
          const on = current?.key === p.key
          return (
            <li key={p.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => pickPack(p.key)}
                className={['flex min-h-11 w-full items-center justify-between gap-3 border-b border-line px-2 text-left transition-colors duration-150', on ? 'bg-ink text-cream' : 'hover:bg-cream-2'].join(' ')}
              >
                <span className="min-w-0 truncate text-sm font-bold">{p.name}</span>
                <span className={['mono-label shrink-0', on ? 'text-cream/80' : 'text-muted'].join(' ')}>{p.count}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )

  const groupPane = data ? (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <button type="button" onClick={() => setPane('packs')} className="pill pill-outline min-h-8 px-3 md:hidden" aria-label="Back to packs">
            ‹ Packs
          </button>
          <span className="headline truncate text-2xl">{data.pack.name}</span>
        </div>
        <span className="mono-label shrink-0 text-muted">{data.summary}</span>
      </div>
      <ul>
        {data.groups.map((g) => {
          const isOpen = expanded === g.key
          const playing = g.loops.filter((l) => isActive(l)).length
          return (
            <li key={g.key} className="border-b border-line">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => open(g)}
                className={['flex min-h-12 w-full items-center gap-3 px-2 py-2 text-left transition-colors duration-150', isOpen ? 'bg-cream-2' : 'hover:bg-cream-2'].join(' ')}
              >
                <span className="inline-block w-3 text-sm transition-transform duration-200 ease-linear" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }} aria-hidden="true">
                  ▸
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm font-bold">{g.name}</span>
                    {g.kind === 'kit' && <span className="tag">Kit</span>}
                    {playing > 0 && <span className="tag">{playing} on</span>}
                  </span>
                  <span className="mono-label truncate text-muted">{g.preview}</span>
                </span>
                <span className="mono-label shrink-0 text-right text-muted">
                  {g.kind === 'kit' && g.bpm !== null ? `${g.bpm}${g.musicalKey ? ` · ${g.musicalKey}` : ''} · ` : ''}
                  {g.loops.length}
                </span>
              </button>
              {isOpen && (
                <div className="px-2 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="mono-label text-muted">
                      {g.kind === 'kit' ? 'Stems layer: tap several.' : 'Tap to add, tap again to take out.'}
                    </span>
                    <button type="button" onClick={() => setDetails((v) => !v)} aria-pressed={details} className="pill pill-outline min-h-8 px-3">
                      {details ? 'Grid' : 'Details'}
                    </button>
                  </div>
                  {groupBody(g)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  ) : (
    <p className="mono-label py-4 text-muted">Pick a pack.</p>
  )

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[18rem_minmax(0,1fr)] md:gap-8">
      <div className={pane === 'packs' ? '' : 'hidden md:block'}>{packPane}</div>
      <div className={pane === 'groups' ? '' : 'hidden md:block'}>{groupPane}</div>
    </div>
  )
}
