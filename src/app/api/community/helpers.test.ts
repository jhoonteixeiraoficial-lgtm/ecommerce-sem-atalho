import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.hoisted(() => vi.fn())

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ auth: { getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { requireCommunityUser } from './helpers'

describe('requireCommunityUser', () => {
  beforeEach(() => {
    getUser.mockReset()
  })

  it('trata ausência de sessão como 401, não como indisponibilidade', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { name: 'AuthSessionMissingError', status: 400, message: 'Auth session missing!' },
    })

    const result = await requireCommunityUser()

    expect(result.response?.status).toBe(401)
    await expect(result.response?.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('mantém falha real do serviço de autenticação como 503', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('network unavailable'),
    })

    const result = await requireCommunityUser()

    expect(result.response?.status).toBe(503)
  })
})
