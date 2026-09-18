/**
 * Readable sample names from library filenames.
 *
 *   BOS_DSRH_90_Trombone_Loop_Protection_C   → "BOS - Trombone Loop Protection"
 *   MADLIB_86_music_loop_ritual_Fmaj         → "Madlib - Music Loop Ritual"
 *
 * Rule: split on "_", "-" and spaces; the first token is the source
 * (kept upper-case when 3 letters or fewer, else title-cased); drop an
 * all-caps code token (DSRH, HFG1), tempo tokens, and a trailing key
 * (C, A#m, Fmaj, Ebmin, D#M); title-case what remains.
 */

const KEY_RE = /^[A-G](?:#|b)?(?:m|M|min|maj|minor|major)?$/
const CODE_RE = /^[A-Z][A-Z0-9]{1,5}$/
const BPM_RE = /^\d{2,3}$/

function titleWord(w: string): string {
  if (/^\d/.test(w)) return w // "6-8", "808"
  if (w.length <= 3 && w === w.toUpperCase()) return w // BOS, EQ, FX
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
}

export function readableSampleName(raw: string): string {
  const base = raw.replace(/\.[^.]+$/, '').trim()
  // Only library-style names (underscored, or carrying a tempo) are rewritten.
  if (!/_/.test(base) && !/\b\d{2,3}\b/.test(base)) return base
  let tokens = base.split(/[_\s]+/).flatMap((t) => (/^\d+-\d+$/.test(t) ? [t] : t.split('-'))).filter(Boolean)
  if (tokens.length < 2) return base

  const source = tokens[0]!
  tokens = tokens.slice(1)

  // vendor code right after the source, e.g. DSRH, HFG1
  if (tokens.length > 1 && CODE_RE.test(tokens[0]!) && !BPM_RE.test(tokens[0]!)) tokens = tokens.slice(1)
  // tempo anywhere in the first two positions
  tokens = tokens.filter((t, i) => !(i < 2 && BPM_RE.test(t)))
  // trailing key
  if (tokens.length > 1 && KEY_RE.test(tokens[tokens.length - 1]!)) tokens = tokens.slice(0, -1)

  if (tokens.length === 0) return titleWord(source)
  const src = source.length <= 3 ? source.toUpperCase() : titleWord(source)
  return `${src} - ${tokens.map(titleWord).join(' ')}`
}
