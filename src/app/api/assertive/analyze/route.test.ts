import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  body: {} as Record<string, unknown>,
  inserted: null as Record<string, unknown> | null,
  updated: null as Record<string, unknown> | null,
  identifyProduct: vi.fn(),
  observeAnalysisStage: vi.fn(),
  getOwnedAssets: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({ response: null, authorizedUser: { id: 'user-1' } }),
  readJson: vi.fn().mockImplementation(async () => ({ body: mocks.body })),
}))
vi.mock('@/lib/assertive/truth', () => ({
  identifyProduct: mocks.identifyProduct,
}))
vi.mock('@/lib/assertive/publisher', () => ({
  getValidMLToken: vi.fn().mockResolvedValue('token'),
}))
vi.mock('@/lib/assertive/pipeline', () => ({
  getUserAIConfig: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/assertive/observability', () => ({
  observeAnalysisStage: mocks.observeAnalysisStage,
}))
vi.mock('@/lib/assertive/image-assets', () => ({
  getOwnedAssets: mocks.getOwnedAssets,
  isPublicationAssetAllowed: (asset: { public_url?: string; fidelity_status?: string }) => Boolean(asset.public_url) && asset.fidelity_status === 'ACCEPT',
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (value: Record<string, unknown>) => {
        mocks.inserted = value
        return { select: () => ({ single: async () => ({ data: { id: 'analysis-1' }, error: null }) }) }
      },
      update: (value: Record<string, unknown>) => {
        mocks.updated = value
        return { eq: () => ({ eq: async () => ({ error: null }) }) }
      },
    }),
  }),
}))

const { POST } = await import('./route')

const truth = {
  name: 'Caneta de polaridade Kitest KA250',
  fields: {},
  uncertain: [],
  evidence: ['fixture'],
  confidence: 1,
  identity: {
    name: 'Caneta de polaridade Kitest KA250',
    product_type: 'Caneta de polaridade',
    function: 'Testar circuitos automotivos',
    brand: 'Kitest',
    model: 'KA250',
    family_or_line: null,
    variant: null,
    voltage: null,
    kit_pack: null,
    dimensions: null,
    condition: null,
    gtin: null,
    seller_sku: null,
    confidence: 1,
    evidence: ['fixture'],
    unknowns: [],
    conflicts: [],
  },
}

describe('POST /api/assertive/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.inserted = null
    mocks.updated = null
    mocks.identifyProduct.mockResolvedValue(truth)
    mocks.observeAnalysisStage.mockImplementation(async (_context, task) => task())
    mocks.getOwnedAssets.mockResolvedValue([])
  })

  it.each([
    [
      { input_type: 'description', description: 'Caneta de polaridade Kitest KA250' },
      { type: 'description', description: 'Caneta de polaridade Kitest KA250' },
    ],
    [
      { input_type: 'url', url: 'https://www.mercadolivre.com.br/produto/up/MLBU123' },
      { type: 'url', url: 'https://www.mercadolivre.com.br/produto/up/MLBU123' },
    ],
    [
      { input_type: 'gtin', gtin: '7898559182505' },
      { type: 'gtin', gtin: '7898559182505' },
    ],
    [
      { input_type: 'brand_model', brand: 'Kitest', model: 'KA250' },
      { type: 'brand_model', brand: 'Kitest', model: 'KA250' },
    ],
    [
      { input_type: 'single_image', photos: ['https://example.com/one.jpg'] },
      { type: 'single_image', photos: ['https://example.com/one.jpg'], context: undefined },
    ],
    [
      { input_type: 'multi_image', photos: ['https://example.com/one.jpg', 'https://example.com/two.jpg'] },
      { type: 'multi_image', photos: ['https://example.com/one.jpg', 'https://example.com/two.jpg'], context: undefined },
    ],
  ])('normaliza %s no mesmo pipeline canônico', async (body, expectedInput) => {
    mocks.body = body

    const response = await POST(new Request('http://localhost/analyze', { method: 'POST' }) as never)

    expect(response.status).toBe(200)
    expect(mocks.identifyProduct).toHaveBeenCalledWith(null, expectedInput, 'token')
    expect(mocks.observeAnalysisStage).toHaveBeenCalledWith(
      expect.objectContaining({ analysis_id: 'analysis-1', stage: 'identity', metadata: { input_type: body.input_type } }),
      expect.any(Function)
    )
    expect(mocks.updated).toMatchObject({ product_name: truth.name, product_truth: truth, status: 'researching' })
    expect(mocks.inserted?.input_data).toMatchObject(body)
  })

  it('resolve somente assets pertencentes ao usuário para a análise por foto', async () => {
    mocks.body = { input_type: 'single_image', photo_asset_ids: ['rendition-1'] }
    mocks.getOwnedAssets.mockResolvedValue([{ id: 'rendition-1', public_url: 'https://cdn.example/rendition.jpg', fidelity_status: 'ACCEPT' }])

    const response = await POST(new Request('http://localhost/analyze', { method: 'POST' }) as never)

    expect(response.status).toBe(200)
    expect(mocks.getOwnedAssets).toHaveBeenCalledWith('user-1', ['rendition-1'])
    expect(mocks.identifyProduct).toHaveBeenCalledWith(null, {
      type: 'single_image', photos: ['https://cdn.example/rendition.jpg'], context: undefined,
    }, 'token')
    expect(mocks.inserted?.input_data).toMatchObject({ photo_asset_ids: ['rendition-1'] })
  })

  it('rejeita asset ausente ou de outro usuário', async () => {
    mocks.body = { input_type: 'single_image', photo_asset_ids: ['foreign-asset'] }
    mocks.getOwnedAssets.mockResolvedValue([])

    const response = await POST(new Request('http://localhost/analyze', { method: 'POST' }) as never)

    expect(response.status).toBe(400)
    expect(mocks.identifyProduct).not.toHaveBeenCalled()
  })
})
