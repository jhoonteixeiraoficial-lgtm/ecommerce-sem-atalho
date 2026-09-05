import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
    if (!['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com'].includes(host)) {
      return NextResponse.json({ error: 'Not a YouTube URL' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    const res = await fetch(oembedUrl, { next: { revalidate: 86400 } })
    if (!res.ok) {
      return NextResponse.json({ error: 'Could not fetch YouTube metadata' }, { status: 502 })
    }
    const data = await res.json()
    return NextResponse.json({
      title: data.title ?? '',
      thumbnailUrl: data.thumbnail_url ?? '',
      authorName: data.author_name ?? '',
    })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch YouTube metadata' }, { status: 502 })
  }
}
