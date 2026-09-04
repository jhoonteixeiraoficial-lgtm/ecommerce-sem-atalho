import { describe, expect, it } from 'vitest'
import { toYouTubeEmbedUrl, isYouTubeUrl, resolvePlayerUrl } from './video'

describe('toYouTubeEmbedUrl', () => {
  it('converts a watch URL', () => {
    expect(toYouTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')
  })

  it('converts a youtu.be short URL', () => {
    expect(toYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')
  })

  it('passes through an already-embed URL', () => {
    expect(toYouTubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')
  })

  it('converts a shorts URL', () => {
    expect(toYouTubeEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')
  })

  it('returns null for a non-YouTube URL', () => {
    expect(toYouTubeEmbedUrl('https://storage.example.test/video.mp4')).toBeNull()
  })

  it('returns null for malformed URLs', () => {
    expect(toYouTubeEmbedUrl('not a url')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(toYouTubeEmbedUrl('')).toBeNull()
  })
})

describe('isYouTubeUrl', () => {
  it('detects YouTube URLs', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true)
  })

  it('rejects non-YouTube URLs', () => {
    expect(isYouTubeUrl('https://storage.example.test/video.mp4')).toBe(false)
  })
})

describe('resolvePlayerUrl', () => {
  it('normalizes YouTube URLs', () => {
    expect(resolvePlayerUrl('https://youtu.be/dQw4w9WgXcQ'))
      .toBe('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')
  })

  it('passes through non-YouTube URLs unchanged', () => {
    expect(resolvePlayerUrl('https://storage.example.test/video.mp4'))
      .toBe('https://storage.example.test/video.mp4')
  })
})
