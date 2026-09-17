/**
 * Stretch as a small meter centred on zero: bar to the right = the loop
 * speeds up to meet the drums, to the left = slows down. Red past 20%.
 * Range shown is ±40%; beyond that the bar is clipped.
 */
export function StretchMeter({ ratio }: { ratio: number }) {
  const pct = (ratio - 1) * 100
  const over = Math.abs(pct) > 20
  const clamp = Math.max(-40, Math.min(40, pct))
  const width = (Math.abs(clamp) / 40) * 50
  const left = clamp >= 0 ? 50 : 50 - width
  return (
    <span className="relative block h-3.5 w-full" aria-hidden="true">
      <span className="absolute inset-x-0 top-[6px] h-px bg-line" />
      <span className="absolute left-1/2 top-0 h-3.5 w-px bg-ink" />
      <span className={['absolute top-[3px] h-2', over ? 'bg-accent' : 'bg-ink'].join(' ')} style={{ left: `${left}%`, width: `${width}%` }} />
    </span>
  )
}
