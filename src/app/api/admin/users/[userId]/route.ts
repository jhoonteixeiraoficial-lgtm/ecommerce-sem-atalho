import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { createAdminClient } from '@/lib/supabase/admin'
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

  const guards = createServerGuards(user)

  let authUser
  try {
    authUser = await guards.requireAdmin()
  } catch (e: unknown) {
    const status = (e && typeof e === 'object' && 'status' in e) ? (e as { status: number }).status : 500
    return NextResponse.json({ error: 'Forbidden' }, { status })
  }

  const admin = createAdminClient()
  const data = parsed.data
  const { error } = await admin.rpc('admin_user_action', {
    p_actor_user_id: authUser.id,
    p_target_user_id: userId,
    p_action: data.action,
    p_role: data.action === 'set_role' ? data.role : null,
    p_status: data.action === 'set_status' ? data.status : null,
    p_reason: data.action === 'set_status' ? data.reason ?? null : null,
  })

  if (error) {
    return NextResponse.json({ error: 'Unable to update user' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
