import { describe, expect, it } from 'vitest'
import { autoKind, autoTags, makeDroppedItems } from './bulk'

const f = (name: string) => new File([new Uint8Array(4)], name)

describe('makeDroppedItems', () => {
  it('uses the dropped folder as the pack and deeper folders as the category', () => {
    const items = makeDroppedItems([
      { file: f('a.wav'), path: 'Reggae Horns/a.wav' },
      { file: f('b.wav'), path: 'Reggae Horns/Trombone/b.wav' },
      { file: f('c.wav'), path: 'Reggae Horns/Trombone/Low/c.wav' },
      { file: f('d.wav'), path: 'Madlib Loops/d.wav' },
    ])
    expect(items.map((i) => [i.pack, i.category, i.relPath])).toEqual([
      ['Reggae Horns', null, 'Reggae Horns/a.wav'],
      ['Reggae Horns', 'Trombone', 'Reggae Horns/Trombone/b.wav'],
      ['Reggae Horns', 'Trombone/Low', 'Reggae Horns/Trombone/Low/c.wav'],
      ['Madlib Loops', null, 'Madlib Loops/d.wav'],
    ])
  })

  it('loose files have no pack, and non-audio files are dropped', () => {
    const items = makeDroppedItems([
      { file: f('loop.wav'), path: 'loop.wav' },
      { file: f('readme.txt'), path: 'Pack/readme.txt' },
      { file: f('cover.jpg'), path: 'Pack/cover.jpg' },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]!.pack).toBeNull()
    expect(items[0]!.status).toBe('queued')
  })
})

describe('auto kind and tags', () => {
  it('only loose files named like drums become drums; pack contents are samples', () => {
    expect(autoKind('11OCT26 - Drums 2.wav', null)).toBe('drums')
    expect(autoKind('my beat.wav', null)).toBe('drums')
    expect(autoKind('AL HUG/Loops/Percussion/AL_HUG_70_percussion_claps.wav', 'AL HUG')).toBe('sample')
    expect(autoKind('Pack/Drums/break_01.wav', 'Pack')).toBe('sample')
    expect(autoKind('trombone.wav', null)).toBe('sample')
  })

  it('percussion folders earn the percussion tag once', () => {
    expect(autoTags('Pack/Loops/Percussion/x.wav', ['soul'])).toEqual(['soul', 'percussion'])
    expect(autoTags('Pack/Loops/Percussion/x.wav', ['percussion'])).toEqual(['percussion'])
    expect(autoTags('Pack/Keys/x.wav', [])).toEqual([])
  })
})

describe('makeDroppedItems with several folders', () => {
  it('one drop with two folders yields two packs, and ids continue from idFrom', () => {
    const items = makeDroppedItems(
      [
        { file: f('a.wav'), path: 'Pack A/a.wav' },
        { file: f('b.wav'), path: 'Pack B/b.wav' },
      ],
      10,
    )
    expect(items.map((i) => i.pack)).toEqual(['Pack A', 'Pack B'])
    expect(items.map((i) => i.id)).toEqual([10, 11])
  })
})
