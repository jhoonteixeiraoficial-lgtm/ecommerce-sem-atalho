import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireMLToken,
  getSellerCapabilities,
  buildItemPayload,
  validateListing,
  publishListing,
  MLNotConnectedError,
} from '@/lib/assertive/publisher'
import type { ListingAttribute } from '@/lib/assertive/generator'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 120

const schema = z.object({
  // exige confirmação explícita do vendedor — nada é publicado por acidente
  confirm: z.literal(true),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const body = await readJson(req)
  if (body.response) return body.response

  if (!schema.safeParse(body.body ?? {}).success) {
    return Response.json(
      { error: 'Confirmação obrigatória para publicar no Mercado Livre.' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (listing.status === 'published' || listing.ml_item_id) {
    return Response.json(
      { error: 'Este anúncio já foi publicado.', item_id: listing.ml_item_id },
      { status: 409 }
    )
  }

  try {
    const token = await requireMLToken(authorizedUser.id)
    const capabilities = await getSellerCapabilities(token)

    const payload = buildItemPayload(
      {
        title: listing.title,
        family_name: listing.family_name,
        category_id: listing.category_id,
        price: Number(listing.price),
        available_quantity: listing.available_quantity || 1,
        condition: listing.condition || 'new',
        listing_type_id: listing.listing_type_id || 'gold_special',
        attributes: (listing.attributes?.list || []) as ListingAttribute[],
        pictures: (listing.photos || []) as string[],
      },
      capabilities
    )

    // valida imediatamente antes de criar: garante que nada mudou desde a última checagem
    const validation = await validateListing(token, payload)
    if (!validation.valid) {
      await supabase
        .from('assertive_listings')
        .update({
          validation: { valid: false, checked_at: new Date().toISOString(), issues: validation.issues },
          status: 'needs_input',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', authorizedUser.id)

      return Response.json(
        { error: 'O anúncio não passou na validação do Mercado Livre.', issues: validation.issues },
        { status: 422 }
      )
    }

    await supabase
      .from('assertive_listings')
      .update({ status: 'publishing', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)

    const result = await publishListing(token, payload, listing.description || '')

    if (!result.success) {
      await supabase
        .from('assertive_listings')
        .update({
          status: 'failed',
          validation: { valid: false, checked_at: new Date().toISOString(), issues: result.issues || [] },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', authorizedUser.id)

      return Response.json({ error: result.error, issues: result.issues }, { status: 422 })
    }

    await supabase
      .from('assertive_listings')
      .update({
        status: 'published',
        ml_item_id: result.item_id,
        ml_permalink: result.permalink,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)

    await supabase
      .from('assertive_analyses')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', listing.analysis_id)
      .eq('user_id', authorizedUser.id)

    return Response.json({
      ok: true,
      item_id: result.item_id,
      permalink: result.permalink,
      status: result.status,
    })
  } catch (e) {
    if (e instanceof MLNotConnectedError) {
      return Response.json({ error: e.message, code: 'ML_NOT_CONNECTED' }, { status: 409 })
    }
    const message = e instanceof Error ? e.message : 'Falha ao publicar.'
    await supabase
      .from('assertive_listings')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)
    return Response.json({ error: message }, { status: 500 })
  }
}
