import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { requireMLToken } from '@/lib/assertive/publisher'
import { auditPublishedItem } from '@/lib/assertive/publication-audit'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Reaudita um anúncio publicado: confirma na conta do vendedor e corrige
 * qualidade. Body opcional { sync_photos: string[] } sincroniza a galeria
 * direto no Mercado Livre (PATCH /items) — usado quando o anúncio está
 * pausado e o rascunho do app já tem as fotos melhores.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth
  const { id } = await params

  let syncPhotos: string[] | null = null
  try {
    const body = await req.json().catch(() => ({})) as { sync_photos?: unknown }
    if (Array.isArray(body.sync_photos)) {
      syncPhotos = body.sync_photos
        .filter((u): u is string => typeof u === 'string' && u.startsWith('https://'))
        .slice(0, 12)
    }
  } catch {
    syncPhotos = null
  }

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('id, user_id, ml_item_id, status')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (!listing.ml_item_id) return Response.json({ error: 'Este anúncio ainda não foi publicado.' }, { status: 409 })

  try {
    const token = await requireMLToken(authorizedUser.id)

    let photos_synced: number | null = null
    if (syncPhotos?.length) {
      const res = await fetch(`https://api.mercadolibre.com/items/${listing.ml_item_id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ pictures: syncPhotos.map(url => ({ source: url })) }),
      })
      if (res.ok) photos_synced = syncPhotos.length
    }

    const audit = await auditPublishedItem({
      token,
      userId: authorizedUser.id,
      listingId: listing.id,
      mlItemId: listing.ml_item_id,
    })
    return Response.json({ ok: true, photos_synced, audit })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Falha ao auditar o anúncio.' },
      { status: 500 }
    )
  }
}
