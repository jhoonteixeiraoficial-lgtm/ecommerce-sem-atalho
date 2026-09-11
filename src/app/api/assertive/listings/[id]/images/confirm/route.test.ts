import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listing: {} as Record<string, any>,
  update: vi.fn(),
  body: { asset_id: 'generated-1' } as Record<string, unknown>,
}))

vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({ response: null, authorizedUser: { id: 'user-1' } }),
  readJson: vi.fn().mockImplementation(async () => ({ body: mocks.body })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const chain: Record<string, any> = {}
        chain.eq = () => chain
        chain.maybeSingle = async () => ({ data: mocks.listing, error: null })
        return chain
      },
      update: (patch: Record<string, unknown>) => {
        mocks.update(patch)
        const chain: Record<string, any> = {}
        chain.eq = () => chain
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
        return chain
      },
    }),
  }),
}))

const { POST } = await import('./route')

describe('POST /api/assertive/listings/[id]/images/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.body = { asset_id: 'generated-1' }
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

  it('não libera o anúncio quando ainda falta um campo essencial', async () => {
    mocks.listing.title = ''

    const response = await POST(new Request('http://localhost/confirm', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'needs_input' }))
  })
})
