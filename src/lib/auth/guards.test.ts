import { describe, expect, it, vi } from 'vitest'
import { createGuards, type GuardDependencies } from './guards'
import type { AppRole, AccountState } from './types'

function authUser(overrides: { id?: string; email?: string | null } = {}) {
  return { id: overrides.id ?? 'user-1', email: overrides.email ?? 'u@test.local' }
}

function authz(rows: { role?: AppRole; status?: AccountState; accessUntil?: string | null } = {}) {
  return {
    role: rows.role ?? 'member',
    status: rows.status ?? 'active',
    accessUntil: rows.accessUntil ?? null,
  }
}

function deps(overrides: Partial<GuardDependencies> = {}): GuardDependencies {
  return {
    getAuthUser: overrides.getAuthUser ?? vi.fn().mockResolvedValue(authUser()),
    getAuthorization: overrides.getAuthorization ?? vi.fn().mockResolvedValue(authz()),
  }
}

describe('requireUser', () => {
  it('rejects when no authenticated user exists', async () => {
    const d = deps({ getAuthUser: vi.fn().mockResolvedValue(null) })
    const guards = createGuards(d)
    await expect(guards.requireUser()).rejects.toMatchObject({ status: 401 })
  })

  it('fails closed when auth lookup throws', async () => {
    const d = deps({ getAuthUser: vi.fn().mockRejectedValue(new Error('connection refused')) })
    const guards = createGuards(d)
    await expect(guards.requireUser()).rejects.toMatchObject({ status: 503 })
  })

  it('returns an authorized user for a valid active member', async () => {
    const d = deps({
      getAuthUser: vi.fn().mockResolvedValue(authUser({ id: 'm1' })),
      getAuthorization: vi.fn().mockResolvedValue(authz({ role: 'member', status: 'active', accessUntil: '2099-01-01T00:00:00Z' })),
    })
    const guards = createGuards(d)
    const user = await guards.requireUser()
    expect(user).toEqual({ id: 'm1', email: 'u@test.local', role: 'member', status: 'active', accessUntil: '2099-01-01T00:00:00Z' })
  })

  it('rejects a banned member', async () => {
    const d = deps({
      getAuthorization: vi.fn().mockResolvedValue(authz({ role: 'member', status: 'banned' })),
    })
    const guards = createGuards(d)
    await expect(guards.requireUser()).rejects.toMatchObject({ status: 403 })
  })

  it('rejects an expired member', async () => {
    const d = deps({
      getAuthorization: vi.fn().mockResolvedValue(authz({ role: 'member', status: 'active', accessUntil: '2020-01-01T00:00:00Z' })),
    })
    const guards = createGuards(d)
    await expect(guards.requireUser()).rejects.toMatchObject({ status: 403 })
  })

  it('fails closed when authorization storage is unavailable', async () => {
    const d = deps({ getAuthorization: vi.fn().mockRejectedValue(new Error('database unavailable')) })
    const guards = createGuards(d)
    await expect(guards.requireUser()).rejects.toMatchObject({ status: 503 })
  })
})

describe('requireAdmin', () => {
  it('rejects a member even when the browser requests an admin route', async () => {
    const d = deps({
      getAuthorization: vi.fn().mockResolvedValue(authz({ role: 'member', status: 'active', accessUntil: '2099-01-01T00:00:00Z' })),
    })
    const guards = createGuards(d)
    await expect(guards.requireAdmin()).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a suspended admin', async () => {
    const d = deps({
      getAuthorization: vi.fn().mockResolvedValue(authz({ role: 'admin', status: 'suspended' })),
    })
    const guards = createGuards(d)
    await expect(guards.requireAdmin()).rejects.toMatchObject({ status: 403 })
  })

  it('fails closed when authorization storage is unavailable', async () => {
    const d = deps({
      getAuthUser: vi.fn().mockResolvedValue(authUser({ id: 'admin' })),
      getAuthorization: vi.fn().mockRejectedValue(new Error('database unavailable')),
    })
    const guards = createGuards(d)
    await expect(guards.requireAdmin()).rejects.toMatchObject({ status: 503 })
  })

  it('returns an authorized admin for a valid active admin', async () => {
    const d = deps({
      getAuthUser: vi.fn().mockResolvedValue(authUser({ id: 'a1', email: 'admin@test.local' })),
      getAuthorization: vi.fn().mockResolvedValue(authz({ role: 'admin', status: 'active' })),
    })
    const guards = createGuards(d)
    const user = await guards.requireAdmin()
    expect(user).toEqual({ id: 'a1', email: 'admin@test.local', role: 'admin', status: 'active', accessUntil: null })
  })

  it('rejects when no authenticated user exists', async () => {
    const d = deps({ getAuthUser: vi.fn().mockResolvedValue(null) })
    const guards = createGuards(d)
    await expect(guards.requireAdmin()).rejects.toMatchObject({ status: 401 })
  })
})
