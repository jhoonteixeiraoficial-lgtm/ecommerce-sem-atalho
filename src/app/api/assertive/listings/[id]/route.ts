import { NextRequest } from 'next/server'
import { requireCommunityUser, invalidInput, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'

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
    .single()

  if (!data) return invalidInput()
  return Response.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const body = await readJson(req)
  if (body.response) return body.response
  const supabase = createAdminClient()
  const updateData = (body.body as Record<string, unknown>) || {}

  const { data } = await supabase
    .from('assertive_listings')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .select()
    .single()

  if (!data) return invalidInput()
  return Response.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const supabase = createAdminClient()
  await supabase
    .from('assertive_listings')
    .delete()
    .eq('id', id)
    .eq('user_id', authorizedUser.id)

  return Response.json({ ok: true })
}
