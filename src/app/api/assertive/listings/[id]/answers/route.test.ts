import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listing: {} as Record<string, unknown>,
  updatePatch: null as Record<string, unknown> | null,
  recomputeListing: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({
    response: null,
    authorizedUser: { id: 'user-1' },
  }),
  readJson: vi.fn().mockResolvedValue({ body: { answers: { GTIN: '7898559182505' } } }),
}))
vi.mock('@/lib/assertive/publisher', () => ({
  requireMLToken: vi.fn().mockResolvedValue('token'),
  MLNotConnectedError: class MLNotConnectedError extends Error {},
}))
vi.mock('@/lib/assertive/generator', () => ({
  matchAttributeValue: vi.fn().mockReturnValue(null),
}))
vi.mock('@/lib/assertive/pipeline', () => ({
  resolveCategoryContext: vi.fn().mockResolvedValue({
    attributes: [{ id: 'GTIN', name: 'Código universal de produto', tier: 'required', fixedValues: false }],
  }),
  recomputeListing: mocks.recomputeListing,
}))
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

const { POST } = await import('./route')

describe('POST /api/assertive/listings/[id]/answers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listing = {
      id: 'listing-1',
      user_id: 'user-1',
      category_id: 'MLB60658',
      status: 'ready_to_publish',
      attributes: {
        list: [],
        missing: [{ field: 'GTIN' }],
        publication_requirements: { all_clear: false, blockers: [{ attribute_id: 'GTIN' }] },
      },
      validation: { valid: true, checked_at: '2026-09-08T23:00:00.000Z', status_code: 204 },
      validated_payload: { category_id: 'MLB60658' },
      validated_payload_hash: 'abc123',
    }
    mocks.updatePatch = null
    mocks.recomputeListing.mockResolvedValue({ status: 'ready' })
  })

  it('resposta do usuário preserva override e invalida o preflight anterior', async () => {
    const response = await POST(new Request('http://localhost/answers', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    const attributes = mocks.updatePatch?.attributes as {
      list: Array<Record<string, unknown>>
      publication_requirements: unknown
    }
    expect(attributes.list).toContainEqual(expect.objectContaining({
      id: 'GTIN',
      value_name: '7898559182505',
      source: 'user',
    }))
    expect(attributes.publication_requirements).toBeNull()
    expect(mocks.updatePatch).toMatchObject({
      validation: {},
      validated_payload: null,
      validated_payload_hash: null,
      status: 'ready',
    })
  })
})
