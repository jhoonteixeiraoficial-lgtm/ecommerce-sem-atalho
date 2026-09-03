import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { createServerGuards } from './server-guards'

describe('createServerGuards', () => {
  it('converts a resolved authentication lookup error to 503', async () => {
    const guards = createServerGuards(null, new Error('upstream authentication details'))

    await expect(guards.requireAdmin()).rejects.toMatchObject({ status: 503 })
  })
})
