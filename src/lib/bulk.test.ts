import { describe, expect, it } from 'vitest'
import { makeDroppedItems } from './bulk'

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
