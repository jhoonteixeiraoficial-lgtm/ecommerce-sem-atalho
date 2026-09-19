import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { identifyProduct, type ProductIdentificationInput } from '@/lib/assertive/truth'
import { getValidMLToken } from '@/lib/assertive/publisher'
import { getUserAIConfig } from '@/lib/assertive/pipeline'
import { createAdminClient } from '@/lib/supabase/admin'
import { observeAnalysisStage } from '@/lib/assertive/observability'
import { getOwnedAssets, isPublicationAssetAllowed } from '@/lib/assertive/image-assets'
import { checkRateLimit } from '@/lib/security'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 120

const schema = z.object({
  input_type: z.enum(['photo', 'single_image', 'multi_image', 'description', 'url', 'gtin', 'brand_model']),
  description: z.string().max(4000).optional(),
  url: z.string().url().max(1000).optional(),
  photos: z.array(z.string().url()).max(8).optional(),
  photo_asset_ids: z.array(z.string().min(1).max(100)).max(8).optional(),
  gtin: z.string().max(32).optional(),
  brand: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  // Rate limit: 10 análises por minuto por usuário
  const rateLimit = checkRateLimit(`assertive-analyze-${authorizedUser.id}`, 10, 60000)
  if (!rateLimit.allowed) {
    return Response.json({ error: 'Muitas solicitações. Aguarde um momento.' }, { status: 429, headers: { 'X-RateLimit-Remaining': '0' } })
  }

  const body = await readJson(req)
  if (body.response) return body.response

  const parsed = schema.safeParse(body.body)
  if (!parsed.success) {
    return Response.json({ error: 'Dados inválidos para iniciar a análise.' }, { status: 400 })
  }

  const { input_type, description, url, photos, photo_asset_ids, gtin, brand, model } = parsed.data
  let resolvedPhotos = photos ?? []
  if (photo_asset_ids?.length) {
    const uniqueIds = [...new Set(photo_asset_ids)]
    const owned = await getOwnedAssets(authorizedUser.id, uniqueIds)
    const byId = new Map(owned.map(asset => [asset.id, asset]))
    const ordered = photo_asset_ids.map(id => byId.get(id))
    if (uniqueIds.length !== photo_asset_ids.length
      || ordered.some(asset => !asset || !isPublicationAssetAllowed(asset))) {
      return Response.json({ error: 'Uma ou mais fotos não pertencem ao usuário ou não estão aprovadas.' }, { status: 400 })
    }
    resolvedPhotos = ordered.map(asset => asset!.public_url!)
  }

  if (['photo', 'single_image', 'multi_image'].includes(input_type) && resolvedPhotos.length === 0) {
    return Response.json({ error: 'Envie pelo menos uma foto do produto.' }, { status: 400 })
  }
  if (input_type === 'single_image' && resolvedPhotos.length !== 1) {
    return Response.json({ error: 'Envie exatamente uma foto para esta modalidade.' }, { status: 400 })
  }
  if (input_type === 'multi_image' && resolvedPhotos.length < 2) {
    return Response.json({ error: 'Envie pelo menos duas fotos para análise múltipla.' }, { status: 400 })
  }
  if (input_type === 'description' && !description?.trim()) {
    return Response.json({ error: 'Descreva o produto para continuar.' }, { status: 400 })
  }
  if (input_type === 'url' && !url) {
    return Response.json({ error: 'Informe a URL do anúncio.' }, { status: 400 })
  }
  if (input_type === 'gtin' && !gtin?.trim()) {
    return Response.json({ error: 'Informe o GTIN/EAN do produto.' }, { status: 400 })
  }
  if (input_type === 'brand_model' && (!brand?.trim() || !model?.trim())) {
    return Response.json({ error: 'Informe marca e modelo do produto.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: analysis, error: insertError } = await supabase
    .from('assertive_analyses')
    .insert({
      user_id: authorizedUser.id,
      product_name: 'Identificando...',
      input_type,
      input_data: {
        input_type,
        description: description ?? null,
        url: url ?? null,
        ml_url: url ?? null,
        photos: resolvedPhotos,
        photo_asset_ids: photo_asset_ids ?? [],
        gtin: gtin ?? null,
        brand: brand ?? null,
        model: model ?? null,
      },
      photos: resolvedPhotos,
      status: 'identifying',
    })
    .select('id')
    .single()

  if (insertError || !analysis) {
    return Response.json({ error: 'Não foi possível iniciar a análise.' }, { status: 500 })
  }

  try {
    const config = await getUserAIConfig(authorizedUser.id)

    const token = await getValidMLToken(authorizedUser.id)
    let identificationInput: ProductIdentificationInput
    if (input_type === 'url') identificationInput = { type: 'url', url: url! }
    else if (input_type === 'description') identificationInput = { type: 'description', description: description! }
    else if (input_type === 'gtin') identificationInput = { type: 'gtin', gtin: gtin! }
    else if (input_type === 'brand_model') identificationInput = { type: 'brand_model', brand: brand!, model: model! }
    else identificationInput = { type: input_type, photos: resolvedPhotos, context: description }

    const truth = await observeAnalysisStage(
      {
        analysis_id: analysis.id,
        user_id: authorizedUser.id,
        stage: 'identity',
        metadata: { input_type },
      },
      () => identifyProduct(config, identificationInput, token)
    )

    await supabase
      .from('assertive_analyses')
      .update({
        product_name: truth.name,
        product_truth: truth,
        status: 'researching',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', analysis.id)
      .eq('user_id', authorizedUser.id)

    return Response.json({ id: analysis.id, product_truth: truth, status: 'researching' })
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Falha na identificação'
    const message = /Nenhuma IA/i.test(raw)
      ? raw
      : /HTTP 4\d\d/.test(raw) && /api key|unauthorized|401|403/i.test(raw)
        ? 'A IA da plataforma está temporariamente indisponível. Tente novamente em instantes.'
        : raw

    await supabase
      .from('assertive_analyses')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', analysis.id)
      .eq('user_id', authorizedUser.id)

    return Response.json({ id: analysis.id, error: message }, { status: 500 })
  }
}
