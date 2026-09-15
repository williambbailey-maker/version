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
  if (rows.length === 0) {
    return <p className="max-w-[400px] text-lg leading-normal text-ink">Pick a drum loop, then tap samples to layer them. Each one enters on the next bar.</p>
  }

  return (
    <ul>
      {rows.map(({ slot, loop, removable }, i) => {
        const ratio = masterBPM / loop.bpm
        return (
          <li key={loop.id} className="group grid grid-cols-[3rem_1fr_auto] items-start gap-x-3 border-t border-line py-4 first:border-t-0 first:pt-0">
            <span className="pt-1 font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="truncate text-2xl font-bold leading-[0.95] tracking-[-0.02em] transition-colors duration-300 ease-linear group-hover:text-cobalt md:text-3xl">
                  {loop.name}
                </span>
                <span className="shrink-0 font-mono text-sm">
                  {loop.kind === 'drums' ? `${loop.bpm} BPM` : `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={slot.gain}
                  onChange={(e) => onGain(loop, Number(e.target.value))}
                  aria-label={`${loop.name} volume`}
                />
                <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">{Math.round(slot.gain * 100)}</span>
              </div>
            </div>
            {removable ? (
              <button
                type="button"
                aria-label={`Stop ${loop.name}`}
                onClick={() => onRemove(loop)}
                className="label-caps px-2 pt-1 transition-colors duration-300 ease-linear hover:text-cobalt"
              >
                Out
              </button>
            ) : (
              <span className="label-caps px-2 pt-1 text-cobalt">Clock</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
