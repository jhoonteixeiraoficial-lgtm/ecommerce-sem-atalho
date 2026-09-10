import { beforeEach, describe, expect, it, vi } from 'vitest'

const taxonomy = vi.hoisted(() => ({
  getCategory: vi.fn(),
  getCategoryAttributes: vi.fn(),
  getCategorySaleTerms: vi.fn(),
  classifyAttributes: vi.fn(),
}))
const getSellerCapabilities = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('../taxonomy', () => ({
  ...taxonomy,
  maxTitleLength: vi.fn().mockReturnValue(60),
}))
vi.mock('../publisher', () => ({
  getSellerCapabilities,
  requireMLToken: vi.fn(),
  buildItemPayload: vi.fn(),
  buildItemPayloadWithMeta: vi.fn(),
  predictMLTitle: vi.fn(),
  getAutoAppendedAttributeIds: vi.fn(),
  validateListing: vi.fn(),
}))

import { resolveCategoryContext } from '../pipeline'

describe('dynamic category context', () => {
  beforeEach(() => {
    taxonomy.getCategory.mockReset().mockResolvedValue({ id: 'MLB60658', name: 'Ferramentas' })
    taxonomy.getCategoryAttributes.mockReset()
    taxonomy.getCategorySaleTerms.mockReset().mockResolvedValue([])
    taxonomy.classifyAttributes.mockReset().mockReturnValue([])
    getSellerCapabilities.mockReset().mockResolvedValue({ user_product_model: true })
  })

  it('não continua silenciosamente quando o schema oficial está indisponível', async () => {
    taxonomy.getCategoryAttributes.mockRejectedValue(new Error('ML unavailable'))

    await expect(resolveCategoryContext('token', 'MLB60658'))
      .rejects.toThrow('schema oficial da categoria MLB60658')
  })

  it('classifica o schema retornado pela categoria e aplica capacidade da conta', async () => {
    const raw = [{ id: 'BRAND', name: 'Marca', value_type: 'string', tags: { required: true } }]
    taxonomy.getCategoryAttributes.mockResolvedValue(raw)

    await resolveCategoryContext('token', 'MLB60658')

    expect(taxonomy.classifyAttributes).toHaveBeenCalledWith(raw, { requireSellerPackage: true })
  })

  it('rejeita categoria oficialmente desabilitada para publicação', async () => {
    taxonomy.getCategory.mockResolvedValue({
      id: 'MLB1',
      name: 'Desabilitada',
      settings: { listing_allowed: false, status: 'disabled' },
    })
    taxonomy.getCategoryAttributes.mockResolvedValue([])

    await expect(resolveCategoryContext('token', 'MLB1'))
      .rejects.toThrow('não aceita novas publicações')
  })

  it('separa atributos do item, variações e termos de venda sem descartá-los', async () => {
    const item = { id: 'BRAND', name: 'Marca', isVariationOnly: false }
    const variation = { id: 'SIZE', name: 'Tamanho', isVariationOnly: true }
    const warranty = { id: 'WARRANTY_TYPE', name: 'Tipo de garantia', isVariationOnly: false }
    taxonomy.getCategory.mockResolvedValue({
      id: 'MLB2',
      name: 'Moda',
      settings: { listing_allowed: true, status: 'enabled', max_title_length: 60, max_pictures_per_item: 12 },
    })
    taxonomy.getCategoryAttributes.mockResolvedValue([{ id: 'RAW_ITEM' }])
    taxonomy.getCategorySaleTerms.mockResolvedValue([{ id: 'RAW_TERM' }])
    taxonomy.classifyAttributes
      .mockReturnValueOnce([item, variation])
      .mockReturnValueOnce([warranty])

    const context = await resolveCategoryContext('token', 'MLB2')

    expect(context.itemAttributes).toEqual([item])
    expect(context.variationAttributes).toEqual([variation])
    expect(context.saleTerms).toEqual([warranty])
    expect(context.limits).toEqual({ title: 60, pictures: 12, variationPictures: 10 })
  })
})
