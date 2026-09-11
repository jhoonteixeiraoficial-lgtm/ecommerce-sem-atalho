import sharp, { type Metadata } from 'sharp'

export interface NormalizedImage {
  buffer: Buffer
  mime_type: 'image/jpeg'
  width: 1200
  height: 1200
  source: Pick<Metadata, 'width' | 'height' | 'format' | 'orientation'>
}

export interface SafeCropVariant {
  key: 'center' | 'upper' | 'lower' | 'left' | 'right' | 'close'
  buffer: Buffer
  mime_type: 'image/jpeg'
  width: 1200
  height: 1200
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

export async function createSafeCropVariants(input: Buffer, count: number): Promise<SafeCropVariant[]> {
  const normalized = await normalizeProductImage(input)
  const crops: Array<{ key: SafeCropVariant['key']; left: number; top: number; size: number }> = [
    { key: 'center', left: 60, top: 60, size: 1080 },
    { key: 'upper', left: 90, top: 0, size: 1020 },
    { key: 'lower', left: 90, top: 180, size: 1020 },
    { key: 'left', left: 0, top: 90, size: 1020 },
    { key: 'right', left: 180, top: 90, size: 1020 },
    { key: 'close', left: 150, top: 150, size: 900 },
  ]

  return Promise.all(crops.slice(0, Math.max(0, Math.min(count, crops.length))).map(async crop => ({
    key: crop.key,
    buffer: await sharp(normalized.buffer)
      .extract({ left: crop.left, top: crop.top, width: crop.size, height: crop.size })
      .resize(1200, 1200)
      .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
      .toBuffer(),
    mime_type: 'image/jpeg' as const,
    width: 1200 as const,
    height: 1200 as const,
  })))
}
