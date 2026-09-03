import { createAdminClient } from '@/lib/supabase/admin'

export type AuditAction = 'user.role_changed' | 'user.suspended' | 'user.banned' | 'user.reactivated'

export async function insertAudit(params: {
  actorUserId: string
  action: AuditAction
  targetUserId: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('admin_audit_log').insert({
    actor_user_id: params.actorUserId,
    action: params.action,
    target_user_id: params.targetUserId,
    metadata: params.metadata ?? {},
  })
  if (error) {
    throw new Error(`Audit insertion failed: ${error.message}`)
  }
}

export async function countActiveAdmins(): Promise<number> {
  const admin = createAdminClient()
  const { count, error } = await admin
    .from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role', 'admin')
  if (error) throw new Error(`Failed to count admins: ${error.message}`)
  return count ?? 0
}

export async function getTargetUserRole(targetUserId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', targetUserId)
    .single()
  if (error) return null
  return data?.role ?? null
}
