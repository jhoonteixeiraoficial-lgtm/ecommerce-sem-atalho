import { beforeEach, describe, expect, it, vi } from 'vitest'

const runTaskJson = vi.hoisted(() => vi.fn())
vi.mock('../ai-router', async importOriginal => ({
  ...(await importOriginal<typeof import('../ai-router')>()),
  runTaskJson,
}))
import { collectAndClassifyPhotos } from '../photos'
import type { ResearchResult } from '../research'
import type { ProductTruth } from '../truth'

const truth: ProductTruth = {
  name: 'Caneta de polaridade Kitest KA250',
  fields: {
    brand: { value: 'Kitest', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
    model: { value: 'KA250', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte' },
  },
  uncertain: [],
  evidence: ['fonte'],
  confidence: 1,
  source_item_id: 'MLB4046224913',
}

const exactCompetitor = {
  product_id: 'MLBP1',
  item_id: 'MLB999',
  domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
  category_id: 'MLB60658',
  title: 'Caneta de polaridade Kitest KA250',
  family_name: null,
  price: 100,
  price_range: { min: 100, max: 100 },
  currency_id: 'BRL',
  condition: 'new',
  listing_type_id: 'gold_special',
  warranty: null,
  seller: null,
  offers_count: 1,
  pictures: ['https://competitor.example/wrong-final.jpg'],
  picture_count: 1,
  attributes: { BRAND: 'Kitest', MODEL: 'KA250' },
  attribute_count: 2,
  short_description: null,
  main_features: [],
  shipping: { free_shipping: false, logistic_type: null, fulfillment: false, mode: null },
  region: null,
  highlight_position: null,
  search_position: 0,
  catalog_required: false,
  competitive_reference_strength: 80,
  strength_evidence: [],
  product_match_confidence: 55,
  match_class: 'EXACT_PRODUCT' as const,
  match_reasons: ['Marca e modelo idênticos'],
  usable_as_fact_source: true,
  exposure: 'UNKNOWN' as const,
}

const research = {
  query: truth.name,
  domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
  domain_name: null,
  category_id: 'MLB60658',
  category_name: 'Outras ferramentas para veículos',
  category_source: 'url_source' as const,
  category_resolution: {
    category_id: 'MLB60658', category_name: 'Outras ferramentas para veículos',
    domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES', source: 'url_source' as const,
    confidence: 1, candidates: [], reasons: [], warnings: [],
  },
  keywords: [],
  competitors: [exactCompetitor],
  catalog_matches: [],
  candidates_found: 1,
  price_stats: null,
  price_basis: 'NONE' as const,
  exact_product_count: 1,
  exact_catalog_count: 0,
  competitor_matrix: {},
  regional: { status: 'NOT_SUPPORTED' as const, note: '', states: [], fulfillment_pct: 0, free_shipping_pct: 0 },
  warnings: [],
} satisfies ResearchResult

describe('photo pipeline safety', () => {
  beforeEach(() => runTaskJson.mockReset().mockResolvedValue([]))

  it('classifica fotos do vendedor enviando os anexos reais', async () => {
    const userPhotos = ['https://seller.example/1.jpg', 'https://seller.example/2.jpg']
    runTaskJson.mockResolvedValue([
      { role: 'MAIN', is_duplicate: false, quality: 90 },
      { role: 'DETAIL', is_duplicate: false, quality: 80 },
    ])

    await collectAndClassifyPhotos({ research, truth, config: null, userPhotos })

    expect(runTaskJson.mock.calls[0][4].images).toEqual(userPhotos)
    expect(runTaskJson.mock.calls[0][3]).not.toContain(userPhotos[0])
  })

  it('nunca coloca foto de concorrente na galeria final sem confirmação', async () => {
    const result = await collectAndClassifyPhotos({
      research,
      truth,
      config: null,
      userPhotos: ['https://seller.example/user.jpg'],
      sourcePhotos: [],
    })

    expect(result.photos.map(photo => photo.url)).toEqual(['https://seller.example/user.jpg'])
    expect(result.stats.from_competitor).toBe(0)
    expect(result.photo_gap.reference_candidates).toBe(1)
    expect(result.photo_gap.missing_roles).toEqual(
      expect.arrayContaining(['Detalhe técnico', 'Em uso', 'Embalagem'])
    )
  })

  it('mantém fotos de URL externa apenas como referência sem direito presumido', async () => {
    const sourcePhotos = Array.from({ length: 5 }, (_, index) => `https://source.example/${index + 1}.jpg`)
    const result = await collectAndClassifyPhotos({ research, truth, config: null, sourcePhotos })

    expect(result.photos).toEqual([])
    expect(result.photo_gap.missing_count).toBeGreaterThan(0)
  })

  it('rejeita fotos de fonte sem identidade verificável', async () => {
    const unverifiedTruth: ProductTruth = {
      ...truth,
      fields: {},
      source_item_id: undefined,
    }

    const result = await collectAndClassifyPhotos({
      research,
      truth: unverifiedTruth,
      config: null,
      sourcePhotos: ['https://unknown.example/product.jpg'],
    })

    expect(result.photos).toEqual([])
    expect(result.fidelity_check).toBeUndefined()
  })
})
