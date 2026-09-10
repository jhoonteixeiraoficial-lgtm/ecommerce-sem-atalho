import { beforeEach, describe, expect, it, vi } from 'vitest'

const generateListing = vi.hoisted(() => vi.fn())
const analysisUpdates = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const observeAnalysisStage = vi.hoisted(() => vi.fn())
const recordAnalysisStageEvent = vi.hoisted(() => vi.fn())
const database = vi.hoisted(() => ({
  previous: null as Record<string, unknown> | null,
  listingInsert: null as Record<string, unknown> | null,
}))
const taxonomy = vi.hoisted(() => ({
  getCategory: vi.fn(async (_token: string, categoryId: string) => ({ id: categoryId, name: categoryId === 'MLB-NEW' ? 'Cadeiras' : 'Bebidas' })),
  getCategoryAttributes: vi.fn(async (_token: string, categoryId: string) => categoryId === 'MLB-NEW'
    ? [{ id: 'BRAND', name: 'Marca', value_type: 'string', tier: 'required', tags: { required: true } }]
    : [
        { id: 'SABOR', name: 'Sabor', value_type: 'string', tier: 'required', tags: { required: true } },
        { id: 'FORMATO_DO_SUCO', name: 'Formato do suco', value_type: 'string', tier: 'required', tags: { required: true } },
      ]),
  getCategorySaleTerms: vi.fn().mockResolvedValue([]),
  classifyAttributes: vi.fn((attrs: Array<Record<string, unknown>>) => attrs.map(attr => ({
    ...attr,
    fixedValues: false,
    isVariationOnly: false,
    readOnly: false,
  }))),
  discoverDomain: vi.fn().mockResolvedValue([{ category_id: 'MLB-NEW', category_name: 'Cadeiras' }]),
}))

function queryBuilder(table: string) {
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => builder,
    update: (patch: Record<string, unknown>) => {
      if (table === 'assertive_analyses') analysisUpdates.push(patch)
      return builder
    },
    delete: () => builder,
    insert: (payload: Record<string, unknown>) => {
      if (table === 'assertive_listings') database.listingInsert = payload
      return builder
    },
    eq: () => builder,
    is: () => builder,
    maybeSingle: async () => ({ data: table === 'assertive_listings' ? database.previous : null, error: null }),
    single: async () => ({ data: { id: 'listing-1' }, error: null }),
    then: (resolve: (value: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
  })
  return builder
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => queryBuilder(table) }),
}))
vi.mock('../taxonomy', () => ({
  ...taxonomy,
  maxTitleLength: () => 60,
}))
vi.mock('../publisher', () => ({
  requireMLToken: vi.fn().mockResolvedValue('token'),
  getSellerCapabilities: vi.fn().mockResolvedValue(null),
  buildItemPayload: vi.fn(),
  buildItemPayloadWithMeta: vi.fn(),
  predictMLTitle: vi.fn(),
  getAutoAppendedAttributeIds: vi.fn().mockReturnValue([]),
  validateListing: vi.fn(),
}))
vi.mock('../generator', () => ({ generateListing }))
vi.mock('../enrichment', () => ({
  enrichAttributes: vi.fn().mockResolvedValue({
    attributes: [], remaining: [],
    stats: { applicable: 0, already_filled: 0, from_exact_product: 0, from_derivation: 0, from_web: 0, inferred_needs_confirmation: 0, not_applicable: 0, unknown: 0, user_input_required: 0, auto_fill_percent: 0 },
    web: { used: false, sources: [], queries: [] }, reasoning_provider: 'nenhum',
  }),
}))
vi.mock('../scoring', () => ({
  computeCompleteness: vi.fn().mockReturnValue({ percent: 0, missing_required: [] }),
  computeScores: vi.fn().mockReturnValue({}),
}))
vi.mock('../photos', () => ({
  collectAndClassifyPhotos: vi.fn().mockResolvedValue({
    photos: [],
    stats: { total_found: 0, from_exact_product: 0, from_competitor: 0, classified: 0, deduplicated: 0 },
    category_requirements: { background: 'white_pure', min_photos: 4, recommended_photos: 6, shot_types: [] },
    photo_gap: { reference_candidates: 0, missing_count: 6, missing_roles: [], recommendations: [] },
  }),
}))
vi.mock('../observability', () => ({
  observeAnalysisStage,
  recordAnalysisStageEvent,
}))

import { runGeneration, type AnalysisRow } from '../pipeline'

describe('category sanity re-resolution', () => {
  beforeEach(() => {
    observeAnalysisStage.mockReset().mockImplementation(async (_context, task) => task())
    recordAnalysisStageEvent.mockReset().mockResolvedValue(true)
  })

  it('gera com o novo schema quando a categoria original tem hard mismatch', async () => {
    analysisUpdates.length = 0
    database.previous = null
    database.listingInsert = null
    generateListing.mockResolvedValue({
      title: 'Cadeira HomeNow Atlanta', title_alternatives: [], family_name: 'Cadeira HomeNow Atlanta',
      description: 'Descrição', price: null, price_rationale: '', attributes: [], missing_attributes: [],
      image_plan: [], category_id: 'MLB-NEW', improvements: [],
    })
    const analysis = {
      id: 'analysis-1', user_id: 'user-1', product_name: 'Cadeira HomeNow Atlanta',
      category_id: 'MLB-OLD', domain_id: null, input_type: 'url', input_data: {}, photos: [],
      product_truth: {
        name: 'Cadeira HomeNow Atlanta', fields: {}, uncertain: [], evidence: [], confidence: 1,
      },
      research: {
        query: 'Cadeira HomeNow Atlanta', category_id: 'MLB-OLD', category_name: 'Bebidas',
        category_source: 'url_source', category_resolution: {}, domain_id: null, domain_name: null,
        keywords: [], competitors: [], catalog_matches: [], candidates_found: 0, price_stats: null,
        price_basis: 'NONE', exact_product_count: 0, exact_catalog_count: 0, competitor_matrix: {},
        regional: { status: 'NOT_SUPPORTED', note: '', states: [], fulfillment_pct: 0, free_shipping_pct: 0 }, warnings: [],
      },
      dna: { title_patterns: [], important_keywords: [], must_have_attributes: [], high_value_attributes: [], description_structure: [], image_patterns: {}, price_context: null, logistics_patterns: {}, common_weaknesses: [], opportunities: [], references_analyzed: 0 },
      status: 'generating', error_message: null, created_at: '', updated_at: '',
    } as unknown as AnalysisRow

    await runGeneration(analysis, null)

    expect(generateListing).toHaveBeenCalledWith(expect.objectContaining({
      category: expect.objectContaining({ id: 'MLB-NEW' }),
      attributes: [expect.objectContaining({ id: 'BRAND' })],
    }))
    expect(analysisUpdates).toContainEqual(expect.objectContaining({
      category_id: 'MLB-NEW',
      research: expect.objectContaining({
        category_resolution: expect.objectContaining({
          category_id: 'MLB-NEW',
          source: 'sanity_reresolution',
        }),
      }),
    }))
    expect(observeAnalysisStage.mock.calls.map(([context]) => context.stage)).toEqual(
      expect.arrayContaining(['category_schema', 'generation', 'attribute_autofill', 'photos'])
    )
    expect(recordAnalysisStageEvent).toHaveBeenCalledWith(expect.objectContaining({
      stage: 'pricing', event: 'completed',
    }))
  })

  it('preserva título, descrição e preço já editados no rascunho', async () => {
    database.previous = {
      attributes: { list: [] },
      photos: [],
      price: 149.9,
      title: 'Título confirmado pelo vendedor',
      description: 'Descrição confirmada pelo vendedor',
    }
    database.listingInsert = null
    generateListing.mockResolvedValue({
      title: 'Título regenerado', title_alternatives: [], family_name: 'Produto',
      description: 'Descrição regenerada', price: 97, price_rationale: '', attributes: [], missing_attributes: [],
      image_plan: [], category_id: 'MLB-NEW', improvements: [],
    })
    const base = {
      id: 'analysis-2', user_id: 'user-1', product_name: 'Produto', category_id: 'MLB-NEW', domain_id: null,
      input_type: 'description', input_data: {}, photos: [],
      product_truth: { name: 'Produto', fields: {}, uncertain: [], evidence: [], confidence: 1 },
      research: {
        query: 'Produto', category_id: 'MLB-NEW', category_name: 'Cadeiras', category_source: 'domain_discovery',
        category_resolution: {}, domain_id: null, domain_name: null, keywords: [], competitors: [], catalog_matches: [],
        candidates_found: 0, price_stats: null, price_basis: 'NONE', exact_product_count: 0, exact_catalog_count: 0,
        competitor_matrix: {}, regional: { status: 'NOT_SUPPORTED', note: '', states: [], fulfillment_pct: 0, free_shipping_pct: 0 }, warnings: [],
      },
      dna: { title_patterns: [], important_keywords: [], must_have_attributes: [], high_value_attributes: [], description_structure: [], image_patterns: {}, price_context: null, logistics_patterns: {}, common_weaknesses: [], opportunities: [], references_analyzed: 0 },
      status: 'generating', error_message: null, created_at: '', updated_at: '',
    } as unknown as AnalysisRow

    await runGeneration(base, null)

    expect(database.listingInsert).toMatchObject({
      title: 'Título confirmado pelo vendedor',
      description: 'Descrição confirmada pelo vendedor',
      price: 149.9,
    })
  })
})
