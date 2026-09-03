import { describe, expect, it } from 'vitest'
import { profileUpdateSchema } from './route'

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
