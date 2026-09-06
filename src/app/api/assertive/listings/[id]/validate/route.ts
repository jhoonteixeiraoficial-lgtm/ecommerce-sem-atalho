import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  requireMLToken,
  buildItemPayload,
  validateListing,
  MLNotConnectedError,
  type ValidationIssue,
} from '@/lib/assertive/publisher'
import { resolveCategoryContext, recomputeListing } from '@/lib/assertive/pipeline'
import type { ListingAttribute } from '@/lib/assertive/generator'
import type { ClassifiedAttribute } from '@/lib/assertive/taxonomy'

export const runtime = 'nodejs'
export const maxDuration = 90

interface MissingQuestion {
  field: string
  label: string
  why: string
  options?: string[]
}

/** Converte atributos citados pela validação em perguntas objetivas ao vendedor. */
function issuesToQuestions(
  issues: ValidationIssue[],
  schema: ClassifiedAttribute[],
  filled: ListingAttribute[]
): MissingQuestion[] {
  const byId = new Map(schema.map(a => [a.id, a]))
  const filledIds = new Set(filled.map(a => a.id))
  const out: MissingQuestion[] = []
  const seen = new Set<string>()

  for (const issue of issues) {
    if (issue.severity !== 'error') continue
    for (const id of issue.attribute_ids || []) {
      if (filledIds.has(id) || seen.has(id)) continue
      const spec = byId.get(id)
      if (!spec) continue
      seen.add(id)
      out.push({
        field: id,
        label: spec.name,
        why: issue.message,
        options: spec.values?.slice(0, 15).map(v => v.name),
      })
    }
  }
  return out
}

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
      .update({ validation, status: 'needs_input', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)
    return Response.json(validation)
  }

  try {
    const token = await requireMLToken(authorizedUser.id)
    const { attributes: schema, capabilities } = await resolveCategoryContext(token, listing.category_id)

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
          attributes,
          pictures: (listing.photos || []) as string[],
        },
        capabilities ?? null
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
        })
        autoApplied.push(spec?.name || attrId)
      }

      if (autoApplied.length) {
        result = await validateListing(token, build())
        await supabase
          .from('assertive_listings')
          .update({
            attributes: { ...(listing.attributes || {}), list: attributes },
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('user_id', authorizedUser.id)
      }
    }

    const questions = issuesToQuestions(result.issues, schema, attributes)

    // perguntas vindas da validação entram na fila de campos faltantes
    if (questions.length) {
      const existing = (listing.attributes?.missing || []) as MissingQuestion[]
      const merged = [...questions, ...existing.filter(e => !questions.some(q => q.field === e.field))]
      await supabase
        .from('assertive_listings')
        .update({
          attributes: { ...(listing.attributes || {}), list: attributes, missing: merged },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', authorizedUser.id)
    }

    const validation = {
      valid: result.valid,
      checked_at: new Date().toISOString(),
      issues: result.issues,
      auto_applied: autoApplied,
      account_model: capabilities?.user_product_model ? 'user_product' : 'classic',
    }

    await supabase
      .from('assertive_listings')
      .update({
        validation,
        status: result.valid ? 'ready_to_publish' : 'needs_input',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)

    await recomputeListing(id, authorizedUser.id).catch(() => null)

    return Response.json(validation)
  } catch (e) {
    if (e instanceof MLNotConnectedError) {
      return Response.json({ error: e.message, code: 'ML_NOT_CONNECTED' }, { status: 409 })
    }
    const message = e instanceof Error ? e.message : 'Falha ao validar o anúncio.'
    return Response.json({ error: message }, { status: 500 })
  }
}
