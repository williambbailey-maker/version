import type { SlotState } from '../engine/engine'
import type { Loop } from '../engine/types'

type Props = {
  masterBPM: number
  drums: SlotState
  samples: SlotState[]
  onGain: (loop: Loop, value: number) => void
  onRemove: (loop: Loop) => void
}

/** What's playing (or queued), one fader each. */
export function Mixer({ masterBPM, drums, samples, onGain, onRemove }: Props) {
  const rows: { slot: SlotState; loop: Loop; removable: boolean }[] = []
  const d = drums.loop ?? drums.pending
  if (d) rows.push({ slot: drums, loop: d, removable: false })
  for (const s of samples) {
    const l = s.loop ?? s.pending
    if (l) rows.push({ slot: s, loop: l, removable: true })
  }
  if (rows.length === 0) return <p className="text-sm text-stone-500">Pick a drum loop, then tap samples to layer them.</p>

  return (
    <ul className="flex flex-col gap-2">
      {rows.map(({ slot, loop, removable }) => {
        const ratio = masterBPM / loop.bpm
        return (
          <li key={loop.id} className="flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate">{loop.name}</span>
                <span className="shrink-0 font-mono text-xs text-stone-600">
                  {loop.kind === 'drums' ? `${loop.bpm} bpm` : `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={slot.gain}
                onChange={(e) => onGain(loop, Number(e.target.value))}
                aria-label={`${loop.name} volume`}
                className="mt-1 w-full accent-orange-600"
              />
            </div>
            {removable && (
              <button
                type="button"
                aria-label={`Stop ${loop.name}`}
                onClick={() => onRemove(loop)}
                className="h-9 w-9 shrink-0 rounded text-stone-500 hover:bg-orange-100 hover:text-stone-900"
              >
                ×
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
