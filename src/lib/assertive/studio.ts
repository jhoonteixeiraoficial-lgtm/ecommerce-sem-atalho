import 'server-only'
import sharp from 'sharp'

/**
 * Estúdio gratuito e ilimitado: melhora uma foto REAL do produto
 * (ex.: referência do anúncio escalado) sem IA generativa — remove o fundo
 * e recomponde em branco de estúdio. Como os pixels do produto são os
 * mesmos, a fidelidade é garantida e não há quota nem custo.
 */

const CANVAS = 1600

export interface StudioResult {
  buffer: Buffer
  mime_type: 'image/jpeg'
  width: number
  height: number
}

/** Foto com fundo isolado em branco puro, enquadrada e otimizada. */
export async function studioEnhance(
  original: Buffer,
  options: { marginPct?: number; background?: string } = {}
): Promise<StudioResult> {
  const { removeBackground } = await import('@imgly/background-removal-node')

  const cutout = await removeBackground(original, { output: { format: 'image/png' } })
  const cutoutBuffer = Buffer.from(await cutout.arrayBuffer())

  const trimmed = await sharp(cutoutBuffer)
    .trim({ threshold: 12 })
    .png()
    .toBuffer()
  const meta = await sharp(trimmed).metadata()
  const productW = meta.width ?? CANVAS
  const productH = meta.height ?? CANVAS

  const marginPct = options.marginPct ?? 0.08
  const scale = Math.min((CANVAS * (1 - marginPct * 2)) / productW, (CANVAS * (1 - marginPct * 2)) / productH)
  const finalW = Math.max(1, Math.round(productW * scale))
  const finalH = Math.max(1, Math.round(productH * scale))
  const left = Math.round((CANVAS - finalW) / 2)
  const top = Math.round((CANVAS - finalH) / 2)

  const buffer = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 3,
      background: options.background ?? '#ffffff',
    },
  })
    .composite([{ input: await sharp(trimmed).resize(finalW, finalH).png().toBuffer(), left, top }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer()

  return { buffer, mime_type: 'image/jpeg', width: CANVAS, height: CANVAS }
}
