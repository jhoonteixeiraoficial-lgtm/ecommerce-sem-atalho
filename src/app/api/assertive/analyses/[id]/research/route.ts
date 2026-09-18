import { requireCommunityUser } from '@/app/api/community/helpers'
import { loadAnalysis, updateAnalysis } from '@/lib/assertive/pipeline'
import { researchMarket } from '@/lib/assertive/research'
import { extractDNA } from '@/lib/assertive/dna'
import { getValidMLToken } from '@/lib/assertive/publisher'
import { tryAcquireAnalysisLock, releaseAnalysisLock } from '@/lib/assertive/concurrency'
import { searchQueryFor, type ProductTruth } from '@/lib/assertive/truth'

export const runtime = 'nodejs'
export const maxDuration = 120

/** Refresh evidence only. Never regenerate a draft or pay for collection. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { id } = await params
  const userId = auth.authorizedUser.id
  const analysis = await loadAnalysis(id, userId)
  if (!analysis) return Response.json({ error: 'Análise não encontrada.' }, { status: 404 })
  const truth = analysis.product_truth as ProductTruth
  if (!truth?.name) return Response.json({ error: 'Identifique o produto primeiro.' }, { status: 409 })
  let lease: string | null = null
  try {
    lease = await tryAcquireAnalysisLock(id, userId)
    if (!lease) return Response.json({ error: 'A análise já está em andamento.' }, { status: 409 })
    const token = await getValidMLToken(userId)
    if (!token) return Response.json({ error: 'Conecte sua conta do Mercado Livre.' }, { status: 409 })
    const query = analysis.research?.query || searchQueryFor(truth)
    const research = await researchMarket(token, query, {
      truth, collectorUserId: userId, allowPublicCollection: false,
      sourceCategoryId: truth.source_category_id || analysis.category_id,
      sourceDomainId: truth.source_domain_id || analysis.domain_id,
      deepLimit: 8,
    })
    const dna = extractDNA(research)
    await updateAnalysis(id, userId, { research, dna })
    return Response.json({ ok: true, research })
  } catch {
    return Response.json({ error: 'Não foi possível atualizar. Seu anúncio foi preservado.' }, { status: 503 })
  } finally {
    if (lease) await releaseAnalysisLock(id, userId, lease)
  }
}
