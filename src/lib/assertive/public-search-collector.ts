import { parsePublicSearch, publicSearchUrl, type PublicSearchSnapshot } from './public-search'

interface CollectionReport {
  outcome: 'HTTP_ERROR' | 'EMPTY_PAGE' | 'SUCCESS' | 'TIMEOUT' | 'RESERVATION_ERROR' | 'REQUEST_ERROR' | 'CACHE_ERROR'
  status: number | null
  credits: number | null
}
interface CollectorDependencies {
  report?: (report: CollectionReport) => void
  reserve: (key: string, dailyLimit: number) => Promise<boolean>
  save: (key: string, snapshot: PublicSearchSnapshot) => Promise<void>
  request: typeof fetch
}
async function admin() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}
const defaults: CollectorDependencies = {
  reserve: async (key, dailyLimit) => {
    const { data, error } = await (await admin()).rpc('reserve_assertive_search_credits', { p_key: key, p_daily_limit: dailyLimit })
    return !error && data === true
  },
  save: async (key, snapshot) => {
    const { error } = await (await admin()).from('assertive_ml_cache').upsert({ cache_key: key, payload: snapshot,
      expires_at: new Date(Date.parse(snapshot.observed_at) + 6 * 3600000).toISOString() }, { onConflict: 'cache_key' })
    if (error) throw new Error('Search cache unavailable')
  },
  request: (...args) => fetch(...args),
  report: report => console.info('[assertive-public-search]', JSON.stringify(report)),
}

/** No refund or retry on uncertain outcomes. Reservation survives worker crashes. */
export async function collectPublicSearch(query: string, key: string, deps: CollectorDependencies = defaults): Promise<PublicSearchSnapshot | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY
  const limit = Number(process.env.ASSERTIVE_SEARCH_DAILY_CREDITS || 0)
  if (!apiKey || !Number.isInteger(limit) || limit < 25 || limit > 250 || !query.trim() || query.length > 200) return null
  let stage: CollectionReport['outcome'] = 'RESERVATION_ERROR'
  let status: number | null = null
  let credits: number | null = null
  const report = (outcome: CollectionReport['outcome']) => {
    try { deps.report?.({ outcome, status, credits }) } catch { /* Logging must not change collection. */ }
  }
  try {
    if (!await deps.reserve(key, limit)) return null
    stage = 'REQUEST_ERROR'
    const url = new URL('https://app.scrapingbee.com/api/v1/')
    // Fixed premium + JS tier: documented 25 credits. Auto-mode can accept
    // an interstitial as success; never escalate to stealth or retry here.
    url.search = new URLSearchParams({ api_key: apiKey, url: publicSearchUrl(query), render_js: 'true', premium_proxy: 'true', stealth_proxy: 'false',
      country_code: 'br', block_ads: 'false', block_resources: 'false', wait: '1500', timeout: '60000' }).toString()
    const response = await deps.request(url, { signal: AbortSignal.timeout(80000), redirect: 'error' })
    status = response.status
    const cost = response.headers.get('spb-cost')
    credits = cost && /^\d+$/.test(cost) ? Number(cost) : null
    if (!response.ok) { report('HTTP_ERROR'); return null }
    const snapshot = parsePublicSearch(await response.text(), query, new Date().toISOString())
    if (!snapshot.available) { report('EMPTY_PAGE'); return null }
    stage = 'CACHE_ERROR'
    await deps.save(key, snapshot)
    report('SUCCESS')
    return snapshot
  } catch (error) {
    report(error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'TIMEOUT' : stage)
    // Never log provider URLs/errors: they can contain the API key.
    return null
  }
}
