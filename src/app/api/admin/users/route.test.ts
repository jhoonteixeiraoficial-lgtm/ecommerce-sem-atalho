import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_ID = '00000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerGuards: vi.fn(),
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  adminFrom: vi.fn(),
  profilesOrder: vi.fn(),
  rolesIn: vi.fn(),
  statusesIn: vi.fn(),
  subscriptionsEq: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/auth/server-guards', () => ({
  createServerGuards: mocks.createServerGuards,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'admin-user', email: 'admin@example.test' } },
  })
  mocks.requireAdmin.mockResolvedValue({
    id: 'admin-user',
    email: 'admin@example.test',
    role: 'admin',
    status: 'active',
    accessUntil: null,
  })
  mocks.createServerGuards.mockReturnValue({ requireAdmin: mocks.requireAdmin })
  mocks.createAdminClient.mockReturnValue({ from: mocks.adminFrom })

  mocks.profilesOrder.mockResolvedValue({
    data: [{ id: USER_ID, full_name: 'Jane Doe', email: 'jane@example.test', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }],
    error: null,
  })
  mocks.rolesIn.mockResolvedValue({ data: [{ user_id: USER_ID, role: 'member' }], error: null })
  mocks.statusesIn.mockResolvedValue({ data: [{ user_id: USER_ID, status: 'active', reason: null }], error: null })
  mocks.subscriptionsEq.mockResolvedValue({ data: [], error: null })

  mocks.adminFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return { select: () => ({ order: mocks.profilesOrder }) }
    }
    if (table === 'user_roles') {
      return { select: () => ({ in: mocks.rolesIn }) }
    }
    if (table === 'account_status') {
      return { select: () => ({ in: mocks.statusesIn }) }
    }
    if (table === 'subscriptions') {
      return { select: () => ({ in: () => ({ eq: mocks.subscriptionsEq }) }) }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
})

describe('GET /api/admin/users', () => {
  it('rejects when canonical admin authorization fails', async () => {
    mocks.requireAdmin.mockRejectedValue({ status: 403 })

    const response = await GET(new Request('https://example.test/api/admin/users'))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('returns merged user data on success', async () => {
    const response = await GET(new Request('https://example.test/api/admin/users'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      users: [{
        id: USER_ID,
        full_name: 'Jane Doe',
        email: 'jane@example.test',
        role: 'member',
        status: 'active',
        is_banned: false,
        ban_reason: '',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        subscriptions: [],
      }],
    })
  })

  it('maps a profiles query failure to a generic 500', async () => {
    mocks.profilesOrder.mockResolvedValue({ data: null, error: { message: 'db exploded' } })

    const response = await GET(new Request('https://example.test/api/admin/users'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch users' })
  })

  it('maps a user_roles query failure to a generic 500 instead of silently degrading', async () => {
    mocks.rolesIn.mockResolvedValue({ data: null, error: { message: 'db exploded' } })

    const response = await GET(new Request('https://example.test/api/admin/users'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch users' })
  })

  it('maps an account_status query failure to a generic 500 instead of silently degrading', async () => {
    mocks.statusesIn.mockResolvedValue({ data: null, error: { message: 'db exploded' } })

    const response = await GET(new Request('https://example.test/api/admin/users'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch users' })
  })

  it('maps a subscriptions query failure to a generic 500 instead of silently degrading', async () => {
    mocks.subscriptionsEq.mockResolvedValue({ data: null, error: { message: 'db exploded' } })

    const response = await GET(new Request('https://example.test/api/admin/users'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch users' })
  })
})
