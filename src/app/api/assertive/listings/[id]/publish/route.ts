import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireMLToken,
  getSellerCapabilities,
  buildItemPayload,
  validateListing,
  publishListing,
  MLNotConnectedError,
  type MLItemPayload,
  type SellerCapabilities,
  type ValidationIssue,
} from '@/lib/assertive/publisher'
import { payloadHash, wasPayloadChanged } from '@/lib/assertive/publication-readiness'
import type { ListingAttribute } from '@/lib/assertive/generator'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 120

const schema = z.object({
  // exige confirmação explícita do vendedor — nada é publicado por acidente
  confirm: z.literal(true),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const body = await readJson(req)
  if (body.response) return body.response

  if (!schema.safeParse(body.body ?? {}).success) {
    return Response.json(
      { error: 'Confirmação obrigatória para publicar no Mercado Livre.' },
      { status: 400 }
    )
  }

  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (listing.status === 'published' || listing.ml_item_id) {
    return Response.json(
      { error: 'Este anúncio já foi publicado.', item_id: listing.ml_item_id },
      { status: 409 }
    )
  }

  // IDEMPOTÊNCIA: verificar se já existe publicação em andamento
  if (listing.status === 'publishing') {
    return Response.json(
      { error: 'Publicação já em andamento. Aguarde ou recarregue a página.' },
      { status: 409 }
    )
  }

  try {
    const token = await requireMLToken(authorizedUser.id)
    const capabilities = await getSellerCapabilities(token)

    // construir payload UMA VEZ — o mesmo validado será usado na publicação
    const payload = buildItemPayload(
      {
        title: listing.title,
        family_name: listing.family_name,
        category_id: listing.category_id,
        price: Number(listing.price),
        available_quantity: listing.available_quantity || 1,
        condition: listing.condition || 'new',
        listing_type_id: listing.listing_type_id || 'gold_special',
        attributes: (listing.attributes?.list || []) as ListingAttribute[],
        pictures: (listing.photos || []) as string[],
      },
      capabilities
    )

    // valida imediatamente antes de criar: garante que nada mudou desde a última checagem
    let validation = await validateListing(token, payload)

    // AUTO-RESOLVE: tenta corrigir automaticamente os blockers antes de pedir ao usuário
    if (!validation.valid) {
      const autoFixed = await autoResolveBlockers(token, payload, validation.issues, capabilities)
      if (autoFixed.changed) {
        validation = await validateListing(token, payload)
      }
    }

    if (!validation.valid) {
      await supabase
        .from('assertive_listings')
        .update({
          validation: { valid: false, checked_at: new Date().toISOString(), issues: validation.issues },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', authorizedUser.id)

      const friendlyIssues = validation.issues.map(i => ({
        attribute_id: i.attribute_id,
        message: i.message,
        severity: i.severity,
      }))

      return Response.json(
        { error: 'O anúncio não passou na validação do Mercado Livre.', issues: friendlyIssues },
        { status: 422 }
      )
    }

    // payloadHash: garantir que o payload validado é o mesmo que será publicado
    const validatedHash = payloadHash(payload)

    // salvar hash validado + payload para comparação futura
    await supabase
      .from('assertive_listings')
      .update({
        status: 'publishing',
        validated_payload_hash: validatedHash,
        validated_payload: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)
      .eq('validated_payload_hash', null)

    // IDEMPOTÊNCIA ATÔMICA: se status já era 'publishing', outro request já está rodando
    const { data: currentAfterLock } = await supabase
      .from('assertive_listings')
      .select('status')
      .eq('id', id)
      .eq('user_id', authorizedUser.id)
      .single()

    if (currentAfterLock?.status !== 'publishing') {
      return Response.json(
        { error: 'Publicação já em andamento por outro processo.' },
        { status: 409 }
      )
    }

    // usar EXATAMENTE o mesmo payload validado — não reconstruir
    const result = await publishListing(token, payload, listing.description || '')

    if (!result.success) {
      await supabase
        .from('assertive_listings')
        .update({
          status: 'failed',
          validation: { valid: false, checked_at: new Date().toISOString(), issues: result.issues || [] },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', authorizedUser.id)

      return Response.json({ error: result.error, issues: result.issues }, { status: 422 })
    }

    await supabase
      .from('assertive_listings')
      .update({
        status: 'published',
        ml_item_id: result.item_id,
        ml_permalink: result.permalink,
        published_at: new Date().toISOString(),
        published_payload: payload,
        ml_response: result,
        publication_status: result.status || 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)

    await supabase
      .from('assertive_analyses')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', listing.analysis_id)
      .eq('user_id', authorizedUser.id)

    return Response.json({
      ok: true,
      item_id: result.item_id,
      permalink: result.permalink,
      status: result.status,
    })
  } catch (e) {
    if (e instanceof MLNotConnectedError) {
      return Response.json({ error: e.message, code: 'ML_NOT_CONNECTED' }, { status: 409 })
    }
    const message = e instanceof Error ? e.message : 'Falha ao publicar.'
    await supabase
      .from('assertive_listings')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)
    return Response.json({ error: message }, { status: 500 })
  }
}

// ---------------------------------------------------------------- auto-resolve blockers

async function autoResolveBlockers(
  token: string,
  payload: MLItemPayload,
  issues: ValidationIssue[],
  capabilities: SellerCapabilities
): Promise<{ changed: boolean }> {
  let changed = false

  for (const issue of issues) {
    if (issue.severity !== 'error') continue

    // GTIN missing: NÃO usar EMPTY_GTIN_REASON como fallback
    // Só remover o valor inválido; ML decide se aceita ausência naquela categoria
    if (
      (issue.code?.includes('GTIN') || issue.attribute_ids?.includes('GTIN')) &&
      !payload.attributes.some(a => a.id === 'GTIN' && a.value_name && !['Na', 'N/A', ''].includes(a.value_name))
    ) {
      const gtinAttr = payload.attributes.find(a => a.id === 'GTIN')
      if (!gtinAttr || !gtinAttr.value_name || /^(na|n\/a|0+)$/i.test(gtinAttr.value_name)) {
        payload.attributes = payload.attributes.filter(a => a.id !== 'GTIN' && a.id !== 'EMPTY_GTIN_REASON')
        changed = true
      }
    }

    // Seller package missing: não podemos inventar medidas de embalagem
    if (issue.attribute_ids?.some(id => id.startsWith('SELLER_PACKAGE_')) && capabilities.user_product_model) {
      continue
    }

    // Qualquer outro atributo_required com suggested_value: usar o sugerido
    if (issue.suggested_value && issue.attribute_id) {
      const existing = payload.attributes.find(a => a.id === issue.attribute_id)
      if (!existing || !existing.value_name) {
        payload.attributes.push({
          id: issue.attribute_id,
          value_id: issue.suggested_value.value_id,
          value_name: issue.suggested_value.value_name,
        })
        changed = true
      }
    }
  }

  return { changed }
}
