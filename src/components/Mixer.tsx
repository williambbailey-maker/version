import { BOOST_PRESETS } from '../engine/booster'
import type { BoostState, SlotState } from '../engine/engine'
import type { Loop } from '../engine/types'
import { StripeFader } from './StripeFader'

const GROUPS: { key: (typeof BOOST_PRESETS)[number]['group']; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'vulfmon', label: 'Vulfmon' },
  { key: 'comp', label: 'Comp' },
  { key: 'fx', label: 'FX' },
]

type Props = {
  masterBPM: number
  drums: SlotState
  samples: SlotState[]
  onGain: (loop: Loop, value: number) => void
  onRemove: (loop: Loop) => void
  onMute: (loop: Loop, muted: boolean) => void
  onSolo: (loop: Loop, solo: boolean) => void
  onSpeed: (loop: Loop, speed: 1 | 2) => void
  boost: BoostState
  onBoost: (on: boolean) => void
  onBoostPreset: (id: string) => void
}

/** What's playing (or queued): one stripe column each. */
export function Mixer({ masterBPM, drums, samples, onGain, onRemove, onMute, onSolo, onSpeed, boost, onBoost, onBoostPreset }: Props) {
  const cols: { slot: SlotState; loop: Loop; removable: boolean }[] = []
  const d = drums.loop ?? drums.pending
  if (d) cols.push({ slot: drums, loop: d, removable: false })
  for (const s of samples) {
    const l = s.loop ?? s.pending
    if (l) cols.push({ slot: s, loop: l, removable: true })
  }
  const anySolo = cols.some((c) => c.slot.solo)
  if (cols.length === 0) {
    return <p className="max-w-xl text-base leading-relaxed text-muted">Tap a drum loop or a sample to hear it, then layer more. Each one enters on the next bar. Drums set the tempo when you have them; otherwise the first sample does.</p>
  }

  return (
    <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
      {cols.map(({ slot, loop, removable }, i) => {
        const ratio = (masterBPM * slot.speed) / loop.bpm
        return (
          <div key={loop.id} className="flex min-w-0 flex-col gap-2">
            <StripeFader
              value={slot.gain}
              label={loop.name}
              onChange={(v) => onGain(loop, v)}
              tone={loop.kind === 'drums' ? 'ink' : 'accent'}
              dim={slot.muted || (anySolo && !slot.solo)}
            />
            <div className="flex gap-1">
              <button
                type="button"
                aria-pressed={slot.muted}
                aria-label={`Mute ${loop.name}`}
                onClick={() => onMute(loop, !slot.muted)}
                className={['pill min-h-7 flex-1 px-2', slot.muted ? '' : 'pill-outline'].join(' ')}
              >
                M
              </button>
              <button
                type="button"
                aria-pressed={slot.solo}
                aria-label={`Solo ${loop.name}`}
                onClick={() => onSolo(loop, !slot.solo)}
                className={['pill min-h-7 flex-1 px-2', slot.solo ? 'pill-accent' : 'pill-outline'].join(' ')}
              >
                S
              </button>
              {loop.kind === 'drums' && (
                <button
                  type="button"
                  aria-pressed={boost.on}
                  aria-label={`Boost ${loop.name}: compressor`}
                  title="Compressor booster"
                  onClick={() => onBoost(!boost.on)}
                  className={['pill min-h-7 flex-1 px-2', boost.on ? 'pill-accent' : 'pill-outline'].join(' ')}
                >
                  ★
                </button>
              )}
            </div>
            {loop.kind === 'drums' && boost.on && (
              <label className="mono-label flex flex-col gap-1 text-muted">
                Preset
                <select
                  aria-label="Compressor preset"
                  value={boost.preset}
                  onChange={(e) => onBoostPreset(e.target.value)}
                  className="pill pill-outline min-h-7 w-full appearance-none px-2 text-[10px]"
                >
                  {GROUPS.map((g) => (
                    <optgroup key={g.key} label={g.label}>
                      {BOOST_PRESETS.filter((x) => x.group === g.key).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {(() => {
                  const note = BOOST_PRESETS.find((x) => x.id === boost.preset)?.note
                  return note ? <span className="normal-case">{note}</span> : null
                })()}
              </label>
            )}
            <div className="mono-label flex items-baseline justify-between gap-2 text-muted">
              <span>{String(i + 1).padStart(2, '0')}</span>
              <span>{loop.kind === 'drums' ? `${loop.bpm} bpm` : `${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}%`}</span>
              <span>{Math.round(slot.gain * 100)}</span>
            </div>
            <span className="mono-label truncate font-bold">{loop.name}</span>
            {removable ? (
              <div className="flex flex-col items-start gap-1">
                <button type="button" aria-label={`Stop ${loop.name}`} onClick={() => onRemove(loop)} className="pill pill-outline min-w-11">
                  ×
                </button>
                <button
                  type="button"
                  aria-pressed={slot.speed === 2}
                  aria-label={`Double time ${loop.name}`}
                  title="Play at double speed (matches loops recorded at twice the drum tempo)"
                  onClick={() => onSpeed(loop, slot.speed === 2 ? 1 : 2)}
                  className={['pill min-w-11', slot.speed === 2 ? 'pill-accent' : 'pill-outline'].join(' ')}
                >
                  2x
                </button>
              </div>
            ) : (
              <span className="tag self-start">Clock</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
