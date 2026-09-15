import { extractPageInfo } from '../src/lib/pageinfo'

/**
 * GET /api/pack-info?url=https://…
 * Fetches a pack's web page server-side (browsers can't, because of CORS)
 * and returns { title, description, image, siteName, publisher, genres }.
 */
export const config = { runtime: 'edge' }

const MAX_BYTES = 2_000_000

export default async function handler(req: Request): Promise<Response> {
  const target = new URL(req.url).searchParams.get('url') ?? ''
  let u: URL
  try {
    u = new URL(target)
  } catch {
    return json({ error: 'Invalid URL' }, 400)
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return json({ error: 'Only http(s) links' }, 400)

  try {
    const res = await fetch(u.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; LoopLab/1.0; +https://looplab.dunwell.co)',
        accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return json({ error: `Page returned ${res.status}` }, 502)
    const html = (await res.text()).slice(0, MAX_BYTES)
    return json({ url: res.url, ...extractPageInfo(html, res.url) })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Fetch failed' }, 502)
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': status === 200 ? 'public, max-age=3600' : 'no-store' },
  })
}
