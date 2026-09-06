import { beforeEach, describe, expect, it, vi } from 'vitest'

const POST_ID = '00000000-0000-4000-8000-000000000001'
const AUTHOR_ID = '00000000-0000-4000-8000-000000000002'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerGuards: vi.fn(),
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  adminFrom: vi.fn(),
  postsOrder: vi.fn(),
  profilesIn: vi.fn(),
  deleteMaybeSingle: vi.fn(),
  delete: vi.fn(),
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

vi.mock('@/lib/security', () => ({
  checkRateLimit: () => ({ allowed: true }),
}))

import { DELETE, GET } from './route'

function adminPostQuery() {
  return {
    select: vi.fn(() => ({ order: mocks.postsOrder })),
    delete: mocks.delete,
  }
}

function adminProfileQuery() {
  return {
    select: vi.fn(() => ({ in: mocks.profilesIn })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'admin-user', email: 'admin@example.test' } },
    error: null,
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
  mocks.adminFrom.mockImplementation((table: string) => {
    if (table === 'community_posts') return adminPostQuery()
    if (table === 'profiles') return adminProfileQuery()
    throw new Error(`Unexpected table: ${table}`)
  })

  mocks.postsOrder.mockResolvedValue({ data: [], error: null })
  mocks.profilesIn.mockResolvedValue({ data: [], error: null })
  mocks.deleteMaybeSingle.mockResolvedValue({ data: { id: POST_ID }, error: null })
  mocks.delete.mockImplementation(() => ({
    eq: () => ({ select: () => ({ maybeSingle: mocks.deleteMaybeSingle }) }),
  }))
})

describe('admin community runtime authorization', () => {
  it.each([
    ['GET', () => GET(new Request('https://example.test/api/admin/community'))],
    ['DELETE', () => DELETE(new Request(`https://example.test/api/admin/community?id=${POST_ID}`, {
      method: 'DELETE',
    }))],
  ])('rejects %s when canonical admin authorization fails', async (_method, invoke) => {
    mocks.requireAdmin.mockRejectedValue({ status: 403 })

    const response = await invoke()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'Unauthorized'],
    [403, 'Forbidden'],
    [503, 'Service unavailable'],
  ])('returns the generic %s authorization response without internal details', async (status, message) => {
    mocks.requireAdmin.mockRejectedValue({ status, message: 'sensitive authorization detail' })

    const response = await GET(new Request('https://example.test/api/admin/community'))

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: message })
  })
})

describe('GET', () => {
  it('merges posts with author profile info loaded from the admin client', async () => {
    mocks.postsOrder.mockResolvedValue({
      data: [{
        id: POST_ID,
        content: 'Hello world',
        category: 'geral',
        created_at: '2026-09-01T10:00:00.000Z',
        image_url: '',
        user_id: AUTHOR_ID,
      }],
      error: null,
    })
    mocks.profilesIn.mockResolvedValue({
      data: [{ id: AUTHOR_ID, full_name: 'Jane Doe', email: 'jane@example.test', is_banned: false }],
      error: null,
    })

    const response = await GET(new Request('https://example.test/api/admin/community'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      posts: [{
        id: POST_ID,
        content: 'Hello world',
        category: 'geral',
        created_at: '2026-09-01T10:00:00.000Z',
        image_url: '',
        user_id: AUTHOR_ID,
        profile: { full_name: 'Jane Doe', email: 'jane@example.test', avatar_url: null, is_banned: false },
      }],
    })
    expect(mocks.adminFrom).toHaveBeenNthCalledWith(1, 'community_posts')
    expect(mocks.adminFrom).toHaveBeenNthCalledWith(2, 'profiles')
  })

  it('returns an empty posts array without querying profiles when there are no posts', async () => {
    mocks.postsOrder.mockResolvedValue({ data: [], error: null })

    const response = await GET(new Request('https://example.test/api/admin/community'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ posts: [] })
    expect(mocks.profilesIn).not.toHaveBeenCalled()
  })

  it('maps a posts query failure to a generic 500', async () => {
    mocks.postsOrder.mockResolvedValue({ data: null, error: { message: 'db exploded' } })

    const response = await GET(new Request('https://example.test/api/admin/community'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch posts' })
  })

  it('maps a profiles query failure to a generic 500', async () => {
    mocks.postsOrder.mockResolvedValue({
      data: [{
        id: POST_ID,
        content: 'Hello world',
        category: 'geral',
        created_at: '2026-09-01T10:00:00.000Z',
        image_url: '',
        user_id: AUTHOR_ID,
      }],
      error: null,
    })
    mocks.profilesIn.mockResolvedValue({ data: null, error: { message: 'db exploded' } })

    const response = await GET(new Request('https://example.test/api/admin/community'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to fetch posts' })
  })
})

describe('DELETE', () => {
  it('rejects a malformed UUID before deleting', async () => {
    const response = await DELETE(new Request('https://example.test/api/admin/community?id=not-a-uuid', {
      method: 'DELETE',
    }))

    expect(response.status).toBe(400)
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('deletes a post through the admin client', async () => {
    const response = await DELETE(new Request(`https://example.test/api/admin/community?id=${POST_ID}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
  })

  it('returns 404 when no post matches the id', async () => {
    mocks.deleteMaybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await DELETE(new Request(`https://example.test/api/admin/community?id=${POST_ID}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Post not found' })
  })

  it('maps a delete failure to a generic 500', async () => {
    mocks.deleteMaybeSingle.mockResolvedValue({ data: null, error: { message: 'db exploded' } })

    const response = await DELETE(new Request(`https://example.test/api/admin/community?id=${POST_ID}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Failed to delete post' })
  })
})
