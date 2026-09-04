import { NextResponse } from 'next/server'
import { createServerGuards } from '@/lib/auth/server-guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clampPosition, buildProgressUpsert } from '@/lib/learning/progress'
import { z } from 'zod'
import type { LessonProgressInput } from '@/lib/learning/types'

type LessonRow = {
  id: string
  duration_seconds: number
  is_published: boolean
  release_at: string | null
  module: {
    id: string
    is_published: boolean
    release_at: string | null
    course: {
      is_published: boolean
      release_at: string | null
    }
  }
}

type ExistingProgressRow = {
  completed: boolean
  completed_at: string | null
  started_at: string
}

const progressUpdateSchema = z.object({
  lessonId: z.string().uuid(),
  positionSeconds: z.number().int().nonnegative(),
  completed: z.boolean().optional(),
}).strict()

export async function PATCH(request: Request) {
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

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parseResult = progressUpdateSchema.safeParse(body)
  if (!parseResult.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { lessonId, positionSeconds, completed } = parseResult.data
  const adminClient = createAdminClient()
  const now = new Date().toISOString()

  const { data: lessonData, error: lessonError } = await adminClient
    .from('lessons')
    .select(`
      id, duration_seconds, is_published, release_at,
      module:modules!inner (id, is_published, release_at, course:courses!inner (is_published, release_at))
    `)
    .eq('id', lessonId)
    .eq('is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`)
    .eq('module.is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`, { referencedTable: 'module' })
    .eq('module.course.is_published', true)
    .or(`release_at.is.null,release_at.lte.${now}`, { referencedTable: 'module.course' })
    .single()

  if (lessonError && lessonError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 })
  }
  if (!lessonData) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const lessonTyped = lessonData as unknown as LessonRow

  if (!lessonTyped.is_published ||
      (lessonTyped.release_at && new Date(lessonTyped.release_at) > new Date()) ||
      !lessonTyped.module?.is_published ||
      (lessonTyped.module?.release_at && new Date(lessonTyped.module.release_at) > new Date()) ||
      !lessonTyped.module?.course?.is_published ||
      (lessonTyped.module?.course?.release_at && new Date(lessonTyped.module.course.release_at) > new Date())) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const clampedPosition = clampPosition(positionSeconds, lessonTyped.duration_seconds)

  const { data: existingProgress, error: existingProgressError } = await adminClient
    .from('lesson_progress')
    .select('completed, completed_at, started_at')
    .eq('user_id', authUser.id)
    .eq('lesson_id', lessonId)
    .single()

  if (existingProgressError && existingProgressError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
  }

  const existingProgressTyped = existingProgress as ExistingProgressRow | null

  const upsert: LessonProgressInput = buildProgressUpsert(
    authUser.id,
    lessonId,
    clampedPosition,
    completed ?? existingProgressTyped?.completed ?? false,
    now,
    existingProgressTyped ? {
      completed: existingProgressTyped.completed,
      completed_at: existingProgressTyped.completed_at,
      started_at: existingProgressTyped.started_at,
    } : undefined
  )

  const { data: updatedProgress, error: upsertError } = await adminClient
    .from('lesson_progress')
    .upsert(upsert, { onConflict: 'user_id,lesson_id' })
    .select('position_seconds, completed, completed_at, last_viewed_at')
    .single()

  if (upsertError) {
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
  }

  return NextResponse.json({
    progress: {
      positionSeconds: updatedProgress.position_seconds,
      completed: updatedProgress.completed,
      completedAt: updatedProgress.completed_at,
      lastViewedAt: updatedProgress.last_viewed_at,
    },
  })
}
