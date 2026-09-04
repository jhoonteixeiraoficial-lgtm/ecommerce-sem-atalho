import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type CourseRow = {
  id: string
  slug: string
  title: string
  description: string
  sort_order: number
  is_published: boolean
  release_at: string | null
  modules: ModuleRow[]
}

type ModuleRow = {
  id: string
  slug: string
  title: string
  description: string
  sort_order: number
  is_published: boolean
  release_at: string | null
  lessons: LessonRow[]
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

export async function GET() {
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

  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { data: courses, error: coursesError } = await adminClient
    .from('courses')
    .select(`
      id, slug, title, description, sort_order, is_published, release_at,
      modules:modules (
        id, slug, title, description, sort_order, is_published, release_at,
        lessons:lessons (id, slug, title, description, video_url, duration_seconds, sort_order, is_published, release_at)
      )
    `)
    .eq('is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`)
    .eq('modules.is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`, { referencedTable: 'modules' })
    .eq('modules.lessons.is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`, { referencedTable: 'modules.lessons' })
    .order('sort_order', { ascending: true })

  if (coursesError) {
    return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 })
  }

  const coursesTyped = (courses ?? []) as CourseRow[]
  const nowDate = new Date(now)
  const visibleCourses = coursesTyped.filter(
    (course) => course.is_published && (!course.release_at || new Date(course.release_at) <= nowDate)
  )

  const lessonIds = visibleCourses.flatMap((course) =>
    course.modules
      ?.filter((module) => module.is_published && (!module.release_at || new Date(module.release_at) <= nowDate))
      .flatMap((module) => module.lessons
        ?.filter((lesson) => lesson.is_published && (!lesson.release_at || new Date(lesson.release_at) <= nowDate))
        .map((lesson) => lesson.id) ?? []) ?? []
  )

  const progressMap = new Map<string, ProgressRow>()
  if (lessonIds.length > 0) {
    const { data: progress, error: progressError } = await adminClient
      .from('lesson_progress')
      .select('lesson_id, position_seconds, completed, completed_at, last_viewed_at')
      .eq('user_id', authUser.id)
      .in('lesson_id', lessonIds)

    if (progressError) {
      return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 })
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

  const catalog = visibleCourses.map((course) => ({
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    sortOrder: course.sort_order,
    isPublished: course.is_published,
    releaseAt: course.release_at,
    modules: (course.modules ?? [])
      .filter((m) => m.is_published && (!m.release_at || new Date(m.release_at) <= nowDate))
      .map((module) => {
        const publishedLessons = (module.lessons ?? []).filter(
          (l) => l.is_published && (!l.release_at || new Date(l.release_at) <= nowDate)
        )
        const completed = publishedLessons.filter(
          (l) => progressMap.get(l.id)?.completed ?? false
        ).length
        return {
          id: module.id,
          slug: module.slug,
          title: module.title,
          description: module.description,
          sortOrder: module.sort_order,
          isPublished: module.is_published,
          releaseAt: module.release_at,
          lessonCount: publishedLessons.length,
          completedCount: completed,
          progressPercentage: publishedLessons.length > 0
            ? Math.round((completed / publishedLessons.length) * 100)
            : 0,
        }
      })
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }))

  return NextResponse.json({ catalog })
}
