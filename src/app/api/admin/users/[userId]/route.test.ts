import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))

vi.mock('@/lib/auth/server-guards', () => ({
  createServerGuards: () => ({ requireAdmin: mocks.requireAdmin }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc }),
}))

import { adminUserActionSchema } from '@/lib/auth/admin-schema'
import { PATCH } from './route'

beforeEach(() => {
  mocks.rpc.mockClear()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor-1', email: 'admin@test.local' } } })
  mocks.requireAdmin.mockResolvedValue({
    id: 'actor-1',
    email: 'admin@test.local',
    role: 'admin',
    status: 'active',
    accessUntil: null,
  })
  mocks.rpc.mockResolvedValue({ data: null, error: null })
})

describe('adminUserActionSchema', () => {
  it('accepts valid set_role action', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_role', role: 'admin' }).success).toBe(true)
  })

  it('accepts valid set_status action', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_status', status: 'banned', reason: 'Spamming in community' }).success).toBe(true)
  })

  it('rejects set_status with short reason', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_status', status: 'banned', reason: 'ab' }).success).toBe(false)
  })

  it('rejects set_status with long reason', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_status', status: 'banned', reason: 'A'.repeat(501) }).success).toBe(false)
  })

  it('rejects set_role with invalid role', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_role', role: 'superadmin' }).success).toBe(false)
  })

  it('rejects set_status with invalid status', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_status', status: 'deleted', reason: 'Test' }).success).toBe(false)
  })

  it('rejects extra fields on set_role', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_role', role: 'admin', reason: 'extra' }).success).toBe(false)
  })

  it('rejects extra fields on set_status', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_status', status: 'banned', reason: 'Valid reason', extra: 'field' }).success).toBe(false)
  })

  it('rejects empty action', () => {
    expect(adminUserActionSchema.safeParse({}).success).toBe(false)
  })

  it('rejects set_status without reason', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_status', status: 'banned' }).success).toBe(false)
  })

  it('accepts activation without a reason', () => {
    expect(adminUserActionSchema.safeParse({ action: 'set_status', status: 'active' }).success).toBe(true)
  })

  it('accepts grant_subscription with a valid plan', () => {
    expect(adminUserActionSchema.safeParse({ action: 'grant_subscription', plan: 'combo' }).success).toBe(true)
  })

  it('rejects grant_subscription with an invalid plan', () => {
    expect(adminUserActionSchema.safeParse({ action: 'grant_subscription', plan: 'gold' }).success).toBe(false)
  })

  it('accepts revoke_subscription', () => {
    expect(adminUserActionSchema.safeParse({ action: 'revoke_subscription' }).success).toBe(true)
  })
})

describe('PATCH', () => {
  it('performs a role action with one database RPC', async () => {
    const response = await PATCH(
      new Request('https://example.test/api/admin/users/target-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set_role', role: 'member' }),
      }),
      { params: Promise.resolve({ userId: 'target-1' }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_user_action', {
      p_actor_user_id: 'actor-1',
      p_target_user_id: 'target-1',
      p_action: 'set_role',
      p_role: 'member',
      p_status: null,
      p_reason: null,
    })
  })

  it('delegates self-modification rejection to the transactional RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        details: null,
        hint: null,
        message: 'Admin user action rejected',
      },
    })

    const response = await PATCH(
      new Request('https://example.test/api/admin/users/actor-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set_status', status: 'banned', reason: 'Compromised account' }),
      }),
      { params: Promise.resolve({ userId: 'actor-1' }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to update user' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('maps unexpected resolved database errors to a generic 500 response', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        details: 'sensitive constraint detail',
        hint: null,
        message: 'duplicate key value violates unique constraint',
      },
    })

    const response = await PATCH(
      new Request('https://example.test/api/admin/users/target-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set_status', status: 'suspended', reason: 'Terms violation' }),
      }),
      { params: Promise.resolve({ userId: 'target-1' }) },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to update user' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('grants a subscription via admin_manage_subscription', async () => {
    const response = await PATCH(
      new Request('https://example.test/api/admin/users/target-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'grant_subscription', plan: 'combo' }),
      }),
      { params: Promise.resolve({ userId: 'target-1' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_manage_subscription', {
      p_actor_user_id: 'actor-1',
      p_target_user_id: 'target-1',
      p_action: 'grant',
      p_plan: 'combo',
      p_period_days: 365,
    })
  })

  it('revokes a subscription via admin_manage_subscription', async () => {
    const response = await PATCH(
      new Request('https://example.test/api/admin/users/target-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'revoke_subscription' }),
      }),
      { params: Promise.resolve({ userId: 'target-1' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_manage_subscription', {
      p_actor_user_id: 'actor-1',
      p_target_user_id: 'target-1',
      p_action: 'revoke',
      p_plan: null,
      p_period_days: null,
    })
  })

  it('maps thrown infrastructure errors to a generic 500 response', async () => {
    mocks.rpc.mockRejectedValue(new Error('database connection failed'))

    const response = await PATCH(
      new Request('https://example.test/api/admin/users/target-1', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'set_role', role: 'admin' }),
      }),
      { params: Promise.resolve({ userId: 'target-1' }) },
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to update user' })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
