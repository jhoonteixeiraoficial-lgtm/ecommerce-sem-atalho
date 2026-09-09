import { beforeEach, describe, expect, it, vi } from 'vitest'

const taxonomy = vi.hoisted(() => ({
  getCategory: vi.fn(),
  getCategoryAttributes: vi.fn(),
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
})
