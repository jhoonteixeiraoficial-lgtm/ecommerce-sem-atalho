import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { createSafeCropVariants, normalizeProductImage } from '../image-normalization'

describe('normalizeProductImage', () => {
  it('decodifica PNG e gera JPEG quadrado de publicação sem metadados', async () => {
    const source = await sharp({
      create: { width: 300, height: 150, channels: 3, background: '#e11d48' },
    }).png().withMetadata({ orientation: 6 }).toBuffer()

    const result = await normalizeProductImage(source)
    const metadata = await sharp(result.buffer).metadata()

    expect(result).toMatchObject({ mime_type: 'image/jpeg', width: 1200, height: 1200 })
    expect(result.source).toMatchObject({ width: 300, height: 150, format: 'png' })
    expect(metadata).toMatchObject({ width: 1200, height: 1200, format: 'jpeg' })
    expect(metadata.exif).toBeUndefined()
  })

  it('rejeita bytes que não formam uma imagem', async () => {
    await expect(normalizeProductImage(Buffer.from('not-an-image'))).rejects.toThrow('Imagem inválida')
  })

  it('cria enquadramentos locais distintos usando somente pixels da foto', async () => {
    const source = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: '#e11d48' },
    }).composite([{ input: Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="#2563eb"/></svg>'), left: 100, top: 100 }])
      .jpeg().toBuffer()

    const variants = await createSafeCropVariants(source, 4)
    const metadata = await Promise.all(variants.map(variant => sharp(variant.buffer).metadata()))

    expect(variants.map(variant => variant.key)).toEqual(['center', 'upper', 'lower', 'left'])
    expect(new Set(variants.map(variant => variant.buffer.toString('base64'))).size).toBe(4)
    expect(metadata).toEqual(metadata.map(() => expect.objectContaining({ width: 1200, height: 1200, format: 'jpeg' })))
  })
})
