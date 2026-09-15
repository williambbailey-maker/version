import type { ReactNode } from 'react'

type Props = {
  index: string
  label: string
  children: ReactNode
  /** Extra classes on the content column. */
  className?: string
}

/**
 * 12-column section with the label column on the left (cols 1-3) and
 * content in cols 4-12. On phones the label becomes a strip on top.
 */
export function Section({ index, label, children, className = '' }: Props) {
  return (
    <section className="grid grid-cols-1 border-t border-line md:grid-cols-12">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 md:items-start md:border-b-0 md:border-r md:px-6 md:py-8 md:col-span-3">
        <span className="font-mono text-xs text-muted">{index}</span>
        <span className="label-caps text-jet md:[writing-mode:vertical-rl] md:rotate-180">{label}</span>
      </div>
      <div className={['px-4 py-6 md:col-span-9 md:px-8 md:py-8', className].join(' ')}>{children}</div>
    </section>
  )
}
