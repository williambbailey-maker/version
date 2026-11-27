import { describe, expect, it } from 'vitest'
import { fetchAll } from './paging'

/** A fake table of n rows that, like Supabase, never returns more than `cap` at once. */
const table = (n: number, cap: number) => {
  const calls: [number, number][] = []
  const page = async (from: number, to: number) => {
    calls.push([from, to])
    return Array.from({ length: n }, (_, i) => i).slice(from, Math.min(to + 1, from + cap))
  }
  return { page, calls }
}

describe('fetchAll', () => {
  it('reads past the per-request cap', async () => {
    const t = table(1820, 1000)
    const rows = await fetchAll(t.page)
    expect(rows).toHaveLength(1820)
    expect(rows[0]).toBe(0)
    expect(rows[1819]).toBe(1819)
    expect(t.calls).toEqual([[0, 999], [1000, 1999]])
  })
  it('stops after one request for a small table', async () => {
    const t = table(12, 1000)
    expect(await fetchAll(t.page)).toHaveLength(12)
    expect(t.calls).toHaveLength(1)
  })
  it('asks once more when the table is an exact multiple of the page', async () => {
    const t = table(2000, 1000)
    expect(await fetchAll(t.page)).toHaveLength(2000)
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })
  it('handles an empty table', async () => {
    expect(await fetchAll(table(0, 1000).page)).toEqual([])
  })
})
