import { describe, expect, it } from 'vitest'
import { dnaToPrompt, extractDNA } from '../dna'
import type { CompetitorDossier, ResearchResult } from '../research'

function competitor(
  productId: string,
  strength: number,
  attributes: Record<string, string>
): CompetitorDossier {
  return {
    product_id: productId,
    item_id: `MLB-${productId}`,
    domain_id: 'MLB-TOOLS',
    category_id: 'MLB60658',
    title: `Caneta de polaridade ${productId}`,
    family_name: null,
    price: 100,
    price_range: { min: 100, max: 100 },
    currency_id: 'BRL',
    condition: 'new',
    listing_type_id: 'gold_special',
    warranty: null,
    seller: null,
    offers_count: 1,
    pictures: [],
    picture_count: 5,
    attributes,
    attribute_count: Object.keys(attributes).length,
    short_description: null,
    main_features: [],
    shipping: { free_shipping: false, logistic_type: null, fulfillment: false, mode: null },
    region: null,
    highlight_position: null,
    search_position: null,
    catalog_required: false,
    competitive_reference_strength: strength,
    strength_evidence: [],
    product_match_confidence: 20,
    match_class: 'COMPARABLE_PRODUCT',
    match_reasons: [],
    usable_as_fact_source: false,
    exposure: 'UNKNOWN',
  }
}

function research(competitors: CompetitorDossier[]): ResearchResult {
  return {
    query: 'caneta polaridade',
    domain_id: 'MLB-TOOLS',
    domain_name: 'Ferramentas',
    category_id: 'MLB60658',
    category_name: 'Ferramentas para veículos',
    category_source: 'url_source',
    category_resolution: {
      category_id: 'MLB60658', category_name: 'Ferramentas para veículos', domain_id: 'MLB-TOOLS',
      source: 'url_source', confidence: 1, candidates: [], reasons: [], warnings: [],
    },
    keywords: [],
    competitors,
    catalog_matches: [],
    candidates_found: competitors.length,
    price_stats: { min: 90, max: 110, median: 100, avg: 100, sample_size: 2 },
    price_basis: 'EXACT_PRODUCT',
    exact_product_count: 2,
    exact_catalog_count: 2,
    competitor_matrix: {},
    regional: { status: 'NOT_SUPPORTED', note: '', states: [], fulfillment_pct: 0, free_shipping_pct: 0 },
    warnings: [],
  }
}

describe('winning listing DNA evidence', () => {
  it('identifica atributo diferencial comparando grupos sem sobreposição', () => {
    const result = extractDNA(research([
      competitor('forte-1', 100, { VIDEO: 'Sim' }),
      competitor('forte-2', 90, { VIDEO: 'Sim' }),
      competitor('fraco-1', 20, {}),
      competitor('fraco-2', 10, {}),
    ]))

    expect(result.high_value_attributes).toEqual([
      expect.objectContaining({ id: 'VIDEO', presence_pct: 50 }),
    ])
  })

  it('registra a base e a amostra da recomendação de preço sem expor valores concorrentes como fatos', () => {
    const market = research([competitor('ref', 100, { VOLTAGE: '220 V' })])
    const result = extractDNA(market)

    expect(result.price_context).toMatchObject({ basis: 'EXACT_PRODUCT', sample_size: 2 })
    expect(dnaToPrompt(result, market.competitors)).not.toContain('220 V')
  })
})
