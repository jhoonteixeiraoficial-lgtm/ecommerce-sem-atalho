import { NextRequest } from 'next/server'
import { requireCommunityUser, invalidInput, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('user_id', authorizedUser.id)
    .order('created_at', { ascending: false })

  return Response.json(data || [])
}

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response
  const { analysis_id } = body.body as { analysis_id?: string }
  if (!analysis_id) return invalidInput()

  const supabase = createAdminClient()
  const { data: analysis } = await supabase
    .from('assertive_analyses')
    .select('*')
    .eq('id', analysis_id)
    .eq('user_id', authorizedUser.id)
    .single()

  if (!analysis) return invalidInput()

  const configRes = await supabase
    .from('assertive_ai_config')
    .select('*')
    .eq('user_id', authorizedUser.id)
    .single()

  const aiConfig = configRes.data || {
    id: '', user_id: '', provider: 'gemini' as const, api_key: process.env.GEMINI_API_KEY,
    default_variations: 3, default_tone: 'profissional', default_margin: 30,
    auto_publish: false, created_at: '', updated_at: '',
  }

  let listings
  try {
    const { generateMultipleListings } = await import('@/lib/assertive/generator')
    listings = await generateMultipleListings(
      analysis,
      analysis.competitors || [],
      aiConfig,
      [],
      configRes.data?.default_variations || 3
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao gerar anúncios'
    return Response.json({ error: msg }, { status: 500 })
  }

  const inserted: Record<string, unknown>[] = []
  for (const listing of listings) {
    const { data } = await supabase
      .from('assertive_listings')
      .insert({
        analysis_id,
        user_id: authorizedUser.id,
        variation_index: inserted.length,
        title: listing.title,
        description: listing.description,
        price: listing.price,
        attributes: listing.attributes,
        photos: listing.photos,
        status: 'draft',
      })
      .select()
      .single()
    if (data) inserted.push(data)
  }

  return Response.json(inserted)
}
