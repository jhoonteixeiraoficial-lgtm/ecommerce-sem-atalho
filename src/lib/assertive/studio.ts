import 'server-only'
import sharp from 'sharp'

/**
 * Estúdio gratuito e ilimitado: melhora uma foto real do produto sem IA
 * generativa. Recorta o produto (remove a moldura do fundo), recentraliza
 * em um canvas branco de estúdio 1600px e normaliza luz/nitidez.
 * Os pixels do produto não mudam — fidelidade 100%, custo zero, sem quota.
 */

const CANVAS = 1600

export interface StudioResult {
  buffer: Buffer
  mime_type: 'image/jpeg'
  width: number
  height: number
}

export interface StudioSlotVariation {
  /** Slot position 0-5, used to seed rotation and framing offset. */
  position: number
  /** Total slots in the gallery, used to distribute variations evenly. */
  totalSlots?: number
}

export async function studioEnhance(
  original: Buffer,
  options: { marginPct?: number; background?: string; variation?: StudioSlotVariation } = {}
): Promise<StudioResult> {
  const marginPct = options.marginPct ?? 0.08
  const background = options.background ?? '#ffffff'
  const total = Math.max(1, options.variation?.totalSlots ?? 1)
  const position = options.variation?.position ?? 0
  // Distribute distinct rotations [-4..4]deg and offsets [-3..3]% per slot
  const angle = ((position % total) - (total - 1) / 2) * (8 / Math.max(1, total - 1))
  const offX = ((position % total) - (total - 1) / 2) * (0.06 / Math.max(1, total - 1))
  const offY = (((position + Math.floor(total / 2)) % total) - (total - 1) / 2) * (0.06 / Math.max(1, total - 1))

  // 1) normaliza decodificação (webp/heic/etc.) e endireita; rotaciona sutilmente para diferenciar slots
  const base = await sharp(original)
    .rotate()
    .flatten({ background })
    .rotate(Number.isFinite(angle) ? angle : 0)
    .toBuffer()

  // 2) recorta a moldura do fundo (trim remove bordas de cor uniforme)
  const trimmed = await sharp(base)
    .trim({ threshold: 18 })
    .toBuffer()
    .catch(() => base)

  // 3) enquadra o produto em canvas branco com margem profissional
  const meta = await sharp(trimmed).metadata()
  const productW = meta.width ?? CANVAS
  const productH = meta.height ?? CANVAS
  const scale = Math.min((CANVAS * (1 - marginPct * 2)) / productW, (CANVAS * (1 - marginPct * 2)) / productH)
  const finalW = Math.max(1, Math.round(productW * scale))
  const finalH = Math.max(1, Math.round(productH * scale))
  const left = Math.round((CANVAS - finalW) / 2 + offX * CANVAS)
  const top = Math.round((CANVAS - finalH) / 2 + offY * CANVAS)

  const canvas = await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 3, background },
  })
    .jpeg({ quality: 95 })
    .toBuffer()

  const buffer = await sharp(canvas)
    .composite([{ input: await sharp(trimmed).resize(finalW, finalH).png().toBuffer(), left, top }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  return { buffer, mime_type: 'image/jpeg', width: CANVAS, height: CANVAS }
}
