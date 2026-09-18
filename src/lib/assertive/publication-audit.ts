import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Auditoria PÓS-PUBLICAÇÃO (padrão para todo anúncio):
 * 1. Confere na conta do vendedor (API) que o item realmente existe e está ativo.
 * 2. Compara os atributos publicados com os recomendados da categoria.
 * 3. Corrige via API o que temos preenchido no rascunho (PATCH /items).
 * 4. Calcula score de qualidade com os objetivos do ML (fotos, descrição,
 *    GTIN, atributos — vídeo e verificação de catálogo exigem o vendedor).
 */

const ML_BASE = 'https://api.mercadolibre.com'

export interface PublicationAudit {
  verified: boolean
  item_status: string | null
  permalink: string | null
  pictures_count: number
  attributes_published: number
  recommended_missing: string[]
  fixes_applied: string[]
  quality_score: number
  objectives: string[]
  audited_at: string
}

interface ItemPayload {
  id?: string
  status?: string
  permalink?: string
  title?: string
  description?: string
  pictures?: Array<{ id?: string; url?: string }>
  attributes?: Array<{ id?: string; value_name?: string }>
  category_id?: string
}

async function ml(path: string, token: string, method: 'GET' | 'PATCH' = 'GET', payload?: unknown) {
  const res = await fetch(`${ML_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

function buildObjectives(item: ItemPayload, recommendedMissing: string[]): string[] {
  const objectives: string[] = []
  const picCount = item.pictures?.length ?? 0
  if (picCount < 6) objectives.push(`Adicione ${6 - picCount} foto(s): anúncios com 6+ fotos vendem mais.`)
  if ((item.description?.length ?? 0) < 500) objectives.push('Descrição curta: detalhe benefícios e dúvidas frequentes.')
  if (recommendedMissing.length) objectives.push(`Atributos recomendados faltando: ${recommendedMissing.slice(0, 5).join(', ')}.`)
  if (!item.attributes?.some(a => a.id === 'GTIN' && a.value_name)) objectives.push('Informe o código universal de produto (GTIN/EAN).')
  objectives.push('Verifique o produto no catálogo (botão "Verificar produto" no painel do vendedor) — exige você.')
  objectives.push('Grave um vídeo do produto em uso pelo app do vendedor.')
  return objectives
}

export async function auditPublishedItem(input: {
  token: string
  userId: string
  listingId: string
  mlItemId: string
}): Promise<PublicationAudit> {
  const supabase = createAdminClient()
  const itemRes = await ml(`/items/${input.mlItemId}`, input.token)
  const item = (itemRes.data ?? null) as ItemPayload | null

  if (!itemRes.ok || !item?.id) {
    return {
      verified: false, item_status: null, permalink: null, pictures_count: 0,
      attributes_published: 0, recommended_missing: [], fixes_applied: [],
      quality_score: 0,
      objectives: ['Item não encontrado na conta do Mercado Livre — confira em vendedores.mercadolivre.com.br.'],
      audited_at: new Date().toISOString(),
    }
  }

  // recomendados da categoria vs publicados
  const publishedIds = new Set((item.attributes || []).filter(a => a.value_name).map(a => a.id))
  let recommended: Array<{ id: string; name: string; tags?: Record<string, boolean> }> = []
  const catRes = await ml(`/categories/${item.category_id}/attributes`, input.token)
  if (catRes.ok && Array.isArray(catRes.data)) {
    recommended = (catRes.data as Array<{ id: string; name: string; tags?: Record<string, boolean> }>)
      .filter(a => a.tags?.recommended && !a.tags?.required)
  }

  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('attributes')
    .eq('id', input.listingId)
    .eq('user_id', input.userId)
    .maybeSingle()
  const currentAttributes = (listing?.attributes ?? {}) as {
    list?: Array<{ id: string; value_name?: string }>
  } & Record<string, unknown>
  const draftList = currentAttributes.list || []

  // completar atributos recomendados faltantes com o que o rascunho já tem
  const attributePatch = recommended
    .filter(attr => !publishedIds.has(attr.id))
    .map(attr => draftList.find(d => d.id === attr.id && d.value_name?.trim()))
    .filter((v): v is { id: string; value_name: string } => Boolean(v))
    .map(v => ({ id: v.id, value_name: v.value_name }))

  const fixes: string[] = []
  if (attributePatch.length) {
    const patchRes = await ml(`/items/${input.mlItemId}`, input.token, 'PATCH', { attributes: attributePatch })
    if (patchRes.ok) {
      for (const attr of attributePatch) {
        publishedIds.add(attr.id)
        fixes.push(`+${attr.id}="${attr.value_name}"`)
      }
    }
  }

  const recommendedMissing = recommended.filter(a => !publishedIds.has(a.id)).map(a => a.name)
  const picturesCount = item.pictures?.length ?? 0
  const score = Math.min(100, Math.round(
    (picturesCount >= 6 ? 40 : picturesCount * 6.5)
    + ((item.description?.length ?? 0) >= 500 ? 20 : 8)
    + (publishedIds.has('GTIN') ? 15 : 0)
    + (recommendedMissing.length === 0 ? 25 : Math.max(0, 25 - recommendedMissing.length * 3))
  ))

  const audit: PublicationAudit = {
    verified: ['active', 'paused', 'payment_required', 'under_review'].includes(item.status || ''),
    item_status: item.status || null,
    permalink: item.permalink || null,
    pictures_count: picturesCount,
    attributes_published: publishedIds.size,
    recommended_missing: recommendedMissing,
    fixes_applied: fixes,
    quality_score: score,
    objectives: buildObjectives(item, recommendedMissing),
    audited_at: new Date().toISOString(),
  }

  // persiste a auditoria mesclando no JSONB de atributos (le-modifica-grava)
  await supabase
    .from('assertive_listings')
    .update({ attributes: { ...currentAttributes, publication_audit: audit } })
    .eq('id', input.listingId)
    .eq('user_id', input.userId)

  return audit
}
