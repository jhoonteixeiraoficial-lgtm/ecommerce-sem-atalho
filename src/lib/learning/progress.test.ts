import { describe, expect, it } from 'vitest'
import {
  clampPosition,
  computeCompletionTransition,
  computeProgressPercentage,
  buildProgressUpsert,
  selectContinueWatching,
  type LessonWithProgress,
} from './progress'

describe('clampPosition', () => {
  it('clamps negative position to zero', () => {
    expect(clampPosition(-10, 120)).toBe(0)
  })

  it('clamps position over duration to duration', () => {
    expect(clampPosition(200, 120)).toBe(120)
  })

  it('keeps valid position unchanged', () => {
    expect(clampPosition(60, 120)).toBe(60)
  })

  it('handles unknown duration (0) by clamping to 0', () => {
    expect(clampPosition(60, 0)).toBe(0)
  })

  it('handles negative duration as 0', () => {
    expect(clampPosition(60, -5)).toBe(0)
  })
})

describe('computeCompletionTransition', () => {
  const now = '2026-09-03T12:00:00.000Z'
  const completedAt = '2026-09-01T08:00:00.000Z'

  it('returns completed=true and timestamp when marking complete', () => {
    const result = computeCompletionTransition(false, true, now)
    expect(result.completed).toBe(true)
    expect(result.completedAt).toBe(now)
  })

  it('returns completed=false and null when unmarking complete', () => {
    const result = computeCompletionTransition(true, false, now)
    expect(result.completed).toBe(false)
    expect(result.completedAt).toBeNull()
  })

  it('preserves completed=false and null when already not complete', () => {
    const result = computeCompletionTransition(false, false, now)
    expect(result.completed).toBe(false)
    expect(result.completedAt).toBeNull()
  })

  it('preserves completed=true and existing timestamp when already complete', () => {
    const result = computeCompletionTransition(true, true, now, completedAt)
    expect(result.completed).toBe(true)
    expect(result.completedAt).toBe(completedAt)
  })
})

describe('buildProgressUpsert', () => {
  it('persists the position already clamped by the lesson-aware caller', () => {
    const result = buildProgressUpsert(
      'member-1',
      'lesson-1',
      73,
      false,
      '2026-09-03T12:00:00.000Z',
    )

    expect(result.position_seconds).toBe(73)
  })
})

describe('computeProgressPercentage', () => {
  it('returns 0 when total lessons is 0', () => {
    expect(computeProgressPercentage(0, 0)).toBe(0)
    expect(computeProgressPercentage(5, 0)).toBe(0)
  })

  it('computes percentage correctly', () => {
    expect(computeProgressPercentage(3, 10)).toBe(30)
    expect(computeProgressPercentage(7, 10)).toBe(70)
    expect(computeProgressPercentage(10, 10)).toBe(100)
  })

  it('rounds to nearest integer', () => {
    expect(computeProgressPercentage(1, 3)).toBe(33)
    expect(computeProgressPercentage(2, 3)).toBe(67)
  })
})

describe('selectContinueWatching', () => {
  const baseLesson: LessonWithProgress = {
    id: 'lesson-1',
    slug: 'lesson-1',
    title: 'Lesson 1',
    description: '',
    videoUrl: '',
    thumbnailUrl: null,
    durationSeconds: 120,
    sortOrder: 0,
    isPublished: true,
    releaseAt: null,
    moduleSlug: 'module-1',
    module: { id: 'module-1', slug: 'module-1', title: 'Module 1', isPublished: true, releaseAt: null, sortOrder: 0 },
    progress: { positionSeconds: 30, completed: false, completedAt: null, lastViewedAt: '2026-09-03T10:00:00.000Z' },
    prevLesson: null,
    nextLesson: null,
  }

  it('returns most recently viewed incomplete lesson', () => {
    const lessons: LessonWithProgress[] = [
      { ...baseLesson, id: 'lesson-1', progress: { ...baseLesson.progress, lastViewedAt: '2026-09-03T10:00:00.000Z' } },
      { ...baseLesson, id: 'lesson-2', progress: { ...baseLesson.progress, lastViewedAt: '2026-09-03T11:00:00.000Z' } },
    ]
    const result = selectContinueWatching(lessons)
    expect(result?.id).toBe('lesson-2')
  })

  it('skips completed lessons', () => {
    const lessons: LessonWithProgress[] = [
      { ...baseLesson, id: 'lesson-1', progress: { ...baseLesson.progress, completed: true } },
      { ...baseLesson, id: 'lesson-2', progress: { ...baseLesson.progress, completed: false, lastViewedAt: '2026-09-03T11:00:00.000Z' } },
    ]
    const result = selectContinueWatching(lessons)
    expect(result?.id).toBe('lesson-2')
  })

  it('falls back to first incomplete lesson when no progress timestamps', () => {
    const lessons: LessonWithProgress[] = [
      { ...baseLesson, id: 'lesson-1', progress: { ...baseLesson.progress, lastViewedAt: null, completed: false } },
      { ...baseLesson, id: 'lesson-2', progress: { ...baseLesson.progress, lastViewedAt: null, completed: false } },
    ]
    const result = selectContinueWatching(lessons)
    expect(result?.id).toBe('lesson-1')
  })

  it('returns null when all lessons are completed', () => {
    const lessons: LessonWithProgress[] = [
      { ...baseLesson, id: 'lesson-1', progress: { ...baseLesson.progress, completed: true } },
      { ...baseLesson, id: 'lesson-2', progress: { ...baseLesson.progress, completed: true } },
    ]
    const result = selectContinueWatching(lessons)
    expect(result).toBeNull()
  })

  it('returns null when no lessons provided', () => {
    expect(selectContinueWatching([])).toBeNull()
  })
})
