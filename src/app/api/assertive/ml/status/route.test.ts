import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSellerCapabilities: vi.fn().mockResolvedValue({
    ml_user_id: 123,
    nickname: 'seller',
    site_id: 'MLB',
    user_product_model: false,
    tags: [],
  }),
  getSellerShippingPreferences: vi.fn().mockResolvedValue({
    modes: ['me1', 'me2', 'custom', 'local_pick_up'],
    default_shipping_mode: 'me1',
    has_me1: true,
    has_me2: true,
    available_modes: ['me1', 'me2', 'custom', 'local_pick_up'],
  }),
}))

vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({
    response: null,
    authorizedUser: { id: 'user-1' },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ml_user_id: 123, nickname: 'seller' } }),
        }),
      }),
    }),
  }),
}))
vi.mock('@/lib/assertive/publisher', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/assertive/publisher')>()
  return {
    ...original,
    getValidMLToken: vi.fn().mockResolvedValue('token'),
    getSellerCapabilities: mocks.getSellerCapabilities,
    getSellerShippingPreferences: mocks.getSellerShippingPreferences,
  }
})

const { GET } = await import('./route')

describe('GET /api/assertive/ml/status', () => {
  it('expõe modalidades suportadas e mantém ME2 como padrão', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      connected: true,
      shipping: {
        available_modes: ['me1', 'me2', 'custom'],
        default_mode: 'me2',
      },
    })
    expect(mocks.getSellerShippingPreferences).toHaveBeenCalledWith('token', 123)
  })
})
