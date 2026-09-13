import { readJson, requireCommunityUser } from '@/app/api/community/helpers'
import { attachManualImageSlot, dismissImageJob, getImageJobSnapshot } from '@/lib/assertive/image-jobs'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

export const runtime = 'nodejs'

const positionSchema = z.string().regex(/^[0-5]$/).transform(Number)
const manualAssetSchema = z.object({ asset_id: z.string().min(1).max(100) })

interface RouteContext {
  params: Promise<{ id: string; position: string }>
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response

  const { id, position: rawPosition } = await context.params
  const parsed = positionSchema.safeParse(rawPosition)
  if (!parsed.success) return Response.json({ error: 'Posição de imagem inválida.' }, { status: 400 })
  const userId = auth.authorizedUser.id
  const { data: listing, error } = await createAdminClient()
    .from('assertive_listings')
    .select('id,status')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return Response.json({ error: 'Não foi possível consultar o anúncio.' }, { status: 500 })
  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (['publishing', 'published'].includes(listing.status)) {
    return Response.json({ error: 'O anúncio não aceita alterações de imagem.' }, { status: 409 })
  }

  try {
    await dismissImageJob(id, userId, parsed.data)
    return Response.json(await getImageJobSnapshot(id, userId))
  } catch {
    return Response.json({ error: 'Não foi possível remover a posição de imagem.' }, { status: 409 })
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response

  const { id, position: rawPosition } = await context.params
  const position = positionSchema.safeParse(rawPosition)
  if (!position.success) return Response.json({ error: 'Posição de imagem inválida.' }, { status: 400 })
  const body = await readJson(request)
  if (body.response) return body.response
  const asset = manualAssetSchema.safeParse(body.body ?? {})
  if (!asset.success) return Response.json({ error: 'Imagem inválida.' }, { status: 400 })

  const userId = auth.authorizedUser.id
  const { data: listing, error } = await createAdminClient()
    .from('assertive_listings')
    .select('id,status')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return Response.json({ error: 'Não foi possível consultar o anúncio.' }, { status: 500 })
  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (['publishing', 'published'].includes(listing.status)) {
    return Response.json({ error: 'O anúncio não aceita alterações de imagem.' }, { status: 409 })
  }

  try {
    await attachManualImageSlot(id, userId, position.data, asset.data.asset_id)
    return Response.json(await getImageJobSnapshot(id, userId))
  } catch {
    return Response.json({ error: 'Não foi possível vincular a foto própria.' }, { status: 409 })
  }
}
