import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createHash, randomUUID } from 'node:crypto'
import { createDerivedAsset, createOriginalAsset } from '@/lib/assertive/image-assets'
import { normalizeProductImage } from '@/lib/assertive/image-normalization'
import { assessWhiteCover, type WhiteCoverAssessment } from '@/lib/assertive/image-quality'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 12 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

const DECODED_FORMAT: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heif',
  'image/heif': 'heif',
}

/**
 * Upload das fotos do produto.
 * Feito no servidor com service role: funciona igual em desktop, mobile e câmera,
 * sem depender das políticas de storage do cliente.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Envio inválido.' }, { status: 400 })
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  if (!files.length) return Response.json({ error: 'Nenhuma foto enviada.' }, { status: 400 })
  if (files.length > 8) return Response.json({ error: 'Envie no máximo 8 fotos.' }, { status: 400 })

  const prepared: Array<{
    bytes: Buffer
    type: string
    extension: string
    originalHash: string
    normalized: Awaited<ReturnType<typeof normalizeProductImage>>
    whiteCover: WhiteCoverAssessment
  }> = []

  // Decodifica tudo antes de persistir para não deixar um lote parcialmente válido.
  for (const file of files) {
    if (file.size === 0) continue
    if (file.size > MAX_BYTES) {
      return Response.json({ error: `"${file.name}" excede 12MB.` }, { status: 400 })
    }

    let type = file.type
    if (!ALLOWED.has(type)) {
      const guessed = file.name.toLowerCase().match(/\.(jpe?g|png|webp|heic|heif)$/)?.[1]
      type = guessed === 'jpg' || guessed === 'jpeg' ? 'image/jpeg' : guessed ? `image/${guessed}` : ''
    }
    if (!ALLOWED.has(type)) {
      return Response.json({ error: 'Formato não suportado. Envie JPG, PNG, WebP ou HEIC.' }, { status: 400 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    try {
      const normalized = await normalizeProductImage(bytes)
      if (normalized.source.format !== DECODED_FORMAT[type]) {
        throw new Error('O MIME informado não corresponde ao formato decodificado.')
      }
      prepared.push({
        bytes,
        type,
        extension: EXT[type],
        originalHash: createHash('sha256').update(bytes).digest('hex'),
        normalized,
        whiteCover: await assessWhiteCover(normalized.buffer),
      })
    } catch {
      return Response.json({ error: `"${file.name}" não é uma imagem válida.` }, { status: 400 })
    }
  }

  const urls: string[] = []
  const assets: Array<{ original_asset_id: string; rendition_asset_id: string; preview_url: string }> = []

  for (const item of prepared) {
    try {
      const keyPrefix = `${authorizedUser.id}/${randomUUID()}`
      const original = await createOriginalAsset({
        user_id: authorizedUser.id,
        bytes: item.bytes,
        mime_type: item.type,
        width: item.normalized.source.width!,
        height: item.normalized.source.height!,
        sha256: item.originalHash,
        storage_key: `${keyPrefix}/original.${item.extension}`,
      })
      const renditionHash = createHash('sha256').update(item.normalized.buffer).digest('hex')
      const rendition = await createDerivedAsset({
        user_id: authorizedUser.id,
        bytes: item.normalized.buffer,
        mime_type: item.normalized.mime_type,
        width: item.normalized.width,
        height: item.normalized.height,
        sha256: renditionHash,
        parent_asset_id: original.id,
        kind: 'PUBLICATION_RENDITION',
        storage_key: `${keyPrefix}/normalized-${renditionHash.slice(0, 16)}.jpg`,
        provider: 'local',
        model: 'sharp-v1',
        fidelity_status: 'ACCEPT',
        metadata: {
          operation: 'NORMALIZE',
          source_sha256: item.originalHash,
          white_cover: item.whiteCover,
        },
      })
      if (!rendition.public_url) throw new Error('URL pública da rendição ausente')
      urls.push(rendition.public_url)
      assets.push({
        original_asset_id: original.id,
        rendition_asset_id: rendition.id,
        preview_url: rendition.public_url,
      })
    } catch (error) {
      return Response.json(
        { error: `Falha ao salvar a foto: ${error instanceof Error ? error.message : 'erro desconhecido'}` },
        { status: 500 }
      )
    }
  }

  if (!urls.length) return Response.json({ error: 'Nenhuma foto válida.' }, { status: 400 })

  return Response.json({ assets, urls })
}
