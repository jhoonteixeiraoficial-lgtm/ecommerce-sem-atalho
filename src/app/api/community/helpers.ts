import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { checkRateLimit } from '@/lib/security'
import { createClient } from '@/lib/supabase/server'

export async function requireCommunityUser() {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    const authorizedUser = await createServerGuards(user, error).requireUser()

    return { authorizedUser, response: null, supabase }
  } catch (error: unknown) {
    const errorStatus = error && typeof error === 'object' && 'status' in error
      ? (error as { status: number }).status
      : 503
    const status = errorStatus === 401 || errorStatus === 403 || errorStatus === 503
      ? errorStatus
      : 503
    const message = status === 401
      ? 'Unauthorized'
      : status === 403
        ? 'Forbidden'
        : 'Service unavailable'

    return {
      authorizedUser: null,
      response: NextResponse.json({ error: message }, { status }),
      supabase: null,
    }
  }
}

export function enforceCommunityRateLimit(
  userId: string,
  resource: string,
  operation: string,
  limit: number,
) {
  const result = checkRateLimit(`${resource}-${operation}-${userId}`, limit, 60000)
  if (result.allowed) return null

  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'X-RateLimit-Remaining': '0' } },
  )
}

export async function readJson(request: Request) {
  try {
    return { body: await request.json() as unknown, response: null }
  } catch {
    return {
      body: null,
      response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }),
    }
  }
}

export function searchParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries())
}

export function invalidInput() {
  return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
}
