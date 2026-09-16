import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadAnalysis: vi.fn(),
  runResearch: vi.fn(),
  runGeneration: vi.fn(),
  updateAnalysis: vi.fn(),
  getUserAIConfig: vi.fn(),
  identifyFromUrl: vi.fn(),
  getValidMLToken: vi.fn(),
  tryAcquireAnalysisLock: vi.fn(),
  releaseAnalysisLock: vi.fn(),
  resetAnalysisProcessing: vi.fn(),
}))

vi.mock('@/lib/assertive/concurrency', () => ({
  tryAcquireAnalysisLock: mocks.tryAcquireAnalysisLock,
  releaseAnalysisLock: mocks.releaseAnalysisLock,
  resetAnalysisProcessing: mocks.resetAnalysisProcessing,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({
    response: null,
    authorizedUser: { id: 'user-1' },
  }),
  readJson: vi.fn().mockResolvedValue({
    body: {
      from: 'researching',
      answers: {},
    },
  }),
}))
vi.mock('@/lib/assertive/pipeline', () => ({
  loadAnalysis: mocks.loadAnalysis,
  runResearch: mocks.runResearch,
  runGeneration: mocks.runGeneration,
  updateAnalysis: mocks.updateAnalysis,
  getUserAIConfig: mocks.getUserAIConfig,
}))
vi.mock('@/lib/assertive/truth', () => ({
  applyUserAnswers: (truth: unknown) => truth,
  identifyFromUrl: mocks.identifyFromUrl,
  isProtectedField: (field: { source?: string; status?: string }) =>
    field.source === 'user' || field.status === 'USER_OVERRIDE',
}))
vi.mock('@/lib/assertive/publisher', () => ({
  MLNotConnectedError: class MLNotConnectedError extends Error {},
  getValidMLToken: mocks.getValidMLToken,
}))

import { POST } from './route'

const staleAnalysis = {
  id: '3f71e2e6-c94c-4e17-81e1-e556cb494022',
  user_id: 'user-1',
  product_name: 'Testador de Pulso de Bico Injetor Kitest KA-250 12V/24V',
  category_id: null,
  domain_id: null,
  input_type: 'url' as const,
  input_data: {
    ml_url: 'https://www.mercadolivre.com.br/kitest-ka250-testador-pulso-bico-fino-12v-24v/up/MLBU3146884103',
  },
  product_truth: {
    name: 'Testador de Pulso de Bico Injetor Kitest KA-250 12V/24V',
    fields: {
      brand: { value: 'Kitest', source: 'description', confidence: 'confirmed', evidence: 'slug' },
      model: { value: 'KA-250', source: 'description', confidence: 'confirmed', evidence: 'slug' },
    },
    uncertain: [],
    evidence: ['slug'],
    confidence: 1,
  },
  research: {},
  dna: {},
  photos: [],
  status: 'failed',
  error_message: 'A pesquisa de mercado ainda não foi executada.',
  created_at: '2026-09-08T22:29:49.170Z',
  updated_at: '2026-09-08T22:30:13.492Z',
}

const refreshedTruth = {
  name: 'Kitest Ka250 Testador Pulso Bico Fino 12v 24v',
  fields: {
    brand: { value: 'Kitest', source: 'ml_item', confidence: 'confirmed', evidence: 'ML item' },
    model: { value: 'KA250', source: 'ml_item', confidence: 'confirmed', evidence: 'ML item title' },
  },
  uncertain: [],
  evidence: ['User product MLBU3146884103 e anúncio MLB4046224913'],
  confidence: 1,
  source_category_id: 'MLB60658',
  source_domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
  source_item_id: 'MLB4046224913',
  source_pictures: ['https://http2.mlstatic.com/D_1-O.jpg'],
}

const completedResearch = {
  query: 'Kitest KA-250 12V/24V',
  category_id: 'MLB60658',
  domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
  category_source: 'url_source',
  competitors: [],
}

describe('POST /api/assertive/analyses/[id]/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tryAcquireAnalysisLock.mockResolvedValue('lease-token')
    mocks.releaseAnalysisLock.mockResolvedValue(undefined)
    mocks.loadAnalysis.mockResolvedValue({ ...staleAnalysis })
    mocks.getUserAIConfig.mockResolvedValue(null)
    mocks.getValidMLToken.mockResolvedValue('ml-token')
    mocks.identifyFromUrl.mockResolvedValue(refreshedTruth)
    mocks.runResearch.mockImplementation(async (analysis: typeof staleAnalysis) => {
      if (!('source_item_id' in analysis.product_truth)) {
        throw new Error('URL source snapshot was not recovered')
      }
      return {
        research: completedResearch,
        dna: { description_structure: [] },
        truth: analysis.product_truth,
      }
    })
    mocks.runGeneration.mockImplementation(async (analysis: typeof staleAnalysis) => {
      if (!('query' in analysis.research)) {
        throw new Error('A pesquisa de mercado ainda não foi executada.')
      }
      return { listingId: 'listing-1', generated: { title: 'Kitest KA-250' } }
    })
  })

  it('runs a newly identified analysis awaiting research instead of rejecting its stage as busy', async () => {
    mocks.loadAnalysis.mockResolvedValue({ ...staleAnalysis, status: 'researching' })
    const response = await POST(new Request('http://localhost/test', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: staleAnalysis.id }),
    })
    expect(response.status).toBe(200)
    expect(mocks.runResearch).toHaveBeenCalledOnce()
    expect(mocks.updateAnalysis.mock.calls.some(call => call[2]?.status === 'processing')).toBe(false)
    expect(mocks.releaseAnalysisLock).toHaveBeenCalledWith(staleAnalysis.id, 'user-1', 'lease-token')
  })

  it('does not alter the running analysis when another request owns its lease', async () => {
    mocks.tryAcquireAnalysisLock.mockResolvedValue(null)
    const response = await POST(new Request('http://localhost/test', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: staleAnalysis.id }),
    })
    expect(response.status).toBe(409)
    expect(mocks.runResearch).not.toHaveBeenCalled()
    expect(mocks.updateAnalysis).not.toHaveBeenCalled()
    expect(mocks.releaseAnalysisLock).not.toHaveBeenCalled()
  })

  it('records failure and releases the lease when the pipeline throws', async () => {
    mocks.runResearch.mockRejectedValueOnce(new Error('research failed'))
    const response = await POST(new Request('http://localhost/test', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: staleAnalysis.id }),
    })
    expect(response.status).toBe(500)
    expect(mocks.updateAnalysis).toHaveBeenCalledWith(staleAnalysis.id, 'user-1', {
      status: 'failed', error_message: 'research failed',
    })
    expect(mocks.releaseAnalysisLock).toHaveBeenCalledWith(staleAnalysis.id, 'user-1', 'lease-token')
  })

  it('recupera snapshot URL legado, inicia research e entrega o draft ao editor no mesmo request', async () => {
    const request = new Request('http://localhost/api/assertive/analyses/3f71e2e6-c94c-4e17-81e1-e556cb494022/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'researching', answers: {} }),
    })

    const response = await POST(request as never, {
      params: Promise.resolve({ id: staleAnalysis.id }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, listing_id: 'listing-1' })
  })
})
