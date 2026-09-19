import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { requireMLToken } from '@/lib/assertive/publisher'

export const runtime = 'nodejs'

/** Pausa o anúncio publicado direto no Mercado Livre (sem excluir). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth
  const { id } = await params

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('id, user_id, ml_item_id')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()
  if (!listing?.ml_item_id) return Response.json({ error: 'Anúncio não publicado.' }, { status: 409 })

  try {
    const token = await requireMLToken(authorizedUser.id)
    const res = await fetch(`https://api.mercadolibre.com/items/${listing.ml_item_id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return Response.json({ error: `Falha ao pausar (HTTP ${res.status}): ${JSON.stringify(data).slice(0, 120)}` }, { status: 502 })
    await supabase
      .from('assertive_listings')
      .update({ publication_status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', listing.id)
      .eq('user_id', authorizedUser.id)
    return Response.json({ ok: true, item_id: listing.ml_item_id, status: data.status })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Falha ao pausar.' }, { status: 500 })
  }
}
