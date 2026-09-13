import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns/promises', () => ({ lookup }))
vi.mock('server-only', () => ({}))

import { assertPublicHttpsUrl } from '../safe-remote-url'
import { discoverWebImageCandidates } from '../web-image-discovery'

function htmlResponse(html: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(html, { ...init, headers })
}

describe('safe remote URL boundary', () => {
  beforeEach(() => {
    lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  afterEach(() => vi.restoreAllMocks())

  it.each([
    'http://shop.example/product',
    'https://user:secret@shop.example/product',
    'https://localhost/product',
    'https://127.0.0.1/product',
    'https://[::1]/product',
    'https://[::ffff:127.0.0.1]/product',
  ])('rejects non-public destinations: %s', async source => {
    await expect(assertPublicHttpsUrl(new URL(source))).rejects.toThrow('URL remota não permitida')
  })

  it('rejects a hostname when any resolved address is private', async () => {
    lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.4', family: 4 },
    ])

    await expect(assertPublicHttpsUrl(new URL('https://mixed.example/product'))).rejects.toThrow('URL remota não permitida')
  })
})

describe('discoverWebImageCandidates', () => {
  beforeEach(() => {
    lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  afterEach(() => vi.restoreAllMocks())

  it('extracts absolute metadata and recursive JSON-LD images without duplicates', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse(`
      <html><head>
        <meta content="/photo-a.jpg" property="og:image">
        <meta content="https://cdn.example/photo-b.jpg" name="twitter:image">
        <script type="application/ld+json">
          {"@graph":[{"image":["https://cdn.example/photo-b.jpg",{"url":"https://cdn.example/photo-c.jpg"}]}]}
        </script>
      </head></html>
    `))

    await expect(discoverWebImageCandidates('https://shop.example/product')).resolves.toEqual([
      'https://shop.example/photo-a.jpg',
      'https://cdn.example/photo-b.jpg',
      'https://cdn.example/photo-c.jpg',
    ])
    expect(fetch).toHaveBeenCalledWith(new URL('https://shop.example/product'), expect.objectContaining({
      redirect: 'manual',
      dispatcher: expect.anything(),
      headers: expect.objectContaining({ Accept: expect.stringContaining('text/html') }),
    }))
  })

  it('decodes metadata attributes and reads contentUrl from nested JSON-LD', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse(`
      <meta property='og:image' content='https://cdn.example/photo.jpg?size=large&amp;crop=1'>
      <script type='application/ld+json'>{"image":{"contentUrl":"/nested.jpg"}}</script>
    `))

    await expect(discoverWebImageCandidates('https://shop.example/item')).resolves.toEqual([
      'https://cdn.example/photo.jpg?size=large&crop=1',
      'https://shop.example/nested.jpg',
    ])
  })

  it('revalidates every redirect and blocks a redirect to loopback', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'https://127.0.0.1/private' },
    }))

    await expect(discoverWebImageCandidates('https://shop.example/product')).rejects.toThrow('URL remota não permitida')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects oversized or non-HTML responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(htmlResponse('x', {
      headers: { 'content-length': String(1024 * 1024 + 1) },
    }))
    await expect(discoverWebImageCandidates('https://shop.example/large')).rejects.toThrow('excede 1MB')

    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', {
      headers: { 'content-type': 'application/json' },
    }))
    await expect(discoverWebImageCandidates('https://shop.example/json')).rejects.toThrow('HTML válido')
  })

  it('ignores malformed JSON-LD, unsafe image URLs and results beyond twelve', async () => {
    const tags = Array.from({ length: 14 }, (_, index) => (
      `<meta property="og:image" content="https://cdn.example/photo-${index}.jpg">`
    )).join('')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlResponse(`
      <meta property="og:image" content="http://cdn.example/insecure.jpg">
      <meta property="og:image" content="https://127.0.0.1/private.jpg">
      ${tags}
      <script type="application/ld+json">{invalid json</script>
    `))

    const candidates = await discoverWebImageCandidates('https://shop.example/product')

    expect(candidates).toHaveLength(12)
    expect(candidates[0]).toBe('https://cdn.example/photo-0.jpg')
    expect(candidates[11]).toBe('https://cdn.example/photo-11.jpg')
  })
})
