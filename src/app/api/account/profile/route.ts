import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { createAdminClient } from '@/lib/supabase/admin'

export const profileUpdateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30),
  avatarUrl: z.string().url().max(2048).optional(),
}).strict()

export async function GET() {
  const { createClient } = await import('@/lib/supabase/server')
  const serverClient = await createClient()
  const { data: { user } } = await serverClient.auth.getUser()

  const guards = createServerGuards(user)

  let authUser
  try {
    authUser = await guards.requireUser()
  } catch (e: unknown) {
    const errorStatus = (e && typeof e === 'object' && 'status' in e) ? (e as { status: number }).status : 500
    const status = errorStatus === 401 || errorStatus === 403 || errorStatus === 503
      ? errorStatus
      : 500
    const message = status === 401
      ? 'Unauthorized'
      : status === 403
        ? 'Forbidden'
        : status === 503
          ? 'Service unavailable'
          : 'Internal server error'
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ role: authUser.role, status: authUser.status })
}

export async function PATCH(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = profileUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid profile data' }, { status: 400 })
  }

  const { createClient } = await import('@/lib/supabase/server')
  const serverClient = await createClient()
  const { data: { user } } = await serverClient.auth.getUser()

  const guards = createServerGuards(user)

  let authUser
  try {
    authUser = await guards.requireUser()
  } catch (e: unknown) {
    const status = (e && typeof e === 'object' && 'status' in e) ? (e as { status: number }).status : 500
    return NextResponse.json({ error: 'Unauthorized' }, { status })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      avatar_url: parsed.data.avatarUrl ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', authUser.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
