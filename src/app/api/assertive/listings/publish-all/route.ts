import { NextRequest } from 'next/server'
import { requireCommunityUser, invalidInput, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishToML, getValidMLToken } from '@/lib/assertive/publisher'

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response
  const { analysis_id } = body.body as { analysis_id?: string }
  if (!analysis_id) return invalidInput()

  const supabase = createAdminClient()
  const token = await getValidMLToken(authorizedUser.id)
  if (!token) return invalidInput()

  const { data: listings } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('analysis_id', analysis_id)
    .eq('user_id', authorizedUser.id)
    .eq('status', 'draft')
    .order('variation_index')

  if (!listings || listings.length === 0) return invalidInput()

  const results = []
  for (const listing of listings) {
    await supabase
      .from('assertive_listings')
      .update({ status: 'publishing' })
      .eq('id', listing.id)

    const result = await publishToML(
      token,
      {
        title: listing.title,
        description: listing.description,
        price: listing.price,
        attributes: listing.attributes,
        category_id: '',
      },
      listing.photos || []
    )

    if (result.success && result.item_id) {
      await supabase
        .from('assertive_listings')
        .update({
          status: 'published',
          ml_item_id: result.item_id,
          published_at: new Date().toISOString(),
        })
        .eq('id', listing.id)
      results.push({ id: listing.id, ok: true, item_id: result.item_id })
    } else {
      await supabase
        .from('assertive_listings')
        .update({ status: 'error' })
        .eq('id', listing.id)
      results.push({ id: listing.id, ok: false, error: result.error })
    }

    await new Promise(r => setTimeout(r, 30000 + Math.random() * 30000))
  }

  return Response.json({ results })
}
