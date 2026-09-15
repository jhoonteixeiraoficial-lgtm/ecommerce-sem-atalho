import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

// Webhook do Mercado Pago - processa notificações de pagamento
// IMPORTANTE: Esta rota usa SERVICE_ROLE key (nunca no frontend)
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

  if (!url || !serviceKey || url.includes('sua_url')) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Mercado Pago not configured' }, { status: 503 })
  }

  // Validate webhook signature if secret is configured
  if (webhookSecret) {
    const signature = request.headers.get('x-signature')
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    try {
      const body = await request.text()
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex')

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }

      const parsedBody = JSON.parse(body)
      return await processWebhook(parsedBody, createClient(url, serviceKey), accessToken)
    } catch (error) {
      console.error('[webhook] Signature validation failed:', error)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  // If no webhook secret configured, process without validation (not recommended for production)
  console.warn('WARNING: Webhook signature validation disabled - configure MERCADOPAGO_WEBHOOK_SECRET')

  try {
    const body = await request.json()
    return await processWebhook(body, createClient(url, serviceKey), accessToken)
  } catch (error) {
    console.error('[webhook] Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

interface MercadoPagoWebhook {
  type?: unknown
  data?: { id?: unknown }
  action?: string
  date_created?: string
  user_id?: string
  api_version?: string
}

interface MercadoPagoPayment {
  id: number
  status: string
  status_detail: string
  external_reference: string
  transaction_amount: number
  currency_id: string
  payer: { email: string; identification?: { type: string; number: string } }
  payment_method_id: string
  payment_type_id: string
  date_approved?: string
  date_created: string
  last_updated: string
  metadata: Record<string, unknown>
  description: string
  statement_descriptor: string
}

async function processWebhook(
  body: MercadoPagoWebhook,
  supabaseAdmin: SupabaseClient,
  accessToken: string
): Promise<NextResponse> {
  const { type, data, action } = body

  // Mercado Pago envia notificações de pagamento
  if (type === 'payment' || action === 'payment.created' || action === 'payment.updated') {
    const paymentId = data?.id

    if (!paymentId) {
      return NextResponse.json({ error: 'Missing payment ID' }, { status: 400 })
    }

    if (!/^\d+$/.test(paymentId.toString())) {
      return NextResponse.json({ error: 'Invalid payment ID format' }, { status: 400 })
    }

    // Buscar detalhes do pagamento na API do Mercado Pago
    let payment: MercadoPagoPayment
    try {
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!paymentResponse.ok) {
        const errorText = await paymentResponse.text()
        console.error('[webhook] Failed to fetch payment:', paymentResponse.status, errorText)
        return NextResponse.json({ error: 'Failed to fetch payment details' }, { status: 502 })
      }

      payment = await paymentResponse.json()
    } catch (error) {
      console.error('[webhook] Error fetching payment:', error)
      return NextResponse.json({ error: 'Payment fetch failed' }, { status: 500 })
    }

    // Processar apenas pagamentos aprovados
    if (payment.status !== 'approved') {
      console.log('[webhook] Payment not approved:', payment.id, payment.status, payment.status_detail)
      return NextResponse.json({ received: true, status: payment.status })
    }

    // Parse external_reference: "user_id:plan:period"
    const externalRef = payment.external_reference
    if (!externalRef) {
      console.error('[webhook] Missing external_reference:', payment.id)
      return NextResponse.json({ error: 'Missing external_reference' }, { status: 400 })
    }

    const [userId, plan, period] = externalRef.split(':')
    if (!userId || !plan || !period) {
      console.error('[webhook] Invalid external_reference format:', externalRef)
      return NextResponse.json({ error: 'Invalid external_reference' }, { status: 400 })
    }

    if (!['comunidade', 'acertive', 'combo'].includes(plan)) {
      console.error('[webhook] Invalid plan:', plan)
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // Verificar idempotência: já processamos este pagamento?
    const { data: existing } = await supabaseAdmin
      .from('payment_transactions')
      .select('id')
      .eq('payment_id', payment.id.toString())
      .maybeSingle()

    if (existing) {
      console.log('[webhook] Payment already processed:', payment.id)
      return NextResponse.json({ received: true, duplicate: true })
    }

    // Calcular período
    const days = period === 'monthly' ? 30 : 365
    const now = new Date().toISOString()
    const periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

    // Inserir transação (idempotência)
    const { error: txError } = await supabaseAdmin
      .from('payment_transactions')
      .insert({
        payment_id: payment.id.toString(),
        user_id: userId,
        plan,
        period,
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        status: payment.status,
        status_detail: payment.status_detail,
        payment_method: payment.payment_method_id,
        payment_type: payment.payment_type_id,
        paid_at: payment.date_approved || payment.date_created,
        external_reference: externalRef,
        metadata: payment.metadata,
      })

    if (txError) {
      // Se falhou por duplicata (race condition), OK
      if (txError.code === '23505') {
        console.log('[webhook] Duplicate payment transaction (race):', payment.id)
        return NextResponse.json({ received: true, duplicate: true })
      }
      console.error('[webhook] Failed to insert transaction:', txError)
      return NextResponse.json({ error: 'Transaction insert failed' }, { status: 500 })
    }

    // Atualizar/criar subscription
    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          plan,
          status: 'active',
          payment_provider: 'mercadopago',
          external_id: payment.id.toString(),
          current_period_start: now,
          current_period_end: periodEnd,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )

    if (subError) {
      console.error('[webhook] Failed to upsert subscription:', subError)
      // Não falhar o webhook - transação já foi salva
    }

    // Log de auditoria
    await supabaseAdmin.from('admin_audit_log').insert({
      actor_user_id: userId,
      action: 'subscription.paid',
      target_user_id: userId,
                  metadata: {
                    plan,
                    period,
                    payment_id: payment.id,
                    amount: payment.transaction_amount,
                    payment_method: payment.payment_method_id,
                  },
                })
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                .then(
                  () => {},
                  () => { /* best effort */ }
                )

    console.log('[webhook] Subscription activated:', { userId, plan, period, paymentId: payment.id })
    return NextResponse.json({ received: true, subscription: 'activated' })
  }

  // Outros tipos de notificação (subscription_preapproval, etc.)
  console.log('[webhook] Unhandled notification type:', type, action)
  return NextResponse.json({ received: true })
}