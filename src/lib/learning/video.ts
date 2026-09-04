const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

function extractYouTubeId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase()

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0]
    return YOUTUBE_ID_PATTERN.test(id) ? id : null
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v')
      return id && YOUTUBE_ID_PATTERN.test(id) ? id : null
    }
    const embedMatch = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch) return embedMatch[1]
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
    if (shortsMatch) return shortsMatch[1]
  }

  return null
}

/**
 * Converts any recognized YouTube URL shape (watch, youtu.be, embed, shorts)
 * into a canonical embeddable player URL. Returns null when the input is not
 * a recognizable YouTube URL, so callers can fall back to the original URL
 * (e.g. a direct storage-hosted video file).
 */
export function toYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null
  const id = extractYouTubeId(url)
  if (!id) return null
  return `https://www.youtube.com/embed/${id}?rel=0`
}

/** True when the given URL is a recognizable YouTube link of any shape. */
export function isYouTubeUrl(url: string): boolean {
  return extractYouTubeId(url) !== null
}

/** Resolves the URL to embed in an iframe player: YouTube URLs are normalized, everything else passes through untouched. */
export function resolvePlayerUrl(url: string): string {
  return toYouTubeEmbedUrl(url) ?? url
}
