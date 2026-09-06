import { NextRequest } from 'next/server'
import { requireCommunityUser, invalidInput, readJson } from '@/app/api/community/helpers'
import { analyzeFromDescription, analyzeFromPhoto, analyzeFromUrl } from '@/lib/assertive/analyzer'
import { getValidMLToken } from '@/lib/assertive/publisher'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const analyzeSchema = z.object({
  input_type: z.enum(['photo', 'description', 'url']),
  input_value: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response
  const parsed = analyzeSchema.safeParse(body.body)
  if (!parsed.success) return invalidInput()

  const { input_type, input_value } = parsed.data
  const supabase = createAdminClient()

  const { data: analysis } = await supabase
    .from('assertive_analyses')
    .insert({
      user_id: authorizedUser.id,
      product_name: 'Processando...',
      input_type,
      input_data: input_type === 'photo' ? { image_url: input_value } : input_type === 'url' ? { ml_url: input_value } : { description: input_value },
      status: 'analyzing',
    })
    .select()
    .single()

  if (!analysis) return new Response('Erro ao criar análise', { status: 500 })

  try {
    const configRes = await supabase
      .from('assertive_ai_config')
      .select('*')
      .eq('user_id', authorizedUser.id)
      .single()

    const config = configRes.data

    let identified
    if (input_type === 'photo') {
      identified = await analyzeFromPhoto(config, input_value)
    } else if (input_type === 'url') {
      const mlToken = await getValidMLToken(authorizedUser.id).catch(() => null)
      identified = await analyzeFromUrl(config, input_value, mlToken)
    } else {
      identified = await analyzeFromDescription(config, input_value)
    }

    await supabase
      .from('assertive_analyses')
      .update({
        product_name: identified.name,
        identified_data: identified,
        category_id: identified.category_id || null,
        status: 'ready',
        updated_at: new Date().toISOString(),
      })
      .eq('id', analysis.id)

    return Response.json({ ...analysis, product_name: identified.name, identified_data: identified, status: 'ready' })
  } catch (e) {
    await supabase
      .from('assertive_analyses')
      .update({ status: 'error', updated_at: new Date().toISOString() })
      .eq('id', analysis.id)

    const msg = e instanceof Error ? e.message : 'Erro na análise'
    const friendly = msg.includes('Invalid API Key') || msg.includes('invalid_api_key')
      ? 'API Key inválida. Configure uma chave válida em Configurações.'
      : msg.includes('Todas as IAs falharam')
        ? 'Nenhuma IA disponível. Configure uma chave de API em Configurações.'
        : msg

    return Response.json({ error: friendly }, { status: 500 })
  }
}
