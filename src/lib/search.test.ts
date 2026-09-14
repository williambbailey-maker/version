import { describe, expect, it } from 'vitest'
import type { Loop } from '../engine/types'
import { matches, parseQuery, tagCounts } from './search'

const L = (name: string, tags: string[], extra: Partial<Loop> = {}): Loop => ({
  id: name, name, url: '', bpm: 100, bars: 2, kind: 'sample', gain: 0.8, tags, ...extra,
})

describe('parseQuery', () => {
  it('splits #tags from free text', () => {
    expect(parseQuery('#reggae warm #skank')).toEqual({ text: 'warm', tags: ['reggae', 'skank'] })
    expect(parseQuery('  ')).toEqual({ text: '', tags: [] })
    expect(parseQuery('#')).toEqual({ text: '#', tags: [] })
  })
})

describe('matches', () => {
  it('requires every tag and matches text across name, pack, key and tags', () => {
    const a = L('Skank Guitar', ['reggae', 'guitar'], { pack: 'Island Vibes', key: 'Amin' })
    expect(matches(a, parseQuery('#reggae'))).toBe(true)
    expect(matches(a, parseQuery('#reggae #guitar'))).toBe(true)
    expect(matches(a, parseQuery('#reggae #bass'))).toBe(false)
    expect(matches(a, parseQuery('island'))).toBe(true)
    expect(matches(a, parseQuery('amin'))).toBe(true)
    expect(matches(a, parseQuery('guitar'))).toBe(true)
    expect(matches(a, parseQuery('piano'))).toBe(false)
  })
})

describe('tagCounts', () => {
  it('counts most common first, then alphabetical', () => {
    const loops = [L('a', ['x', 'y']), L('b', ['y']), L('c', ['z', 'y'])]
    expect(tagCounts(loops)).toEqual([['y', 3], ['x', 1], ['z', 1]])
  })
})
