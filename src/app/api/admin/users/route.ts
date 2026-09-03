import { NextResponse } from 'next/server'
import { createGuards } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'

  const { createClient } = await import('@/lib/supabase/server')
  const serverClient = await createClient()
  const { data: { user } } = await serverClient.auth.getUser()

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
    return NextResponse.json({ error: 'Forbidden' }, { status })
  }

  const admin = createAdminClient()

  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, full_name, email, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (profileError) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  const userIds = (profiles ?? []).map(p => p.id)

  const { data: roles } = await admin
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', userIds)

  const { data: statuses } = await admin
    .from('account_status')
    .select('user_id, status, reason')
    .in('user_id', userIds)

  const { data: subscriptions } = await admin
    .from('subscriptions')
    .select('user_id, plan, status, current_period_end')
    .in('user_id', userIds)
    .eq('status', 'active')

  const roleMap = new Map((roles ?? []).map(r => [r.user_id, r.role]))
  const statusMap = new Map((statuses ?? []).map(s => [s.user_id, s]))
  const subMap = new Map<string, typeof subscriptions>()
  for (const sub of (subscriptions ?? [])) {
    if (!subMap.has(sub.user_id)) subMap.set(sub.user_id, [])
    subMap.get(sub.user_id)!.push(sub)
  }

  const users = (profiles ?? []).map(p => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: roleMap.get(p.id) ?? 'member',
    status: statusMap.get(p.id)?.status ?? 'active',
    is_banned: statusMap.get(p.id)?.status === 'banned',
    ban_reason: statusMap.get(p.id)?.status === 'banned' ? (statusMap.get(p.id)?.reason ?? '') : '',
    created_at: p.created_at,
    updated_at: p.updated_at,
    subscriptions: subMap.get(p.id) ?? [],
  }))

  return NextResponse.json({ users })
}
