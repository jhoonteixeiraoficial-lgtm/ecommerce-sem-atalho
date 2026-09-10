import sharp, { type Metadata } from 'sharp'

export interface NormalizedImage {
  buffer: Buffer
  mime_type: 'image/jpeg'
  width: 1200
  height: 1200
  source: Pick<Metadata, 'width' | 'height' | 'format' | 'orientation'>
}

export async function normalizeProductImage(input: Buffer): Promise<NormalizedImage> {
  if (!input.byteLength || input.byteLength > 12 * 1024 * 1024) {
    throw new Error('Imagem inválida: o arquivo está vazio ou excede 12MB.')
  }
  try {
    const decoder = sharp(input, { limitInputPixels: 40_000_000, failOn: 'error' })
    const metadata = await decoder.metadata()
    if (!metadata.width || !metadata.height || !metadata.format) throw new Error('dados ausentes')
    const buffer = await decoder
      .rotate()
      .resize(1200, 1200, {
        fit: 'contain',
        background: '#ffffff',
        withoutEnlargement: false,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer()
    return {
      buffer,
      mime_type: 'image/jpeg',
      width: 1200,
      height: 1200,
      source: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        orientation: metadata.orientation,
      },
    }
  } catch (error) {
    throw new Error(`Imagem inválida: ${error instanceof Error ? error.message : 'falha na decodificação'}`)
  }
}
