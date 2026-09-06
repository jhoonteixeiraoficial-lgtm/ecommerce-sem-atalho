import { NextResponse } from 'next/server'

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null
    }
    if (host === 'm.youtube.com' || host === 'youtube.com') {
      return parsed.searchParams.get('v')
    }
    return null
  } catch {
    return null
  }
}

function extractMetaTag(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]*property="${property}"[^>]*content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]*content="([^"]*)"[^>]*property="${property}"`, 'i'),
    new RegExp(`<meta[^>]*name="${property}"[^>]*content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]*content="([^"]*)"[^>]*name="${property}"`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  const videoId = extractVideoId(url)
  if (!videoId) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
  }

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const res = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EcommerceSemAtalho/1.0)',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      next: { revalidate: 86400 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Could not fetch YouTube page' }, { status: 502 })
    }

    const html = await res.text()

    const title = extractMetaTag(html, 'og:title')
    const description = extractMetaTag(html, 'og:description')
    const thumbnailUrl = extractMetaTag(html, 'og:image')

    return NextResponse.json({
      title: title || '',
      description: description || '',
      thumbnailUrl: thumbnailUrl || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch YouTube metadata' }, { status: 502 })
  }
}
