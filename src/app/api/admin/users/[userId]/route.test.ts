import { describe, expect, it } from 'vitest'
import { adminUserActionSchema } from '@/lib/auth/admin-schema'

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
})
