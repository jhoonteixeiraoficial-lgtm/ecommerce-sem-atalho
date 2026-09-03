import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))
vi.mock('@/lib/auth/server-guards', () => ({
  createServerGuards: (_user: unknown, authError?: unknown) => ({
    requireAdmin: authError
      ? async () => { throw { status: 503 } }
      : mocks.requireAdmin,
  }),
}))

import AdminLayout from './layout'

describe('AdminLayout authorization failures', () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null })
    mocks.requireAdmin.mockReset()
  })

  it.each([
    [401, '/login'],
    [403, '/membros/dashboard'],
    [503, '/erro-de-acesso'],
  ])('redirects status %i to %s', async (status, destination) => {
    mocks.requireAdmin.mockRejectedValue({ status })

    await expect(AdminLayout({ children: null })).rejects.toThrow(`redirect:${destination}`)
  })

  it('routes a resolved authentication infrastructure error to the access-error page', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('upstream authentication details'),
    })

    await expect(AdminLayout({ children: null })).rejects.toThrow('redirect:/erro-de-acesso')
  })
})
