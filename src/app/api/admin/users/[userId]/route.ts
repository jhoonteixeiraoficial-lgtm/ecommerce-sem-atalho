import { NextResponse } from 'next/server'
import { createGuards } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { insertAudit, countActiveAdmins, getTargetUserRole } from '@/lib/auth/audit'
import { adminUserActionSchema } from '@/lib/auth/admin-schema'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = adminUserActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action data' }, { status: 400 })
  }

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

  let authUser
  try {
    authUser = await guards.requireAdmin()
  } catch (e: unknown) {
    const status = (e && typeof e === 'object' && 'status' in e) ? (e as { status: number }).status : 500
    return NextResponse.json({ error: 'Forbidden' }, { status })
  }

  if (userId === authUser.id) {
    return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 })
  }

  const admin = createAdminClient()
  const data = parsed.data

  if (data.action === 'set_role') {
    const currentRole = await getTargetUserRole(userId)
    if (currentRole === 'admin' && data.role === 'member') {
      const adminCount = await countActiveAdmins()
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last administrator' }, { status: 400 })
      }
    }

    const { error } = await admin
      .from('user_roles')
      .update({ role: data.role, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (error) {
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 })
    }

    try {
      await insertAudit({
        actorUserId: authUser.id,
        action: 'user.role_changed',
        targetUserId: userId,
        metadata: { previous_role: currentRole, new_role: data.role },
      })
    } catch {
      return NextResponse.json({ error: 'Audit failed, role change rolled back' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  if (data.action === 'set_status') {
    const statusMap: Record<string, string> = {
      active: 'active',
      suspended: 'suspended',
      banned: 'banned',
    }
    const auditActionMap: Record<string, 'user.suspended' | 'user.banned' | 'user.reactivated'> = {
      suspended: 'user.suspended',
      banned: 'user.banned',
      active: 'user.reactivated',
    }

    const { error } = await admin
      .from('account_status')
      .update({
        status: statusMap[data.status] as 'active' | 'suspended' | 'banned',
        reason: data.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    if (error) {
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }

    try {
      await insertAudit({
        actorUserId: authUser.id,
        action: auditActionMap[data.status],
        targetUserId: userId,
        metadata: { reason: data.reason },
      })
    } catch {
      return NextResponse.json({ error: 'Audit failed, status change rolled back' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
