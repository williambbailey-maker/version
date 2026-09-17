import type { Loop } from '../engine/types'
import { StretchMeter } from './StretchMeter'

type Props = {
  loop: Loop
  index: number
  packName: string | null
  masterBPM: number
  active: boolean
  loading: boolean
  onSelect: () => void
  onEdit: (() => void) | null
  onRemove: () => void
  removeLabel: string
}

export const ROW_COLS = 'grid-cols-[2rem_1fr_4rem_3.5rem_7.5rem_9rem]'

const fmt = (ratio: number) => `${ratio >= 1 ? '+' : '−'}${Math.abs(Math.round((ratio - 1) * 100))}%`

/** One sample: a fixed-height ledger row on desktop, a card on the phone. */
export function SampleRow({ loop, index, packName, masterBPM, active, loading, onSelect, onEdit, onRemove, removeLabel }: Props) {
  const ratio = masterBPM / loop.bpm
  const over = Math.abs(ratio - 1) > 0.2
  const tagCount = loop.tags?.length ?? 0
  const sub = [packName ?? loop.pack, loop.category].filter(Boolean).join(' / ')
  const key = loop.key ? <span className={['chip', active ? 'chip-on' : ''].join(' ')}>{loop.key}</span> : <span className="text-muted">—</span>

  const actions = (
    <span className={['flex gap-1.5', active ? 'row-actions-on' : 'row-actions'].join(' ')} onClick={(e) => e.stopPropagation()}>
      {onEdit && (
        <button type="button" aria-label={`Edit ${loop.name}`} onClick={onEdit} className="pill min-h-6 px-2.5 text-[10px]">
          Edit
        </button>
      )}
      <button type="button" aria-label={`Remove ${loop.name}`} onClick={onRemove} className="pill min-h-6 px-2.5 text-[10px]">
        {removeLabel}
      </button>
    </span>
  )

  return (
    <li className={loading ? 'opacity-60' : ''}>
      {/* desktop: ledger row */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        className={[
          'group hidden min-h-[52px] cursor-pointer items-center gap-3 border-b border-line py-1.5 transition-colors duration-150 md:grid',
          ROW_COLS,
          active ? 'bg-ink text-cream' : 'hover:bg-[#f3ece0]',
        ].join(' ')}
      >
        <span className={['mono-label text-right', active ? 'text-cream/70' : 'text-muted'].join(' ')}>{String(index).padStart(3, '0')}</span>
        <span className="min-w-0">
          <span className="headline block truncate text-[15px] font-bold tracking-[-0.01em]">{loop.name}</span>
          <span className={['mono-label block truncate', active ? 'text-cream/70' : 'text-muted'].join(' ')}>
            {sub}
            {tagCount ? ` · ${tagCount} tag${tagCount === 1 ? '' : 's'}` : ''}
          </span>
        </span>
        <span>{key}</span>
        <span className="mono-label tabular-nums">{loop.bpm}</span>
        <span className="flex items-center gap-2">
          <StretchMeter ratio={ratio} />
          <span className={['mono-label w-12 shrink-0 text-right tabular-nums', over && !active ? 'text-accent' : ''].join(' ')}>{fmt(ratio)}</span>
        </span>
        <span className="flex justify-end pr-1">{actions}</span>
      </div>

      {/* phone: card */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        className={[
          'grid cursor-pointer gap-2 rounded-md border-[1.5px] border-ink p-3 md:hidden',
          active ? 'bg-ink text-cream' : '',
        ].join(' ')}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="headline min-w-0 truncate text-[15px] font-bold tracking-[-0.01em]">{loop.name}</span>
          <span className={['mono-label shrink-0 tabular-nums', over && !active ? 'text-accent' : ''].join(' ')}>{fmt(ratio)}</span>
        </span>
        <span className="flex items-center gap-2">
          {key}
          <span className="mono-label tabular-nums">{loop.bpm} bpm</span>
          <span className="ml-auto w-20"><StretchMeter ratio={ratio} /></span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={['mono-label truncate', active ? 'text-cream/70' : 'text-muted'].join(' ')}>{sub}</span>
          {actions}
        </span>
      </div>
    </li>
  )
}
