import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestListing extends Record<string, unknown> {
  title?: string
  attributes: Record<string, unknown> & {
    image_review?: { required_asset_ids: string[]; confirmed_asset_ids: string[] }
  }
}

const mocks = vi.hoisted(() => ({
  listing: { attributes: {} } as TestListing,
  update: vi.fn(),
  body: { asset_id: 'generated-1' } as Record<string, unknown>,
  findReviewJob: vi.fn(),
  confirmJob: vi.fn(),
  getSnapshot: vi.fn(),
}))

vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({ response: null, authorizedUser: { id: 'user-1' } }),
  readJson: vi.fn().mockImplementation(async () => ({ body: mocks.body })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.maybeSingle = async () => ({ data: mocks.listing, error: null })
        return chain
      },
      update: (patch: Record<string, unknown>) => {
        mocks.update(patch)
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
        return chain
      },
    }),
  }),
}))
vi.mock('@/lib/assertive/image-jobs', () => ({
  findImageReviewJob: mocks.findReviewJob,
  confirmImageJob: mocks.confirmJob,
  getImageJobSnapshot: mocks.getSnapshot,
}))

const { POST } = await import('./route')

describe('POST /api/assertive/listings/[id]/images/confirm', () => {
  beforeEach(() => {
    vi.stubEnv('ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED', 'true')
    vi.clearAllMocks()
    mocks.body = { asset_id: 'generated-1' }
    mocks.findReviewJob.mockReset().mockResolvedValue({ progressive: false, position: null })
    mocks.confirmJob.mockReset().mockResolvedValue(undefined)
    mocks.getSnapshot.mockReset().mockResolvedValue({ listing_id: 'listing-1', slots: [] })
    mocks.listing = {
      id: 'listing-1',
      status: 'needs_input',
      title: 'Controle Sony DualSense',
      price: 399.9,
      photos: ['https://cdn.example/generated.jpg'],
      attributes: {
        image_review: {
          required_asset_ids: ['generated-1'],
          confirmed_asset_ids: [],
        },
        photo_metadata: [{ asset_id: 'generated-1', source: 'AI_GENERATED' }],
      },
    }
  })

  afterEach(() => vi.unstubAllEnvs())

  it('confirma somente a imagem gerada anexada ao anúncio do usuário', async () => {
    const response = await POST(new Request('http://localhost/confirm', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready',
      validation: {},
      validated_payload: null,
      validated_payload_hash: null,
      attributes: expect.objectContaining({
        image_review: expect.objectContaining({ confirmed_asset_ids: ['generated-1'] }),
      }),
    }))
  })

  it('rejeita asset que não pertence à revisão pendente da galeria', async () => {
    mocks.body = { asset_id: 'other-asset' }

    const response = await POST(new Request('http://localhost/confirm', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('confirma uma posição progressiva somente pelo job REVIEW correspondente', async () => {
    mocks.findReviewJob.mockResolvedValue({ progressive: true, position: 2 })
    mocks.getSnapshot.mockResolvedValue({
      listing_id: 'listing-1',
      slots: [{ position: 2, status: 'SUCCEEDED', asset_id: 'generated-1' }],
    })

    const response = await POST(new Request('http://localhost/confirm', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.confirmJob).toHaveBeenCalledWith('listing-1', 'user-1', 2, 'generated-1')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(body.snapshot.slots[0].status).toBe('SUCCEEDED')
  })

  it('rejeita asset sem correspondência quando há jobs progressivos', async () => {
    mocks.findReviewJob.mockResolvedValue({ progressive: true, position: null })

    const response = await POST(new Request('http://localhost/confirm', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.confirmJob).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('usa a confirmação legada sem consultar jobs quando a flag está desligada', async () => {
    vi.stubEnv('ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED', 'false')
    mocks.findReviewJob.mockResolvedValue({ progressive: true, position: 2 })

    const response = await POST(new Request('http://localhost/confirm', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.findReviewJob).not.toHaveBeenCalled()
    expect(mocks.confirmJob).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledOnce()
  })

  it('não libera o anúncio quando ainda falta um campo essencial', async () => {
    mocks.listing.title = ''

    const response = await POST(new Request('http://localhost/confirm', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'needs_input' }))
  })
})
