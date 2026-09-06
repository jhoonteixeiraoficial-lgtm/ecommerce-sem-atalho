import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { recomputeListing } from '@/lib/assertive/pipeline'
import { MLNotConnectedError } from '@/lib/assertive/publisher'
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
  source: z.string().max(20).optional(),
})

// Whitelist explícita: impede que o cliente altere user_id, status de publicação ou ml_item_id.
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(50000).optional(),
  price: z.number().min(0).max(9999999).nullable().optional(),
  available_quantity: z.number().int().min(1).max(99999).optional(),
  condition: z.enum(['new', 'used', 'not_specified']).optional(),
  listing_type_id: z.string().max(40).optional(),
  category_id: z.string().max(30).optional(),
  family_name: z.string().max(120).optional(),
  photos: z.array(z.string().url()).max(12).optional(),
  attributes: z.array(attributeSchema).max(120).optional(),
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

  const { attributes, ...rest } = parsed.data
  const patch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() }

  if (attributes) {
    patch.attributes = { ...(current.attributes || {}), list: attributes }
    // qualquer alteração invalida a validação anterior
    patch.validation = {}
  }
  if (rest.title || rest.description || rest.photos || rest.category_id) {
    patch.validation = {}
  }

  await supabase.from('assertive_listings').update(patch).eq('id', id).eq('user_id', authorizedUser.id)

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
