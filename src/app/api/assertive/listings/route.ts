import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  // Rate limit: 60 listagens por minuto por usuário
  const rateLimit = checkRateLimit(`assertive-listings-get-${authorizedUser.id}`, 60, 60000)
  if (!rateLimit.allowed) {
    return Response.json({ error: 'Muitas solicitações. Aguarde um momento.' }, { status: 429, headers: { 'X-RateLimit-Remaining': '0' } })
  }

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
