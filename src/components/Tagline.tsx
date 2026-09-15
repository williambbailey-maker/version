import { useEffect, useState } from 'react'

const LINES = ['Less of a library, more of a jam.', 'Pull up a stool, stay a while.']
const SEEN = 'looplab.tagline.seen'

/** Types itself in the first time, plain text after that. */
export function Tagline() {
  const [typed, setTyped] = useState<string[] | null>(null)

  useEffect(() => {
    let seen = false
    try {
      seen = localStorage.getItem(SEEN) === '1'
    } catch {
      seen = true
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (seen || reduce) {
      setTyped(LINES)
      return
    }
    let cancelled = false
    ;(async () => {
      const out: string[] = ['']
      for (let i = 0; i < LINES.length; i++) {
        if (i) out.push('')
        for (const ch of LINES[i]!) {
          if (cancelled) return
          out[i] += ch
          setTyped([...out])
          await new Promise((r) => setTimeout(r, 34))
        }
        await new Promise((r) => setTimeout(r, 350))
      }
      try {
        localStorage.setItem(SEEN, '1')
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const lines = typed ?? LINES
  const done = typed !== null && typed.length === LINES.length && typed[1] === LINES[1]
  return (
    <div className="px-4 py-8 text-center md:py-10">
      <p className="text-sm text-ink">{lines[0]}{typed && !done && lines.length === 1 ? <span className="cursor-blink ml-0.5" /> : null}</p>
      <p className="mt-2 text-sm text-muted">{lines[1] ?? ''}{typed && !done && lines.length === 2 ? <span className="cursor-blink ml-0.5" /> : null}</p>
    </div>
  )
}
