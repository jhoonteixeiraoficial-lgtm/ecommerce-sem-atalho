import { createHash } from 'node:crypto'
import { load } from 'cheerio'
import { parsePublicListing } from './public-listing'

export interface PublicListingPage { url: string; html: string; observed_at: string }
interface Report { outcome: 'SUCCESS' | 'HTTP_ERROR' | 'INVALID_PAGE' | 'ERROR'; status: number | null; credits: number | null }
interface Dependencies {
  reserve: (key: string, limit: number) => Promise<boolean>
  request: typeof fetch
  save: (key: string, page: PublicListingPage) => Promise<void>
  report?: (report: Report) => void
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
async function admin() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}
const defaults: Dependencies = {
  reserve: async (key, limit) => {
    const { data, error } = await (await admin()).rpc('reserve_assertive_search_credits', { p_key: key, p_daily_limit: limit })
    return !error && data === true
  },
  request: (...args) => fetch(...args),
  save: async (key, page) => {
    const { error } = await (await admin()).from('assertive_ml_cache').upsert({ cache_key: key, payload: page,
      expires_at: new Date(Date.parse(page.observed_at) + 6 * 3600000).toISOString() }, { onConflict: 'cache_key' })
    if (error) throw new Error('Public listing cache unavailable')
  },
  report: report => console.info('[assertive-public-listing]', JSON.stringify(report)),
}
function safeTarget(raw: string, itemId: string): boolean {
  if (!/^MLB\d+$/.test(itemId)) return false
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return false
    if (u.hostname === 'produto.mercadolivre.com.br') return u.pathname.match(/^\/MLB-(\d+)-/)?.[1] === itemId.slice(3)
    if (u.hostname !== 'www.mercadolivre.com.br' || !/\/p\/MLB\d+\/?$/.test(u.pathname)) return false
    const filters = u.searchParams.get('pdp_filters')
    const expected = `item_id:${itemId}`
    if (filters === expected) return true
    // Common encoded variants produced by ML's app: item_id%3A<id> or item_id=<id>.
    try {
      const decoded = filters ? decodeURIComponent(filters) : ''
      if (decoded === expected) return true
      const params = new URLSearchParams(filters || '')
      if (params.get('item_id') === itemId) return true
    } catch {/* keep strict equality above as the only acceptance */}
    return false
  } catch { return false }
}
async function boundedBody(response: Response): Promise<string> {
  const max = 8 * 1024 * 1024
  if (Number(response.headers.get('content-length')) > max) throw new Error('Page too large')
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) { await reader.cancel(); throw new Error('Page too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks).toString('utf8')
}

/** Uses the same global budget as search. Never retries or refunds uncertain requests. */
export async function collectPublicListingPage(target: string, expectedItemId: string, deps: Dependencies = defaults): Promise<PublicListingPage | null> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY
  const limit = Number(process.env.ASSERTIVE_SEARCH_DAILY_CREDITS || 0)
  if (!safeTarget(target, expectedItemId) || !apiKey || !Number.isInteger(limit) || limit < 25 || limit > 250) return null
  let status: number | null = null
  let credits: number | null = null
  const report = (outcome: Report['outcome']) => { try { deps.report?.({ outcome, status, credits }) } catch { /* Noncritical logging. */ } }
  try {
    if (!await deps.reserve(`PUBLIC_SEARCH:v1:MLB:br:${hash('LISTING:' + target)}`, limit)) return null
    const url = new URL('https://app.scrapingbee.com/api/v1/')
    url.search = new URLSearchParams({ api_key: apiKey, url: target, render_js: 'true', premium_proxy: 'true', stealth_proxy: 'false',
      country_code: 'br', block_ads: 'false', block_resources: 'false', wait: '1500', timeout: '60000' }).toString()
    const response = await deps.request(url, { signal: AbortSignal.timeout(80000), redirect: 'error' })
    status = response.status
    const cost = response.headers.get('spb-cost')
    credits = cost && /^\d+$/.test(cost) ? Number(cost) : null
    if (!response.ok) { report('HTTP_ERROR'); return null }
    const resolved = response.headers.get('spb-resolved-url')
    if (resolved && !safeTarget(resolved, expectedItemId)) { report('INVALID_PAGE'); return null }
    const $ = load(await boundedBody(response))
    $('script,style,input,iframe,form,textarea').remove()
    $('[hidden], [aria-hidden="true"]').remove()
    $('*').each((_, element) => {
      for (const attribute of Object.keys('attribs' in element ? element.attribs : {})) {
        if (/^on/i.test(attribute)) $(element).removeAttr(attribute)
      }
    })
    const html = $('.ui-pdp-title,.ui-pdp-subtitle,.ui-pdp-seller-summary,.ui-seller-data,.ui-vpp-denounce__info,.ui-pdp-specs,.ui-pdp-gallery__figure,.ui-pdp-description__content')
      .toArray().map(node => $.html(node)).join('\n')
    const page = { url: target, html, observed_at: new Date().toISOString() }
    if (!parsePublicListing(html, target, expectedItemId, page.observed_at)) { report('INVALID_PAGE'); return null }
    await deps.save(`PUBLIC_LISTING:v1:${hash(target)}`, page)
    report('SUCCESS')
    return page
  } catch { report('ERROR'); return null }
}
