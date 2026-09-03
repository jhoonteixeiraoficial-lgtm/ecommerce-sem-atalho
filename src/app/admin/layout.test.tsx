import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
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
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
  }),
}))
vi.mock('@/lib/auth/server-guards', () => ({
  createServerGuards: () => ({ requireAdmin: mocks.requireAdmin }),
}))

import AdminLayout from './layout'

describe('AdminLayout authorization failures', () => {
  beforeEach(() => {
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
})
