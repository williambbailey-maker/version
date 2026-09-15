import type { ReactNode } from 'react'

type Props = {
  label: string
  sub?: string
  children: ReactNode
  id?: string
  /** Optional controls rendered at the right of the caption. */
  aside?: ReactNode
}

/** A section captioned like the reference: "● EACH MUG IS A PROJECT. GET A TASTE." */
export function Section({ label, sub, children, id, aside }: Props) {
  return (
    <section id={id} className="scroll-mt-4 border-t border-line px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="caption">
          {label}
          {sub ? `. ${sub}.` : '.'}
        </p>
        {aside}
      </div>
      {children}
    </section>
  )
}
