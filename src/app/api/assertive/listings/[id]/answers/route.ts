import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireMLToken, MLNotConnectedError } from '@/lib/assertive/publisher'
import { resolveCategoryContext, recomputeListing } from '@/lib/assertive/pipeline'
import { matchAttributeValue, type ListingAttribute } from '@/lib/assertive/generator'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60

const schema = z.object({
  answers: z.record(z.string().max(60), z.string().max(500)),
})



/**
 * Recebe as respostas do vendedor para os campos que faltavam.
 * Os valores são conferidos contra a lista oficial da categoria antes de entrar na ficha.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const body = await readJson(req)
  if (body.response) return body.response

  const parsed = schema.safeParse(body.body ?? {})
  if (!parsed.success) return Response.json({ error: 'Respostas inválidas.' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()

  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })

  try {
    const token = await requireMLToken(authorizedUser.id)
    const { attributes: schemaAttrs } = await resolveCategoryContext(token, listing.category_id)
    const byId = new Map(schemaAttrs.map(a => [a.id, a]))

    const current = ((listing.attributes?.list || []) as ListingAttribute[]).slice()
    const rejected: string[] = []

    for (const [attrId, rawValue] of Object.entries(parsed.data.answers)) {
      const value = rawValue.trim()
      const spec = byId.get(attrId)
      if (!spec) continue

      if (!value) {
        const idx = current.findIndex(a => a.id === attrId)
        if (idx >= 0) current.splice(idx, 1)
        continue
      }

      let value_id: string | undefined
      let value_name = value

      if (spec.values?.length) {
        const match = matchAttributeValue(value, spec.values)
        if (match) {
          value_id = match.id
          value_name = match.name
        } else if (spec.fixedValues) {
          rejected.push(`${spec.name}: "${value}" não é um valor aceito pelo Mercado Livre`)
          continue
        }
      }

      if (spec.value_max_length && value_name.length > spec.value_max_length) {
        value_name = value_name.slice(0, spec.value_max_length)
      }

      const entry: ListingAttribute = {
        id: attrId,
        name: spec.name,
        value_name,
        value_id,
        tier: spec.tier,
        source: 'user',
      }

      const idx = current.findIndex(a => a.id === attrId)
      if (idx >= 0) current[idx] = entry
      else current.push(entry)
    }

    const stillMissing = ((listing.attributes?.missing || []) as Array<{ field: string }>).filter(
      m => !current.some(a => a.id === m.field)
    )

    await supabase
      .from('assertive_listings')
      .update({
        attributes: { ...(listing.attributes || {}), list: current, missing: stillMissing },
        validation: {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', authorizedUser.id)

    const recomputed = await recomputeListing(id, authorizedUser.id)

    return Response.json({ ok: true, rejected, ...recomputed })
  } catch (e) {
    if (e instanceof MLNotConnectedError) {
      return Response.json({ error: e.message, code: 'ML_NOT_CONNECTED' }, { status: 409 })
    }
    const message = e instanceof Error ? e.message : 'Falha ao aplicar as respostas.'
    return Response.json({ error: message }, { status: 500 })
  }
}
