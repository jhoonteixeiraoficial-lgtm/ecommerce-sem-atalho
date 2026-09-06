import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const status = new URL(req.url).searchParams.get('status')

  const supabase = createAdminClient()
  let query = supabase
    .from('assertive_listings')
    .select('*')
    .eq('user_id', authorizedUser.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)

  const { data } = await query
  return Response.json(data || [])
}
