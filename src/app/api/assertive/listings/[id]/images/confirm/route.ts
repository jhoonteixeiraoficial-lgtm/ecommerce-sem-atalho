import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const schema = z.object({ asset_id: z.string().uuid().or(z.string().min(1).max(100)) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response

  const body = await readJson(req)
  if (body.response) return body.response
  const parsed = schema.safeParse(body.body ?? {})
  if (!parsed.success) return Response.json({ error: 'Imagem inválida.' }, { status: 400 })

  const { id } = await params
  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', auth.authorizedUser.id)
    .maybeSingle()

  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (listing.status === 'published') {
    return Response.json({ error: 'Anúncio publicado não pode ser alterado.' }, { status: 409 })
  }

  const review = listing.attributes?.image_review || {}
  const required = Array.isArray(review.required_asset_ids) ? review.required_asset_ids : []
  const generatedAssets = new Set(
    (listing.attributes?.photo_metadata || [])
      .filter((item: { source?: string }) => item.source === 'AI_GENERATED')
      .map((item: { asset_id?: string }) => item.asset_id)
      .filter(Boolean)
  )
  if (!required.includes(parsed.data.asset_id) || !generatedAssets.has(parsed.data.asset_id)) {
    return Response.json({ error: 'Esta imagem não está pendente de revisão neste anúncio.' }, { status: 400 })
  }

  const confirmed = [...new Set([
    ...(Array.isArray(review.confirmed_asset_ids) ? review.confirmed_asset_ids : []),
    parsed.data.asset_id,
  ])]
  const hasRealBlockers = !listing.title?.trim()
    || !listing.price
    || Number(listing.price) <= 0
    || !listing.photos?.length
    || required.some((assetId: string) => !confirmed.includes(assetId))
  const { error } = await supabase
    .from('assertive_listings')
    .update({
      attributes: {
        ...(listing.attributes || {}),
        image_review: {
          ...review,
          confirmed_asset_ids: confirmed,
          confirmed_at: new Date().toISOString(),
        },
      },
      status: hasRealBlockers ? 'needs_input' : 'ready',
      validation: {},
      validated_payload: null,
      validated_payload_hash: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', auth.authorizedUser.id)

  if (error) return Response.json({ error: 'Não foi possível confirmar a imagem.' }, { status: 500 })
  return Response.json({ ok: true, confirmed_asset_ids: confirmed })
}
