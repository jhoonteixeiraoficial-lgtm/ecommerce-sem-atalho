import { describe, expect, it } from 'vitest'
import { resolveAccess } from './access'

describe('resolveAccess', () => {
  it('allows an active administrator into admin and member areas', () => {
    expect(resolveAccess({ role: 'admin', status: 'active', accessUntil: null })).toEqual({
      canUseMemberArea: true,
      canUseAdminArea: true,
      reason: null,
    })
  })

  it('blocks a banned administrator from every protected area', () => {
    expect(resolveAccess({ role: 'admin', status: 'banned', accessUntil: null })).toEqual({
      canUseMemberArea: false,
      canUseAdminArea: false,
      reason: 'banned',
    })
  })

  it('allows a member only while paid access is current', () => {
    expect(resolveAccess({
      role: 'member',
      status: 'active',
      accessUntil: '2099-01-01T00:00:00.000Z',
      now: '2026-09-02T00:00:00.000Z',
    }).canUseMemberArea).toBe(true)
  })

  it('blocks an expired member', () => {
    expect(resolveAccess({
      role: 'member',
      status: 'active',
      accessUntil: '2026-09-01T00:00:00.000Z',
      now: '2026-09-02T00:00:00.000Z',
    }).reason).toBe('expired')
  })

  it('blocks a member whose paid-through date is malformed', () => {
    expect(resolveAccess({
      role: 'member',
      status: 'active',
      accessUntil: 'not-a-date',
      now: '2026-09-02T00:00:00.000Z',
    })).toEqual({
      canUseMemberArea: false,
      canUseAdminArea: false,
      reason: 'expired',
    })
  })
})
