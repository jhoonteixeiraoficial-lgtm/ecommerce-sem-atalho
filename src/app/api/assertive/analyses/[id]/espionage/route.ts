import { NextRequest } from 'next/server'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { publicSearchCacheKey, loadPublicSearch } from '@/lib/assertive/public-search-cache'

export const runtime = 'nodejs'

/**
 * Status da espionagem para uma análise: quantos anúncios reais o coletor
 * já capturou para a consulta desta análise (cache BROWSER do próprio usuário).
 * Usado pelo indicador na tela "Confirme o produto" — mostra se a pesquisa
 * vai cruzar catálogo + coletor ou só catálogo.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth
  const { id } = await params

  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const { data: analysis } = await supabase
    .from('assertive_analyses')
    .select('id, user_id, product_truth, research')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .maybeSingle()
  if (!analysis) return Response.json({ error: 'Análise não encontrada.' }, { status: 404 })

  const truth = analysis.product_truth as { name?: string } | null
  const query = (analysis.research as { query?: string } | null)?.query
    || truth?.name
    || ''
  if (!query.trim()) return Response.json({ available: false, entries: 0, query: '' })

  try {
    const snapshot = await loadPublicSearch(query, undefined, Date.now(), {
      userId: authorizedUser.id,
      allowCollection: false,
    })
    return Response.json({
      available: snapshot.available,
      entries: snapshot.entries.length,
      observed_at: snapshot.available ? snapshot.observed_at : null,
      query,
    })
  } catch {
    return Response.json({ available: false, entries: 0, query })
  }
}
