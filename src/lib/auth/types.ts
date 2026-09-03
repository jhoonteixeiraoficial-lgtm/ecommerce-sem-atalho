export type AppRole = 'member' | 'admin'
export type AccountState = 'active' | 'suspended' | 'banned'

export interface AccessInput {
  role: AppRole
  status: AccountState
  accessUntil: string | null
  now?: string
}

export interface AccessResult {
  canUseMemberArea: boolean
  canUseAdminArea: boolean
  reason: 'banned' | 'suspended' | 'expired' | null
}

export interface AuthorizedUser {
  id: string
  email: string | null
  role: AppRole
  status: AccountState
  accessUntil: string | null
}
