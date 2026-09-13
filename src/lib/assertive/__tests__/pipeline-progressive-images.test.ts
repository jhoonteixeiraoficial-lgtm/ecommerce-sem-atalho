import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const generateListing = vi.hoisted(() => vi.fn())
const collectAndClassifyPhotos = vi.hoisted(() => vi.fn())
const buildAnalysisListingGallery = vi.hoisted(() => vi.fn())
const attachListingImages = vi.hoisted(() => vi.fn())
const database = vi.hoisted(() => ({
  previous: null as Record<string, unknown> | null,
  listingInsert: null as Record<string, unknown> | null,
  listingUpdate: null as Record<string, unknown> | null,
  listingDeletes: 0,
  bootstrapSlots: [] as Array<Record<string, unknown>>,
  persistedJobs: [] as Array<Record<string, unknown>>,
}))

function queryBuilder(table: string) {
  let operation = 'select'
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    select: () => builder,
    update: (patch: Record<string, unknown>) => {
      operation = 'update'
      if (table === 'assertive_listings') database.listingUpdate = patch
      return builder
    },
    delete: () => {
      operation = 'delete'
      if (table === 'assertive_listings') database.listingDeletes++
      return builder
    },
    insert: (payload: Record<string, unknown>) => {
      operation = 'insert'
      if (table === 'assertive_listings') database.listingInsert = payload
      return builder
    },
    eq: () => builder,
    is: () => builder,
    maybeSingle: async () => ({
      data: table === 'assertive_listings' ? database.previous : null,
      error: null,
    }),
    single: async () => ({
      data: { id: operation === 'update' ? database.previous?.id : 'listing-new' },
      error: null,
    }),
    then: (resolve: (value: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
  })
  return builder
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => queryBuilder(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'assertive_bootstrap_image_jobs') {
        database.bootstrapSlots = args.p_slots as Array<Record<string, unknown>>
        database.persistedJobs = [
          { kind: 'REFERENCE_SEARCH', position: null },
          ...database.bootstrapSlots.map(slot => ({ kind: 'GENERATE_SLOT', position: slot.position })),
        ]
      }
      return { data: null, error: null }
    },
  }),
}))
vi.mock('../taxonomy', () => ({
  getCategory: vi.fn(async () => ({ id: 'MLB123', name: 'Ferramentas', settings: { max_pictures_per_item: 12 } })),
  getCategoryAttributes: vi.fn().mockResolvedValue([]),
  getCategorySaleTerms: vi.fn().mockResolvedValue([]),
  classifyAttributes: vi.fn().mockReturnValue([]),
  maxTitleLength: vi.fn().mockReturnValue(60),
  discoverDomain: vi.fn().mockResolvedValue([]),
}))
vi.mock('../publisher', () => ({
  requireMLToken: vi.fn().mockResolvedValue('ml-token'),
  getSellerCapabilities: vi.fn().mockResolvedValue(null),
  getSellerShippingPreferences: vi.fn().mockResolvedValue(null),
  buildItemPayload: vi.fn().mockReturnValue({}),
  buildItemPayloadWithMeta: vi.fn(),
  predictMLTitle: vi.fn().mockReturnValue('Furadeira Bosch GSB 13 RE'),
  getAutoAppendedAttributeIds: vi.fn().mockReturnValue([]),
  validateListing: vi.fn().mockResolvedValue({ valid: true, issues: [] }),
  resolveShippingMode: vi.fn().mockReturnValue('me2'),
  hasMandatoryFreeShippingIssue: vi.fn().mockReturnValue(false),
}))
vi.mock('../generator', () => ({ generateListing }))
vi.mock('../research', () => ({
  exactFactSources: vi.fn().mockReturnValue([]),
  exactProductReferenceUrls: vi.fn().mockReturnValue([]),
  researchMarket: vi.fn(),
}))
vi.mock('../enrichment', () => ({
  enrichAttributes: vi.fn().mockResolvedValue({
    attributes: [],
    remaining: [],
    stats: {
      applicable: 0,
      already_filled: 0,
      from_exact_product: 0,
      from_derivation: 0,
      from_web: 0,
      inferred_needs_confirmation: 0,
      not_applicable: 0,
      unknown: 0,
      user_input_required: 0,
      auto_fill_percent: 100,
    },
    web: { used: false, sources: [], queries: [] },
    reasoning_provider: 'nenhum',
  }),
}))
vi.mock('../scoring', () => ({
  computeCompleteness: vi.fn().mockReturnValue({ percent: 100, missing_required: [] }),
  computeScores: vi.fn().mockReturnValue({ overall: 80 }),
}))
vi.mock('../photos', () => ({ collectAndClassifyPhotos }))
vi.mock('../image-pipeline', () => ({ buildAnalysisListingGallery }))
vi.mock('../image-assets', () => ({
  attachListingImages,
  isPublicationAssetAllowed: vi.fn().mockReturnValue(false),
}))
vi.mock('../copy-brief', () => ({
  buildCopyBrief: vi.fn().mockReturnValue({
    facts: [
      { id: 'product_type', label: 'Produto', value: 'Furadeira de impacto' },
      { id: 'brand', label: 'Marca', value: 'Bosch' },
    ],
  }),
}))
vi.mock('../observability', () => ({
  observeAnalysisStage: vi.fn(async (_context, task) => task()),
  recordAnalysisStageEvent: vi.fn().mockResolvedValue(true),
}))

import {
  normalizeProgressiveImagePlan,
  runGeneration,
  type AnalysisRow,
} from '../pipeline'

function analysisFixture(): AnalysisRow {
  return {
    id: 'analysis-1',
    user_id: 'user-1',
    product_name: 'Furadeira Bosch GSB 13 RE',
    category_id: 'MLB123',
    domain_id: null,
    input_type: 'url',
    input_data: { photo_asset_ids: ['private-upload'] },
    photos: ['https://private.example/upload.jpg'],
    product_truth: {
      name: 'Furadeira Bosch GSB 13 RE',
      fields: {
        product_type: { value: 'Furadeira de impacto', confidence: 'confirmed', source: 'url', evidence: 'Fonte exata', status: 'CONFIRMED' },
        brand: { value: 'Bosch', confidence: 'confirmed', source: 'url', evidence: 'Fonte exata', status: 'CONFIRMED' },
      },
      uncertain: [],
      evidence: [],
      confidence: 0.95,
      source_item_id: 'MLB54005757',
      source_catalog_product_id: 'MLB54005757',
      source_pictures: Array.from({ length: 11 }, (_, index) => `https://http2.mlstatic.com/${index}.jpg`),
    },
    research: {
      query: 'Furadeira Bosch GSB 13 RE',
      category_id: 'MLB123',
      category_name: 'Ferramentas',
      category_source: 'url_source',
      category_resolution: {},
      domain_id: null,
      domain_name: null,
      keywords: [],
      competitors: [],
      catalog_matches: [],
      candidates_found: 0,
      price_stats: null,
      price_basis: 'NONE',
      exact_product_count: 0,
      exact_catalog_count: 0,
      competitor_matrix: {},
      regional: { status: 'NOT_SUPPORTED', note: '', states: [], fulfillment_pct: 0, free_shipping_pct: 0 },
      warnings: [],
    },
    dna: {
      title_patterns: [],
      important_keywords: [],
      must_have_attributes: [],
      high_value_attributes: [],
      description_structure: [],
      image_patterns: {},
      price_context: null,
      logistics_patterns: {},
      common_weaknesses: [],
      opportunities: [],
      references_analyzed: 0,
    },
    status: 'generating',
    error_message: null,
    created_at: '',
    updated_at: '',
  } as unknown as AnalysisRow
}

describe('progressive image bootstrap in runGeneration', () => {
  beforeEach(() => {
    vi.stubEnv('ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED', 'true')
    database.previous = null
    database.listingInsert = null
    database.listingUpdate = null
    database.listingDeletes = 0
    database.bootstrapSlots = []
    database.persistedJobs = []
    collectAndClassifyPhotos.mockReset().mockResolvedValue({
      photos: [{ url: 'https://legacy.example/photo.jpg', role: 'MAIN', source: 'USER', score: 100 }],
      stats: { total_found: 1, from_exact_product: 0, from_competitor: 0, classified: 1, deduplicated: 0 },
      category_requirements: { background: 'white_pure', min_photos: 4, recommended_photos: 6, shot_types: [] },
      photo_gap: { reference_candidates: 0, missing_count: 5, missing_roles: [], recommendations: [] },
    })
    buildAnalysisListingGallery.mockReset().mockResolvedValue({
      images: [],
      urls: ['https://legacy.example/photo.jpg'],
      listingImages: [],
      outcome: 'ready',
      reviewRequiredAssetIds: [],
      warning: null,
    })
    attachListingImages.mockReset().mockResolvedValue(undefined)
    generateListing.mockReset().mockResolvedValue({
      title: 'Furadeira Bosch GSB 13 RE',
      title_alternatives: [],
      family_name: 'Furadeira Bosch GSB 13 RE',
      description: 'Descrição confirmada da furadeira.',
      price: 499,
      price_rationale: '',
      attributes: [],
      missing_attributes: [],
      image_plan: [
        { order: 1, title: 'Capa', description: 'Produto em fundo branco', required: true },
        { order: 6, title: 'Dimensões', description: 'Mostrar dimensões do produto', required: false },
      ],
      category_id: 'MLB123',
      improvements: [],
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('persists an empty new gallery and bootstraps exactly seven resumable jobs', async () => {
    const result = await runGeneration(analysisFixture(), null)

    expect(result.listingId).toBe('listing-new')
    expect(database.listingInsert).toMatchObject({
      photos: [],
      attributes: {
        image_review: {
          outcome: 'progressive_pending',
          required_asset_ids: [],
          confirmed_asset_ids: [],
        },
      },
    })
    expect(database.persistedJobs).toHaveLength(7)
    expect(database.bootstrapSlots.map(slot => `${slot.position}:${slot.role}`)).toEqual([
      '0:MAIN',
      '1:DETAIL',
      '2:DETAIL',
      '3:LIFESTYLE',
      '4:LIFESTYLE',
      '5:INFORMATIONAL',
    ])
    expect(collectAndClassifyPhotos).not.toHaveBeenCalled()
    expect(buildAnalysisListingGallery).not.toHaveBeenCalled()
    expect(attachListingImages).not.toHaveBeenCalled()
  })

  it('keeps the synchronous gallery path available when the flag is false', async () => {
    vi.stubEnv('ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED', 'false')

    await runGeneration(analysisFixture(), null)

    expect(collectAndClassifyPhotos).toHaveBeenCalledOnce()
    expect(buildAnalysisListingGallery).toHaveBeenCalledOnce()
    expect(database.listingInsert).toMatchObject({ photos: ['https://legacy.example/photo.jpg'] })
    expect(database.persistedJobs).toEqual([])
  })

  it('updates an existing draft in place and preserves its gallery', async () => {
    database.previous = {
      id: 'listing-existing',
      status: 'needs_input',
      attributes: {
        list: [],
        image_review: {
          outcome: 'generated_pending_review',
          required_asset_ids: ['existing-generated'],
          confirmed_asset_ids: ['existing-generated'],
        },
      },
      photos: ['https://owned.example/existing.jpg'],
      price: 499,
      title: 'Título confirmado pelo vendedor',
      description: 'Descrição confirmada pelo vendedor',
      listing_type_id: 'gold_special',
      shipping_mode: 'me2',
      free_shipping: false,
      free_shipping_mandatory: false,
    }

    const result = await runGeneration(analysisFixture(), null)

    expect(result.listingId).toBe('listing-existing')
    expect(database.listingUpdate).toMatchObject({
      photos: ['https://owned.example/existing.jpg'],
      title: 'Título confirmado pelo vendedor',
      description: 'Descrição confirmada pelo vendedor',
      attributes: {
        image_review: {
          outcome: 'progressive_pending',
          required_asset_ids: ['existing-generated'],
          confirmed_asset_ids: ['existing-generated'],
        },
      },
    })
    expect(database.listingInsert).toBeNull()
    expect(database.listingDeletes).toBe(0)
    expect(database.persistedJobs).toHaveLength(7)
  })

  it('normalizes unsafe or missing image-plan steps into six fixed roles', () => {
    const slots = normalizeProgressiveImagePlan([
      { order: 6, title: 'Dimensões', description: 'Mostrar dimensões exatas', required: false },
    ], [])

    expect(slots.map(slot => `${slot.position}:${slot.role}`)).toEqual([
      '0:MAIN',
      '1:DETAIL',
      '2:DETAIL',
      '3:LIFESTYLE',
      '4:LIFESTYLE',
      '5:INFORMATIONAL',
    ])
    expect(slots[5].shot.title).toBe('Vista técnica segura')
  })
})
