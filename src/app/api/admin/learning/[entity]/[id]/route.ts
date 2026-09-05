import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { adminLearningActionSchema, type AdminLearningAction } from '@/lib/learning/admin-schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchYouTubeOEmbed, getYouTubeThumbnailUrl } from '@/lib/learning/video'

type Context = { params: Promise<{ entity: string; id: string }> }

async function requireCanonicalAdmin() {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const serverClient = await createClient()
    const { data: { user }, error } = await serverClient.auth.getUser()
    return { user: await createServerGuards(user, error).requireAdmin(), response: null }
  } catch (error: unknown) {
    const candidate = error && typeof error === 'object' && 'status' in error
      ? (error as { status: number }).status
      : 500
    const status = candidate === 401 || candidate === 403 || candidate === 503 ? candidate : 500
    const message = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Service unavailable'
    return { user: null, response: NextResponse.json({ error: message }, { status }) }
  }
}

function rpcArguments(actorId: string, action: AdminLearningAction) {
  const metadata = action.action === 'update' ? action : null
  return {
    p_actor_user_id: actorId,
    p_entity: action.entity,
    p_action: action.action,
    p_entity_id: action.action === 'create' ? null : action.id,
    p_parent_id: null,
    p_slug: metadata?.slug ?? null,
    p_title: metadata?.title ?? null,
    p_description: metadata?.description ?? null,
    p_video_url: metadata && 'videoUrl' in metadata ? metadata.videoUrl ?? null : null,
    p_duration_seconds: metadata && 'durationSeconds' in metadata ? metadata.durationSeconds ?? null : null,
    p_sort_order: metadata?.sortOrder ?? null,
    p_is_published: metadata?.isPublished ?? null,
    p_release_at: metadata?.releaseAt ?? null,
    p_release_at_set: Boolean(metadata && Object.hasOwn(metadata, 'releaseAt')),
  }
}

function errorStatus(code?: string) {
  if (code === 'P0002' || code === '23505') return 409
  if (code === 'P0001' || code === '23503' || code === '23514' || code?.startsWith('22')) return 400
  return 500
}

async function mutate(
  action: AdminLearningAction,
  actorId: string,
  verb: 'update' | 'delete',
) {
  try {
    const { data, error } = await createAdminClient().rpc('admin_learning_action', rpcArguments(actorId, action))
    if (error) {
      return NextResponse.json(
        { error: `Unable to ${verb} learning content` },
        { status: errorStatus(error.code) },
      )
    }
    return verb === 'delete' ? NextResponse.json({ success: true }) : NextResponse.json({ id: data })
  } catch {
    return NextResponse.json({ error: `Unable to ${verb} learning content` }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const authorization = await requireCanonicalAdmin()
  if (authorization.response || !authorization.user) return authorization.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { entity, id } = await params
  const parsed = adminLearningActionSchema.safeParse({
    ...(body && typeof body === 'object' ? body : {}),
    entity,
    action: 'update',
    id,
  })
  if (!parsed.success || parsed.data.action !== 'update') {
    console.error('[learning] PATCH validation failed:', JSON.stringify(parsed.error?.flatten()))
    return NextResponse.json({ error: 'Invalid learning content', details: parsed.error?.flatten() ?? 'Unknown validation error' }, { status: 400 })
  }

  const data = parsed.data

  if (data.entity === 'lesson' && 'videoUrl' in data && data.videoUrl && !('thumbnailUrl' in data && data.thumbnailUrl)) {
    const oembed = await fetchYouTubeOEmbed(data.videoUrl)
    if (oembed) {
      ;(data as { thumbnailUrl?: string }).thumbnailUrl = oembed.thumbnailUrl
    }
  }

  return mutate(data, authorization.user.id, 'update')
}

export async function DELETE(_request: Request, { params }: Context) {
  const authorization = await requireCanonicalAdmin()
  if (authorization.response || !authorization.user) return authorization.response

  const { entity, id } = await params
  const parsed = adminLearningActionSchema.safeParse({ entity, action: 'delete', id })
  if (!parsed.success || parsed.data.action !== 'delete') {
    return NextResponse.json({ error: 'Invalid learning content' }, { status: 400 })
  }

  return mutate(parsed.data, authorization.user.id, 'delete')
}
