import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'

export async function POST(_req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const clientId = process.env.ML_CLIENT_ID
  const redirectUri = process.env.ML_REDIRECT_URI || 'https://ecommerce-sem-atalho.vercel.app/api/assertive/ml/callback'

  if (!clientId) return Response.json({ error: 'ML não configurado' }, { status: 500 })

  const state = Buffer.from(JSON.stringify({ user_id: authorizedUser.id })).toString('base64')

  const authUrl = `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`

  return Response.json({ url: authUrl })
}
