import type { ReactNode } from 'react'

type Props = {
  label: string
  sub?: string
  children: ReactNode
  id?: string
  /** Optional controls rendered at the right of the caption. */
  aside?: ReactNode
}

/** A section with a small mono label. `sub` is accepted but no longer shown. */
export function Section({ label, children, id, aside }: Props) {
  return (
    <section id={id} className="scroll-mt-4 border-t border-line px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="mono-label text-muted">{label}</p>
        {aside}
      </div>
      {children}
    </section>
  )
}
