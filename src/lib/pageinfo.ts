/**
 * Extract pack info from a web page's HTML: Open Graph / Twitter / JSON-LD
 * metadata, which Splice, Loopmasters and most shops emit. Pure function so
 * it can be tested; the edge function in api/pack-info.ts does the fetching.
 */
export type PageInfo = {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  publisher: string | null
  genres: string[]
}

function meta(html: string, key: string): string | null {
  // <meta property="og:title" content="..."> or <meta name="..." content="..."> in either attribute order
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  if (!tag) return null
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
  return content ? decode(content.trim()) : null
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
}

function jsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]!.trim()) as unknown
      if (Array.isArray(parsed)) out.push(...(parsed as Record<string, unknown>[]))
      else if (parsed && typeof parsed === 'object') out.push(parsed as Record<string, unknown>)
    } catch {
      // ignore malformed blocks
    }
  }
  return out
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function extractPageInfo(html: string, url?: string): PageInfo {
  const ld = jsonLd(html)
  const product = ld.find((o) => /Product|MusicAlbum|CreativeWork/i.test(String(o['@type'] ?? '')))

  let title = meta(html, 'og:title') ?? meta(html, 'twitter:title') ?? str(product?.name) ?? html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null
  const description = meta(html, 'og:description') ?? meta(html, 'twitter:description') ?? meta(html, 'description') ?? str(product?.description)
  let image = meta(html, 'og:image') ?? meta(html, 'twitter:image') ?? str(product?.image) ?? null
  const siteName = meta(html, 'og:site_name')

  // Publisher: JSON-LD brand/author, else "Pack by Label" / "Pack - Label" patterns in the title.
  let publisher: string | null = null
  const brand = product?.brand ?? product?.author ?? product?.creator
  if (brand && typeof brand === 'object') publisher = str((brand as Record<string, unknown>).name)
  else publisher = str(brand)
  if (title) {
    const by = title.match(/^(.*?)\s+by\s+(.+?)(?:\s*[|–-]\s*.*)?$/i)
    if (by) {
      title = by[1]!.trim()
      publisher ??= by[2]!.trim()
    } else {
      const parts = title.split(/\s*[|–]\s*|\s+-\s+/)
      if (parts.length >= 2) {
        title = parts[0]!.trim()
        if (!siteName || parts[parts.length - 1]!.trim() !== siteName) publisher ??= parts[1]!.trim()
      }
    }
  }
  if (publisher && siteName && publisher.toLowerCase() === siteName.toLowerCase()) publisher = null

  // Genres: JSON-LD genre/keywords, or meta keywords.
  const genres = new Set<string>()
  const addAll = (v: unknown) => {
    if (typeof v === 'string') v.split(',').forEach((g) => g.trim() && genres.add(g.trim().toLowerCase()))
    else if (Array.isArray(v)) v.forEach(addAll)
  }
  addAll(product?.genre)
  addAll(product?.keywords)
  addAll(meta(html, 'keywords'))

  if (image && url) {
    try {
      image = new URL(image, url).toString()
    } catch {
      // keep as-is
    }
  }

  return { title, description, image, siteName, publisher, genres: [...genres].slice(0, 12) }
}
