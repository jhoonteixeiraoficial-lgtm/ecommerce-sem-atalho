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
import { applyUserAnswers, type ProductTruth } from '@/lib/assertive/truth'
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

  try {
    const config = await getUserAIConfig(authorizedUser.id)

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
      await runResearch(analysis, {
        queryOverride: parsed.data.query,
        categoryOverride: parsed.data.category_id,
      })
      analysis = await loadAnalysis(id, authorizedUser.id)
      if (!analysis) return Response.json({ error: 'Análise não encontrada.' }, { status: 404 })
    }

    const { listingId } = await runGeneration(analysis, config)

    return Response.json({ ok: true, listing_id: listingId })
  } catch (e) {
    if (e instanceof MLNotConnectedError) {
      await updateAnalysis(id, authorizedUser.id, {
        status: 'failed',
        error_message: e.message,
      })
      return Response.json({ error: e.message, code: 'ML_NOT_CONNECTED' }, { status: 409 })
    }

    const message = e instanceof Error ? e.message : 'Falha ao processar a análise.'
    await updateAnalysis(id, authorizedUser.id, { status: 'failed', error_message: message })
    return Response.json({ error: message }, { status: 500 })
  }
}
