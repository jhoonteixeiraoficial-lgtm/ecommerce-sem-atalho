import { createHash } from 'node:crypto'
import { collectPublicSearch } from './public-search-collector'
import { parsePublicSearch } from './public-search'
import { publicSearchUrl, type PublicSearchSnapshot } from './public-search'

const MAX_AGE_MS = 6 * 60 * 60 * 1000
// Normalização compartilhada entre a consulta da pesquisa (com acentos,
// vinda da IA) e a consulta derivada da URL navegada (sem acentos, slug do
// Mercado Livre). Sem isso, "térmica" e "termica" gerariam chaves distintas.
const normalize = (query: string) => query
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('pt-BR')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
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

/** Cache first; collection requires explicit server budget and durable reservation. */

/** Sobreposição de palavras relevantes entre a consulta da pesquisa e a captura (0..1). */
function queryOverlap(researchQuery: string, capturedQuery: string): number {
  const stop = new Set(['de', 'da', 'do', 'com', 'para', 'em', 'e', 'a', 'o', 'as', 'os', 'que', 'por'])
  const words = (q: string) => normalize(q).split(' ').filter(w => w.length >= 3 && !stop.has(w))
  const target = new Set(words(researchQuery))
  if (!target.size) return 0
  const captured = words(capturedQuery)
  const hits = captured.filter(w => target.has(w)).length
  return hits / Math.max(1, Math.min(captured.length, target.size))
}

/**
 * Procura a captura mais recente do usuário cuja consulta cobre a pesquisa
 * (≥50% de sobreposição de palavras relevantes). Reconecta o coletor à
 * pesquisa quando a IA reformula a consulta.
 */
async function findUserCapture(
  userId: string,
  query: string,
  read: (key: string) => Promise<unknown>,
  now: number
): Promise<PublicSearchSnapshot | null> {
  const supabase = (await import('@/lib/supabase/admin')).createAdminClient()
  const { data } = await supabase
    .from('assertive_ml_cache')
    .select('cache_key, payload, expires_at')
    .like('cache_key', `BROWSER:${userId}:PUBLIC_SEARCH:v1:MLB:br:%`)
    .gte('expires_at', new Date(now).toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  let best: PublicSearchSnapshot | null = null
  let bestScore = 0
  let bestHasImages = false
  for (const row of data || []) {
    const snap = row.payload as PublicSearchSnapshot | null
    if (!snap || snap.available !== true || !snap.query) continue
    if (Date.parse(row.expires_at) <= now) continue
    const score = queryOverlap(query, snap.query)
    const hasImages = (snap.entries || []).some(e => e.image_url)
    // captura COM fotos vence empate: as âncoras do img2img são o recurso escasso
    if (score > bestScore || (score === bestScore && hasImages && !bestHasImages)) {
      bestScore = score
      best = snap
      bestHasImages = hasImages
    }
  }
  return bestScore >= 0.5 ? best : null
}
export async function loadPublicSearch(
  query: string,
  read: (key: string) => Promise<unknown> = readStoredSnapshot,
  now = Date.now(),
  options: { userId?: string; allowCollection?: boolean } = {},
): Promise<PublicSearchSnapshot> {
  try {
    if (options.userId) {
      const own = await read(`BROWSER:${options.userId}:${publicSearchCacheKey(query)}`)
      const ownValid = valid(own, query, now)
      const ownHasImages = Boolean(own && (own as { entries?: Array<{ image_url?: string | null }> }).entries?.some(e => e.image_url))
      // A IA reformula a consulta (ordem/sinônimos); o coletor captura a busca
      // que o usuário navegou. Matching por sobreposição reconecta os dois —
      // e captura COM fotos vence quando a exata não tem (parser antigo).
      const fuzzy = await findUserCapture(options.userId, query, read, now).catch(() => null)
      const fuzzySnap = fuzzy && valid(fuzzy, fuzzy.query, now) ? fuzzy : null
      const fuzzyOverlap = fuzzySnap ? queryOverlap(query, fuzzySnap.query) : 0
      const fuzzyHasImages = fuzzySnap ? (fuzzySnap.entries || []).some(e => e.image_url) : false
      if (ownValid && ownHasImages) return own
      if (fuzzySnap && fuzzyHasImages && fuzzyOverlap >= 0.5) return fuzzySnap
      if (ownValid) return own
      if (fuzzySnap && fuzzyOverlap >= 0.5) return fuzzySnap
    }
    const snapshot = await read(publicSearchCacheKey(query))
    if (valid(snapshot, query, now)) return snapshot
    const collected = options.allowCollection === false ? null : await collectPublicSearch(query, publicSearchCacheKey(query))
    if (valid(collected, query, Date.now())) return collected
  } catch { /* Ranking is unavailable; preserve the rest of the research. */ }
  return { available: false, query, observed_at: new Date(now).toISOString(),
    search_url: publicSearchUrl(query), entries: [],
    unavailable_reason: 'Ranking da busca pública não verificado: sem coleta válida nas últimas 6 horas. A posição no catálogo não substitui esse ranking.' }
}

/** Re-processa capturas antigas do usuário com o parser atual (ganha image_url). */
export async function reparseUserCaptures(userId: string): Promise<number> {
  const supabase = (await import('@/lib/supabase/admin')).createAdminClient()
  const { data } = await supabase
    .from('assertive_ml_cache')
    .select('cache_key, payload, expires_at')
    .like('cache_key', `BROWSER:${userId}:PUBLIC_SEARCH:v1:MLB:br:%`)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(10)
  let updated = 0
  for (const row of data || []) {
    const payload = row.payload as { html?: string; query?: string; observed_at?: string; entries?: Array<{ image_url?: string | null }> } | null
    if (!payload?.html || !payload.query || !payload.observed_at) continue
    if (payload.entries?.some(e => e.image_url)) continue
    const reparsed = parsePublicSearch(payload.html, payload.query, payload.observed_at)
    if (!reparsed.available) continue
    await supabase.from('assertive_ml_cache').update({ payload: { ...payload, ...reparsed } }).eq('cache_key', row.cache_key)
    updated++
  }
  return updated
}