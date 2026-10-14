import type { Loop } from '../engine/types'
import { SampleRow } from './SampleRow'

type Props = {
  loops: Loop[] // favourited samples
  packNames: ReadonlyMap<string, string>
  masterBPM: number
  isActive: (loop: Loop) => boolean
  loadingIds: readonly string[]
  onSelect: (loop: Loop) => void
  onRemove: (loop: Loop) => void
  onFavorite: (loop: Loop) => void
}

/** The record player's list: every sample marked with a star. */
export function Favorites({ loops, packNames, masterBPM, isActive, loadingIds, onSelect, onRemove, onFavorite }: Props) {
  if (loops.length === 0) {
    return <p className="mono-label py-2 text-muted">Nothing starred yet. Tap the star on any sample and it lands here.</p>
  }
  return (
    <ul className="grid gap-2 md:block md:gap-0">
      {loops.map((loop, i) => (
        <SampleRow
          key={loop.id}
          loop={loop}
          index={i + 1}
          packName={loop.packId ? (packNames.get(loop.packId) ?? null) : null}
          masterBPM={masterBPM}
          active={isActive(loop)}
          loading={loadingIds.includes(loop.id)}
          onSelect={() => onSelect(loop)}
          onEdit={null}
          onRemove={() => onRemove(loop)}
          removeLabel={isActive(loop) ? '×' : 'Del'}
          onFavorite={() => onFavorite(loop)}
        />
      ))}
    </ul>
  )
}
