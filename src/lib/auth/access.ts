import type { AccessInput, AccessResult } from './types'

export function resolveAccess(input: AccessInput): AccessResult {
  if (input.status === 'banned') {
    return { canUseMemberArea: false, canUseAdminArea: false, reason: 'banned' }
  }

  if (input.status === 'suspended') {
    return { canUseMemberArea: false, canUseAdminArea: false, reason: 'suspended' }
  }

  if (input.role === 'admin') {
    return { canUseMemberArea: true, canUseAdminArea: true, reason: null }
  }

  const now = new Date(input.now ?? new Date().toISOString())
  const accessUntil = input.accessUntil ? new Date(input.accessUntil) : null
  if (!accessUntil || Number.isNaN(accessUntil.getTime()) || accessUntil <= now) {
    return { canUseMemberArea: false, canUseAdminArea: false, reason: 'expired' }
  }

  return { canUseMemberArea: true, canUseAdminArea: false, reason: null }
}
