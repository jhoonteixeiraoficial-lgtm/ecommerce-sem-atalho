import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import {
  loadAnalysis,
  runResearch,
  runGeneration,
  updateAnalysis,
  getUserAIConfig,
} from '@/lib/assertive/pipeline'
import { MLNotConnectedError } from '@/lib/assertive/publisher'
import { getValidMLToken } from '@/lib/assertive/publisher'
import { applyUserAnswers, identifyFromUrl, isProtectedField, type ProductTruth } from '@/lib/assertive/truth'
import { tryAcquireAnalysisLock, releaseAnalysisLock } from '@/lib/assertive/concurrency'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 300

const schema = z.object({
  /**
   * Retomada inteligente: falha na publicação não refaz a IA de visão,
   * falha na geração não refaz a pesquisa de mercado.
   */
  from: z.enum(['researching', 'generating']).default('researching'),
  query: z.string().max(200).optional(),
  category_id: z.string().max(30).optional(),
  /** respostas do vendedor aos campos não confirmados na identificação */
  answers: z.record(z.string().max(60), z.string().max(500)).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const body = await readJson(req)
  if (body.response) return body.response

  const parsed = schema.safeParse(body.body ?? {})
  if (!parsed.success) return Response.json({ error: 'Parâmetros inválidos.' }, { status: 400 })

  let analysis = await loadAnalysis(id, authorizedUser.id)
  if (!analysis) return Response.json({ error: 'Análise não encontrada.' }, { status: 404 })

  let leaseToken: string | null
  try {
    leaseToken = await tryAcquireAnalysisLock(id, authorizedUser.id)
  } catch {
    return Response.json({ error: 'Controle de execução indisponível. Tente novamente em instantes.' }, { status: 503 })
  }
  if (!leaseToken) {
    return Response.json(
      { error: 'Esta análise já está sendo processada. Aguarde a conclusão.', code: 'ANALYSIS_IN_PROGRESS' },
      { status: 409 }
    )
  }

  // `researching` also means identified and awaiting the user's confirmation.
  // Only the database lease determines whether another execution is active.
  try {
    const config = await getUserAIConfig(authorizedUser.id)

    // Recupera análises URL criadas antes do suporte a /up/MLBU.
    // Dados confirmados manualmente pelo usuário continuam soberanos.
    if (parsed.data.from === 'researching' && analysis.input_type === 'url') {
      const truth = analysis.product_truth as ProductTruth
      const sourceUrl = typeof analysis.input_data?.ml_url === 'string' ? analysis.input_data.ml_url : null
      const needsSourceSnapshot = !truth?.source_item_id || !truth?.source_pictures?.length || !truth?.source_category_id
      if (sourceUrl && needsSourceSnapshot) {
        const token = await getValidMLToken(authorizedUser.id)
        if (token) {
          const refreshed = await identifyFromUrl(config, sourceUrl, token)
          const protectedFields = Object.fromEntries(
            Object.entries(truth?.fields || {}).filter(([, field]) => isProtectedField(field))
          )
          const refreshedTruth: ProductTruth = {
            ...refreshed,
            fields: { ...refreshed.fields, ...protectedFields },
          }
          await updateAnalysis(id, authorizedUser.id, {
            product_truth: refreshedTruth,
            product_name: refreshedTruth.name,
            error_message: null,
          })
          analysis = {
            ...analysis,
            product_truth: refreshedTruth,
            product_name: refreshedTruth.name,
            error_message: null,
          }
        }
      }
    }

    // respostas do vendedor viram fatos confirmados antes da pesquisa
    const answers = Object.fromEntries(
      Object.entries(parsed.data.answers ?? {}).filter(([, v]) => v.trim())
    )
    const nameOverride = parsed.data.query?.trim()

    if (Object.keys(answers).length || nameOverride) {
      const truth = analysis.product_truth as ProductTruth
      if (truth?.name) {
        const updated = applyUserAnswers(truth, answers)
        if (nameOverride && nameOverride !== updated.name) {
          updated.name = nameOverride
          updated.evidence = [...updated.evidence, 'Nome do produto corrigido pelo vendedor']
        }
        await updateAnalysis(id, authorizedUser.id, {
          product_truth: updated,
          product_name: updated.name,
        })
        analysis = { ...analysis, product_truth: updated, product_name: updated.name }
      }
    }

    if (parsed.data.from === 'researching') {
      const result = await runResearch(analysis, {
        queryOverride: parsed.data.query,
        categoryOverride: parsed.data.category_id,
      })
      analysis = {
        ...analysis,
        product_truth: result.truth,
        product_name: result.truth.name,
        research: result.research,
        dna: result.dna,
        category_id: result.research.category_id,
        domain_id: result.research.domain_id,
        status: 'generating',
        error_message: null,
      }
    }

    const { listingId } = await runGeneration(analysis, config)

    return Response.json({ ok: true, listing_id: listingId })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Falha ao processar a análise.'
    await updateAnalysis(id, authorizedUser.id, { status: 'failed', error_message: message })
    if (e instanceof MLNotConnectedError) {
      return Response.json({ error: message, code: 'ML_NOT_CONNECTED' }, { status: 409 })
    }
    return Response.json({ error: message }, { status: 500 })
  } finally {
    await releaseAnalysisLock(id, authorizedUser.id, leaseToken)
  }
}
