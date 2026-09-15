import { describe, expect, it } from 'vitest'
import { extractPageInfo } from './pageinfo'

const splice = `<html><head>
<title>Island Vibes by Example Sounds | Splice</title>
<meta property="og:site_name" content="Splice" />
<meta property="og:title" content="Island Vibes by Example Sounds" />
<meta content="Warm reggae &amp; dub loops, recorded to tape." property="og:description">
<meta property="og:image" content="https://cdn.example.com/covers/island.jpg" />
<script type="application/ld+json">{"@type":"Product","name":"Island Vibes","brand":{"name":"Example Sounds"},"genre":["Reggae","Dub"]}</script>
</head><body></body></html>`

describe('extractPageInfo', () => {
  it('reads Open Graph, JSON-LD and the "by" pattern', () => {
    const info = extractPageInfo(splice, 'https://splice.com/sounds/packs/x')
    expect(info).toEqual({
      title: 'Island Vibes',
      description: 'Warm reggae & dub loops, recorded to tape.',
      image: 'https://cdn.example.com/covers/island.jpg',
      siteName: 'Splice',
      publisher: 'Example Sounds',
      genres: ['reggae', 'dub'],
    })
  })

  it('falls back to <title> and meta description, resolves relative images', () => {
    const html = `<title>Dub Tools - Roots Records</title><meta name="description" content="Dubby things"><meta name="twitter:image" content="/img/cover.png"><meta name="keywords" content="dub, roots">`
    const info = extractPageInfo(html, 'https://shop.example.com/packs/dub-tools')
    expect(info.title).toBe('Dub Tools')
    expect(info.publisher).toBe('Roots Records')
    expect(info.description).toBe('Dubby things')
    expect(info.image).toBe('https://shop.example.com/img/cover.png')
    expect(info.genres).toEqual(['dub', 'roots'])
  })

  it('does not treat the site name as the publisher', () => {
    const info = extractPageInfo(`<meta property="og:site_name" content="Loopmasters"><meta property="og:title" content="Big Pack | Loopmasters">`)
    expect(info.title).toBe('Big Pack')
    expect(info.publisher).toBeNull()
  })

  it('returns nulls for an empty page', () => {
    expect(extractPageInfo('<html></html>')).toEqual({ title: null, description: null, image: null, siteName: null, publisher: null, genres: [] })
  })
})
