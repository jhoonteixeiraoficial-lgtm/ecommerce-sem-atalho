import sharp from 'sharp'

export interface WhiteCoverAssessment {
  passed: boolean
  square: boolean
  white_border_ratio: number
  reason: string | null
}

export interface PerceptualComparison {
  id: string
  buffer: Buffer
}

const HASH_PATTERN = /^[0-9a-f]{16}$/i

export async function perceptualHash(buffer: Buffer): Promise<string> {
  const pixels = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer()
  let hash = BigInt(0)
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      hash *= BigInt(2)
      if (pixels[row * 9 + column] > pixels[row * 9 + column + 1]) hash += BigInt(1)
    }
  }
  return hash.toString(16).padStart(16, '0')
}

export function perceptualDistance(left: string, right: string): number {
  if (!HASH_PATTERN.test(left) || !HASH_PATTERN.test(right)) {
    throw new Error('Hash perceptual inválido.')
  }
  let difference = BigInt(`0x${left}`) ^ BigInt(`0x${right}`)
  let distance = 0
  while (difference > BigInt(0)) {
    distance += Number(difference & BigInt(1))
    difference >>= BigInt(1)
  }
  return distance
}

export async function assessWhiteCover(buffer: Buffer): Promise<WhiteCoverAssessment> {
  const { data, info } = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
  const square = info.width === info.height
  const horizontalEdge = Math.max(1, Math.ceil(info.width * 0.08))
  const verticalEdge = Math.max(1, Math.ceil(info.height * 0.08))
  let borderPixels = 0
  let whitePixels = 0

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const border = x < horizontalEdge
        || x >= info.width - horizontalEdge
        || y < verticalEdge
        || y >= info.height - verticalEdge
      if (!border) continue
      borderPixels++
      const offset = (y * info.width + x) * info.channels
      if (data[offset] >= 245 && data[offset + 1] >= 245 && data[offset + 2] >= 245) whitePixels++
    }
  }

  const whiteBorderRatio = borderPixels ? whitePixels / borderPixels : 0
  const passed = square && whiteBorderRatio >= 0.9
  return {
    passed,
    square,
    white_border_ratio: Math.round(whiteBorderRatio * 10_000) / 10_000,
    reason: !square
      ? 'A capa precisa ser quadrada.'
      : whiteBorderRatio < 0.9
        ? 'A borda da capa precisa ter fundo branco puro.'
        : null,
  }
}

export async function findNearDuplicate(
  candidate: Buffer,
  comparisons: PerceptualComparison[],
  threshold: number
): Promise<string | null> {
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
    throw new Error('Limite perceptual inválido.')
  }
  const candidateHash = await perceptualHash(candidate)
  for (const comparison of comparisons) {
    const comparisonHash = await perceptualHash(comparison.buffer)
    if (perceptualDistance(candidateHash, comparisonHash) <= threshold) return comparison.id
  }
  return null
}
