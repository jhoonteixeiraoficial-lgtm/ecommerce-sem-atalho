import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { studioEnhance } from '@/lib/assertive/studio'
import { createHash } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Estúdio gratuito e ilimitado: pega uma foto real (do usuário ou referência
 * confirmada) e devolve versão de estúdio — fundo branco puro, produto
 * centralizado, sem IA generativa. Fidelidade 100% (mesmos pixels do
 * produto), custo zero, sem quota.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth
  const { id } = await params

  const body = await req.json().catch(() => ({})) as { photo_url?: unknown }
  const photoUrl = typeof body.photo_url === 'string' && body.photo_url.startsWith('https://') ? body.photo_url : null
  if (!photoUrl) return Response.json({ error: 'Informe photo_url (https).' }, { status: 400 })

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('id, user_id, analysis_id')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()
  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })

  try {
    const res = await fetch(photoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!res.ok) return Response.json({ error: 'Foto original indisponível.' }, { status: 422 })
    const original = Buffer.from(await res.arrayBuffer())

    const studio = await studioEnhance(original)
    const sha256 = createHash('sha256').update(studio.buffer).digest('hex')
    const storageKey = `${authorizedUser.id}/${listing.analysis_id}/${sha256}.jpg`

    const { error: upErr } = await supabase.storage
      .from('assertive-originals')
      .upload(storageKey, studio.buffer, { contentType: studio.mime_type, upsert: true })
    if (upErr && !upErr.message.includes('exists')) throw new Error(`Falha ao salvar foto: ${upErr.message}`)

    const { data: pub } = await supabase.storage
      .from('assertive-originals')
      .createSignedUrl(storageKey, 60 * 60 * 24 * 365)
    const publicUrl = pub?.signedUrl ?? null

    const { createOriginalAsset } = await import('@/lib/assertive/image-assets')
    const asset = await createOriginalAsset({
      user_id: authorizedUser.id,
      analysis_id: listing.analysis_id,
      bytes: studio.buffer,
      mime_type: studio.mime_type,
      width: studio.width,
      height: studio.height,
      sha256,
      storage_key: storageKey,
    }).catch(() => null)

    return Response.json({
      ok: true,
      url: publicUrl,
      asset_id: asset?.id ?? null,
      width: studio.width,
      height: studio.height,
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Falha no estúdio de fotos.' },
      { status: 500 }
    )
  }
}
