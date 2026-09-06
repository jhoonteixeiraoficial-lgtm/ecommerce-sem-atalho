import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const supabase = createAdminClient()

  const { data: analyses } = await supabase
    .from('assertive_analyses')
    .select('id, product_name, status, error_message, photos, created_at, updated_at')
    .eq('user_id', authorizedUser.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: listings } = await supabase
    .from('assertive_listings')
    .select('id, analysis_id, title, price, status, scores, completeness, ml_item_id, ml_permalink, photos, created_at')
    .eq('user_id', authorizedUser.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return Response.json({ analyses: analyses || [], listings: listings || [] })
}
