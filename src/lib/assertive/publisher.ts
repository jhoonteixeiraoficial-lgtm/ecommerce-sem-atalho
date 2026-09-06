import type { GenerateListingOutput } from './types'
import { decrypt, encrypt } from './encryption'
import { createAdminClient } from '@/lib/supabase/admin'

const ML_BASE = 'https://api.mercadolibre.com'

interface MLPublishPayload {
  title: string
  category_id: string
  price: number
  currency_id: string
  quantity: number
  condition: string
  description: string
  attributes: Array<{ id: string; value_name: string }>
  pictures: Array<{ source: string }>
  shipping: { free_shipping: boolean }
}

export async function publishToML(
  accessToken: string,
  listing: GenerateListingOutput,
  photos: string[]
): Promise<{ success: boolean; item_id?: string; error?: string }> {
  try {
    const pictureIds: string[] = []
    for (const photo of photos.slice(0, 10)) {
      try {
        const res = await fetch(`${ML_BASE}/pictures/items/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ source: photo }),
        })
        if (res.ok) {
          const data = await res.json()
          pictureIds.push(data.id)
        }
      } catch { continue }
    }

    const attrs = Object.entries(listing.attributes).map(([id, value]) => ({
      id,
      value_name: String(value),
    }))

    const payload: MLPublishPayload = {
      title: listing.title,
      category_id: listing.category_id,
      price: listing.price,
      currency_id: 'BRL',
      quantity: 1,
      condition: 'new',
      description: listing.description,
      attributes: attrs,
      pictures: pictureIds.map(id => ({ source: id })),
      shipping: { free_shipping: true },
    }

    const res = await fetch(`${ML_BASE}/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const error = await res.json()
      return { success: false, error: error.message || `ML error ${res.status}` }
    }

    const data = await res.json()
    return { success: true, item_id: data.id }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export async function refreshMLToken(refreshToken: string): Promise<{ access_token: string; expires_at: string } | null> {
  try {
    const res = await fetch(`${ML_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    }
  } catch {
    return null
  }
}

export async function getValidMLToken(userId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_ml_connections')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!data) return null

  if (new Date(data.expires_at) > new Date()) {
    return decrypt(data.access_token)
  }

  const refreshed = await refreshMLToken(decrypt(data.refresh_token))
  if (!refreshed) return null

  await supabase
    .from('assertive_ml_connections')
    .update({
      access_token: encrypt(refreshed.access_token),
      expires_at: refreshed.expires_at,
    })
    .eq('id', data.id)

  return refreshed.access_token
}
