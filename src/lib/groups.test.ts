import { describe, expect, it } from 'vitest'
import type { Loop } from '../engine/types'
import { byBpm, folderName, groupPack, hasBpmToken, kitName, lastSegment, packList, stemLabel } from './groups'

let n = 0
const loop = (over: Partial<Loop>): Loop => ({ id: `l${n++}`, name: 'x', url: '', bpm: 100, bars: 2, kind: 'sample', gain: 0.15, ...over })

describe('names', () => {
  it('kit names strip prefix, bpm, key and 6-8 and keep the last word', () => {
    expect(kitName('MADLIB_120_bodega_Amaj')).toBe('Bodega')
    expect(kitName('AR_VBS_120_strings_stack_darling_Dmin')).toBe('Darling')
    expect(kitName('TC_VLP_85_bolero')).toBe('Bolero')
    expect(kitName('DSC_GED_133_run_Fmaj')).toBe('Run')
    expect(kitName('SO_VKAM_92_rhythm_king_6-8')).toBe('King')
    expect(kitName('MADLIB_86_music_loop_ritual_F#min')).toBe('Ritual')
  })
  it('folder names read as words', () => {
    expect(folderName('Drum_Loops')).toBe('Drum Loops')
    expect(folderName('Trumpet_-_Loops')).toBe('Trumpet Loops')
    expect(folderName('120')).toBe('120 BPM')
    expect(folderName('')).toBe('Ungrouped')
  })
  it('stem labels drop the vendor prefix and the kit name', () => {
    expect(stemLabel('TC - Conga Bolero', 'Bolero')).toBe('Conga')
    expect(stemLabel('Madlib - Music Loop Ritual', 'Ritual')).toBe('Music Loop')
    expect(stemLabel('DSC - Glockenspiel Run Fmaj.', 'Run')).toBe('Glockenspiel Fmaj.')
    expect(stemLabel('AR - Darling', 'Darling')).toBe('Darling') // nothing else left: keep it
  })
  it('spots kit folders by their bpm token', () => {
    expect(hasBpmToken('TC_VLP_85_bolero')).toBe(true)
    expect(hasBpmToken('120')).toBe(true)
    expect(hasBpmToken('Drum_Loops')).toBe(false)
    expect(hasBpmToken('conga')).toBe(false)
  })
  it('uses only the last category segment', () => {
    expect(lastSegment('Melodic_Loops/MADLIB_120_bodega_Amaj')).toBe('MADLIB_120_bodega_Amaj')
    expect(lastSegment('Loops/Melodic_Loops/MADLIB_120_bodega_Amaj')).toBe('MADLIB_120_bodega_Amaj')
    expect(lastSegment(null)).toBe('')
  })
})

describe('packs and groups', () => {
  const packs = new Map([['p1', 'Vintage Latin'], ['p2', 'Madlib Loops']])
  const lib: Loop[] = [
    // a kit in two differently rooted categories
    loop({ name: 'TC - Conga Bolero', packId: 'p1', category: 'loops/percussion_stacks/bolero/TC_VLP_85_bolero', bpm: 85 }),
    loop({ name: 'TC - Bongo Bolero', packId: 'p1', category: 'Tribe/loops/percussion_stacks/bolero/TC_VLP_85_bolero', bpm: 85 }),
    // a folder: same bpm but no bpm token in the folder name
    loop({ name: 'TC - Conga Abuelo', packId: 'p1', category: 'loops/conga', bpm: 90 }),
    loop({ name: 'TC - Conga Brave', packId: 'p1', category: 'one_shots/conga', bpm: 90 }),
    // a tempo bin: bpm token, but still a folder? no: uniform + token → kit per rule; guard with key mismatch below
    loop({ name: 'SC - Perc Boot', packId: 'p1', category: 'Audio/loops/120', bpm: 120 }),
    loop({ name: 'SC - Perc Downbeats', packId: 'p1', category: 'Audio/loops/120', bpm: 120, key: 'Amin' }),
    loop({ name: 'TC - Shaker', packId: 'p1', category: null, bpm: 100 }),
    loop({ name: 'Madlib - Music Loop Ritual', packId: 'p2', category: 'MADLIB_86_ritual_Fmaj', bpm: 86, key: 'Fmaj' }),
    loop({ name: 'Madlib - Bass Ritual', packId: 'p2', category: 'MADLIB_86_ritual_Fmaj', bpm: 86, key: 'Fmaj' }),
    loop({ name: 'my beat', kind: 'drums', bpm: 70 }),
    loop({ name: 'Loose one', bpm: 95 }),
  ]

  it('lists packs with sample counts, largest first, drums excluded', () => {
    expect(packList(lib, packs)).toEqual([
      { key: 'p1', name: 'Vintage Latin', count: 7 },
      { key: 'p2', name: 'Madlib Loops', count: 2 },
      { key: '__loose__', name: 'Loose samples', count: 1 },
    ])
  })

  it('groups a pack: kits first by bpm, folders after, ungrouped last, one-shots merged with loops', () => {
    const g = groupPack(lib, { key: 'p1', name: 'Vintage Latin', count: 7 })
    expect(g.groups.map((x) => [x.kind, x.name, x.loops.length])).toEqual([
      ['kit', 'Bolero', 2],
      ['folder', '120 BPM', 2],
      ['folder', 'Conga', 2],
      ['folder', 'Ungrouped', 1],
    ])
    const kit = g.groups[0]!
    expect(kit.bpm).toBe(85)
    expect(kit.preview).toBe('Conga, Bongo')
    expect(g.summary).toBe('1 kit, 2 120 bpm, 2 conga, 1 ungrouped')
  })

  it('a kit needs one bpm and one key across its loops', () => {
    const g = groupPack(lib, { key: 'p2', name: 'Madlib Loops', count: 2 })
    expect(g.groups[0]).toMatchObject({ kind: 'kit', name: 'Ritual', bpm: 86, musicalKey: 'Fmaj' })
  })

  it('splits big folders by bpm, ascending', () => {
    const bins = byBpm([loop({ bpm: 120 }), loop({ bpm: 90 }), loop({ bpm: 120 })])
    expect(bins.map((b) => [b.bpm, b.loops.length])).toEqual([[90, 1], [120, 2]])
  })
})
