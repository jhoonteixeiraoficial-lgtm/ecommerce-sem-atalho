import { beforeEach, describe, expect, it, vi } from 'vitest'
import { payloadHash } from '@/lib/assertive/publication-readiness'

const payload = {
  category_id: 'MLB60658',
  price: 112.3,
  currency_id: 'BRL',
  available_quantity: 1,
  buying_mode: 'buy_it_now',
  condition: 'new',
  listing_type_id: 'gold_special',
  family_name: 'Testador Circuito Kitest KA250 Canela Polaridade',
  pictures: [{ source: 'https://example.com/kitest.jpg' }],
  attributes: [{ id: 'BRAND', value_name: 'Kitest' }],
  shipping: { mode: 'not_specified', local_pick_up: false, free_shipping: false },
}

const warning = {
  code: 'future.shipping.notice',
  message: 'Shipping normalized by marketplace',
  severity: 'warning' as const,
}

const marketplaceItem = {
  id: 'MLB7612322310',
  title: 'Testador Circuito Kitest Ka250 Canela Polaridade',
  family_name: 'Testador Circuito Kitest Ka250 Canela Polaridade',
  permalink: 'https://produto.mercadolivre.com.br/MLB-7612322310-testador-_JM',
  status: 'active',
  category_id: 'MLB60658',
  price: 112.3,
  currency_id: 'BRL',
  available_quantity: 1,
  listing_type_id: 'gold_special',
  shipping: {
    mode: 'me2',
    methods: [],
    tags: ['mandatory_free_shipping'],
    dimensions: null,
    local_pick_up: false,
    free_shipping: true,
    logistic_type: 'xd_drop_off',
    store_pick_up: false,
  },
  pictures: [{ id: '1', url: 'https://example.com/kitest-final.jpg' }],
  attributes: [{ id: 'BRAND', value_id: null, value_name: 'Kitest' }],
  date_created: '2026-09-09T12:01:07.755Z',
  last_updated: '2026-09-09T12:01:07.755Z',
}

const mocks = vi.hoisted(() => ({
  listing: {} as Record<string, any>,
  updates: [] as Array<{ table: string; patch: Record<string, any> }>,
  mlGet: vi.fn(),
  buildItemPayload: vi.fn(),
  validateListing: vi.fn(),
  publishListing: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({ response: null, authorizedUser: { id: 'user-1' } }),
  readJson: vi.fn().mockResolvedValue({ body: { confirm: true } }),
}))
vi.mock('@/lib/assertive/publisher', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/assertive/publisher')>()
  return {
    ...original,
    requireMLToken: vi.fn().mockResolvedValue('token'),
    getSellerCapabilities: vi.fn().mockResolvedValue({
      ml_user_id: 1643995837,
      nickname: 'AUTOCENTER_',
      site_id: 'MLB',
      user_product_model: true,
      tags: ['user_product_seller'],
    }),
    buildItemPayload: mocks.buildItemPayload,
    validateListing: mocks.validateListing,
    publishListing: mocks.publishListing,
  }
})
vi.mock('@/lib/assertive/ml-api', () => ({ mlGet: mocks.mlGet }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        const chain: Record<string, any> = {}
        chain.eq = () => chain
        chain.maybeSingle = async () => ({ data: mocks.listing })
        return chain
      },
      update: (patch: Record<string, any>) => {
        mocks.updates.push({ table, patch })
        const chain: Record<string, any> = {}
        chain.eq = () => chain
        chain.neq = () => chain
        chain.is = () => chain
        chain.select = () => chain
        chain.single = async () => ({ data: { id: mocks.listing.id }, error: null })
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ error: null }).then(resolve, reject)
        return chain
      },
    }),
  }),
}))

const { POST } = await import('./route')

describe('POST /api/assertive/listings/[id]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updates = []
    mocks.buildItemPayload.mockReturnValue(payload)
    mocks.listing = {
      id: 'listing-1',
      user_id: 'user-1',
      analysis_id: 'analysis-1',
      title: 'Testador de circuito Kitest KA250',
      family_name: payload.family_name,
      category_id: payload.category_id,
      price: payload.price,
      available_quantity: 1,
      condition: 'new',
      listing_type_id: 'gold_special',
      photos: ['https://example.com/kitest.jpg'],
      attributes: {
        list: [{ id: 'BRAND', value_name: 'Kitest' }],
        title_control_mode: 'user_product',
        publication_requirements: { all_clear: true, blockers: [] },
      },
      description: '',
      status: 'ready_to_publish',
      validation: { valid: true, status_code: 400, checked_at: '2026-09-09T12:00:00.000Z', issues: [warning] },
      validated_payload: structuredClone(payload),
      validated_payload_hash: payloadHash(payload),
      ml_item_id: null,
    }
    mocks.validateListing.mockResolvedValue({ valid: true, status_code: 400, issues: [warning] })
    mocks.publishListing.mockResolvedValue({
      success: true,
      item_id: marketplaceItem.id,
      permalink: 'http://produto.mercadolivre.com.br/MLB-7612322310-testador-_JM',
      status: 'active',
    })
    mocks.mlGet.mockResolvedValue(marketplaceItem)
  })

  it('publica exatamente o snapshot validado sem reconstruir o payload', async () => {
    const validatedPayload = {
      ...payload,
      price: 87.4,
      pictures: [{ source: 'https://example.com/validated-kitest.jpg' }],
    }
    mocks.listing.validated_payload = validatedPayload
    mocks.listing.validated_payload_hash = payloadHash(validatedPayload)

    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.buildItemPayload).not.toHaveBeenCalled()
    expect(mocks.validateListing).toHaveBeenCalledWith('token', validatedPayload)
    expect(mocks.publishListing).toHaveBeenCalledWith('token', validatedPayload, '')
    expect(mocks.updates.find(update => update.patch.status === 'published')?.patch.published_payload)
      .toEqual(validatedPayload)
  })

  it('recusa publicação quando o hash do snapshot não confere', async () => {
    mocks.listing.validated_payload_hash = 'hash-adulterado'

    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })

    expect(response.status).toBe(409)
    expect(mocks.validateListing).not.toHaveBeenCalled()
    expect(mocks.publishListing).not.toHaveBeenCalled()
  })

  it('recusa publicação de imagem gerada ainda não confirmada pelo usuário', async () => {
    mocks.listing.attributes.image_review = {
      required_asset_ids: ['generated-1'],
      confirmed_asset_ids: [],
    }

    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('IMAGE_REVIEW_REQUIRED')
    expect(mocks.validateListing).not.toHaveBeenCalled()
    expect(mocks.publishListing).not.toHaveBeenCalled()
  })

  it('persiste e devolve o estado autoritativo retornado por GET /items/{id}', async () => {
    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })
    const body = await response.json()
    const publishedUpdate = mocks.updates.find(update => update.table === 'assertive_listings' && update.patch.status === 'published')

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      item_id: marketplaceItem.id,
      permalink: marketplaceItem.permalink,
      status: marketplaceItem.status,
      reconciliation: 'confirmed',
    })
    expect(publishedUpdate?.patch).toMatchObject({
      ml_item_id: marketplaceItem.id,
      ml_permalink: marketplaceItem.permalink,
      publication_status: marketplaceItem.status,
      published_payload: payload,
      ml_response: {
        validation_warnings: [warning],
        reconciliation: { status: 'confirmed', checked_at: expect.any(String) },
        marketplace_item: {
          id: marketplaceItem.id,
          status: 'active',
          permalink: marketplaceItem.permalink,
          shipping: {
            mode: 'me2',
            free_shipping: true,
            logistic_type: 'xd_drop_off',
            tags: ['mandatory_free_shipping'],
          },
        },
      },
      attributes: expect.objectContaining({ ml_final_title: marketplaceItem.title }),
    })
  })

  it('mantém publicação bem-sucedida e marca reconciliação pendente quando o GET falha', async () => {
    mocks.mlGet.mockRejectedValue(new Error('ML 503 em /items/MLB7612322310'))

    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })
    const body = await response.json()
    const publishedUpdate = mocks.updates.find(update => update.table === 'assertive_listings' && update.patch.status === 'published')

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, item_id: marketplaceItem.id, reconciliation: 'pending' })
    expect(publishedUpdate?.patch).toMatchObject({
      status: 'published',
      ml_item_id: marketplaceItem.id,
      ml_permalink: 'http://produto.mercadolivre.com.br/MLB-7612322310-testador-_JM',
      publication_status: 'active',
      ml_response: {
        validation_warnings: [warning],
        reconciliation: {
          status: 'pending',
          checked_at: expect.any(String),
          error: 'ML 503 em /items/MLB7612322310',
        },
        marketplace_item: null,
      },
    })
  })
})
