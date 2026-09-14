import type { Loop } from '../engine/types'

type Props = {
  loop: Loop
  active: boolean
  loading: boolean
  onSelect: (loop: Loop) => void
  onRemove?: (loop: Loop) => void
}

/** Phase-1 pad: name, bpm, active state. Ratio badge and layout come in phase 2. */
export function Pad({ loop, active, loading, onSelect, onRemove }: Props) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onSelect(loop)}
        aria-pressed={active}
        className={[
          'min-h-24 w-full rounded-lg border px-4 py-3 text-left transition-colors',
          active ? 'border-orange-600 bg-orange-100' : 'border-stone-300 bg-white hover:bg-stone-100',
          loading ? 'opacity-60' : '',
        ].join(' ')}
      >
        <div className="truncate pr-6 text-lg">{loop.name}</div>
        <div className="font-mono text-sm text-stone-600">
          {loop.bpm} bpm · {loop.bars} bar{loop.bars > 1 ? 's' : ''}
          {loading ? ' · loading…' : ''}
        </div>
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${loop.name}`}
          onClick={() => onRemove(loop)}
          className="absolute top-1 right-1 h-8 w-8 rounded text-stone-400 hover:bg-stone-200 hover:text-stone-900"
        >
          ×
        </button>
      )}
    </div>
  )
}
