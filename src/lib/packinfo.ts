import type { PageInfo } from './pageinfo'

/** Ask the edge function to read a pack's web page (title, description, cover, publisher, genres). */
export async function fetchPackInfo(url: string): Promise<PageInfo & { url: string }> {
  const res = await fetch(`/api/pack-info?url=${encodeURIComponent(url.trim())}`)
  const body = (await res.json()) as (PageInfo & { url: string }) | { error: string }
  if (!res.ok || 'error' in body) throw new Error('error' in body ? body.error : `Could not read ${url}`)
  return body
}
