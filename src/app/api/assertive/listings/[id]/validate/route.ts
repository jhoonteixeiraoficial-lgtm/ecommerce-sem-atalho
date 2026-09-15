import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireMLToken,
  buildItemPayload,
  validateListing,
  getSellerShippingPreferences,
  resolveShippingMode,
  hasMandatoryFreeShippingIssue,
  MLNotConnectedError,
  predictMLTitle,
  getAutoAppendedAttributeIds,
  type ShippingMode,
} from '@/lib/assertive/publisher'
import { resolveCategoryContext, recomputeListing } from '@/lib/assertive/pipeline'
import { computeEffectiveRequirements } from '@/lib/assertive/publication-requirements'
import { payloadHash } from '@/lib/assertive/publication-readiness'
import { getCategoryAttributes } from '@/lib/assertive/taxonomy'
import type { ListingAttribute } from '@/lib/assertive/generator'
import type { EnrichedAttribute } from '@/lib/assertive/enrichment'
import { publishableAttributes } from '@/lib/assertive/attribute-evidence'
import { buildBlockingQuestions } from '@/lib/assertive/blocking-questions'

export const runtime = 'nodejs'
export const maxDuration = 90

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const supabase = createAdminClient()

  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })

  // checagens locais evitam gastar chamada na API com payload obviamente incompleto
  const blockers: string[] = []
  if (!listing.category_id) blockers.push('Categoria não definida.')
  if (!listing.price || Number(listing.price) <= 0) blockers.push('Defina um preço maior que zero.')
  if (!Array.isArray(listing.photos) || listing.photos.length === 0) {
    blockers.push('Adicione pelo menos uma foto ao anúncio.')
  }

  if (blockers.length) {
    const validation = {
      valid: false,
      checked_at: new Date().toISOString(),
      issues: blockers.map(message => ({ code: 'local_check', message, severity: 'error' as const })),
    }
    await supabase
      .from('assertive_listings')
      .update({
        validation,
        validated_payload: null,
        validated_payload_hash: null,
        status: 'needs_input',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)
    return Response.json(validation)
  }

  try {
    const token = await requireMLToken(authorizedUser.id)
    const { attributes: schema, capabilities } = await resolveCategoryContext(token, listing.category_id)
    const shippingPreferences = capabilities
      ? await getSellerShippingPreferences(token, capabilities.ml_user_id)
      : null
    const requestedShippingMode = ['me2', 'me1', 'custom'].includes(listing.shipping_mode)
      ? listing.shipping_mode as ShippingMode
      : undefined
    let effectiveShippingMode: ShippingMode
    try {
      effectiveShippingMode = resolveShippingMode(requestedShippingMode, shippingPreferences)
    } catch {
      effectiveShippingMode = resolveShippingMode(undefined, shippingPreferences)
    }
    const shippingModeChanged = effectiveShippingMode !== listing.shipping_mode
    listing.shipping_mode = effectiveShippingMode

    const attributes = ((listing.attributes?.list || []) as ListingAttribute[]).slice()

    function build() {
      return buildItemPayload(
        {
          title: listing.title,
          family_name: listing.family_name,
          category_id: listing.category_id,
          price: Number(listing.price),
          available_quantity: listing.available_quantity || 1,
          condition: listing.condition || 'new',
          listing_type_id: listing.listing_type_id || 'gold_special',
          shipping_mode: effectiveShippingMode,
          free_shipping: Boolean(listing.free_shipping),
          free_shipping_mandatory: Boolean(listing.free_shipping_mandatory),
          attributes: publishableAttributes(attributes),
          pictures: (listing.photos || []) as string[],
        },
        capabilities ?? null,
        shippingPreferences
      )
    }

    await supabase
      .from('assertive_listings')
      .update({ status: 'validating', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)

    let result = await validateListing(token, build())

    // O ML às vezes informa o valor exato que falta. Aplicamos e revalidamos uma vez.
    const autoApplied: string[] = []
    if (shippingModeChanged) autoApplied.push('Modalidade de envio ajustada à conta do Mercado Livre')
    let payloadChanged = false
    if (hasMandatoryFreeShippingIssue(result.issues) && !listing.free_shipping_mandatory) {
      listing.free_shipping = true
      listing.free_shipping_mandatory = true
      autoApplied.push('Frete grátis obrigatório pelo Mercado Livre')
      payloadChanged = true
    }
    const gtinSpec = schema.find(attribute => attribute.id === 'GTIN')
    const invalidOptionalGtin = result.issues.some(issue =>
      issue.severity === 'error' && issue.code === 'item.attribute.invalid_product_identifier'
    ) && gtinSpec && gtinSpec.tier !== 'required' && gtinSpec.tier !== 'catalog_required'

    if (invalidOptionalGtin) {
      const gtinIndex = attributes.findIndex(attribute => attribute.id === 'GTIN')
      if (gtinIndex !== -1) {
        attributes.splice(gtinIndex, 1)
        autoApplied.push(`${gtinSpec.name} inválido removido`)
        payloadChanged = true
      }
    }

    const suggestions = result.issues.filter(i => i.suggested_value && i.attribute_id)
    if (suggestions.length) {
      const byId = new Map(schema.map(a => [a.id, a]))
      for (const s of suggestions) {
        const attrId = s.attribute_id!
        if (attributes.some(a => a.id === attrId)) continue
        const spec = byId.get(attrId)
        const value_name = s.suggested_value?.value_name
        const value_id = s.suggested_value?.value_id
        if (!value_name && !value_id) continue
        attributes.push({
          id: attrId,
          name: spec?.name || attrId,
          value_name: value_name || '',
          value_id,
          tier: spec?.tier || 'recommended',
          source: 'catalog',
          status: 'AUTO_FILLED',
          evidence: `Valor sugerido pela validação oficial do Mercado Livre (${s.code})`,
        })
        autoApplied.push(spec?.name || attrId)
        payloadChanged = true
      }
    }

    if (payloadChanged) {
      result = await validateListing(token, build())
      await supabase
        .from('assertive_listings')
        .update({
          attributes: { ...(listing.attributes || {}), list: attributes },
          shipping_mode: effectiveShippingMode,
          free_shipping: Boolean(listing.free_shipping),
          free_shipping_mandatory: Boolean(listing.free_shipping_mandatory),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', authorizedUser.id)
    }

    const effectiveAttributes = attributes as EnrichedAttribute[]
        const publicationRequirements = computeEffectiveRequirements(schema, result.issues, effectiveAttributes)
        const blockingQuestions = buildBlockingQuestions(publicationRequirements, schema, attributes)
        const validatedPayload = build()
        const readyToPublish = result.valid && publicationRequirements.all_clear

        // Persistir metadata do modo User Product
        let titleControlMode: 'seller' | 'user_product' = 'seller'
        let predictedTitle = listing.title
        let autoAppendedAttributes: string[] = []

        if (capabilities?.user_product_model) {
          titleControlMode = 'user_product'
          // Buscar atributos da categoria para saber quais o ML auto-appende ao título
          const catAttrs = await getCategoryAttributes(token, listing.category_id || '').catch(() => [])
          predictedTitle = predictMLTitle(listing.family_name || listing.title, attributes, catAttrs)
          autoAppendedAttributes = getAutoAppendedAttributeIds(catAttrs)
        }

        const validation = {
          valid: readyToPublish,
          ml_valid: result.valid,
          status_code: result.status_code,
          checked_at: new Date().toISOString(),
          issues: result.issues,
          auto_applied: autoApplied,
          account_model: capabilities?.user_product_model ? 'user_product' : 'classic',
          blocking_questions: blockingQuestions,
          title_control_mode: titleControlMode,
          predicted_title: predictedTitle,
          auto_appended_attributes: autoAppendedAttributes,
        }

        await recomputeListing(id, authorizedUser.id).catch(() => null)

        await supabase
          .from('assertive_listings')
          .update({
            validation,
            attributes: {
              ...(listing.attributes || {}),
              list: attributes,
              publication_requirements: publicationRequirements,
              blocking_questions: blockingQuestions,
              title_control_mode: titleControlMode,
              predicted_title: predictedTitle,
              auto_appended_attributes: autoAppendedAttributes,
            },
            validated_payload: readyToPublish ? validatedPayload : null,
            validated_payload_hash: readyToPublish ? payloadHash(validatedPayload) : null,
            shipping_mode: effectiveShippingMode,
            free_shipping: Boolean(listing.free_shipping),
            free_shipping_mandatory: Boolean(listing.free_shipping_mandatory),
            status: readyToPublish ? 'ready_to_publish' : 'needs_input',
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('user_id', authorizedUser.id)

        return Response.json(validation)
  } catch (e) {
    if (e instanceof MLNotConnectedError) {
      return Response.json({ error: e.message, code: 'ML_NOT_CONNECTED' }, { status: 409 })
    }
    const message = e instanceof Error ? e.message : 'Falha ao validar o anúncio.'
    return Response.json({ error: message }, { status: 500 })
  }
}
