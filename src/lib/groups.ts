/**
 * Pack → group → loop structure for the sample browser, derived from the
 * loaded library (no extra queries, no schema). Pure functions, memoised
 * by the component that uses them.
 *
 * - Pack: loops.packId, falling back to the loops.pack text; loops with
 *   neither are "Loose samples".
 * - Group: loops in a pack that share the LAST segment of loops.category.
 *   Older rows store the category relative to a different root than newer
 *   ones, so only the last segment is reliable.
 * - Kit: 2+ loops, one BPM, one key, and the folder name carries a BPM
 *   token (every real kit folder does: "TC_VLP_85_bolero"). Kits are the
 *   stems of one composition and are meant to be layered.
 * - Folder: anything else ("Drum_Loops", tempo bins like "120", one-shots).
 */
import type { Loop } from '../engine/types'

export type GroupKind = 'kit' | 'folder'

export type Group = {
  key: string // unique within the pack
  segment: string // raw last path segment ('' for ungrouped)
  name: string // display name
  kind: GroupKind
  loops: Loop[]
  bpm: number | null // shared BPM (kits only)
  musicalKey: string | null // shared key (kits only)
  preview: string // "Conga, Bongo, Clave"
}

export type PackEntry = { key: string; name: string; count: number }

export type PackGroups = { pack: PackEntry; groups: Group[]; summary: string }

export const LOOSE_PACK = '__loose__'
export const UNGROUPED = '__ungrouped__'

const CODE_RE = /^[A-Z][A-Z0-9]{1,5}$/ // vendor prefix tokens: MADLIB, TC, VLP, DSC
const BPM_RE = /^\d{2,3}$/
const KEY_RE = /^[A-G](?:#|b)?(?:m|M|min|maj|minor|major)?$/

/** Which pack a loop belongs to, as a stable key. */
export function packKeyOf(loop: Loop): string {
  if (loop.packId) return loop.packId
  if (loop.pack) return `name:${loop.pack}`
  return LOOSE_PACK
}

/** Packs that have samples, largest first. */
export function packList(loops: readonly Loop[], packNames: ReadonlyMap<string, string>): PackEntry[] {
  const m = new Map<string, PackEntry>()
  for (const l of loops) {
    if (l.kind !== 'sample') continue
    const key = packKeyOf(l)
    let e = m.get(key)
    if (!e) {
      const name = l.packId ? (packNames.get(l.packId) ?? l.pack ?? 'Pack') : (l.pack ?? 'Loose samples')
      e = { key, name, count: 0 }
      m.set(key, e)
    }
    e.count++
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function lastSegment(category: string | null | undefined): string {
  if (!category) return ''
  const segs = category.split('/').filter(Boolean)
  return segs[segs.length - 1] ?? ''
}

const titleWord = (w: string) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

/** Tokens of a folder segment with the vendor prefix, BPM, key and 6-8 marker removed. */
function contentTokens(segment: string): string[] {
  let tokens = segment
    .replace(/(^|[_\s-])6[-_]8(?=$|[_\s-])/g, '$1')
    .split(/[_\s]+|-(?!\d)/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter(Boolean)
  while (tokens.length > 1 && CODE_RE.test(tokens[0]!) && !BPM_RE.test(tokens[0]!)) tokens = tokens.slice(1)
  tokens = tokens.filter((t) => !BPM_RE.test(t))
  if (tokens.length > 1 && KEY_RE.test(tokens[tokens.length - 1]!)) tokens = tokens.slice(0, -1)
  return tokens
}

/** "MADLIB_120_bodega_Amaj" → "Bodega"; "AR_VBS_120_strings_stack_darling_Dmin" → "Darling". */
export function kitName(segment: string): string {
  const tokens = contentTokens(segment)
  if (tokens.length === 0) return segment
  return titleWord(tokens[tokens.length - 1]!)
}

/** "Drum_Loops" → "Drum Loops"; "Trumpet_-_Loops" → "Trumpet Loops"; "120" → "120 BPM". */
export function folderName(segment: string): string {
  if (!segment) return 'Ungrouped'
  if (BPM_RE.test(segment)) return `${segment} BPM`
  const tokens = segment
    .split(/[_\s]+|-(?!\d)/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter(Boolean)
  return tokens.map(titleWord).join(' ') || segment
}

/** The loop name without the "SRC - " vendor prefix. */
export function stripPrefix(name: string): string {
  return name.replace(/^[^-]{1,12}\s+-\s+/, '').trim()
}

/** Stem label: the loop name minus the vendor prefix and the kit name. */
export function stemLabel(loopName: string, kit: string): string {
  const base = stripPrefix(loopName)
  const re = new RegExp(`(^|\\s)${kit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i')
  const out = base.replace(re, ' ').replace(/\s+/g, ' ').trim()
  return out || base
}

/** Whether a folder segment carries a BPM token, the mark of a kit folder. */
export function hasBpmToken(segment: string): boolean {
  return segment.split(/[_\s-]+/).some((t) => BPM_RE.test(t) && Number(t) >= 40 && Number(t) <= 220)
}

function preview(labels: string[]): string {
  const seen: string[] = []
  for (const l of labels) {
    const first = l.split(' ')[0] ?? l
    if (first && !seen.includes(first)) seen.push(first)
    if (seen.length === 4) break
  }
  return seen.join(', ')
}

/** Groups for one pack's samples (already filtered by whatever the UI applies). */
export function groupPack(loops: readonly Loop[], pack: PackEntry): PackGroups {
  const bySeg = new Map<string, Loop[]>()
  for (const l of loops) {
    if (l.kind !== 'sample' || packKeyOf(l) !== pack.key) continue
    const seg = lastSegment(l.category)
    const arr = bySeg.get(seg)
    if (arr) arr.push(l)
    else bySeg.set(seg, [l])
  }
  const groups: Group[] = []
  for (const [seg, members] of bySeg) {
    const bpm0 = members[0]!.bpm
    const key0 = members[0]!.key ?? null
    const uniform = members.every((l) => l.bpm === bpm0 && (l.key ?? null) === key0)
    const isKit = seg !== '' && members.length >= 2 && uniform && hasBpmToken(seg)
    if (isKit) {
      const name = kitName(seg)
      groups.push({ key: seg, segment: seg, name, kind: 'kit', loops: members, bpm: bpm0, musicalKey: key0, preview: preview(members.map((l) => stemLabel(l.name, name))) })
    } else {
      groups.push({ key: seg || UNGROUPED, segment: seg, name: folderName(seg), kind: 'folder', loops: members, bpm: null, musicalKey: null, preview: preview(members.map((l) => stripPrefix(l.name))) })
    }
  }
  groups.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'kit' ? -1 : 1
    if (a.kind === 'kit') return (a.bpm ?? 0) - (b.bpm ?? 0) || a.name.localeCompare(b.name)
    if (a.segment === '') return 1
    if (b.segment === '') return -1
    return a.name.localeCompare(b.name)
  })
  const kits = groups.filter((g) => g.kind === 'kit')
  const folders = groups.filter((g) => g.kind === 'folder')
  const parts: string[] = []
  if (kits.length) parts.push(`${kits.length} kit${kits.length === 1 ? '' : 's'}`)
  for (const f of folders.slice(0, 3)) parts.push(`${f.loops.length} ${f.name.toLowerCase()}`)
  if (folders.length > 3) parts.push(`${folders.length - 3} more folder${folders.length - 3 === 1 ? '' : 's'}`)
  return { pack, groups, summary: parts.join(', ') || 'nothing here' }
}

/** Big folders are easier to scan split by tempo. */
export function byBpm(loops: readonly Loop[]): { bpm: number; loops: Loop[] }[] {
  const m = new Map<number, Loop[]>()
  for (const l of loops) {
    const arr = m.get(l.bpm)
    if (arr) arr.push(l)
    else m.set(l.bpm, [l])
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([bpm, ls]) => ({ bpm, loops: ls }))
}
