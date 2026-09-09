import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ mlGet: vi.fn() }))

vi.mock('../ml-api', async importOriginal => {
  const original = await importOriginal<typeof import('../ml-api')>()
  return { ...original, mlGet: mocks.mlGet }
})

import { exactFactSources, researchMarket } from '../research'
import type { ResearchResult } from '../research'
import type { ProductTruth } from '../truth'

const truth: ProductTruth = {
  name: 'Caneta de polaridade Kitest KA250 12V 24V',
  fields: {
    brand: { value: 'Kitest', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
    model: { value: 'KA250', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
    gtin: { value: '7898559182505', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
  },
  uncertain: [],
  evidence: ['fonte oficial'],
  confidence: 1,
  source_category_id: 'MLB60658',
  source_domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
}

describe('researchMarket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mlGet.mockImplementation(async (path: string) => {
      if (path.startsWith('/sites/MLB/domain_discovery/search')) {
        return [{
          domain_id: 'MLB-COMBINED_TOOL_KITS',
          domain_name: 'Kits de ferramentas',
          category_id: 'MLB99999',
          category_name: 'Kits combinados',
        }]
      }
      if (path === '/categories/MLB60658') {
        return {
          id: 'MLB60658',
          name: 'Outras ferramentas para veículos',
          path_from_root: [],
          settings: { listing_allowed: true, catalog_domain: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES' },
        }
      }
      if (path.startsWith('/products/search?')) {
        return {
          results: [
            { id: 'MLBP1', domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES' },
            { id: 'MLBP2', domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES' },
          ],
        }
      }
      if (path === '/highlights/MLB/category/MLB60658') return { content: [] }
      if (path === '/products/MLBP1') {
        return {
          id: 'MLBP1',
          status: 'active',
          domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
          name: 'Caneta de polaridade Kitest KA250',
          attributes: [
            { id: 'BRAND', value_name: 'Kitest' },
            { id: 'MODEL', value_name: 'KA250' },
            { id: 'GTIN', value_name: '7898559182505' },
          ],
          pictures: [{ url: 'https://example.com/catalog.jpg' }],
        }
      }
      if (path === '/products/MLBP2') {
        return {
          id: 'MLBP2',
          status: 'active',
          domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
          name: 'Caneta teste circuito automotivo 12V',
          attributes: [{ id: 'VOLTAGE', value_name: '12V' }],
          pictures: [{ url: 'https://example.com/competitor.jpg' }],
        }
      }
      if (path === '/products/MLBP1/items') return { results: [] }
      if (path === '/products/MLBP2/items') {
        return {
          results: [{
            item_id: 'MLB200',
            seller_id: 200,
            price: 79.9,
            category_id: 'MLB60658',
            currency_id: 'BRL',
            condition: 'new',
            shipping: { free_shipping: false, logistic_type: 'cross_docking', mode: 'me2' },
          }],
        }
      }
      if (path === '/users/200') return { id: 200, nickname: 'SELLER', seller_reputation: {} }
      if (path === '/trends/MLB/MLB60658') return []
      throw new Error(`Unexpected ML path: ${path}`)
    })
  })

  it('preserva categoria/domínio da URL e não chama catálogo sem oferta de concorrente', async () => {
    const result = await researchMarket('token', truth.name, {
      sourceCategoryId: truth.source_category_id,
      sourceDomainId: truth.source_domain_id,
      truth,
      deepLimit: 8,
    })

    expect(result.category_resolution).toMatchObject({
      category_id: 'MLB60658',
      category_name: 'Outras ferramentas para veículos',
      domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
      source: 'url_source',
      confidence: 1,
    })
    expect(result.domain_id).toBe('MLB-TOOL_AND_CONSTRUCTION_SUPPLIES')
    expect(result.category_name).toBe('Outras ferramentas para veículos')
    expect(result.catalog_matches).toHaveLength(1)
    expect(result.catalog_matches[0]).toMatchObject({ product_id: 'MLBP1', match_class: 'EXACT_PRODUCT' })
    expect(result.competitors).toHaveLength(1)
    expect(result.competitors[0].item_id).toBe('MLB200')
    expect(result.competitors.some(competitor => competitor.product_id === 'MLBP1')).toBe(false)
    const searchPaths = mocks.mlGet.mock.calls.map(([path]) => String(path)).filter(path => path.startsWith('/products/search?'))
    expect(searchPaths.some(path => path.includes('q=7898559182505'))).toBe(true)
    expect(searchPaths.some(path => decodeURIComponent(path).includes('q=Kitest KA250'))).toBe(true)
  })
})

describe('exactFactSources', () => {
  it('exclui até match exato quando a evidência não autoriza uso factual', () => {
    const sources = exactFactSources({
      catalog_matches: [
        { title: 'Seguro', attributes: { BRAND: 'Kitest' }, usable_as_fact_source: true },
        { title: 'Sem confiança', attributes: { MODEL: 'Outro' }, usable_as_fact_source: false },
      ],
      competitors: [
        { title: 'Comparável', attributes: { VOLTAGE: '220 V' }, usable_as_fact_source: false },
      ],
    } as unknown as ResearchResult)

    expect(sources).toEqual([{ title: 'Seguro', attributes: { BRAND: 'Kitest' } }])
  })
})
