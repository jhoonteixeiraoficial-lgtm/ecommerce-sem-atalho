import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerGuards } from '@/lib/auth/server-guards'
import { checkRateLimit } from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'

const postIdSchema = z.string().uuid()

const POST_COLUMNS = 'id, content, category, created_at, image_url, user_id'
const PROFILE_COLUMNS = 'id, full_name, email, is_banned'

function rateLimit(request: Request, operation: string) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const result = checkRateLimit(`admin-community-${operation}-${ip}`, operation === 'get' ? 60 : 20, 60000)
  if (result.allowed) return null

  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'X-RateLimit-Remaining': '0' } },
  )
}

async function requireCanonicalAdmin() {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const serverClient = await createClient()
    const { data: { user }, error } = await serverClient.auth.getUser()
    await createServerGuards(user, error).requireAdmin()
    return null
  } catch (error: unknown) {
    const errorStatus = error && typeof error === 'object' && 'status' in error
      ? (error as { status: number }).status
      : 500
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
}

export async function GET(request: Request) {
  const limited = rateLimit(request, 'get')
  if (limited) return limited

  const forbidden = await requireCanonicalAdmin()
  if (forbidden) return forbidden

  try {
    const admin = createAdminClient()
    const { data: posts, error: postsError } = await admin
      .from('community_posts')
      .select(POST_COLUMNS)
      .order('created_at', { ascending: false })

    if (postsError) {
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
    }

    const userIds = [...new Set((posts ?? []).map((post) => post.user_id))]
    const { data: profiles, error: profilesError } = userIds.length
      ? await admin.from('profiles').select(PROFILE_COLUMNS).in('id', userIds)
      : { data: [], error: null }

    if (profilesError) {
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
    }

    const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
    const authorizedPosts = (posts ?? []).map((post) => {
      const profile = profilesById.get(post.user_id)
      return {
        ...post,
        profile: {
          full_name: profile?.full_name ?? '',
          email: profile?.email ?? '',
          is_banned: profile?.is_banned ?? false,
        },
      }
    })

    return NextResponse.json({ posts: authorizedPosts })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const limited = rateLimit(request, 'delete')
  if (limited) return limited

  const forbidden = await requireCanonicalAdmin()
  if (forbidden) return forbidden

  const id = new URL(request.url).searchParams.get('id')
  const parsedId = postIdSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
  }

  try {
    const { data, error } = await createAdminClient()
      .from('community_posts')
      .delete()
      .eq('id', parsedId.data)
      .select('id')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
  }
}
