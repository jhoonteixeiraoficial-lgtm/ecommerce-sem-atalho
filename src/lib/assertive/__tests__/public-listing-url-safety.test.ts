import { afterEach, describe, expect, it, vi } from 'vitest'
// Import the un-exported helper indirectly through collectPublicListingPage, which calls safeTarget.
import { collectPublicListingPage } from '../public-listing-collector'

const baseUrl = 'https://www.mercadolivre.com.br/garrafa/p/MLB11865004'
const altEncoded = 'https://www.mercadolivre.com.br/garrafa/p/MLB11865004?pdp_filters=item_id%3AMLB11865004'
const altItem = 'https://www.mercadolivre.com.br/garrafa/p/MLB11865004?pdp_filters=item_id:MLB11865004'

const html = '<h1 class="ui-pdp-title">Garrafa</h1>'
  + '<div class="ui-pdp-seller-summary"><a class="ui-pdp-seller-summary__link">Loja</a></div>'
  + '<div class="ui-seller-data"><h2 class="ui-seller-data-header__title">Loja</h2></div>'
  + '<p class="ui-vpp-denounce__info">Anúncio #11865004</p>'

afterEach(() => vi.unstubAllEnvs())

function buildDeps() {
  vi.stubEnv('SCRAPINGBEE_API_KEY', 'fake')
  vi.stubEnv('ASSERTIVE_SEARCH_DAILY_CREDITS', '100')
  return {
    reserve: vi.fn().mockResolvedValue(true),
    request: vi.fn().mockResolvedValue(new Response(html)),
    save: vi.fn().mockResolvedValue(undefined),
  }
}

describe('public listing url allow-list', () => {
  it.each([
    ['explicit colon in pdp_filters', baseUrl + '?pdp_filters=item_id:MLB11865004'],
    ['url-encoded colon in pdp_filters', altEncoded],
    ['pdp_filters missing but item id in path', 'https://produto.mercadolivre.com.br/MLB-11865004-garrafa-_JM'],
  ])('accepts the canonical target variation: %s', async (_label, target) => {
    const deps = buildDeps()
    const result = await collectPublicListingPage(target, 'MLB11865004', deps)
    expect(result?.url).toBe(target)
  })

  it.each([
    ['wrong item id in pdp_filters', baseUrl + '?pdp_filters=item_id:MLB9999999'],
    ['foreign host', 'https://evil.example/garrafa/p/MLB11865004'],
    ['non-https', 'http://www.mercadolivre.com.br/garrafa/p/MLB11865004'],
    ['pdp_filters with same id, wrong on a non-ML host', 'https://www.mercadolivre.com.br.evil/p/MLB11865004'],
  ])('rejects unsafe target without spending: %s', async (_label, target) => {
    const deps = buildDeps()
    const result = await collectPublicListingPage(target, 'MLB11865004', deps)
    expect(result).toBeNull()
    expect(deps.reserve).not.toHaveBeenCalled()
  })
})
