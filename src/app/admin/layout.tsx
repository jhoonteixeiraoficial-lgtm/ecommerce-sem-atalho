import { redirect } from 'next/navigation'
import { createGuards } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const serverClient = await createClient()
  const {
    data: { user },
  } = await serverClient.auth.getUser()

  const guards = createGuards({
    getAuthUser: async () => {
      if (!user) return null
      return { id: user.id, email: user.email ?? null }
    },
    getAuthorization: async () => {
      if (!user) throw new Error('No authenticated user')
      const admin = createAdminClient()
      const { data: roleRow } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single()
      const { data: statusRow } = await admin
        .from('account_status')
        .select('status')
        .eq('user_id', user.id)
        .single()
      return {
        role: (roleRow?.role ?? 'member') as 'member' | 'admin',
        status: (statusRow?.status ?? 'active') as 'active' | 'suspended' | 'banned',
        accessUntil: null,
      }
    },
  })

  try {
    await guards.requireAdmin()
  } catch (e: unknown) {
    const status = (e && typeof e === 'object' && 'status' in e) ? (e as { status: number }).status : 500
    if (status === 401) redirect('/login')
    redirect('/membros/dashboard')
  }

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="max-w-6xl mx-auto">
        {children}
      </div>
    </div>
  )
}
