import { beforeEach, describe, expect, it, vi } from 'vitest'

interface ListingState extends Record<string, unknown> {
  status?: string
  validation?: Record<string, unknown>
  validated_payload?: Record<string, unknown> | null
  validated_payload_hash?: string | null
  attributes?: {
    list?: Array<Record<string, unknown>>
    publication_requirements?: Record<string, unknown>
  }
}

const mocks = vi.hoisted(() => ({
  listing: {} as ListingState,
  updates: [] as Array<Record<string, unknown>>,
  validateListing: vi.fn(),
  recomputeListing: vi.fn(),
  resolveCategoryContext: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({
    response: null,
    authorizedUser: { id: 'user-1' },
  }),
}))
vi.mock('@/lib/assertive/publisher', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/assertive/publisher')>()
  return {
    ...original,
    requireMLToken: vi.fn().mockResolvedValue('token'),
    buildItemPayload: vi.fn().mockImplementation(input => ({
      category_id: input.category_id,
      price: input.price,
      currency_id: 'BRL',
      available_quantity: input.available_quantity,
      buying_mode: 'buy_it_now',
      condition: input.condition,
      listing_type_id: input.listing_type_id,
      title: input.title,
      pictures: input.pictures.map((source: string) => ({ source })),
      attributes: input.attributes.map((attribute: { id: string; value_name?: string }) => ({
        id: attribute.id,
        value_name: attribute.value_name,
      })),
    })),
    validateListing: mocks.validateListing,
  }
})
vi.mock('@/lib/assertive/pipeline', () => ({
  resolveCategoryContext: mocks.resolveCategoryContext,
  recomputeListing: mocks.recomputeListing,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mocks.listing }),
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        mocks.updates.push(patch)
        Object.assign(mocks.listing, patch)
        return { eq: () => ({ eq: async () => ({ error: null }) }) }
      },
    }),
  }),
}))

const { POST } = await import('./route')

describe('POST /api/assertive/listings/[id]/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listing = {
      id: 'listing-1',
      user_id: 'user-1',
      analysis_id: 'analysis-1',
      title: 'Caneta de polaridade Kitest KA250 12V 24V',
      family_name: 'Caneta de polaridade Kitest KA250',
      category_id: 'MLB60658',
      price: 129.9,
      available_quantity: 1,
      condition: 'new',
      listing_type_id: 'gold_special',
      photos: ['https://example.com/kitest.jpg'],
      attributes: {
        list: [{ id: 'BRAND', name: 'Marca', value_name: 'Kitest', tier: 'required', source: 'ml_item' }],
      },
      status: 'ready',
      validation: {},
      validated_payload: null,
      validated_payload_hash: null,
    }
    mocks.updates = []
    mocks.recomputeListing.mockResolvedValue({})
    mocks.resolveCategoryContext.mockResolvedValue({
      category: { id: 'MLB60658', name: 'Ferramentas' },
      capabilities: { ml_user_id: 1, nickname: 'seller', site_id: 'MLB', user_product_model: false, tags: [] },
      attributes: [{
        id: 'BRAND',
        name: 'Marca',
        tier: 'required',
        value_type: 'string',
        fixedValues: false,
        isVariationOnly: false,
        readOnly: false,
      }],
    })
  })

  it('persiste HTTP 204, payload/hash e único estado READY_TO_PUBLISH', async () => {
    mocks.validateListing.mockResolvedValue({ valid: true, issues: [], status_code: 204 })

    const response = await POST(new Request('http://localhost/validate', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.listing.status).toBe('ready_to_publish')
    expect(mocks.listing.validation).toMatchObject({ valid: true, status_code: 204 })
    expect(mocks.listing.validated_payload).toMatchObject({ category_id: 'MLB60658', price: 129.9 })
    expect(mocks.listing.validated_payload_hash).toEqual(expect.any(String))
    expect(mocks.listing.attributes?.publication_requirements).toMatchObject({ all_clear: true, blocker_count: 0 })
  })

  it('persiste warning-only HTTP 400 como ready_to_publish', async () => {
    mocks.validateListing.mockResolvedValue({
      valid: true,
      status_code: 400,
      issues: [{
        code: 'shipping.lost_me1_by_user',
        message: 'ME1 unavailable',
        severity: 'warning',
      }],
    })

    await POST(new Request('http://localhost/validate', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(mocks.listing.status).toBe('ready_to_publish')
    expect(mocks.listing.validation).toMatchObject({ valid: true, ml_valid: true, status_code: 400 })
    expect(mocks.listing.validated_payload).toMatchObject({ category_id: 'MLB60658', price: 129.9 })
    expect(mocks.listing.validated_payload_hash).toEqual(expect.any(String))
  })

  it('remove GTIN inválido não obrigatório e revalida sem blocker falso', async () => {
    mocks.listing.attributes = {
      list: [
        { id: 'BRAND', name: 'Marca', value_name: 'Kitest', tier: 'required', source: 'ml_item' },
        { id: 'GTIN', name: 'Código universal de produto', value_name: '7898559182505', tier: 'recommended', source: 'truth' },
      ],
    }
    mocks.resolveCategoryContext.mockResolvedValue({
      category: { id: 'MLB60658', name: 'Ferramentas' },
      capabilities: { ml_user_id: 1, nickname: 'seller', site_id: 'MLB', user_product_model: false, tags: [] },
      attributes: [
        { id: 'BRAND', name: 'Marca', tier: 'required', value_type: 'string', fixedValues: false, isVariationOnly: false, readOnly: false },
        { id: 'GTIN', name: 'Código universal de produto', tier: 'recommended', value_type: 'string', fixedValues: false, isVariationOnly: false, readOnly: false },
      ],
    })
    mocks.validateListing
      .mockResolvedValueOnce({
        valid: false,
        status_code: 400,
        issues: [{
          code: 'item.attribute.invalid_product_identifier',
          message: 'Insira um código universal que você não tenha usado no anúncio de outra categoria.',
          severity: 'error',
          attribute_ids: [],
        }],
      })
      .mockResolvedValueOnce({
        valid: true,
        status_code: 400,
        issues: [{ code: 'future.shipping.notice', message: 'Shipping notice', severity: 'warning' }],
      })

    await POST(new Request('http://localhost/validate', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(mocks.validateListing).toHaveBeenCalledTimes(2)
    expect(mocks.validateListing.mock.calls[1][1].attributes).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'GTIN' })])
    )
    expect(mocks.listing.status).toBe('ready_to_publish')
    expect(mocks.listing.attributes?.list).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'GTIN' })])
    )
  })

  it('mantém bloqueio quando o GTIN inválido é obrigatório', async () => {
    mocks.listing.attributes = {
      list: [
        { id: 'BRAND', name: 'Marca', value_name: 'Kitest', tier: 'required', source: 'ml_item' },
        { id: 'GTIN', name: 'Código universal de produto', value_name: '7898559182505', tier: 'required', source: 'truth' },
      ],
    }
    mocks.resolveCategoryContext.mockResolvedValue({
      category: { id: 'MLB60658', name: 'Ferramentas' },
      capabilities: { ml_user_id: 1, nickname: 'seller', site_id: 'MLB', user_product_model: false, tags: [] },
      attributes: [
        { id: 'BRAND', name: 'Marca', tier: 'required', value_type: 'string', fixedValues: false, isVariationOnly: false, readOnly: false },
        { id: 'GTIN', name: 'Código universal de produto', tier: 'required', value_type: 'string', fixedValues: false, isVariationOnly: false, readOnly: false },
      ],
    })
    mocks.validateListing.mockResolvedValue({
      valid: false,
      status_code: 400,
      issues: [{
        code: 'item.attribute.invalid_product_identifier',
        message: 'GTIN inválido.',
        severity: 'error',
        attribute_ids: [],
      }],
    })

    await POST(new Request('http://localhost/validate', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(mocks.validateListing).toHaveBeenCalledTimes(1)
    expect(mocks.listing.status).toBe('needs_input')
    expect(mocks.listing.attributes?.list).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'GTIN', value_name: '7898559182505' })])
    )
  })

  it('mantém bloqueio quando um campo realmente obrigatório está ausente', async () => {
    mocks.resolveCategoryContext.mockResolvedValue({
      category: { id: 'MLB60658', name: 'Ferramentas' },
      capabilities: { ml_user_id: 1, nickname: 'seller', site_id: 'MLB', user_product_model: false, tags: [] },
      attributes: [
        { id: 'BRAND', name: 'Marca', tier: 'required', value_type: 'string', fixedValues: false, isVariationOnly: false, readOnly: false },
        { id: 'MODEL', name: 'Modelo', tier: 'required', value_type: 'string', fixedValues: false, isVariationOnly: false, readOnly: false },
      ],
    })
    mocks.validateListing.mockResolvedValue({ valid: true, status_code: 204, issues: [] })

    await POST(new Request('http://localhost/validate', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(mocks.listing.status).toBe('needs_input')
    expect(mocks.listing.attributes?.publication_requirements).toMatchObject({
      all_clear: false,
      blockers: [expect.objectContaining({ attribute_id: 'MODEL', is_blocker: true })],
    })
    expect(mocks.listing.validated_payload).toBeNull()
  })
})
