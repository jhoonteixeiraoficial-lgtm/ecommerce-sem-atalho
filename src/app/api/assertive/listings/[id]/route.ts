import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeListing } from '@/lib/assertive/pipeline'
import { MLNotConnectedError } from '@/lib/assertive/publisher'
import { attachListingImages } from '@/lib/assertive/image-assets'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!data) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  return Response.json(data)
}

const attributeSchema = z.object({
  id: z.string().max(60),
  name: z.string().max(120).optional(),
  value_name: z.string().max(500),
  value_id: z.string().max(60).optional(),
  tier: z.string().max(30).optional(),
  source: z.enum(['truth', 'ai', 'catalog', 'user']).optional(),
  status: z.enum(['CONFIRMED', 'AUTO_FILLED', 'NEEDS_CONFIRMATION', 'UNKNOWN', 'NOT_APPLICABLE', 'CONFLICT', 'USER_OVERRIDE']).optional(),
  evidence: z.string().max(2000).optional(),
  source_url: z.string().url().max(2000).optional(),
  isVariationOnly: z.boolean().optional(),
})

const listingImageSchema = z.object({
  asset_id: z.string().min(1).max(100),
  position: z.number().int().min(0).max(11),
  role: z.enum(['MAIN', 'DETAIL', 'PACKAGING', 'LIFESTYLE', 'INFORMATIONAL']),
  shot_type: z.string().max(80).optional(),
})

// Whitelist explícita: impede que o cliente altere user_id, status de publicação ou ml_item_id.
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(50000).optional(),
  price: z.number().min(0).max(9999999).nullable().optional(),
  available_quantity: z.number().int().min(1).max(99999).optional(),
  condition: z.enum(['new', 'used', 'not_specified']).optional(),
  listing_type_id: z.enum(['gold_special', 'gold_pro']).optional(),
  shipping_mode: z.enum(['me2', 'me1', 'custom']).optional(),
  free_shipping: z.boolean().optional(),
  category_id: z.string().max(30).optional(),
  family_name: z.string().max(120).optional(),
  photos: z.array(z.string().url()).max(12).optional(),
  listing_images: z.array(listingImageSchema).max(12).optional(),
  attributes: z.array(attributeSchema).max(120).optional(),
  photo_metadata: z.array(z.object({
    asset_id: z.string().max(100).optional(),
    parent_asset_id: z.string().max(100).optional(),
    url: z.string(),
    role: z.enum(['MAIN', 'DETAIL', 'PACKAGING', 'LIFESTYLE', 'INFORMATIONAL']),
    source: z.enum(['USER', 'COMPETITOR', 'SOURCE_URL', 'AI_ENHANCED', 'AI_GENERATED']),
    source_ref: z.string().optional(),
    source_url: z.string().optional(),
    score: z.number(),
    ai_enhanced: z.boolean(),
    fidelity_status: z.enum(['ACCEPT', 'REVIEW', 'REJECT']).optional(),
    label: z.string().max(80).optional(),
    position: z.number(),
  })).max(12).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const body = await readJson(req)
  if (body.response) return body.response

  const parsed = patchSchema.safeParse(body.body ?? {})
  if (!parsed.success) {
    return Response.json({ error: 'Dados inválidos para atualizar o anúncio.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: current } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!current) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (current.status === 'published') {
    return Response.json({ error: 'Este anúncio já foi publicado e não pode ser editado aqui.' }, { status: 409 })
  }

  const shippingPolicyInputsChanged = (
    (parsed.data.price !== undefined && parsed.data.price !== null && parsed.data.price !== Number(current.price))
    || (parsed.data.listing_type_id !== undefined && parsed.data.listing_type_id !== current.listing_type_id)
    || (parsed.data.shipping_mode !== undefined && parsed.data.shipping_mode !== current.shipping_mode)
    || (parsed.data.category_id !== undefined && parsed.data.category_id !== current.category_id)
    || (parsed.data.condition !== undefined && parsed.data.condition !== current.condition)
  )
  if (parsed.data.free_shipping === false && current.free_shipping_mandatory && !shippingPolicyInputsChanged) {
    return Response.json({ error: 'O frete grátis é obrigatório para esta configuração do anúncio.' }, { status: 409 })
  }

  if (parsed.data.listing_images) {
    if (Object.keys(parsed.data).some(key => key !== 'listing_images')) {
      return Response.json({ error: 'Atualize a galeria separadamente dos outros campos.' }, { status: 400 })
    }
    try {
      await attachListingImages(id, authorizedUser.id, parsed.data.listing_images)
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Falha ao atualizar galeria.' }, { status: 400 })
    }
    try {
      const recomputed = await recomputeListing(id, authorizedUser.id)
      return Response.json({ ok: true, ...recomputed })
    } catch (error) {
      if (error instanceof MLNotConnectedError) return Response.json({ ok: true, warning: error.message })
      return Response.json({ ok: true })
    }
  }

  const { attributes, photo_metadata } = parsed.data
  const rest = { ...parsed.data }
  delete rest.attributes
  delete rest.photo_metadata
  delete rest.listing_images
  const patch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() }
  if (shippingPolicyInputsChanged) patch.free_shipping_mandatory = false

  if (attributes) {
    patch.attributes = { ...(current.attributes || {}), list: attributes }
  }
  if (photo_metadata) {
    patch.attributes = { ...(patch.attributes as Record<string, unknown> || current.attributes || {}), photo_metadata }
  }

  // QUALQUER edição invalida o preflight e o payload previamente validado.
  patch.attributes = {
    ...(current.attributes || {}),
    ...((patch.attributes as Record<string, unknown>) || {}),
    publication_requirements: null,
  }
  patch.validation = {}
  patch.validated_payload = null
  patch.validated_payload_hash = null
  patch.status = 'ready'

  const { error } = await supabase.from('assertive_listings').update(patch).eq('id', id).eq('user_id', authorizedUser.id)
  if (error) return Response.json({ error: 'Falha ao salvar o anúncio.' }, { status: 500 })

  try {
    const recomputed = await recomputeListing(id, authorizedUser.id)
    return Response.json({ ok: true, ...recomputed })
  } catch (e) {
    if (e instanceof MLNotConnectedError) {
      return Response.json({ ok: true, warning: e.message })
    }
    return Response.json({ ok: true })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const supabase = createAdminClient()
  await supabase.from('assertive_listings').delete().eq('id', id).eq('user_id', authorizedUser.id)
  return Response.json({ ok: true })
}
