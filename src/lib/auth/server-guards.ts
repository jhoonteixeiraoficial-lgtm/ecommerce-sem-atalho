import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAuthorization } from './authorization'
import { createGuards } from './guards'

interface AuthUser {
  id: string
  email?: string | null
}

export function createServerGuards(user: AuthUser | null) {
  return createGuards({
    getAuthUser: async () => user ? { id: user.id, email: user.email ?? null } : null,
    getAuthorization: async () => {
      if (!user) throw new Error('No authenticated user')
      return loadAuthorization(createAdminClient(), user.id)
    },
  })
}
