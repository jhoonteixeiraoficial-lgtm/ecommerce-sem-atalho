import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'

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

  const supabase = createAdminClient()
  const urls: string[] = []

  for (const file of files) {
    if (file.size === 0) continue
    if (file.size > MAX_BYTES) {
      return Response.json({ error: `"${file.name}" excede 12MB.` }, { status: 400 })
    }

    // navegadores mobile às vezes enviam type vazio: detecta pela extensão
    let type = file.type
    if (!ALLOWED.has(type)) {
      const guessed = file.name.toLowerCase().match(/\.(jpe?g|png|webp|heic|heif)$/)?.[1]
      type = guessed === 'jpg' || guessed === 'jpeg' ? 'image/jpeg' : guessed ? `image/${guessed}` : ''
    }
    if (!ALLOWED.has(type)) {
      return Response.json(
        { error: 'Formato não suportado. Envie JPG, PNG ou WebP.' },
        { status: 400 }
      )
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const path = `${authorizedUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${EXT[type]}`

    const { error } = await supabase.storage
      .from('assertive')
      .upload(path, bytes, { contentType: type, upsert: false })

    if (error) {
      return Response.json(
        { error: `Falha ao salvar a foto: ${error.message}` },
        { status: 500 }
      )
    }

    const { data } = supabase.storage.from('assertive').getPublicUrl(path)
    urls.push(data.publicUrl)
  }

  if (!urls.length) return Response.json({ error: 'Nenhuma foto válida.' }, { status: 400 })

  return Response.json({ urls })
}
