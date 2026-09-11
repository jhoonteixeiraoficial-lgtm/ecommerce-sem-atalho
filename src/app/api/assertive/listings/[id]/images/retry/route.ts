import { randomUUID } from 'node:crypto'
import { requireCommunityUser } from '@/app/api/community/helpers'
import { buildCopyBrief } from '@/lib/assertive/copy-brief'
import { attachListingImages } from '@/lib/assertive/image-assets'
import { buildGeneratedListingGallery } from '@/lib/assertive/image-pipeline'
import { getUserAIConfig, recomputeListing } from '@/lib/assertive/pipeline'
import { exactProductReferenceUrls, type ResearchResult } from '@/lib/assertive/research'
import type { ProductTruth } from '@/lib/assertive/truth'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 300

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response

  const userId = auth.authorizedUser.id
  const { id } = await context.params
  const supabase = createAdminClient()
  const { data: listing } = await supabase.from('assertive_listings')
    .select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!listing) return Response.json({ error: 'Anúncio não encontrado.' }, { status: 404 })
  if (listing.status === 'published' || listing.status === 'publishing') {
    return Response.json({ error: 'Anúncios publicados não podem gerar outra imagem.' }, { status: 409 })
  }

  const { data: analysis } = await supabase.from('assertive_analyses')
    .select('*').eq('id', listing.analysis_id).eq('user_id', userId).maybeSingle()
  if (!analysis?.product_truth) {
    return Response.json({ error: 'A identidade do produto não está disponível.' }, { status: 422 })
  }

  const truth = analysis.product_truth as ProductTruth
  const brief = buildCopyBrief({ truth, category: null })
  const factIds = new Set(brief.facts.map(fact => fact.id))
  const identityReady = truth.confidence >= 0.7
    && factIds.has('product_type')
    && ['brand', 'model', 'variant', 'material', 'color'].some(fact => factIds.has(fact))
  if (!identityReady) {
    return Response.json({ error: 'Confirme a identidade e os atributos principais antes de gerar outra imagem.' }, { status: 422 })
  }

  const config = await getUserAIConfig(userId)
  const referenceUrls = [...new Set([
    ...(truth.source_pictures || []).filter(Boolean),
    ...exactProductReferenceUrls(analysis.research as ResearchResult),
  ])]
  const referenceAssetIds = Array.isArray(analysis.input_data?.photo_asset_ids)
    ? analysis.input_data.photo_asset_ids.filter((assetId: unknown): assetId is string => typeof assetId === 'string' && Boolean(assetId))
    : []
  if (!referenceUrls.length && !referenceAssetIds.length) {
    return Response.json({ error: 'Envie uma foto própria ou confirme uma referência visual do produto exato antes de gerar outra imagem.' }, { status: 422 })
  }
  const gallery = await buildGeneratedListingGallery({
    userId,
    analysisId: analysis.id,
    productName: truth.name || listing.title,
    facts: brief.facts.map(fact => ({ label: fact.label, value: fact.value })),
    referenceUrls,
    referenceAssetIds,
    config,
    imagePlan: Array.isArray(listing.image_plan) ? listing.image_plan : undefined,
    maxPictures: 7,
    generationEnabled: true,
    generationNonce: randomUUID(),
  })
  if (!gallery.listingImages.length) {
    return Response.json({ error: gallery.warning || 'Não foi possível gerar outra imagem.' }, { status: 422 })
  }

  const imageReview = {
    required_asset_ids: gallery.reviewRequiredAssetIds,
    confirmed_asset_ids: [],
    outcome: gallery.outcome,
    warning: gallery.warning || null,
  }
  const { error: updateError } = await supabase.from('assertive_listings').update({
    attributes: {
      ...(listing.attributes || {}),
      image_review: imageReview,
    },
    status: 'needs_input',
    validation: {},
    validated_payload: null,
    validated_payload_hash: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('user_id', userId)
  if (updateError) return Response.json({ error: 'A imagem foi gerada, mas a revisão não pôde ser protegida.' }, { status: 500 })
  try {
    await attachListingImages(id, userId, gallery.listingImages)
  } catch {
    return Response.json({ error: 'A imagem foi gerada, mas não pôde ser vinculada ao anúncio.' }, { status: 500 })
  }
  await recomputeListing(id, userId)

  return Response.json({ ok: true, image_review: imageReview, photos: gallery.urls })
}
