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
  it.each(['user_roles', 'account_status', 'subscriptions'])(
    'retries a transient future-issued JWT only for the failed %s lookup',
    async (table) => {
      const attempts: Record<string, number> = {}
      const client = {
        from(name: string) {
          attempts[name] = (attempts[name] ?? 0) + 1
          const error = Object.assign(new Error('JWT issued at future'), { code: 'PGRST303' })
          return clientWith(name === table && attempts[name] === 1
            ? { [name]: { data: null, error } }
            : {}).from(name)
        },
      }
      await expect(loadAuthorization(client, 'member-1')).resolves.toMatchObject({ role: 'member', status: 'active' })
      expect(attempts[table]).toBe(2)
      for (const name of ['user_roles', 'account_status', 'subscriptions']) {
        if (name !== table) expect(attempts[name]).toBe(1)
      }
    },
  )

  it('still denies access when the future-issued JWT error persists', async () => {
    let attempts = 0
    const client = {
      from(name: string) {
        if (name === 'user_roles') attempts++
        return clientWith({ user_roles: { data: null, error: Object.assign(new Error('JWT issued at future'), { code: 'PGRST303' }) } }).from(name)
      },
    }
    await expect(loadAuthorization(client, 'member-1')).rejects.toThrow('Authorization service unavailable')
    expect(attempts).toBe(3)
  })

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
