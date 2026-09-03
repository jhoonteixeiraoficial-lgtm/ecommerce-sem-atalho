import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

// Webhook do Mercado Pago - processa notificações de pagamento
// IMPORTANTE: Esta rota usa SERVICE_ROLE key (nunca no frontend)
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET

  if (!url || !serviceKey || url.includes('sua_url')) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
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

      // Parse body after validation
      const parsedBody = JSON.parse(body)
      return await processWebhook(parsedBody, createClient(url, serviceKey))
    } catch (error) {
      console.error('Webhook signature validation failed')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  // If no webhook secret configured, process without validation (not recommended for production)
  console.warn('WARNING: Webhook signature validation disabled - configure MERCADOPAGO_WEBHOOK_SECRET')
  
  try {
    const body = await request.json()
    return await processWebhook(body, createClient(url, serviceKey))
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function processWebhook(body: any, supabaseAdmin: any) {
  const { type, data } = body

  // Mercado Pago envia notificações de pagamento
  if (type === 'payment') {
    const paymentId = data?.id

    if (!paymentId) {
      return NextResponse.json({ error: 'Missing payment ID' }, { status: 400 })
    }

    // Validate payment ID format (should be numeric)
    if (!/^\d+$/.test(paymentId.toString())) {
      return NextResponse.json({ error: 'Invalid payment ID format' }, { status: 400 })
    }

    // TODO: Buscar detalhes do pagamento via API do Mercado Pago
    // const payment = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    //   headers: { 'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
    // })
    // const paymentData = await payment.json()

    // Por enquanto, apenas logamos (sem dados sensíveis)
    console.log('Payment webhook received for payment:', paymentId)

    // Exemplo de lógica futura:
    // if (paymentData.status === 'approved') {
    //   await supabaseAdmin
    //     .from('subscriptions')
    //     .update({ status: 'active', external_id: paymentId })
    //     .eq('external_id', paymentId)
    // }
  }

  return NextResponse.json({ received: true })
}
