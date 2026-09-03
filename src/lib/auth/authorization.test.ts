import { describe, expect, it } from 'vitest'
import { loadAuthorization } from './authorization'

type QueryResult = { data: Record<string, string> | null; error: Error | null }

function clientWith(results: Partial<Record<string, QueryResult>> = {}) {
  const defaults: Record<string, QueryResult> = {
    user_roles: { data: { role: 'member' }, error: null },
    account_status: { data: { status: 'active' }, error: null },
    subscriptions: { data: { current_period_end: '2099-01-01T00:00:00Z' }, error: null },
  }

  return {
    from(table: string) {
      const result = results[table] ?? defaults[table]
      const query = {
        select: () => query,
        eq: () => query,
        not: () => query,
        order: () => query,
        limit: () => query,
        single: async () => result,
        maybeSingle: async () => result,
      }
      return query
    },
  }
}

describe('loadAuthorization', () => {
  it('returns canonical authorization with the active subscription paid-through date', async () => {
    await expect(loadAuthorization(clientWith(), 'member-1')).resolves.toEqual({
      role: 'member',
      status: 'active',
      accessUntil: '2099-01-01T00:00:00Z',
    })
  })

  it.each(['user_roles', 'account_status', 'subscriptions'])(
    'fails when the %s lookup errors',
    async (table) => {
      const client = clientWith({ [table]: { data: null, error: new Error('database unavailable') } })
      await expect(loadAuthorization(client, 'member-1')).rejects.toThrow('Authorization service unavailable')
    },
  )

  it.each(['user_roles', 'account_status'])(
    'fails when the canonical %s row is missing',
    async (table) => {
      const client = clientWith({ [table]: { data: null, error: null } })
      await expect(loadAuthorization(client, 'member-1')).rejects.toThrow('Authorization service unavailable')
    },
  )
})
