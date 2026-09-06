import { NextRequest } from 'next/server'
import { requireCommunityUser, invalidInput } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishToML, getValidMLToken } from '@/lib/assertive/publisher'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const { id } = await params
  const supabase = createAdminClient()

  const { data: listing } = await supabase
    .from('assertive_listings')
    .select('*')
    .eq('id', id)
    .eq('user_id', authorizedUser.id)
    .single()

  if (!listing) return invalidInput()
  if (listing.status === 'published') return invalidInput()

  const token = await getValidMLToken(authorizedUser.id)
  if (!token) return invalidInput()

  await supabase
    .from('assertive_listings')
    .update({ status: 'publishing' })
    .eq('id', id)

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
      .eq('id', id)

    return Response.json({ ok: true, ml_item_id: result.item_id, url: `https://www.mercadolivre.com.br/item/${result.item_id}` })
  }

  await supabase
    .from('assertive_listings')
    .update({ status: 'error' })
    .eq('id', id)

  return Response.json({ error: result.error }, { status: 500 })
}
