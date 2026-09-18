import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const collect = vi.hoisted(() => vi.fn().mockResolvedValue(null))
vi.mock('../public-listing-collector', () => ({ collectPublicListingPage: collect }))
import { loadPublicCompetitors } from '../public-competitors'
import type { PublicSearchSnapshot } from '../public-search'

const html = `<h1 class="ui-pdp-title">Caneta Kitest KA250</h1>
<div class="ui-pdp-subtitle">+100 vendidos</div>
<div class="ui-pdp-seller-summary"><a class="ui-pdp-seller-summary__link">Loja A</a></div>
<div class="ui-seller-data"><h2 class="ui-seller-data-header__title">Loja A</h2></div>
<p class="ui-vpp-denounce__info">Anúncio #300</p>`
const url = 'https://produto.mercadolivre.com.br/MLB-300-caneta_JM'
function snapshot(): PublicSearchSnapshot {
  return { available: true, query: 'Caneta', observed_at: new Date().toISOString(), search_url: 'https://lista.mercadolivre.com.br/Caneta', entries: [{ position: 1, organic_position: 1, sponsored: false, item_id: 'MLB300', catalog_product_id: null, url, title: 'Caneta', bestseller_badge: false, sold_quantity: null }] }
}
describe('public competitors browser cache', () => {
  it('joins by listing ID in the owner namespace while preserving actual page sales scope', async () => {
    const page = { html, url: 'https://www.mercadolivre.com.br/p/MLB500?pdp_filters=item_id%3AMLB300', observed_at: new Date().toISOString() }
    const read = vi.fn(async (key: string) => key === 'BROWSER:user-a:PUBLIC_LISTING_ID:v1:MLB300' ? page : null)
    const result = await loadPublicCompetitors(snapshot(), null, read, { userId: 'user-a', allowCollection: false })
    expect(result).toHaveLength(1)
    expect(result[0].item_id).toBe('MLB300')
    expect(result[0].public_seller_evidence?.product_sales?.scope).toBe('CATALOG')
    expect(result[0].source_url).toBe(page.url)
    expect(await loadPublicCompetitors(snapshot(), null, read, { userId: 'user-b', allowCollection: false })).toEqual([])
    expect(collect).not.toHaveBeenCalled()
  })
  it('rejects another item and an expired observation', async () => {
    for (const page of [
      { html: html.replace('#300', '#999'), url, observed_at: new Date().toISOString() },
      { html, url, observed_at: '2000-01-01T00:00:00Z' },
    ]) expect(await loadPublicCompetitors(snapshot(), null, async () => page, { allowCollection: false })).toEqual([])
  })
})
