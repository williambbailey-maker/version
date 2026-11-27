/**
 * Supabase returns at most 1000 rows per request. Anything that must see the
 * whole table (the library, import bookkeeping, storage tidy-up) reads it in
 * pages through this helper. Pure, so the stopping rule is unit-tested.
 *
 * The page function must use a stable order (ending in a unique column),
 * otherwise rows can repeat or go missing between pages.
 */
export const PAGE_SIZE = 1000

export async function fetchAll<T>(page: (from: number, to: number) => Promise<readonly T[]>, size = PAGE_SIZE): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const rows = await page(from, from + size - 1)
    out.push(...rows)
    if (rows.length < size) break
  }
  return out
}
