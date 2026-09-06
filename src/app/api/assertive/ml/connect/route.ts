import { randomBytes, createHash } from 'crypto'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export function mlRedirectUri(): string {
  return (
    process.env.ML_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_APP_URL || 'https://ecommerce-sem-atalho.vercel.app'}/api/assertive/ml/callback`
  )
}

export async function POST() {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const clientId = process.env.ML_CLIENT_ID
  if (!clientId) {
    return Response.json({ error: 'Integração com o Mercado Livre não configurada.' }, { status: 500 })
  }

  // PKCE obrigatório neste app do Mercado Livre.
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const state = randomBytes(24).toString('base64url')

  // O verifier fica no servidor. Nunca trafega pela URL do navegador.
  const supabase = createAdminClient()
  const { error } = await supabase.from('assertive_oauth_states').insert({
    state,
    user_id: authorizedUser.id,
    code_verifier: codeVerifier,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  })

  if (error) {
    return Response.json({ error: 'Não foi possível iniciar a conexão.' }, { status: 500 })
  }

  // limpeza oportunista de states expirados
  await supabase.from('assertive_oauth_states').delete().lt('expires_at', new Date().toISOString())

  const url =
    `https://auth.mercadolivre.com.br/authorization?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(mlRedirectUri())}` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${codeChallenge}&code_challenge_method=S256`

  return Response.json({ url })
}
