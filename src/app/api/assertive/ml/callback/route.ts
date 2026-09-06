import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt } from '@/lib/assertive/encryption'
import { mlRedirectUri } from '../connect/route'

export const runtime = 'nodejs'

function page(ok: boolean, title: string, message: string, status = 200) {
  const esc = (s: string) => s.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] || c)
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="background:#0c0c0c;color:#fff;font-family:system-ui,Inter,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:24px">
  <div style="text-align:center;max-width:420px">
    <h1 style="color:${ok ? '#c8a44e' : '#e05252'};font-size:22px;margin:0 0 12px">${esc(title)}</h1>
    <p style="color:#9a9a9a;font-size:14px;line-height:1.5;margin:0 0 20px">${esc(message)}</p>
    <button onclick="window.close()" style="background:#c8a44e;color:#000;border:none;padding:10px 22px;border-radius:8px;font-weight:600;cursor:pointer">Fechar</button>
  </div>
  <script>
    try { if (window.opener) window.opener.postMessage({ type: 'ml-connected', ok: ${ok}, message: ${JSON.stringify(message)} }, window.location.origin) } catch (e) {}
    ${ok ? 'setTimeout(function(){ window.close() }, 1400)' : ''}
  </script>
</body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  if (oauthError) {
    return page(false, 'Autorização cancelada', searchParams.get('error_description') || oauthError, 400)
  }
  if (!code || !state) {
    return page(false, 'Não foi possível conectar', 'O Mercado Livre não retornou os dados esperados.', 400)
  }

  const supabase = createAdminClient()

  const { data: stateRow } = await supabase
    .from('assertive_oauth_states')
    .select('*')
    .eq('state', state)
    .maybeSingle()

  if (!stateRow) {
    return page(false, 'Sessão expirada', 'O pedido de conexão expirou. Volte ao Assertive e tente novamente.', 400)
  }

  // state é de uso único
  await supabase.from('assertive_oauth_states').delete().eq('state', state)

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    return page(false, 'Sessão expirada', 'O pedido de conexão expirou. Tente novamente.', 400)
  }

  const clientId = process.env.ML_CLIENT_ID
  const clientSecret = process.env.ML_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return page(false, 'Configuração incompleta', 'A integração do Mercado Livre não está configurada no servidor.', 500)
  }

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: mlRedirectUri(),
    code_verifier: stateRow.code_verifier,
  })

  const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  if (!tokenRes.ok) {
    let details: Record<string, unknown> = {}
    try {
      details = await tokenRes.json()
    } catch {
      /* corpo não-JSON */
    }
    // não logar tokens nem segredos
    console.error('[assertive/ml/callback] token_exchange falhou', {
      status: tokenRes.status,
      error: details.error,
      description: details.error_description,
    })
    return page(
      false,
      'Não foi possível conectar',
      (details.error_description as string) || `O Mercado Livre recusou a autorização (HTTP ${tokenRes.status}).`,
      502
    )
  }

  const tokenData = await tokenRes.json()

  const userRes = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  if (!userRes.ok) {
    return page(false, 'Não foi possível conectar', 'Não conseguimos confirmar os dados da sua conta do Mercado Livre.', 502)
  }
  const userData = await userRes.json()

  const { error: saveError } = await supabase.from('assertive_ml_connections').upsert(
    {
      user_id: stateRow.user_id,
      access_token: encrypt(tokenData.access_token),
      refresh_token: encrypt(tokenData.refresh_token),
      expires_at: new Date(Date.now() + (tokenData.expires_in ?? 21600) * 1000).toISOString(),
      ml_user_id: String(userData.id),
      nickname: userData.nickname || '',
    },
    { onConflict: 'user_id' }
  )

  if (saveError) {
    return page(false, 'Não foi possível conectar', 'Falha ao salvar a conexão. Tente novamente.', 500)
  }

  return page(true, 'Conta conectada', `Mercado Livre vinculado: ${userData.nickname || userData.id}`)
}
