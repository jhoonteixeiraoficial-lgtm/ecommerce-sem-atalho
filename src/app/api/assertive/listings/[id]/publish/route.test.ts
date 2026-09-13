import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  shipping: { mode: 'me2', local_pick_up: false, free_shipping: false },
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

interface TestListing extends Record<string, unknown> {
  id?: string
  validated_payload?: unknown
  validated_payload_hash?: string
  attributes: Record<string, unknown> & {
    image_review?: { required_asset_ids: string[]; confirmed_asset_ids: string[] }
  }
}

const mocks = vi.hoisted(() => ({
  listing: { attributes: {} } as TestListing,
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  mlGet: vi.fn(),
  buildItemPayload: vi.fn(),
  validateListing: vi.fn(),
  publishListing: vi.fn(),
  imageJobs: [] as Array<Record<string, unknown>>,
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
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.maybeSingle = async () => ({ data: mocks.listing })
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({ data: table === 'assertive_image_jobs' ? mocks.imageJobs : null, error: null }).then(resolve, reject)
        return chain
      },
      update: (patch: Record<string, unknown>) => {
        mocks.updates.push({ table, patch })
        const chain: Record<string, unknown> = {}
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
    vi.stubEnv('ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED', 'true')
    vi.clearAllMocks()
    mocks.updates = []
    mocks.imageJobs = []
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

  afterEach(() => vi.unstubAllEnvs())

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

  it('recusa publicação enquanto qualquer uma das seis posições progressivas estiver pendente', async () => {
    mocks.imageJobs = Array.from({ length: 6 }, (_, position) => ({
      kind: 'GENERATE_SLOT',
      position,
      status: position === 4 ? 'REVIEW' : 'SUCCEEDED',
    }))

    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('IMAGE_JOBS_PENDING')
    expect(mocks.validateListing).not.toHaveBeenCalled()
    expect(mocks.publishListing).not.toHaveBeenCalled()
  })

  it('accepts six explicitly succeeded or dismissed progressive positions', async () => {
    mocks.imageJobs = Array.from({ length: 6 }, (_, position) => ({
      kind: 'GENERATE_SLOT',
      position,
      status: position === 5 ? 'DISMISSED' : 'SUCCEEDED',
    }))

    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.publishListing).toHaveBeenCalledOnce()
  })

  it('ignores progressive jobs when the rollback flag is disabled', async () => {
    vi.stubEnv('ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED', 'false')
    mocks.imageJobs = [{ kind: 'GENERATE_SLOT', position: 0, status: 'QUEUED' }]

    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })

    expect(response.status).toBe(200)
    expect(mocks.publishListing).toHaveBeenCalledOnce()
  })

  it('exige nova confirmação quando o ML passa a impor frete grátis', async () => {
    mocks.validateListing.mockResolvedValue({
      valid: true,
      status_code: 400,
      issues: [{
        code: 'item.shipping.mandatory_free_shipping',
        message: 'Free shipping is mandatory for this listing',
        severity: 'warning',
      }],
    })

    const response = await POST(new Request('http://localhost/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }) as never, { params: Promise.resolve({ id: 'listing-1' }) })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'REVALIDATION_REQUIRED' })
    expect(mocks.publishListing).not.toHaveBeenCalled()
    expect(mocks.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: 'assertive_listings',
        patch: expect.objectContaining({
          free_shipping: true,
          free_shipping_mandatory: true,
          validated_payload: null,
          status: 'needs_input',
        }),
      }),
    ]))
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
