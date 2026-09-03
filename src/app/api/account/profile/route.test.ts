import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createAdminClient: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { PATCH, profileUpdateSchema } from './route'

function adminClient() {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        update: () => query,
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        single: async () => ({
          data: table === 'user_roles' ? { role: 'member' } : { status: 'active' },
          error: null,
        }),
        maybeSingle: async () => ({
          data: { current_period_end: '2099-01-01T00:00:00Z' },
          error: null,
        }),
        then: (resolve: (result: { error: null }) => unknown) => resolve({ error: null }),
      }
      return query
    },
  }
}

beforeEach(() => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'member-1', email: 'member@test.local' } } })
  mocks.createAdminClient.mockReturnValue(adminClient())
})

describe('profileUpdateSchema', () => {
  it('accepts valid profile data', () => {
    expect(profileUpdateSchema.safeParse({ fullName: 'João Silva', phone: '+5511999999999' }).success).toBe(true)
  })

  it('accepts avatarUrl as optional', () => {
    expect(profileUpdateSchema.safeParse({ fullName: 'João', phone: '', avatarUrl: 'https://example.com/avatar.jpg' }).success).toBe(true)
  })

  it('rejects role escalation', () => {
    expect(profileUpdateSchema.safeParse({ fullName: 'Member', phone: '', role: 'admin' }).success).toBe(false)
  })

  it('rejects is_banned injection', () => {
    expect(profileUpdateSchema.safeParse({ fullName: 'Member', phone: '', is_banned: false }).success).toBe(false)
  })

  it('rejects empty fullName', () => {
    expect(profileUpdateSchema.safeParse({ fullName: '', phone: '' }).success).toBe(false)
  })

  it('rejects fullName that is too long', () => {
    expect(profileUpdateSchema.safeParse({ fullName: 'A'.repeat(121), phone: '' }).success).toBe(false)
  })

  it('rejects non-url avatarUrl', () => {
    expect(profileUpdateSchema.safeParse({ fullName: 'João', phone: '', avatarUrl: 'not-a-url' }).success).toBe(false)
  })

  it('rejects extra fields', () => {
    expect(profileUpdateSchema.safeParse({ fullName: 'João', phone: '', unknown: 'field' }).success).toBe(false)
  })
})

describe('PATCH', () => {
  it('allows an active paid member to update their profile', async () => {
    const response = await PATCH(new Request('https://example.test/api/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Paid Member', phone: '+5511999999999' }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
  })
})
