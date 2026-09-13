import { describe, expect, it } from 'vitest'
import sharp from 'sharp'

import {
  assessWhiteCover,
  findNearDuplicate,
  perceptualDistance,
  perceptualHash,
} from '../image-quality'

async function canvas(
  width: number,
  height: number,
  background: string,
  rectangle?: { left: number; top: number; width: number; height: number; color: string }
): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background } })
  if (!rectangle) return image.png().toBuffer()
  const product = await sharp({
    create: {
      width: rectangle.width,
      height: rectangle.height,
      channels: 3,
      background: rectangle.color,
    },
  }).png().toBuffer()
  return image.composite([{ input: product, left: rectangle.left, top: rectangle.top }]).png().toBuffer()
}

describe('white cover assessment', () => {
  it('accepts a square cover with white borders and rejects a colored background', async () => {
    const white = await canvas(512, 512, '#ffffff', {
      left: 156,
      top: 106,
      width: 200,
      height: 300,
      color: '#202020',
    })
    const colored = await canvas(512, 512, '#d9b38c')

    await expect(assessWhiteCover(white)).resolves.toMatchObject({
      passed: true,
      square: true,
      white_border_ratio: 1,
    })
    await expect(assessWhiteCover(colored)).resolves.toMatchObject({
      passed: false,
      square: true,
    })
  })

  it('rejects a white image that is not square', async () => {
    await expect(assessWhiteCover(await canvas(640, 480, '#ffffff'))).resolves.toMatchObject({
      passed: false,
      square: false,
    })
  })
})

describe('perceptual duplicate gate', () => {
  it('detects resized copies and keeps distinct compositions', async () => {
    const first = await canvas(512, 512, '#ffffff', {
      left: 48,
      top: 96,
      width: 180,
      height: 320,
      color: '#101010',
    })
    const resizedFirst = await sharp(first).resize(1024, 1024).jpeg({ quality: 88 }).toBuffer()
    const differentComposition = await canvas(512, 512, '#ffffff', {
      left: 284,
      top: 64,
      width: 180,
      height: 220,
      color: '#101010',
    })
    const firstHash = await perceptualHash(first)

    expect(firstHash).toMatch(/^[0-9a-f]{16}$/)
    expect(perceptualDistance(firstHash, await perceptualHash(resizedFirst))).toBeLessThanOrEqual(4)
    expect(perceptualDistance(firstHash, await perceptualHash(differentComposition))).toBeGreaterThan(6)
    await expect(findNearDuplicate(differentComposition, [
      { id: 'first', buffer: first },
      { id: 'resized', buffer: resizedFirst },
    ], 6)).resolves.toBeNull()
    await expect(findNearDuplicate(resizedFirst, [{ id: 'first', buffer: first }], 4)).resolves.toBe('first')
  })

  it('rejects malformed hashes instead of comparing partial data', () => {
    expect(() => perceptualDistance('abc', 'def')).toThrow('Hash perceptual inválido')
  })
})
