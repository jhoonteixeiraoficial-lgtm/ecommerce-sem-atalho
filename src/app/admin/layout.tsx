import { redirect } from 'next/navigation'
import { createServerGuards } from '@/lib/auth/server-guards'
import { createClient } from '@/lib/supabase/server'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    const serverClient = await createClient()
    const {
      data: { user },
      error,
    } = await serverClient.auth.getUser()
    const guards = createServerGuards(user, error)
    await guards.requireAdmin()
  } catch (e: unknown) {
    const status = (e && typeof e === 'object' && 'status' in e) ? (e as { status: number }).status : 500
    if (status === 401) redirect('/login')
    if (status === 403) redirect('/membros/dashboard')
    redirect('/erro-de-acesso')
  }

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="max-w-6xl mx-auto">
        {children}
      </div>
    </div>
  )
}
