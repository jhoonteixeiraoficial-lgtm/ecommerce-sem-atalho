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
import { mlGet } from '@/lib/assertive/ml-api'
import { payloadHash } from '@/lib/assertive/publication-readiness'
import type { ListingAttribute } from '@/lib/assertive/generator'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 120

const schema = z.object({
  confirm: z.literal(true),
})

/** Lock leasetime: 5 minutos — stale depois disso */
const LOCK_LEASE_MS = 5 * 60 * 1000

interface MarketplaceItemSnapshot {
  id?: string
  title?: string
  family_name?: string
  permalink?: string
  status?: string
  category_id?: string
  price?: number
  currency_id?: string
  available_quantity?: number
  listing_type_id?: string
  shipping?: {
    mode?: string
    free_shipping?: boolean
    local_pick_up?: boolean
    logistic_type?: string
    tags?: string[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

async function releaseLock(supabase: ReturnType<typeof createAdminClient>, id: string, userId: string, extra?: Record<string, unknown>) {
  await supabase
    .from('assertive_listings')
    .update({
      status: 'failed',
      publishing_started_at: null,
      publishing_attempt_id: null,
      ...extra,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
}

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

  // Já publicado
  if (listing.status === 'published' || listing.ml_item_id) {
    return Response.json(
      { error: 'Este anúncio já foi publicado.', item_id: listing.ml_item_id },
      { status: 409 }
    )
  }

  // ---------------------------------------------------------------- LOCK: status = publishing
  if (listing.status === 'publishing') {
    const startedAt = listing.publishing_started_at ? new Date(listing.publishing_started_at).getTime() : 0
    const now = Date.now()
    const isStale = startedAt > 0 && (now - startedAt) > LOCK_LEASE_MS

    if (isStale && !listing.ml_item_id) {
      // Lock antigo sem item criado → recuperar: marcar anterior como failed e permitir retry
      await supabase
        .from('assertive_listings')
        .update({
          status: 'failed',
          publishing_started_at: null,
          publishing_attempt_id: null,
          last_publication_error: 'Tentativa anterior expirada (stale lock).',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', authorizedUser.id)
      // Continua para nova tentativa abaixo — o listing.status agora é 'failed'
    } else if (!isStale) {
      // Lock ainda ativo
      return Response.json(
        { error: 'Publicando no Mercado Livre...', status: 'publishing' },
        { status: 409 }
      )
    } else {
      // Stale mas ml_item_id existe → publicado
      return Response.json(
        { error: 'Este anúncio já foi publicado.', item_id: listing.ml_item_id },
        { status: 409 }
      )
    }
  }

  // ---------------------------------------------------------------- PRE-FLIGHT
  try {
    const token = await requireMLToken(authorizedUser.id)
    const capabilities = await getSellerCapabilities(token)

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

    let validation = await validateListing(token, payload)

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

    // ---------------------------------------------------------------- ATOMIC LOCK
    const validatedHash = payloadHash(payload)
    const attemptId = crypto.randomUUID()

    // Acquire lock atomicamente: só atualiza se não está publishing
    const { data: lockAcquired } = await supabase
      .from('assertive_listings')
      .update({
        status: 'publishing',
        publishing_started_at: new Date().toISOString(),
        publishing_attempt_id: attemptId,
        validated_payload_hash: validatedHash,
        validated_payload: payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)
      .neq('status', 'publishing')
      .select('id')
      .single()

    if (!lockAcquired) {
      // Outro request adquiriu o lock entre nossa leitura e a escrita
      return Response.json(
        { error: 'Publicando no Mercado Livre...', status: 'publishing' },
        { status: 409 }
      )
    }

    // ---------------------------------------------------------------- POST /items
    let result
    try {
      result = await publishListing(token, payload, listing.description || '')
    } catch (publishError) {
      // Publicação falhou — liberar lock
      const msg = publishError instanceof Error ? publishError.message : 'Falha ao publicar.'
      await releaseLock(supabase, id, authorizedUser.id, {
        last_publication_error: msg,
        validated_payload: payload,
      })
      return Response.json({ error: msg }, { status: 500 })
    }

    if (!result.success) {
      await releaseLock(supabase, id, authorizedUser.id, {
        validation: { valid: false, checked_at: new Date().toISOString(), issues: result.issues || [] },
        last_publication_error: result.error,
        validated_payload: payload,
        ml_response: result,
      })
      return Response.json({ error: result.error, issues: result.issues }, { status: 422 })
    }

    // ---------------------------------------------------------------- SUCESSO
    // O POST confirma criação; o GET seguinte captura o estado que o marketplace efetivamente aplicou.
    let marketplaceItem: MarketplaceItemSnapshot | null = null
    let reconciliation: { status: 'confirmed' | 'pending'; checked_at: string; error?: string }
    try {
      marketplaceItem = await mlGet<MarketplaceItemSnapshot>(`/items/${result.item_id}`, token)
      reconciliation = { status: 'confirmed', checked_at: new Date().toISOString() }
    } catch (error) {
      reconciliation = {
        status: 'pending',
        checked_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Falha ao consultar o item publicado.',
      }
    }

    const mlFinalTitle = marketplaceItem?.title || null
    const authoritativeItemId = marketplaceItem?.id || result.item_id
    const authoritativePermalink = marketplaceItem?.permalink || result.permalink
    const authoritativeStatus = marketplaceItem?.status || result.status || 'active'
    const titleControlMode = listing.attributes?.title_control_mode || (capabilities?.user_product_model ? 'user_product' : 'seller')

    await supabase
      .from('assertive_listings')
      .update({
        status: 'published',
        ml_item_id: authoritativeItemId,
        ml_permalink: authoritativePermalink,
        published_at: new Date().toISOString(),
        published_payload: payload,
        ml_response: {
          ...result,
          validation_warnings: validation.issues.filter(issue => issue.severity === 'warning'),
          reconciliation,
          marketplace_item: marketplaceItem,
          ml_final_title: mlFinalTitle,
        },
        publication_status: authoritativeStatus,
        publishing_started_at: null,
        publishing_attempt_id: null,
        validated_payload: payload,
        attributes: {
          ...(listing.attributes || {}),
          ml_final_title: mlFinalTitle,
          title_control_mode: titleControlMode,
        },
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
      item_id: authoritativeItemId,
      permalink: authoritativePermalink,
      status: authoritativeStatus,
      reconciliation: reconciliation.status,
    })
  } catch (e) {
    if (e instanceof MLNotConnectedError) {
      return Response.json({ error: e.message, code: 'ML_NOT_CONNECTED' }, { status: 409 })
    }
    const message = e instanceof Error ? e.message : 'Falha ao publicar.'
    await releaseLock(supabase, id, authorizedUser.id, {
      last_publication_error: message,
    })
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

    if (issue.attribute_ids?.some(id => id.startsWith('SELLER_PACKAGE_')) && capabilities.user_product_model) {
      continue
    }

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
