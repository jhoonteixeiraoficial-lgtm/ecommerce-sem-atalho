import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidMLToken, getSellerCapabilities } from '@/lib/assertive/publisher'

export const runtime = 'nodejs'

export async function GET() {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_ml_connections')
    // nunca selecionar os tokens
    .select('ml_user_id, nickname, expires_at, created_at')
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!data) return Response.json({ connected: false })

  const token = await getValidMLToken(authorizedUser.id)
  if (!token) {
    return Response.json({
      connected: false,
      stale: true,
      nickname: data.nickname,
      message: 'Sua conexão com o Mercado Livre expirou. Reconecte a conta.',
    })
  }

  try {
    const capabilities = await getSellerCapabilities(token)
    return Response.json({
      connected: true,
      nickname: capabilities.nickname || data.nickname,
      ml_user_id: capabilities.ml_user_id,
      site_id: capabilities.site_id,
      account_model: capabilities.user_product_model ? 'user_product' : 'classic',
    })
  } catch {
    return Response.json({ connected: true, nickname: data.nickname })
  }
}

export async function DELETE() {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const supabase = createAdminClient()
  await supabase.from('assertive_ml_connections').delete().eq('user_id', authorizedUser.id)
  return Response.json({ ok: true })
}
