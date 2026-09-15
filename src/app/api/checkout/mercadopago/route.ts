import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 30

interface CheckoutRequest {
  plan: 'comunidade' | 'acertive' | 'combo'
  period: 'monthly' | 'yearly'
  successUrl?: string
  failureUrl?: string
  pendingUrl?: string
}

interface MercadoPagoPreference {
  id: string
  init_point: string
  sandbox_init_point: string
}

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  // Rate limit: 5 checkouts por minuto por usuário
  const { checkRateLimit } = await import('@/lib/security')
  const rateLimit = checkRateLimit(`checkout-mercadopago-${authorizedUser.id}`, 5, 60000)
  if (!rateLimit.allowed) {
    return Response.json({ error: 'Muitas solicitações. Aguarde um momento.' }, { status: 429 })
  }

  let body: CheckoutRequest
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
  }

  const { plan, period, successUrl, failureUrl, pendingUrl } = body

  if (!['comunidade', 'acertive', 'combo'].includes(plan)) {
    return Response.json({ error: 'Plano inválido' }, { status: 400 })
  }
  if (!['monthly', 'yearly'].includes(period)) {
    return Response.json({ error: 'Período inválido' }, { status: 400 })
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
  if (!accessToken) {
    return Response.json({ error: 'Checkout não configurado' }, { status: 503 })
  }

  // Preços (em centavos)
  const prices: Record<string, Record<string, number>> = {
    comunidade: { monthly: 4990, yearly: 49900 },
    acertive: { monthly: 9990, yearly: 99900 },
    combo: { monthly: 12990, yearly: 129900 },
  }
  const unitPrice = prices[plan][period]

  // Idempotency key: user_id + plan + period + timestamp minute
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${authorizedUser.id}:${plan}:${period}:${Math.floor(Date.now() / 60000)}`)
    .digest('hex')
    .slice(0, 32)

  // Buscar email do usuário
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', authorizedUser.id)
    .single()

  if (!profile?.email) {
    return Response.json({ error: 'Email não encontrado no perfil' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const preference = {
    items: [
      {
        id: `${plan}_${period}`,
        title: `Assinatura ${plan.charAt(0).toUpperCase() + plan.slice(1)} ${period === 'monthly' ? 'Mensal' : 'Anual'}`,
        quantity: 1,
        unit_price: unitPrice / 100,
        currency_id: 'BRL',
      },
    ],
    payer: {
      email: profile.email,
      name: profile.full_name || undefined,
    },
    back_urls: {
      success: successUrl || `${baseUrl}/membros/assinatura?status=success`,
      failure: failureUrl || `${baseUrl}/membros/assinatura?status=failure`,
      pending: pendingUrl || `${baseUrl}/membros/assinatura?status=pending`,
    },
    auto_return: 'approved',
    external_reference: `${authorizedUser.id}:${plan}:${period}`,
    notification_url: `${baseUrl}/api/webhooks/mercadopago`,
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
    metadata: {
      user_id: authorizedUser.id,
      plan,
      period,
      idempotency_key: idempotencyKey,
    },
  }

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(preference),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[checkout] Mercado Pago error:', response.status, errorText)
      return Response.json({ error: 'Erro ao criar preferência de pagamento' }, { status: 502 })
    }

    const data: MercadoPagoPreference = await response.json()

    // Log para auditoria
    const admin = await import('@/lib/supabase/admin').then(m => m.createAdminClient())
    await admin.from('checkout_audit_log').insert({
      user_id: authorizedUser.id,
      plan,
      period,
      preference_id: data.id,
      idempotency_key: idempotencyKey,
      status: 'created',
    })
    // Fire and forget - não await para não atrasar resposta
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    .then(
      () => {},
      () => { /* best effort */ }
    )

    return Response.json({
      id: data.id,
      init_point: data.init_point,
      sandbox_init_point: data.sandbox_init_point,
    })
  } catch (error) {
    console.error('[checkout] Erro inesperado:', error)
    return Response.json({ error: 'Erro interno ao processar checkout' }, { status: 500 })
  }
}