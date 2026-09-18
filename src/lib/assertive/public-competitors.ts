import { createHash } from 'node:crypto'
import { collectPublicListingPage } from './public-listing-collector'
import type { PublicSearchSnapshot } from './public-search'
import { parsePublicListing, publicListingDossier } from './public-listing'
import type { CompetitorDossier } from './research'
import type { ProductTruth } from './truth'

export function publicListingCacheKey(url: string): string {
  return `PUBLIC_LISTING:v1:${createHash('sha256').update(url).digest('hex')}`
}

async function readPage(key: string): Promise<unknown> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data, error } = await createAdminClient().from('assertive_ml_cache').select('payload,expires_at').eq('cache_key', key).maybeSingle()
  if (error || !data || Date.parse(data.expires_at) <= Date.now()) return null
  return data.payload
}

/** Only public-page evidence, never uploads or inferred seller metrics. */
export async function loadPublicCompetitors(
  snapshot: PublicSearchSnapshot,
  truthLike?: Pick<ProductTruth, 'name' | 'fields'> | null,
  read: (key: string) => Promise<unknown> = readPage,
  options: { userId?: string; allowCollection?: boolean } = {},
): Promise<CompetitorDossier[]> {
  const now = Date.now()
  const age = now - Date.parse(snapshot.observed_at)
  // Tolera pequeno skew quando o snapshot foi escrito poucos ms antes da chamada.
  if (!snapshot.available || !Number.isFinite(age) || age < -5_000 || age >= 6 * 3600000) return []
  const result: CompetitorDossier[] = []
  // Nichos dominados por catálogo (/p/) concentram os anúncios reais mais
  // abaixo na busca; 10 leituras de cache seguem baratas e limitadas.
  for (const entry of snapshot.entries.filter(e => !e.sponsored && e.item_id).slice(0, 10)) {
    try {
      // 1) chave por URL (coleta ScrapingBee, mesma URL canonizada do snapshot)
      // 2) chave por item_id (coleta do navegador: a URL visitada difere da
      //    canônica por parâmetros de rastreio; o binding Anúncio #NNN dentro
      //    da própria página é a garantia de identidade)
      const own = options.userId
        ? (await read(`BROWSER:${options.userId}:${publicListingCacheKey(entry.url)}`))
          || (await read(`BROWSER:${options.userId}:PUBLIC_LISTING_ID:v1:${entry.item_id}`))
        : null
      const value = own || (await read(publicListingCacheKey(entry.url)))
        || (options.allowCollection === false ? null : await collectPublicListingPage(entry.url, entry.item_id!))
      if (!value || typeof value !== 'object') continue
      const page = value as { url: string; html: string; observed_at: string }
      const pageAge = Date.now() - Date.parse(page.observed_at)
      const mesmaUrl = page.url === entry.url
      if (typeof page.html !== 'string' || !Number.isFinite(pageAge) || pageAge < -5_000 || pageAge >= 6 * 3600000) continue
      if (!mesmaUrl && (typeof page.url !== 'string' || !page.url.startsWith('https://'))) continue
      const parsed = parsePublicListing(page.html, page.url, entry.item_id!, page.observed_at)
      const dossier = parsed ? publicListingDossier(parsed, entry, truthLike) : null
      if (dossier) result.push(dossier)
    } catch {/* Não transforma evidência inacessível em concorrente adivinhado. */}
  }
  return result
}
