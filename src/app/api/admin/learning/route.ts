import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { adminLearningActionSchema, type AdminLearningAction } from '@/lib/learning/admin-schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { slugify, fetchYouTubeOEmbed, getYouTubeThumbnailUrl } from '@/lib/learning/video'

type LessonRow = {
  id: string; module_id: string; slug: string; title: string; description: string; video_url: string
  duration_seconds: number; sort_order: number; is_published: boolean; release_at: string | null
  thumbnail_url: string | null; created_at: string; updated_at: string
}

type ModuleRow = {
  id: string; course_id: string; slug: string; title: string; description: string; sort_order: number
  is_published: boolean; release_at: string | null; created_at: string; updated_at: string; lessons: LessonRow[]
}

type CourseRow = {
  id: string; slug: string; title: string; description: string; sort_order: number; is_published: boolean
  release_at: string | null; created_at: string; updated_at: string; modules: ModuleRow[]
}

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
  const creating = action.action === 'create'
  const updating = action.action === 'update'
  const metadata = creating || updating ? action : null
  const parentId = creating && action.entity === 'module'
    ? action.courseId
    : creating && action.entity === 'lesson' ? action.moduleId : null

  return {
    p_actor_user_id: actorId,
    p_entity: action.entity,
    p_action: action.action,
    p_entity_id: creating ? null : action.id,
    p_parent_id: parentId,
    p_slug: metadata?.slug ?? null,
    p_title: metadata?.title ?? null,
    p_description: metadata?.description ?? null,
    p_video_url: metadata && 'videoUrl' in metadata ? metadata.videoUrl ?? null : null,
    p_duration_seconds: metadata && 'durationSeconds' in metadata ? metadata.durationSeconds ?? null : null,
    p_sort_order: metadata?.sortOrder ?? null,
    p_is_published: metadata?.isPublished ?? null,
    p_release_at: metadata?.releaseAt ?? null,
    p_release_at_set: creating || Boolean(metadata && Object.hasOwn(metadata, 'releaseAt')),
  }
}

function mutationErrorStatus(code?: string) {
  if (code === 'P0002' || code === '23505') return 409
  if (code === 'P0001' || code === '23503' || code === '23514' || code?.startsWith('22')) return 400
  return 500
}

export async function GET() {
  const authorization = await requireCanonicalAdmin()
  if (authorization.response) return authorization.response

  try {
    const { data, error } = await createAdminClient()
      .from('courses')
      .select(`
        id, slug, title, description, sort_order, is_published, release_at, created_at, updated_at,
        modules:modules (
          id, course_id, slug, title, description, sort_order, is_published, release_at, created_at, updated_at,
          lessons:lessons (
            id, module_id, slug, title, description, video_url, duration_seconds, sort_order,
            is_published, release_at, thumbnail_url, created_at, updated_at
          )
        )
      `)
      .order('sort_order', { ascending: true })

    if (error) return NextResponse.json({ error: 'Unable to load learning content' }, { status: 500 })

    const courses = ((data ?? []) as CourseRow[]).map((course) => ({
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      sortOrder: course.sort_order,
      isPublished: course.is_published,
      releaseAt: course.release_at,
      createdAt: course.created_at,
      updatedAt: course.updated_at,
      modules: (course.modules ?? []).map((module) => ({
        id: module.id,
        courseId: module.course_id,
        slug: module.slug,
        title: module.title,
        description: module.description,
        sortOrder: module.sort_order,
        isPublished: module.is_published,
        releaseAt: module.release_at,
        createdAt: module.created_at,
        updatedAt: module.updated_at,
        lessons: (module.lessons ?? []).map((lesson) => ({
          id: lesson.id,
          moduleId: lesson.module_id,
          slug: lesson.slug,
          title: lesson.title,
          description: lesson.description,
          videoUrl: lesson.video_url,
          durationSeconds: lesson.duration_seconds,
          sortOrder: lesson.sort_order,
          isPublished: lesson.is_published,
          releaseAt: lesson.release_at,
          thumbnailUrl: lesson.thumbnail_url ?? null,
          createdAt: lesson.created_at,
          updatedAt: lesson.updated_at,
        })).sort((a, b) => a.sortOrder - b.sortOrder),
      })).sort((a, b) => a.sortOrder - b.sortOrder),
    }))

    return NextResponse.json({ courses })
  } catch {
    return NextResponse.json({ error: 'Unable to load learning content' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authorization = await requireCanonicalAdmin()
  if (authorization.response || !authorization.user) return authorization.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = adminLearningActionSchema.safeParse(body)
  if (!parsed.success || parsed.data.action !== 'create') {
    console.error('[learning] Validation failed:', JSON.stringify(parsed.error?.flatten()))
    return NextResponse.json({ error: 'Invalid learning content', details: parsed.error?.flatten() ?? 'Unknown validation error' }, { status: 400 })
  }

  const data = parsed.data
  const admin = createAdminClient()

  try {
    if (data.entity === 'lesson') {
      let slug = data.slug || slugify(data.title)
      let thumbnailUrl = data.thumbnailUrl ?? null

      const existingCount = await admin
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('module_id', data.moduleId)

      const autoSortOrder = data.sortOrder ?? (existingCount.count ?? 0)

      if (!thumbnailUrl && data.videoUrl) {
        const oembed = await fetchYouTubeOEmbed(data.videoUrl)
        if (oembed) thumbnailUrl = oembed.thumbnailUrl
        if (!data.slug && oembed?.title) slug = slugify(oembed.title)
      }

      const enriched = {
        ...data,
        slug,
        sortOrder: autoSortOrder,
        thumbnailUrl,
      }

      const { data: rpcData, error } = await admin.rpc(
        'admin_learning_action',
        rpcArguments(authorization.user.id, enriched),
      )
      if (error) {
        console.error('[learning] RPC error creating lesson:', error.code, error.message)
        return NextResponse.json(
          { error: 'Unable to create learning content' },
          { status: mutationErrorStatus(error.code) },
        )
      }
      return NextResponse.json({ id: rpcData }, { status: 201 })
    }

    const { data: rpcData, error } = await admin.rpc(
      'admin_learning_action',
      rpcArguments(authorization.user.id, data),
    )
    if (error) {
      console.error('[learning] RPC error:', error.code, error.message)
      return NextResponse.json(
        { error: 'Unable to create learning content' },
        { status: mutationErrorStatus(error.code) },
      )
    }
    return NextResponse.json({ id: rpcData }, { status: 201 })
  } catch (e) {
    console.error('[learning] Unexpected error:', e)
    return NextResponse.json({ error: 'Unable to create learning content' }, { status: 500 })
  }
}
