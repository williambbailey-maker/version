import type { SlotState } from '../engine/engine'
import type { Loop } from '../engine/types'
import { StripeFader } from './StripeFader'

type Props = {
  masterBPM: number
  drums: SlotState
  samples: SlotState[]
  onGain: (loop: Loop, value: number) => void
  onRemove: (loop: Loop) => void
}

/** What's playing (or queued): one stripe column each. */
export function Mixer({ masterBPM, drums, samples, onGain, onRemove }: Props) {
  const cols: { slot: SlotState; loop: Loop; removable: boolean }[] = []
  const d = drums.loop ?? drums.pending
  if (d) cols.push({ slot: drums, loop: d, removable: false })
  for (const s of samples) {
    const l = s.loop ?? s.pending
    if (l) cols.push({ slot: s, loop: l, removable: true })
  }
  if (cols.length === 0) {
    return <p className="headline max-w-xl text-2xl md:text-3xl">Pick a drum loop, then tap samples to layer them. Each one enters on the next bar.</p>
  }

  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {cols.map(({ slot, loop, removable }, i) => {
        const ratio = masterBPM / loop.bpm
        return (
          <div key={loop.id} className="flex min-w-0 flex-col gap-2">
            <StripeFader value={slot.gain} label={loop.name} onChange={(v) => onGain(loop, v)} tone={loop.kind === 'drums' ? 'ink' : 'muted'} />
            <div className="mono-label flex items-baseline justify-between gap-2 text-muted">
              <span>{String(i + 1).padStart(2, '0')}</span>
              <span>{loop.kind === 'drums' ? `${loop.bpm} bpm` : `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`}</span>
              <span>{Math.round(slot.gain * 100)}</span>
            </div>
            <span className="mono-label truncate font-bold">{loop.name}</span>
            {removable ? (
              <button type="button" aria-label={`Stop ${loop.name}`} onClick={() => onRemove(loop)} className="pill pill-outline self-start">
                Out
              </button>
            ) : (
              <span className="tag self-start">Clock</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
