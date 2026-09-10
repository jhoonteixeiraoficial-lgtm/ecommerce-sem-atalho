import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mlSend: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('../ml-api', () => ({
  mlSend: mocks.mlSend,
  mlGet: vi.fn(),
}))

const { buildItemPayload, validateListing } = await import('../publisher')

describe('validateListing', () => {
  beforeEach(() => vi.clearAllMocks())

  it('aceita somente o sucesso HTTP real da API', async () => {
    mocks.mlSend.mockResolvedValue({ ok: true, status: 204, data: null })

    const result = await validateListing('token', {
      category_id: 'MLB60658',
      price: 129.9,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/kitest.jpg' }],
      attributes: [],
    })

    expect(result.valid).toBe(true)
    expect(result.status_code).toBe(204)
  })

  it('aceita HTTP 400 com causes não vazias e todas do tipo warning', async () => {
    mocks.mlSend.mockResolvedValue({
      ok: false,
      status: 400,
      data: {
        message: 'Validation error',
        cause: [
          { code: 'future.account.notice', message: 'Account notice', type: 'warning' },
          { code: 'future.shipping.notice', message: 'Shipping notice', type: 'warning' },
        ],
      },
    })

    const result = await validateListing('token', {
      category_id: 'MLB60658',
      price: 129.9,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/kitest.jpg' }],
      attributes: [],
    })

    expect(result.valid).toBe(true)
    expect(result.status_code).toBe(400)
    expect(result.issues).toHaveLength(2)
    expect(result.issues.every(issue => issue.severity === 'warning')).toBe(true)
  })

  it('rejeita HTTP 400 quando existe uma causa do tipo error', async () => {
    mocks.mlSend.mockResolvedValue({
      ok: false,
      status: 400,
      data: {
        message: 'Validation error',
        cause: [
          { code: 'shipping.lost_me1_by_user', message: 'ME1 unavailable', type: 'warning' },
          { code: 'item.attribute.invalid_product_identifier', message: 'GTIN inválido', type: 'error' },
        ],
      },
    })

    const result = await validateListing('token', {
      category_id: 'MLB60658',
      price: 129.9,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/kitest.jpg' }],
      attributes: [],
    })

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'item.attribute.invalid_product_identifier', severity: 'error' }),
    ]))
  })

  it('rejeita HTTP 400 sem causes', async () => {
    mocks.mlSend.mockResolvedValue({
      ok: false,
      status: 400,
      data: { message: 'Validation error', error: 'validation_error', cause: [] },
    })

    const result = await validateListing('token', {
      category_id: 'MLB60658',
      price: 129.9,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/kitest.jpg' }],
      attributes: [],
    })

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'validation_error', severity: 'error' }),
    ])
  })

  it('rejeita HTTP 400 quando uma causa tem type diferente de warning', async () => {
    mocks.mlSend.mockResolvedValue({
      ok: false,
      status: 400,
      data: {
        message: 'Validation error',
        cause: [{ code: 'item.review.pending', message: 'Pending review', type: 'info' }],
      },
    })

    const result = await validateListing('token', {
      category_id: 'MLB60658',
      price: 129.9,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/kitest.jpg' }],
      attributes: [],
    })

    expect(result.valid).toBe(false)
    expect(result.issues[0]).toMatchObject({ code: 'item.review.pending', severity: 'error' })
  })

  it.each([401, 403])('rejeita HTTP %s como falha de autorização', async status => {
    mocks.mlSend.mockResolvedValue({
      ok: false,
      status,
      data: { message: 'Access denied', error: 'unauthorized', cause: [] },
    })

    const result = await validateListing('token', {
      category_id: 'MLB60658',
      price: 129.9,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/kitest.jpg' }],
      attributes: [],
    })

    expect(result.valid).toBe(false)
    expect(result.status_code).toBe(status)
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'unauthorized', severity: 'error' }),
    ])
  })

  it('não promove resposta 5xx warning-only para sucesso', async () => {
    mocks.mlSend.mockResolvedValue({
      ok: false,
      status: 503,
      data: {
        message: 'Service unavailable',
        cause: [{ code: 'temporary_warning', message: 'Try later', type: 'warning' }],
      },
    })

    const result = await validateListing('token', {
      category_id: 'MLB60658',
      price: 129.9,
      currency_id: 'BRL',
      available_quantity: 1,
      buying_mode: 'buy_it_now',
      condition: 'new',
      listing_type_id: 'gold_special',
      pictures: [{ source: 'https://example.com/kitest.jpg' }],
      attributes: [],
    })

    expect(result.valid).toBe(false)
  })
})

describe('buildItemPayload evidence filtering', () => {
  it('exclui atributos não confirmados do payload enviado ao Mercado Livre', () => {
    const payload = buildItemPayload({
      title: 'Caneta de polaridade Kitest KA250',
      category_id: 'MLB60658',
      price: 129.9,
      available_quantity: 1,
      pictures: ['https://example.com/kitest.jpg'],
      attributes: [
        { id: 'BRAND', name: 'Marca', value_name: 'Kitest', tier: 'required', source: 'truth', status: 'CONFIRMED' },
        { id: 'VOLTAGE', name: 'Voltagem', value_name: '220 V', tier: 'required', source: 'ai', status: 'NEEDS_CONFIRMATION' },
        { id: 'COLOR', name: 'Cor', value_name: 'Preto', tier: 'required', source: 'catalog', status: 'AUTO_FILLED' },
        { id: 'MODEL', name: 'Modelo', value_name: 'KA250', tier: 'required', source: 'catalog', status: 'AUTO_FILLED', evidence: 'Catálogo exato MLB123' },
      ],
    }, null)

    expect(payload.attributes).toEqual([
      { id: 'BRAND', value_name: 'Kitest' },
      { id: 'MODEL', value_name: 'KA250' },
    ])
  })
})
