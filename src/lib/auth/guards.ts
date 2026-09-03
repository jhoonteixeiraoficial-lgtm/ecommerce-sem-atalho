import { resolveAccess } from './access'
import type { AccessResult, AppRole, AccountState, AuthorizedUser } from './types'

export interface GuardDependencies {
  getAuthUser(): Promise<{ id: string; email: string | null } | null>
  getAuthorization(): Promise<{
    role: AppRole
    status: AccountState
    accessUntil: string | null
  }>
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export function createGuards(deps: GuardDependencies) {
  async function requireUser(): Promise<AuthorizedUser> {
    let authUser: { id: string; email: string | null } | null
    try {
      authUser = await deps.getAuthUser()
    } catch {
      throw new AuthError('Authentication service unavailable', 503)
    }

    if (!authUser) {
      throw new AuthError('Authentication required', 401)
    }

    let authz: { role: AppRole; status: AccountState; accessUntil: string | null }
    try {
      authz = await deps.getAuthorization()
    } catch {
      throw new AuthError('Authorization service unavailable', 503)
    }

    const access = resolveAccess(authz)
    if (!access.canUseMemberArea) {
      throw new AuthError(`Access denied: ${access.reason}`, 403)
    }

    return {
      id: authUser.id,
      email: authUser.email,
      role: authz.role,
      status: authz.status,
      accessUntil: authz.accessUntil,
    }
  }

  async function requireAdmin(): Promise<AuthorizedUser> {
    const user = await requireUser()

    const access: AccessResult = resolveAccess({
      role: user.role,
      status: user.status,
      accessUntil: user.accessUntil,
    })

    if (!access.canUseAdminArea) {
      throw new AuthError('Admin access denied', 403)
    }

    return user
  }

  return { requireUser, requireAdmin }
}
