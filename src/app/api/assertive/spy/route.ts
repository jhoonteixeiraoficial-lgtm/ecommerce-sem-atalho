import { NextRequest } from 'next/server'
import { requireCommunityUser, invalidInput, readJson } from '@/app/api/community/helpers'
import { spyCompetitors } from '@/lib/assertive/spy'
import { downloadAndProcessPhotos } from '@/lib/assertive/photos'
import { getValidMLToken } from '@/lib/assertive/publisher'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const spySchema = z.object({
  analysis_id: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response
  const parsed = spySchema.safeParse(body.body)
  if (!parsed.success) return invalidInput()

  const supabase = createAdminClient()
  const { data: analysis } = await supabase
    .from('assertive_analyses')
    .select('*')
    .eq('id', parsed.data.analysis_id)
    .eq('user_id', authorizedUser.id)
    .single()

  if (!analysis) return invalidInput()

  const mlToken = await getValidMLToken(authorizedUser.id)
  if (!mlToken) {
    return Response.json(
      { error: 'ML_NOT_CONNECTED', message: 'Conecte sua conta do Mercado Livre para pesquisar concorrentes reais.' },
      { status: 428 }
    )
  }

  const configRes = await supabase
    .from('assertive_ai_config')
    .select('*')
    .eq('user_id', authorizedUser.id)
    .single()

  let spyResult
  try {
    spyResult = await spyCompetitors(mlToken, analysis.product_name, configRes.data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao espionar concorrentes'
    console.error('[assertive/spy] stage=catalog_search error:', msg)
    return Response.json({ error: `Erro ao consultar Mercado Livre: ${msg}` }, { status: 500 })
  }

  let photos: string[] = []
  try {
    const allPhotos = spyResult.competitors.flatMap(c => c.pictures)
    photos = await downloadAndProcessPhotos(allPhotos)
  } catch (e) {
    console.error('[assertive/spy] stage=photo_download error:', e)
  }

  await supabase
    .from('assertive_analyses')
    .update({
      competitors: spyResult.competitors,
      updated_at: new Date().toISOString(),
    })
    .eq('id', analysis.id)

  return Response.json({ ...spyResult, photos })
}
