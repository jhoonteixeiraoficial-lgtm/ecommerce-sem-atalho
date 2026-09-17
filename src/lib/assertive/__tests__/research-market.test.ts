import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ mlGet: vi.fn(), loadPublicSearch: vi.fn() }))
vi.mock('../public-search-cache', () => ({ loadPublicSearch: mocks.loadPublicSearch }))

vi.mock('../ml-api', async importOriginal => {
  const original = await importOriginal<typeof import('../ml-api')>()
  return { ...original, mlGet: mocks.mlGet }
})

import {
  exactFactSources,
  exactProductReferenceUrls,
  researchMarket,
  searchMarketplaceVisualReferences,
} from '../research'
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
  category_hint: 'Ferramentas Automotivas > Diagnóstico e Testes',
  source_category_id: 'MLB60658',
  source_domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
}

describe('researchMarket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadPublicSearch.mockResolvedValue({ available: false, query: truth.name, observed_at: '2026-09-17T12:00:00Z', search_url: '', entries: [], unavailable_reason: 'Ranking público não verificado' })
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
          buy_box_winner: { item_id: 'MLB100' },
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
          buy_box_winner: { item_id: 'MLB200' },
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

  it('propaga a coleta pública ao benchmark da oferta exata', async () => {
    const snapshot = { available: true, query: truth.name, observed_at: '2026-09-17T12:00:00Z', search_url: 'https://lista.mercadolivre.com.br/caneta', entries: [{ position: 2, organic_position: 1, sponsored: false, item_id: 'MLB200', catalog_product_id: null, title: 'Caneta', url: 'https://produto.mercadolivre.com.br/MLB-200-caneta_JM', bestseller_badge: false, sold_quantity: null }] }
    mocks.loadPublicSearch.mockResolvedValue(snapshot)
    const result = await researchMarket('token', truth.name, { sourceCategoryId: truth.source_category_id, sourceDomainId: truth.source_domain_id, truth })
    expect(mocks.loadPublicSearch).toHaveBeenCalledWith(truth.name)
    expect(result.public_search).toEqual(snapshot)
    expect(result.benchmark?.primary?.evidence.some(e => e.includes('Busca pública: posição observada #2'))).toBe(true)
  })

  it('preserva categoria/domínio da URL e não chama catálogo sem oferta de concorrente', async () => {
    const result = await researchMarket('token', truth.name, {
      sourceCategoryId: truth.source_category_id,
      sourceDomainId: truth.source_domain_id,
      domainHint: truth.category_hint,
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
    const discoveryPath = mocks.mlGet.mock.calls.map(([path]) => String(path)).find(path => path.startsWith('/sites/MLB/domain_discovery/search'))
    expect(decodeURIComponent(discoveryPath || '')).toContain('Ferramentas Automotivas > Diagnóstico e Testes')
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

  it('usa somente fotos de correspondências exatas autorizadas como fonte factual', () => {
    const urls = exactProductReferenceUrls({
      catalog_matches: [
        { pictures: ['https://cdn.example/exact.jpg'], match_class: 'EXACT_PRODUCT', usable_as_fact_source: true },
      ],
      competitors: [
        { pictures: ['https://cdn.example/exact.jpg', 'https://cdn.example/exact-2.jpg'], match_class: 'EXACT_PRODUCT', usable_as_fact_source: true },
        { pictures: ['https://cdn.example/comparable.jpg'], match_class: 'COMPARABLE_PRODUCT', usable_as_fact_source: false },
      ],
    } as ResearchResult)

    expect(urls).toEqual(['https://cdn.example/exact.jpg', 'https://cdn.example/exact-2.jpg'])
  })

  it('prioriza referências exatas com sinais oficiais de melhor vendedor', () => {
    const urls = exactProductReferenceUrls({
      catalog_matches: [
        { pictures: ['https://cdn.example/catalog.jpg'], match_class: 'EXACT_PRODUCT', usable_as_fact_source: true, product_match_confidence: 0.99 },
      ],
      competitors: [
        {
          pictures: ['https://cdn.example/ordinary.jpg'], match_class: 'EXACT_PRODUCT', usable_as_fact_source: true,
          product_match_confidence: 0.99, highlight_position: null, search_position: 4,
          competitive_reference_strength: 70, seller: null,
        },
        {
          pictures: ['https://cdn.example/best-seller.jpg'], match_class: 'EXACT_PRODUCT', usable_as_fact_source: true,
          product_match_confidence: 0.99, highlight_position: 1, search_position: 1,
          competitive_reference_strength: 95,
          seller: { official_store: true, power_seller_status: 'platinum', transactions_total: 10000 },
        },
      ],
    } as ResearchResult)

    expect(urls[0]).toBe('https://cdn.example/best-seller.jpg')
    expect(urls).toContain('https://cdn.example/catalog.jpg')
  })

  it('expands exact marketplace pictures without loading offer facts', async () => {
    mocks.mlGet.mockClear()
    const visualTruth: ProductTruth = {
      ...truth,
      source_item_id: 'MLB100',
      source_catalog_product_id: 'MLBP1',
      source_pictures: ['https://example.com/source-own.jpg'],
      source_permalink: 'https://produto.mercadolivre.com.br/MLB-100',
    }

    const candidates = await searchMarketplaceVisualReferences('token', visualTruth, 8)

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'ML_SOURCE',
        image_url: 'https://example.com/source-own.jpg',
        source_item_id: 'MLB100',
      }),
      expect.objectContaining({
        source: 'ML_SOURCE',
        image_url: 'https://example.com/catalog.jpg',
        source_catalog_product_id: 'MLBP1',
      }),
      expect.objectContaining({
        source: 'ML_COMPETITOR',
        image_url: 'https://example.com/competitor.jpg',
        source_item_id: 'MLB200',
      }),
    ]))
    expect(mocks.mlGet.mock.calls.map(([path]) => String(path)).some(path => path.endsWith('/items'))).toBe(false)
  })
})
