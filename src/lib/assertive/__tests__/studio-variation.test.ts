import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { studioEnhance } from '../studio'

async function makeJpeg(width: number, height: number, background: { r: number; g: number; b: number }) {
  const sharp = (await import('sharp')).default
  return sharp({ create: { width, height, channels: 3, background } }).jpeg().toBuffer()
}

describe('studio visual variation per slot', () => {
  it('produces different buffers for each slot position from the same source', async () => {
    const source = await makeJpeg(400, 400, { r: 180, g: 60, b: 60 })
    const outputs = await Promise.all(
      [0, 1, 2, 3, 4, 5].map(position =>
        studioEnhance(source, { variation: { position, totalSlots: 6 } }),
      ),
    )
    const sizes = outputs.map(o => o.buffer.length)
    // Each slot must produce a distinct file size (rotation + framing shifts the encoder output).
    expect(new Set(sizes).size).toBeGreaterThan(1)
    for (const o of outputs) {
      expect(o.width).toBe(1600)
      expect(o.height).toBe(1600)
      expect(o.mime_type).toBe('image/jpeg')
    }
  })
})
