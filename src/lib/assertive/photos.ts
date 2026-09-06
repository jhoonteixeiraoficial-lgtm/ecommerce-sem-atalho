import sharp from 'sharp'

export async function downloadAndProcessPhotos(urls: string[]): Promise<string[]> {
  const processed: string[] = []

  for (const url of urls.slice(0, 10)) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buffer = Buffer.from(await res.arrayBuffer())

      const optimized = await sharp(buffer)
        .resize(1200, 1200, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .jpeg({ quality: 85 })
        .toBuffer()

      const base64 = optimized.toString('base64')
      processed.push(`data:image/jpeg;base64,${base64}`)
    } catch {
      continue
    }
  }

  return processed
}

export async function createPhotoVariations(
  basePhotos: string[],
  variationIndex: number,
  totalVariations: number
): Promise<string[]> {
  if (basePhotos.length <= 1) return basePhotos

  const shuffled = [...basePhotos]
  const seed = variationIndex * 7 + 13
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (seed * (i + 1)) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const cropOffsets = [
    { top: 0, left: 0 },
    { top: 50, left: 50 },
    { top: 0, left: 100 },
  ]
  const offset = cropOffsets[variationIndex % cropOffsets.length]

  const variations: string[] = []
  for (const photo of shuffled.slice(0, 5)) {
    try {
      if (photo.startsWith('data:')) {
        const base64Data = photo.split(',')[1]
        const buffer = Buffer.from(base64Data, 'base64')
        const metadata = await sharp(buffer).metadata()
        const w = metadata.width || 1200
        const h = metadata.height || 1200
        const cropSize = Math.min(w, h) * 0.85

        const cropped = await sharp(buffer)
          .extract({
            top: Math.min(offset.top, h - cropSize),
            left: Math.min(offset.left, w - cropSize),
            width: cropSize,
            height: cropSize,
          })
          .resize(1200, 1200, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          })
          .jpeg({ quality: 85 })
          .toBuffer()

        variations.push(`data:image/jpeg;base64,${cropped.toString('base64')}`)
      } else {
        variations.push(photo)
      }
    } catch {
      variations.push(photo)
    }
  }

  return variations
}
