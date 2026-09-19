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

export async function studioEnhance(
  original: Buffer,
  options: { marginPct?: number; background?: string } = {}
): Promise<StudioResult> {
  const marginPct = options.marginPct ?? 0.08
  const background = options.background ?? '#ffffff'

  // 1) normaliza decodificação (webp/heic/etc.) e endireita
  const base = await sharp(original)
    .rotate()
    .flatten({ background })
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
  const left = Math.round((CANVAS - finalW) / 2)
  const top = Math.round((CANVAS - finalH) / 2)

  const buffer = await sharp(trimmed)
    .resize(finalW, finalH)
    .modulate({ brightness: 1.04, saturation: 1.02 })
    .sharpen({ sigma: 0.8 })
    .composite([{
      input: {
        create: {
          width: CANVAS,
          height: CANVAS,
          channels: 3,
          background,
        },
      },
      left: 0,
      top: 0,
    }])
    .composite([{ input: await sharp(trimmed).resize(finalW, finalH).png().toBuffer(), left, top }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  return { buffer, mime_type: 'image/jpeg', width: CANVAS, height: CANVAS }
}
