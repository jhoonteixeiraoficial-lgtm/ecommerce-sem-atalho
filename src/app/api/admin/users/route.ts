import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const url = new URL(request.url)

  const { createClient } = await import('@/lib/supabase/server')
  const serverClient = await createClient()
  const { data: { user } } = await serverClient.auth.getUser()

  const guards = createServerGuards(user)

  try {
    await guards.requireAdmin()
  } catch (e: unknown) {
    const status = (e && typeof e === 'object' && 'status' in e) ? (e as { status: number }).status : 500
    return NextResponse.json({ error: 'Forbidden' }, { status })
  }

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const search = url.searchParams.get('search')?.trim() || ''
  const from = (page - 1) * limit
  const to = from + limit - 1

  const admin = createAdminClient()

  let query = admin
    .from('profiles')
    .select('id, full_name, email, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)
  }

  query = query.range(from, to)

  const { data: profiles, error: profileError, count } = await query

  if (profileError) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  const userIds = (profiles ?? []).map(p => p.id)

  const [rolesResult, statusesResult, subscriptionsResult] = await Promise.all([
    admin
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds),
    admin
      .from('account_status')
      .select('user_id, status, reason')
      .in('user_id', userIds),
    admin
      .from('subscriptions')
      .select('user_id, plan, status, current_period_end')
      .in('user_id', userIds)
      .eq('status', 'active'),
  ])

  const roles = rolesResult.data
  const statuses = statusesResult.data
  const subscriptions = subscriptionsResult.data

  if (rolesResult.error || statusesResult.error || subscriptionsResult.error) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

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

  const total = count ?? 0

  return NextResponse.json({
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}
