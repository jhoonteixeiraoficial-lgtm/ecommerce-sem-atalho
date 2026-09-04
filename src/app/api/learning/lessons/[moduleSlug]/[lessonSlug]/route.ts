import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type LessonDetailRow = {
  id: string
  slug: string
  title: string
  description: string
  video_url: string
  duration_seconds: number
  sort_order: number
  is_published: boolean
  release_at: string | null
  module: {
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
}

type AdjacentLessonRow = {
  id: string
  slug: string
  title: string
  sort_order: number
  is_published: boolean
  release_at: string | null
  module: {
    slug: string
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ moduleSlug: string; lessonSlug: string }> }
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

  const { moduleSlug, lessonSlug } = await params
  const adminClient = createAdminClient()

  const { data: lessonData, error: lessonError } = await adminClient
    .from('lessons')
    .select(`
      id, slug, title, description, video_url, duration_seconds, sort_order, is_published, release_at,
      module:modules!inner (
        id, slug, title, description, sort_order, is_published, release_at,
        course:courses!inner (id, slug, title, is_published, release_at)
      )
    `)
    .eq('slug', lessonSlug)
    .eq('module.slug', moduleSlug)
    .single()

  if (lessonError || !lessonData) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const lessonTyped = lessonData as unknown as LessonDetailRow

  if (!lessonTyped.is_published ||
      (lessonTyped.release_at && new Date(lessonTyped.release_at) > new Date()) ||
      !lessonTyped.module?.is_published ||
      (lessonTyped.module?.release_at && new Date(lessonTyped.module.release_at) > new Date()) ||
      !lessonTyped.module?.course?.is_published ||
      (lessonTyped.module?.course?.release_at && new Date(lessonTyped.module.course.release_at) > new Date())) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const { data: progress } = await adminClient
    .from('lesson_progress')
    .select('position_seconds, completed, completed_at, last_viewed_at')
    .eq('user_id', authUser.id)
    .eq('lesson_id', lessonTyped.id)
    .single()

  const { data: allLessonsData } = await adminClient
    .from('lessons')
    .select('id, slug, title, sort_order, is_published, release_at, module:modules!inner(slug)')
    .eq('module_id', lessonTyped.module.id)
    .eq('is_published', true)
    .lte('release_at', new Date().toISOString())
    .order('sort_order', { ascending: true })

  const allLessons = (allLessonsData ?? []) as unknown as AdjacentLessonRow[]
  const lessonIndex = allLessons.findIndex((l) => l.id === lessonTyped.id)
  const prevLesson = lessonIndex > 0
    ? { slug: allLessons[lessonIndex - 1].slug, title: allLessons[lessonIndex - 1].title }
    : null
  const nextLesson = lessonIndex >= 0 && lessonIndex < allLessons.length - 1
    ? { slug: allLessons[lessonIndex + 1].slug, title: allLessons[lessonIndex + 1].title }
    : null

  return NextResponse.json({
    lesson: {
      id: lessonTyped.id,
      slug: lessonTyped.slug,
      title: lessonTyped.title,
      description: lessonTyped.description,
      videoUrl: lessonTyped.video_url,
      durationSeconds: lessonTyped.duration_seconds,
      sortOrder: lessonTyped.sort_order,
      isPublished: lessonTyped.is_published,
      releaseAt: lessonTyped.release_at,
      moduleSlug: lessonTyped.module.slug,
      progress: progress ? {
        positionSeconds: progress.position_seconds,
        completed: progress.completed,
        completedAt: progress.completed_at,
        lastViewedAt: progress.last_viewed_at,
      } : null,
      prevLesson,
      nextLesson,
    },
  })
}