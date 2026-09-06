import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/assertive/encryption'

function errorPage(message: string) {
  const safe = message.replace(/</g, '&lt;')
  return new Response(`
    <html>
      <body style="background:#0c0c0c;color:#fff;font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
        <div style="text-align:center;max-width:420px;padding:24px">
          <h1 style="color:#e05252;font-size:22px">Não foi possível conectar</h1>
          <p style="color:#aaa;font-size:14px">${safe}</p>
          <button onclick="window.close()" style="margin-top:16px;background:#c8a44e;color:#000;border:none;padding:10px 20px;border-radius:8px;font-weight:bold;cursor:pointer">Fechar</button>
        </div>
        <script>
          try { if (window.opener) window.opener.postMessage({ type: 'ml-connected', ok: false, message: ${JSON.stringify(message)} }, '*') } catch (e) {}
        </script>
      </body>
    </html>
  `, { status: 500, headers: { 'Content-Type': 'text/html' } })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code || !state) {
    return errorPage('Parâmetros inválidos retornados pelo Mercado Livre.')
  }

  let userId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
    userId = decoded.user_id
  } catch {
    return errorPage('State inválido ou expirado. Tente conectar novamente.')
  }

  const redirectUri = process.env.ML_REDIRECT_URI || 'https://ecommerce-sem-atalho.vercel.app/api/assertive/ml/callback'
  const clientId = process.env.ML_CLIENT_ID
  const clientSecret = process.env.ML_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('[ml/callback] stage=env_check missing:', {
      ML_CLIENT_ID: !clientId, ML_CLIENT_SECRET: !clientSecret,
    })
    return errorPage('Configuração do Mercado Livre incompleta no servidor.')
  }

  const form = new URLSearchParams()
  form.set('grant_type', 'authorization_code')
  form.set('client_id', clientId)
  form.set('client_secret', clientSecret)
  form.set('code', code)
  form.set('redirect_uri', redirectUri)

  const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  })

  if (!tokenRes.ok) {
    let details: Record<string, unknown> = {}
    try { details = await tokenRes.json() } catch { /* ignore parse error */ }
    console.error('[ml/callback] stage=token_exchange status:', tokenRes.status, {
      error: details.error,
      error_description: details.error_description,
      message: details.message,
      cause: details.cause,
      redirect_uri_used: redirectUri,
    })
    const reason = (details.error_description as string) || (details.error as string) || `HTTP ${tokenRes.status}`
    return errorPage(`Erro ao obter token: ${reason}`)
  }

  const tokenData = await tokenRes.json()

  const userRes = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
  })

  if (!userRes.ok) {
    console.error('[ml/callback] stage=verify_users_me status:', userRes.status)
  }

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
      <body style="background:#0c0c0c;color:#fff;font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
        <div style="text-align:center">
          <h1 style="color:#c8a44e;font-size:24px">Conta conectada!</h1>
          <p style="color:#888">Mercado Livre vinculado com sucesso.</p>
          <p style="color:#888">Nickname: ${userData.nickname}</p>
        </div>
        <script>
          try { if (window.opener) window.opener.postMessage({ type: 'ml-connected', ok: true }, '*') } catch (e) {}
          setTimeout(function () { window.close() }, 1200)
        </script>
      </body>
    </html>
  `, { headers: { 'Content-Type': 'text/html' } })
}
