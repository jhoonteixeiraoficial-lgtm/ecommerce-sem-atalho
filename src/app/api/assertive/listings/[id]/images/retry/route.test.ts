import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listing: {} as Record<string, unknown>,
  analysis: {} as Record<string, unknown>,
  updatePatch: null as Record<string, unknown> | null,
  buildGeneratedListingGallery: vi.fn(),
  attachListingImages: vi.fn(),
  recomputeListing: vi.fn(),
  events: [] as string[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({
    response: null,
    authorizedUser: { id: 'user-1' },
  }),
}))
vi.mock('@/lib/assertive/image-pipeline', () => ({
  buildGeneratedListingGallery: mocks.buildGeneratedListingGallery,
}))
vi.mock('@/lib/assertive/image-assets', () => ({ attachListingImages: mocks.attachListingImages }))
vi.mock('@/lib/assertive/pipeline', () => ({
  getUserAIConfig: vi.fn().mockResolvedValue(null),
  recomputeListing: mocks.recomputeListing,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: table === 'assertive_listings' ? mocks.listing : mocks.analysis }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        mocks.events.push('review-saved')
        mocks.updatePatch = patch
        Object.assign(mocks.listing, patch)
        return { eq: () => ({ eq: async () => ({ error: null }) }) }
      },
    }),
  }),
}))

const { POST } = await import('./route')

describe('POST /api/assertive/listings/[id]/images/retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listing = {
      id: 'listing-1', analysis_id: 'analysis-1', user_id: 'user-1', status: 'needs_input',
      title: 'Controle Sony DualSense',
      image_plan: [{ order: 1, title: 'Foto principal', description: 'Fundo branco', required: true }],
      attributes: { list: [], image_review: { required_asset_ids: ['generated-1'], confirmed_asset_ids: [] } },
    }
    mocks.analysis = {
      id: 'analysis-1', user_id: 'user-1', input_type: 'url', input_data: {},
      product_truth: {
        name: 'Controle Sony DualSense', confidence: 0.98,
        identity: { product_type: 'Controle', brand: 'Sony', model: 'DualSense' },
        fields: {
          product_type: { value: 'Controle', status: 'CONFIRMED' },
          brand: { value: 'Sony', status: 'CONFIRMED' },
          model: { value: 'DualSense', status: 'CONFIRMED' },
        },
        source_pictures: ['https://source.example/controller.jpg'],
      },
    }
    mocks.buildGeneratedListingGallery.mockResolvedValue({
      images: [{ asset_id: 'generated-2', url: 'https://cdn.example/generated-2.jpg' }],
      urls: ['https://cdn.example/generated-2.jpg'],
      listingImages: [{ asset_id: 'generated-2', position: 0, role: 'MAIN' }],
      reviewRequiredAssetIds: ['generated-2'],
      outcome: 'generated_pending_review',
    })
    mocks.attachListingImages.mockResolvedValue(undefined)
    mocks.attachListingImages.mockImplementation(async () => { mocks.events.push('gallery-attached') })
    mocks.recomputeListing.mockResolvedValue({ status: 'ready' })
    mocks.updatePatch = null
    mocks.events = []
  })

  it('gera outra opção, anexa e mantém o anúncio bloqueado para revisão', async () => {
    const response = await POST(new Request('http://localhost/retry', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.buildGeneratedListingGallery).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1', analysisId: 'analysis-1', referenceUrls: ['https://source.example/controller.jpg'],
      imagePlan: mocks.listing.image_plan, maxPictures: 7,
      generationEnabled: true, generationNonce: expect.any(String),
    }))
    expect(mocks.attachListingImages).toHaveBeenCalledWith('listing-1', 'user-1', [{
      asset_id: 'generated-2', position: 0, role: 'MAIN',
    }])
    expect(mocks.updatePatch).toMatchObject({
      status: 'needs_input',
      attributes: {
        image_review: { required_asset_ids: ['generated-2'], confirmed_asset_ids: [] },
      },
    })
    expect(mocks.updatePatch).not.toHaveProperty('photos')
    expect(mocks.events).toEqual(['review-saved', 'gallery-attached'])
  })

  it('usa o upload próprio quando não existe referência exata no mercado', async () => {
    const truth = mocks.analysis.product_truth as { source_pictures: string[] }
    truth.source_pictures = []
    mocks.analysis.input_data = { photo_asset_ids: ['rendition-1'] }

    const response = await POST(new Request('http://localhost/retry', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.buildGeneratedListingGallery).toHaveBeenCalledWith(expect.objectContaining({
      referenceUrls: [], referenceAssetIds: ['rendition-1'],
    }))
  })

  it('retorna falha explícita sem substituir a imagem atual', async () => {
    mocks.buildGeneratedListingGallery.mockResolvedValue({
      images: [], urls: [], listingImages: [], reviewRequiredAssetIds: [],
      outcome: 'generation_failed', warning: 'A imagem não preservou o produto.',
    })

    const response = await POST(new Request('http://localhost/retry', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toEqual({ error: 'A imagem não preservou o produto.' })
    expect(mocks.attachListingImages).not.toHaveBeenCalled()
    expect(mocks.updatePatch).toBeNull()
  })
})
