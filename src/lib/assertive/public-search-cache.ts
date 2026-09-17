import { createHash } from 'node:crypto'
import { publicSearchUrl, type PublicSearchSnapshot } from './public-search'

const MAX_AGE_MS = 6 * 60 * 60 * 1000
const normalize = (query: string) => query.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
export function publicSearchCacheKey(query: string): string {
  return `PUBLIC_SEARCH:v1:MLB:br:${createHash('sha256').update(normalize(query)).digest('hex')}`
}

async function readStoredSnapshot(key: string): Promise<unknown> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data, error } = await createAdminClient().from('assertive_ml_cache')
    .select('payload, expires_at').eq('cache_key', key).maybeSingle()
  if (error || !data || Date.parse(data.expires_at) <= Date.now()) return null
  return data.payload
}

function valid(value: unknown, query: string, now: number): value is PublicSearchSnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as PublicSearchSnapshot
  const observed = Date.parse(s.observed_at)
  if (s.available !== true || typeof s.query !== 'string' || normalize(s.query) !== normalize(query)
    || !Number.isFinite(observed) || observed > now || now - observed >= MAX_AGE_MS
    || s.search_url !== publicSearchUrl(s.query)
    || !Array.isArray(s.entries) || !s.entries.length || s.entries.length > 60) return false
  return s.entries.every(e => {
    if (!e || typeof e !== 'object') return false
    try {
      const url = new URL(e.url)
      return url.protocol === 'https:' && !url.username && !url.password
        && ['www.mercadolivre.com.br', 'produto.mercadolivre.com.br'].includes(url.hostname)
        && Number.isInteger(e.position) && e.position > 0 && e.position <= 60
        && typeof e.sponsored === 'boolean'
        && (e.sponsored ? e.organic_position === null : Number.isInteger(e.organic_position) && e.organic_position! > 0 && e.organic_position! <= e.position)
        && (e.item_id === null || /^MLB\d+$/.test(e.item_id))
        && (e.catalog_product_id === null || /^MLB\d+$/.test(e.catalog_product_id))
        && Boolean(e.item_id || e.catalog_product_id)
        && typeof e.title === 'string' && e.title.length > 0
        && typeof e.bestseller_badge === 'boolean' && e.sold_quantity === null
    } catch { return false }
  })
}

/** Read-only: cache miss must never silently trigger a paid scrape. */
export async function loadPublicSearch(
  query: string,
  read: (key: string) => Promise<unknown> = readStoredSnapshot,
  now = Date.now(),
): Promise<PublicSearchSnapshot> {
  try {
    const snapshot = await read(publicSearchCacheKey(query))
    if (valid(snapshot, query, now)) return snapshot
  } catch { /* Ranking is unavailable; preserve the rest of the research. */ }
  return { available: false, query, observed_at: new Date(now).toISOString(),
    search_url: publicSearchUrl(query), entries: [],
    unavailable_reason: 'Ranking da busca pública não verificado: sem coleta válida nas últimas 6 horas. A posição no catálogo não substitui esse ranking.' }
}
