import type { ReactNode } from 'react'

type Props = {
  index: string
  label: string
  sub?: string
  children: ReactNode
  id?: string
}

/** Section with the stacked tag-block label, as in "ABOUT CASSETTE / A MUSIC CURATION AGENCY". */
export function Section({ index, label, sub, children, id }: Props) {
  return (
    <section id={id} className="border-t border-line px-4 py-8 md:px-6 md:py-12">
      <div className="mb-6 flex flex-col items-start gap-1">
        <span className="tag">
          {index} {label}
        </span>
        {sub && <span className="tag">{sub}</span>}
      </div>
      {children}
    </section>
  )
}
