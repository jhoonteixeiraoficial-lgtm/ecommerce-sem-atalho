import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const supabase = createAdminClient()

  const { data: analysis } = await supabase
    .from('assertive_analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!analysis) return Response.json({ error: 'Análise não encontrada.' }, { status: 404 })

  const { data: listings } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('analysis_id', id)
    .eq('user_id', authorizedUser.id)
    .order('created_at', { ascending: false })

  return Response.json({ analysis, listings: listings || [] })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const supabase = createAdminClient()

  await supabase.from('assertive_listings').delete().eq('analysis_id', id).eq('user_id', authorizedUser.id)
  await supabase.from('assertive_analyses').delete().eq('id', id).eq('user_id', authorizedUser.id)

  return Response.json({ ok: true })
}
