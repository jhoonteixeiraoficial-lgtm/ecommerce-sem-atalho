import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type ModuleRow = {
  id: string
  slug: string
  title: string
  description: string
  sort_order: number
  is_published: boolean
  release_at: string | null
  course: {
    id: string
    slug: string
    title: string
    is_published: boolean
    release_at: string | null
  }
}

type LessonRow = {
  id: string
  slug: string
  title: string
  description: string
  video_url: string
  duration_seconds: number
  sort_order: number
  is_published: boolean
  release_at: string | null
}

type ProgressRow = {
  position_seconds: number
  completed: boolean
  completed_at: string | null
  last_viewed_at: string | null
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export async function GET(
  request: Request,
  { params }: { params: Promise<{ moduleSlug: string }> }
) {
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

  const { moduleSlug } = await params
  if (!slugPattern.test(moduleSlug)) {
    return NextResponse.json({ error: 'Invalid module slug' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { data: moduleData, error: moduleError } = await adminClient
    .from('modules')
    .select(`
      id, slug, title, description, sort_order, is_published, release_at,
      course:courses!inner (id, slug, title, is_published, release_at)
    `)
    .eq('slug', moduleSlug)
    .eq('is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`)
    .eq('course.is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`, { referencedTable: 'course' })
    .single()

  if (moduleError && moduleError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to fetch module' }, { status: 500 })
  }
  if (!moduleData) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  }

  const moduleDataTyped = moduleData as unknown as ModuleRow

  if (!moduleDataTyped.is_published ||
      (moduleDataTyped.release_at && new Date(moduleDataTyped.release_at) > new Date()) ||
      !moduleDataTyped.course?.is_published ||
      (moduleDataTyped.course?.release_at && new Date(moduleDataTyped.course.release_at) > new Date())) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 })
  }

  const { data: lessons, error: lessonsError } = await adminClient
    .from('lessons')
    .select('id, slug, title, description, video_url, duration_seconds, sort_order, is_published, release_at')
    .eq('module_id', moduleDataTyped.id)
    .eq('is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`)
    .order('sort_order', { ascending: true })

  if (lessonsError) {
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 })
  }

  const lessonsTyped = (lessons ?? []) as LessonRow[]
  const lessonIds = lessonsTyped.map((l) => l.id)

  const progressMap = new Map<string, ProgressRow>()
  if (lessonIds.length > 0) {
    const { data: progress, error: progressError } = await adminClient
      .from('lesson_progress')
      .select('lesson_id, position_seconds, completed, completed_at, last_viewed_at')
      .eq('user_id', authUser.id)
      .in('lesson_id', lessonIds)

    if (progressError) {
      return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
    }

    progress?.forEach((p) => {
      progressMap.set(p.lesson_id, {
        position_seconds: p.position_seconds,
        completed: p.completed,
        completed_at: p.completed_at,
        last_viewed_at: p.last_viewed_at,
      })
    })
  }

  const lessonDtos = lessonsTyped
    .filter((l) => l.is_published && (!l.release_at || new Date(l.release_at) <= new Date()))
    .map((lesson) => {
      const progress = progressMap.get(lesson.id)
      return {
        id: lesson.id,
        slug: lesson.slug,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.video_url,
        durationSeconds: lesson.duration_seconds,
        sortOrder: lesson.sort_order,
        isPublished: lesson.is_published,
        releaseAt: lesson.release_at,
        moduleSlug: moduleDataTyped.slug,
        progress: progress ? {
          positionSeconds: progress.position_seconds,
          completed: progress.completed,
          completedAt: progress.completed_at,
          lastViewedAt: progress.last_viewed_at,
        } : null,
        prevLesson: null,
        nextLesson: null,
      }
    })

  return NextResponse.json({
    module: {
      id: moduleDataTyped.id,
      slug: moduleDataTyped.slug,
      title: moduleDataTyped.title,
      description: moduleDataTyped.description,
      sortOrder: moduleDataTyped.sort_order,
      isPublished: moduleDataTyped.is_published,
      releaseAt: moduleDataTyped.release_at,
      courseSlug: moduleDataTyped.course.slug,
      lessons: lessonDtos,
    },
  })
}
