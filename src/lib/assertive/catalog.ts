const ML_BASE = 'https://api.mercadolibre.com'

interface CatalogSearchResult {
  id: string
  domain_id: string
  name: string
  attributes: { id: string; value_name: string }[]
  pictures: { url: string }[]
}

interface CatalogProductDetail {
  id: string
  name: string
  domain_id: string
  attributes: { id: string; value_name: string }[]
  pictures: { url: string }[]
  buy_box_winner?: {
    item_id: string
    seller_id: number
    price: number
    currency_id: string
    shipping?: { free_shipping?: boolean }
    condition?: string
    seller?: { reputation_level_id?: string }
  }
  buy_box_winner_price_range?: {
    min: { price: number }
    max: { price: number }
  }
}

async function mlGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${ML_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`ML ${res.status}: ${text.substring(0, 200)}`)
  }
  return res.json()
}

export async function searchCatalogProducts(
  token: string,
  query: string,
  siteId: string = 'MLB'
): Promise<CatalogSearchResult[]> {
  const data = await mlGet<{ results: CatalogSearchResult[] }>(
    `/products/search?status=active&site_id=${siteId}&q=${encodeURIComponent(query)}`,
    token
  )
  return data.results || []
}

export async function getCatalogProductDetail(token: string, productId: string): Promise<CatalogProductDetail> {
  return mlGet<CatalogProductDetail>(`/products/${productId}`, token)
}

function parseReputation(level?: string): number {
  const levels: Record<string, number> = {
    RED: 1, ORANGE: 2, YELLOW: 3, LIGHT_GREEN: 4, GREEN: 5,
  }
  return level ? levels[level.toUpperCase()] || 3 : 0
}

export interface CatalogCompetitor {
  item_id: string
  title: string
  price: number
  condition: 'new' | 'used'
  seller: { id: string; nickname: string; reputation: number; level: string }
  pictures: string[]
  attributes: Record<string, string>
  shipping: { free_shipping: boolean }
  reviews_count: number
  listing_type: string
  price_range?: { min: number; max: number }
  catalog_product_id: string
}

export async function searchAndEnrichCatalog(
  token: string,
  query: string,
  topN: number = 6
): Promise<CatalogCompetitor[]> {
  const products = await searchCatalogProducts(token, query, 'MLB')
  const enriched: CatalogCompetitor[] = []

  for (const p of products.slice(0, topN)) {
    try {
      const detail = await getCatalogProductDetail(token, p.id)
      const winner = detail.buy_box_winner
      const attrs: Record<string, string> = {}
      for (const a of detail.attributes || []) {
        if (a.value_name) attrs[a.id] = a.value_name
      }

      enriched.push({
        item_id: winner?.item_id || detail.id,
        title: detail.name,
        price: winner?.price ?? 0,
        condition: winner?.condition === 'used' ? 'used' : 'new',
        seller: {
          id: winner?.seller_id ? String(winner.seller_id) : '',
          nickname: '',
          reputation: parseReputation(winner?.seller?.reputation_level_id),
          level: winner?.seller?.reputation_level_id || 'unknown',
        },
        pictures: (detail.pictures || []).map(pic => pic.url),
        attributes: attrs,
        shipping: { free_shipping: winner?.shipping?.free_shipping || false },
        reviews_count: 0,
        listing_type: '',
        price_range: detail.buy_box_winner_price_range
          ? { min: detail.buy_box_winner_price_range.min.price, max: detail.buy_box_winner_price_range.max.price }
          : undefined,
        catalog_product_id: detail.id,
      })
    } catch {
      continue
    }
  }

  return enriched
}
