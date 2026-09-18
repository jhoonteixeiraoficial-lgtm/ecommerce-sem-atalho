import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), saved: vi.fn(), upsert: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.read, single: mocks.saved }) }),
    upsert: mocks.upsert,
  }) }),
}))
import { getUserCollectToken, resolveCollectToken, rotateUserCollectToken } from '../collect-token'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.read.mockResolvedValue({ data: null, error: null })
  mocks.upsert.mockResolvedValue({ error: null })
})

describe('collector token lifecycle', () => {
  it('reuses an installed token without writing', async () => {
    mocks.read.mockResolvedValue({ data: { token: 'installed' }, error: null })
    expect(await getUserCollectToken('owner')).toBe('installed')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('returns the winner of concurrent creation without overwriting it', async () => {
    mocks.saved.mockResolvedValue({ data: { token: 'concurrent-winner' }, error: null })
    expect(await getUserCollectToken('owner')).toBe('concurrent-winner')
    expect(mocks.upsert).toHaveBeenCalledWith(
      { user_id: 'owner', token: expect.stringMatching(/^esc_[a-f0-9]{48}$/) },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
  })

  it('does not rotate a token after a failed lookup', async () => {
    mocks.read.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    await expect(getUserCollectToken('owner')).rejects.toThrow('consultar')
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('never returns an unpersisted token', async () => {
    mocks.saved.mockResolvedValue({ data: null, error: { message: 'unavailable' } })
    await expect(getUserCollectToken('owner')).rejects.toThrow('consultar')
  })

  it('overwrites a token only on explicit rotation', async () => {
    const token = await rotateUserCollectToken('owner')
    expect(token).toMatch(/^esc_[a-f0-9]{48}$/)
    expect(mocks.upsert).toHaveBeenCalledWith(
      { user_id: 'owner', token, rotated_at: expect.any(String) },
      { onConflict: 'user_id' },
    )
  })

  it.each([null, '', 'Bearer arbitrary', 'esc_' + 'a'.repeat(48)])('rejects malformed credentials before accessing storage', async authorization => {
    expect(await resolveCollectToken(authorization)).toBeNull()
    expect(mocks.read).not.toHaveBeenCalled()
  })
})
