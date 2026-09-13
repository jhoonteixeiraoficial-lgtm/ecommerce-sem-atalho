import { requireCommunityUser } from '@/app/api/community/helpers'
import { buildCopyBrief } from '@/lib/assertive/copy-brief'
import type { ImagePlanStep } from '@/lib/assertive/generator'
import { ensureProgressiveImageJobs } from '@/lib/assertive/image-jobs'
import { runNextProgressiveImageJob } from '@/lib/assertive/progressive-images'
import type { ProductTruth } from '@/lib/assertive/truth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 180

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  if (process.env.ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED !== 'true') {
    return Response.json(
      { error: 'A geração progressiva de imagens está desativada.', code: 'IMAGE_PIPELINE_DISABLED' },
      { status: 404 }
    )
  }

  const userId = auth.authorizedUser.id
  const { id } = await context.params
  const supabase = createAdminClient()
  const { data: listing, error: listingError } = await supabase
    .from('assertive_listings')
    .select('id,analysis_id,status,image_plan')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (listingError) return Response.json({ error: 'Não foi possível consultar o anúncio.' }, { status: 500 })
  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (['publishing', 'published'].includes(listing.status)) {
    return Response.json({ error: 'O anúncio não aceita novas imagens.' }, { status: 409 })
  }

  const { data: analysis, error: analysisError } = await supabase
    .from('assertive_analyses')
    .select('id,user_id,product_truth')
    .eq('id', listing.analysis_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (analysisError) return Response.json({ error: 'Não foi possível consultar a análise.' }, { status: 500 })
  const truth = analysis?.product_truth as ProductTruth | null | undefined
  if (!analysis || !truth?.name) {
    return Response.json({ error: 'A identidade do produto não está disponível.' }, { status: 422 })
  }

  try {
    const facts = buildCopyBrief({ truth, category: null }).facts
      .map(fact => ({ label: fact.label, value: fact.value }))
    await ensureProgressiveImageJobs({
      listingId: listing.id,
      analysisId: analysis.id,
      userId,
      imagePlan: Array.isArray(listing.image_plan) ? listing.image_plan as ImagePlanStep[] : [],
      facts,
    })
    const result = await runNextProgressiveImageJob({ listingId: listing.id, userId })
    return Response.json({
      ...result,
      processed_jobs: result.processed_kind ? 1 : 0,
    })
  } catch {
    return Response.json({ error: 'Não foi possível processar a próxima imagem.' }, { status: 500 })
  }
}
