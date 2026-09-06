import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { identifyFromDescription, identifyFromPhotos, identifyFromUrl } from '@/lib/assertive/truth'
import { getValidMLToken } from '@/lib/assertive/publisher'
import { getUserAIConfig } from '@/lib/assertive/pipeline'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 120

const schema = z.object({
  input_type: z.enum(['photo', 'description', 'url']),
  description: z.string().max(4000).optional(),
  url: z.string().url().max(1000).optional(),
  photos: z.array(z.string().url()).max(8).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response

  const parsed = schema.safeParse(body.body)
  if (!parsed.success) {
    return Response.json({ error: 'Dados inválidos para iniciar a análise.' }, { status: 400 })
  }

  const { input_type, description, url, photos } = parsed.data

  if (input_type === 'photo' && (!photos || photos.length === 0)) {
    return Response.json({ error: 'Envie pelo menos uma foto do produto.' }, { status: 400 })
  }
  if (input_type === 'description' && !description?.trim()) {
    return Response.json({ error: 'Descreva o produto para continuar.' }, { status: 400 })
  }
  if (input_type === 'url' && !url) {
    return Response.json({ error: 'Informe a URL do anúncio.' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: analysis, error: insertError } = await supabase
    .from('assertive_analyses')
    .insert({
      user_id: authorizedUser.id,
      product_name: 'Identificando...',
      input_type,
      input_data: { description: description ?? null, ml_url: url ?? null },
      photos: photos ?? [],
      status: 'identifying',
    })
    .select('id')
    .single()

  if (insertError || !analysis) {
    return Response.json({ error: 'Não foi possível iniciar a análise.' }, { status: 500 })
  }

  try {
    const config = await getUserAIConfig(authorizedUser.id)

    const truth =
      input_type === 'photo'
        ? await identifyFromPhotos(config, photos!, description)
        : input_type === 'url'
          ? await identifyFromUrl(config, url!, await getValidMLToken(authorizedUser.id))
          : await identifyFromDescription(config, description!)

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
        ? 'A chave de API da IA foi recusada. Verifique em Configurações.'
        : raw

    await supabase
      .from('assertive_analyses')
      .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', analysis.id)
      .eq('user_id', authorizedUser.id)

    return Response.json({ id: analysis.id, error: message }, { status: 500 })
  }
}
