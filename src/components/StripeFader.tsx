import { useRef } from 'react'
import type { PointerEvent } from 'react'

const STEPS = 12

type Props = {
  value: number // 0..1
  label: string
  onChange: (v: number) => void
}

/**
 * A stack of grainy stripes that fills from the bottom: the reference's
 * cassette stripes as a fader. Drag or tap to set; a hidden range input
 * keeps it keyboard- and screen-reader-operable.
 */
export function StripeFader({ value, label, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const v = 1 - (e.clientY - r.top) / r.height
    onChange(Math.round(Math.max(0, Math.min(1, v)) * 100) / 100)
  }

  const lit = Math.round(value * STEPS)

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={ref}
        className="flex h-40 cursor-ns-resize touch-none flex-col-reverse gap-1"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        aria-hidden="true"
      >
        {Array.from({ length: STEPS }, (_, i) => (
          <span key={i} className={['block flex-1', i < lit ? 'grain bg-ink' : 'bg-ink/10'].join(' ')} />
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} volume`}
        className="sr-only"
      />
    </div>
  )
}
