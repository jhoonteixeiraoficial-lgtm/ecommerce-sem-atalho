import type { LessonWithProgress, LessonProgressInput } from './types'
export type { LessonProgressInput, LessonWithProgress } from './types'

/**
 * Clamps position to valid range [0, durationSeconds]
 */
export function clampPosition(positionSeconds: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0
  if (positionSeconds <= 0) return 0
  if (positionSeconds >= durationSeconds) return durationSeconds
  return Math.floor(positionSeconds)
}

/**
 * Computes completion state transition
 */
export function computeCompletionTransition(
  currentCompleted: boolean,
  requestedCompleted: boolean,
  now: string
): { completed: boolean; completedAt: string | null } {
  if (currentCompleted === requestedCompleted) {
    return { completed: requestedCompleted, completedAt: requestedCompleted ? now : null }
  }
  return { completed: requestedCompleted, completedAt: requestedCompleted ? now : null }
}

/**
 * Computes progress percentage
 */
export function computeProgressPercentage(completed: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((completed / total) * 100)
}

/**
 * Selects the most recently viewed incomplete lesson for continue-watching
 * Falls back to first incomplete lesson if no view timestamps
 */
export function selectContinueWatching(
  lessons: LessonWithProgress[]
): LessonWithProgress | null {
  const incomplete = lessons.filter((l) => !l.progress.completed)

  if (incomplete.length === 0) return null

  // Sort by lastViewedAt descending (most recent first)
  const withTimestamps = incomplete.filter((l) => l.progress.lastViewedAt)
  if (withTimestamps.length > 0) {
    return withTimestamps.sort(
      (a, b) =>
        new Date(b.progress.lastViewedAt!).getTime() - new Date(a.progress.lastViewedAt!).getTime()
    )[0]
  }

  // Fall back to first incomplete by sort order
  return incomplete.sort((a, b) => a.sortOrder - b.sortOrder)[0]
}

/**
 * Builds the canonical LessonProgressInput for upsert
 */
export function buildProgressUpsert(
  userId: string,
  lessonId: string,
  positionSeconds: number,
  completed: boolean,
  now: string,
  previous?: { completed: boolean; completed_at: string | null; started_at: string }
): LessonProgressInput {
  const { completed: finalCompleted, completedAt } = computeCompletionTransition(
    previous?.completed ?? false,
    completed,
    now
  )

  return {
    user_id: userId,
    lesson_id: lessonId,
    position_seconds: clampPosition(positionSeconds, 0), // duration validated in handler
    started_at: previous?.started_at ?? now,
    last_viewed_at: now,
    completed: finalCompleted,
    completed_at: completedAt,
  }
}