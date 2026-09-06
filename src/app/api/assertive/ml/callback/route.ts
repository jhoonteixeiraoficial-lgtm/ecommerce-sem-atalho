import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/assertive/encryption'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return new Response('Parâmetros inválidos', { status: 400 })
  }

  let userId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
    userId = decoded.user_id
  } catch {
    return new Response('State inválido', { status: 400 })
  }

  const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.ML_CLIENT_ID,
      client_secret: process.env.ML_CLIENT_SECRET,
      code,
      redirect_uri: process.env.ML_REDIRECT_URI || 'https://ecommerce-sem-atalho.vercel.app/api/assertive/ml/callback',
    }),
  })

  if (!tokenRes.ok) {
    return new Response('Erro ao obter token', { status: 500 })
  }

  const tokenData = await tokenRes.json()

  const userRes = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
  })

  const userData = userRes.ok ? await userRes.json() : { id: '', nickname: '' }

  const supabase = createAdminClient()
  await supabase
    .from('assertive_ml_connections')
    .upsert({
      user_id: userId,
      access_token: encrypt(tokenData.access_token),
      refresh_token: encrypt(tokenData.refresh_token),
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
      ml_user_id: String(userData.id),
      nickname: userData.nickname,
    })

  return new Response(`
    <html>
      <body style="background:#0c0c0c;color:#fff;font-family:Inter;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h1 style="color:#c8a44e;font-size:24px">Conta conectada!</h1>
          <p style="color:#888">Mercado Livre vinculado com sucesso.</p>
          <p style="color:#888">Nickname: ${userData.nickname}</p>
          <script>window.close()</script>
        </div>
      </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } })
}
