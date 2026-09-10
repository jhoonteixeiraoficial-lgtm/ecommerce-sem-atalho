import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listing: {} as Record<string, unknown>,
  updatePatch: null as Record<string, unknown> | null,
  recomputeListing: vi.fn(),
  attachListingImages: vi.fn(),
  body: { price: 149.9 } as Record<string, unknown>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({
    response: null,
    authorizedUser: { id: 'user-1' },
  }),
  readJson: vi.fn().mockImplementation(async () => ({ body: mocks.body })),
}))
vi.mock('@/lib/assertive/pipeline', () => ({
  recomputeListing: mocks.recomputeListing,
}))
vi.mock('@/lib/assertive/publisher', () => ({
  MLNotConnectedError: class MLNotConnectedError extends Error {},
}))
vi.mock('@/lib/assertive/image-assets', () => ({ attachListingImages: mocks.attachListingImages }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: mocks.listing }) }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        mocks.updatePatch = patch
        Object.assign(mocks.listing, patch)
        return { eq: () => ({ eq: async () => ({ error: null }) }) }
      },
    }),
  }),
}))

const { PATCH } = await import('./route')

describe('PATCH /api/assertive/listings/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listing = {
      id: 'listing-1',
      user_id: 'user-1',
      status: 'ready_to_publish',
      price: 129.9,
      attributes: {
        list: [],
        publication_requirements: { all_clear: true, blockers: [] },
      },
      validation: { valid: true, checked_at: '2026-09-08T23:00:00.000Z', status_code: 204 },
      validated_payload: { category_id: 'MLB60658' },
      validated_payload_hash: 'abc123',
    }
    mocks.updatePatch = null
    mocks.recomputeListing.mockResolvedValue({ status: 'ready' })
    mocks.attachListingImages.mockResolvedValue(undefined)
    mocks.body = { price: 149.9 }
  })

  it('qualquer edição invalida preflight e não grava coluna inexistente', async () => {
    const response = await PATCH(new Request('http://localhost/listing-1', { method: 'PATCH' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.updatePatch).not.toHaveProperty('publication_requirements')
    expect(mocks.updatePatch).toMatchObject({
      validation: {},
      validated_payload: null,
      validated_payload_hash: null,
      status: 'ready',
    })
    const attributes = mocks.updatePatch?.attributes as { publication_requirements: unknown }
    expect(attributes.publication_requirements).toBeNull()
  })

  it('atualiza assets, posições e projeção de URLs por uma operação transacional', async () => {
    mocks.body = {
      listing_images: [
        { asset_id: 'asset-2', position: 0, role: 'MAIN' },
        { asset_id: 'asset-1', position: 1, role: 'DETAIL' },
      ],
    }

    const response = await PATCH(new Request('http://localhost/listing-1', { method: 'PATCH' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.attachListingImages).toHaveBeenCalledWith('listing-1', 'user-1', mocks.body.listing_images)
    expect(mocks.updatePatch).toBeNull()
    expect(mocks.recomputeListing).toHaveBeenCalledWith('listing-1', 'user-1')
  })
})
