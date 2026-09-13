import { requireCommunityUser } from '@/app/api/community/helpers'
import { getImageJobSnapshot, retryImageJob } from '@/lib/assertive/image-jobs'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

export const runtime = 'nodejs'

const positionSchema = z.string().regex(/^[0-5]$/).transform(Number)

interface RouteContext {
  params: Promise<{ id: string; position: string }>
}

export async function POST(_request: Request, context: RouteContext) {
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
    await retryImageJob(id, userId, parsed.data)
    return Response.json(await getImageJobSnapshot(id, userId))
  } catch {
    return Response.json({ error: 'Não foi possível reenfileirar a posição de imagem.' }, { status: 409 })
  }
}
