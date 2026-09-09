import { describe, expect, it, vi } from 'vitest'

const queriedTables = vi.hoisted(() => [] as string[])

vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({ response: null, authorizedUser: { id: 'user-1' } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      queriedTables.push(table)
      const builder: Record<string, unknown> = {}
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: { id: 'analysis-1', user_id: 'user-1', status: 'researching' } }),
        order: () => table === 'assertive_listings'
          ? Promise.resolve({ data: [] })
          : builder,
        limit: async () => ({
          data: [{ stage: 'research', event: 'started', created_at: '2026-09-09T00:00:00Z' }],
        }),
      })
      return builder
    },
  }),
}))

import { GET } from './route'

describe('GET /api/assertive/analyses/[id]', () => {
  it('retorna os eventos recentes para progresso real da interface', async () => {
    queriedTables.length = 0
    const response = await GET(new Request('http://localhost/analysis-1') as never, {
      params: Promise.resolve({ id: 'analysis-1' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      stage_events: [{ stage: 'research', event: 'started' }],
    })
    expect(queriedTables).toContain('assertive_stage_events')
  })
})
