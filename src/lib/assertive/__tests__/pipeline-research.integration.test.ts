import { beforeEach, describe, expect, it, vi } from 'vitest'

const database = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  forceError: false,
}))
const observeAnalysisStage = vi.hoisted(() => vi.fn())

const researchFixture = vi.hoisted(() => ({
  query: 'Kitest KA-250 12V 24V',
  domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
  domain_name: 'Ferramentas e materiais de construção',
  category_id: 'MLB60658',
  category_name: 'Outras ferramentas para veículos',
  category_source: 'url_source' as const,
  keywords: [],
  competitors: [],
  candidates_found: 0,
  price_stats: null,
  price_basis: 'NONE' as const,
  exact_product_count: 0,
  competitor_matrix: {},
  regional: { states: [], cities: [] },
  warnings: [],
}))

const actualAnalysisColumns = new Set([
  'id', 'user_id', 'product_name', 'category_id', 'domain_id', 'input_type',
  'input_data', 'identified_data', 'competitors', 'status', 'created_at',
  'updated_at', 'product_truth', 'research', 'dna', 'error_message', 'photos',
])

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const builder = {
          eq: () => builder,
          then: (
            onFulfilled: (value: { data: null; error: null | { message: string } }) => unknown,
            onRejected?: (reason: unknown) => unknown
          ) => {
            const unknownColumn = Object.keys(patch).find(key => !actualAnalysisColumns.has(key))
            const error = database.forceError
              ? { message: 'database unavailable' }
              : unknownColumn
                ? { message: `Could not find the '${unknownColumn}' column` }
                : null
            if (!error) Object.assign(database.row, patch)
            return Promise.resolve({ data: null, error }).then(onFulfilled, onRejected)
          },
        }
        return builder
      },
    }),
  }),
}))
vi.mock('../publisher', () => ({
  requireMLToken: vi.fn().mockResolvedValue('ml-token'),
  getSellerCapabilities: vi.fn(),
  buildItemPayload: vi.fn(),
  buildItemPayloadWithMeta: vi.fn(),
  predictMLTitle: vi.fn(),
  getAutoAppendedAttributeIds: vi.fn(),
  validateListing: vi.fn(),
}))
vi.mock('../research', async importOriginal => {
  const actual = await importOriginal<typeof import('../research')>()
  return {
    ...actual,
    researchMarket: vi.fn().mockResolvedValue(researchFixture),
  }
})
vi.mock('../dna', () => ({
  extractDNA: vi.fn().mockReturnValue({
    title_patterns: [],
    mandatory_keywords: [],
    description_structure: [],
    differentiation_opportunities: [],
    photo_patterns: [],
    common_attributes: {},
  }),
}))
vi.mock('../observability', () => ({
  observeAnalysisStage,
  recordAnalysisStageEvent: vi.fn().mockResolvedValue(true),
}))

import { runResearch, updateAnalysis, type AnalysisRow } from '../pipeline'

const initialAnalysis: AnalysisRow = {
  id: '3f71e2e6-c94c-4e17-81e1-e556cb494022',
  user_id: 'user-1',
  product_name: 'Kitest Ka250 Testador Pulso Bico Fino 12v 24v',
  category_id: null,
  domain_id: null,
  input_type: 'url',
  input_data: { ml_url: 'https://example.test/up/MLBU3146884103' },
  product_truth: {
    name: 'Kitest Ka250 Testador Pulso Bico Fino 12v 24v',
    fields: {},
    uncertain: [],
    evidence: [],
    confidence: 1,
    source_category_id: 'MLB60658',
    source_item_id: 'MLB4046224913',
    source_pictures: ['https://http2.mlstatic.com/D_1-O.jpg'],
  },
  research: {},
  dna: {},
  photos: [],
  status: 'researching',
  error_message: null,
  created_at: '2026-09-08T22:29:49.170Z',
  updated_at: '2026-09-08T22:29:49.170Z',
}

describe('runResearch - persistência real do estágio', () => {
  beforeEach(() => {
    database.forceError = false
    observeAnalysisStage.mockReset().mockImplementation(async (_context, task) => task())
    for (const key of Object.keys(database.row)) delete database.row[key]
    Object.assign(database.row, initialAnalysis)
  })

  it('persiste research e avança para generating usando apenas colunas existentes', async () => {
    await runResearch(initialAnalysis)

    expect(database.row.research).toMatchObject({
      query: 'Kitest KA-250 12V 24V',
      category_id: 'MLB60658',
      category_source: 'url_source',
    })
    expect(database.row.category_id).toBe('MLB60658')
    expect(database.row.status).toBe('generating')
    expect(observeAnalysisStage.mock.calls.map(([context]) => context.stage)).toEqual(['research', 'dna'])
  })

  it('propaga falha de persistência em vez de continuar com estado vazio', async () => {
    database.forceError = true

    await expect(updateAnalysis(initialAnalysis.id, initialAnalysis.user_id, { status: 'researching' }))
      .rejects.toThrow('database unavailable')
  })
})
