import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authError, makeFromMock, makeQueryBuilder } from '../../../learning-test-helpers'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerGuards: vi.fn(),
  requireUser: vi.fn(),
  createAdminClient: vi.fn(),
  adminFrom: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))

vi.mock('@/lib/auth/server-guards', () => ({
  createServerGuards: mocks.createServerGuards,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

import { GET } from './route'

const AUTH_USER = {
  id: 'member-1',
  email: 'member@test.local',
  role: 'member' as const,
  status: 'active' as const,
  accessUntil: '2099-01-01T00:00:00.000Z',
}

function callRoute(moduleSlug: string, lessonSlug: string) {
  return GET(new Request('https://example.test/api/learning/lessons/x/y'), {
    params: Promise.resolve({ moduleSlug, lessonSlug }),
  })
}

function baseLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson-2',
    slug: 'lesson-2',
    title: 'Lesson 2',
    description: '',
    video_url: '',
    duration_seconds: 90,
    sort_order: 1,
    is_published: true,
    release_at: null,
    module: {
      id: 'module-1',
      slug: 'module-1',
      title: 'Module 1',
      description: '',
      sort_order: 0,
      is_published: true,
      release_at: null,
      course: { id: 'course-1', slug: 'course-1', title: 'Course 1', is_published: true, release_at: null },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER.id, email: AUTH_USER.email } }, error: null })
  mocks.createServerGuards.mockReturnValue({ requireUser: mocks.requireUser })
  mocks.requireUser.mockResolvedValue(AUTH_USER)
  mocks.createAdminClient.mockReturnValue({ from: mocks.adminFrom })
})

describe('GET /api/learning/lessons/[moduleSlug]/[lessonSlug]', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.requireUser.mockRejectedValue(authError(401))

    const res = await callRoute('module-1', 'lesson-2')

    expect(res.status).toBe(401)
  })

  it('returns 404 when the lesson does not exist', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({ lessons: [makeQueryBuilder({ data: null, error: { message: 'not found' } })] }),
    )

    const res = await callRoute('module-1', 'missing')

    expect(res.status).toBe(404)
  })

  it('returns 404 for a draft lesson', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({ lessons: [makeQueryBuilder({ data: baseLesson({ is_published: false }), error: null })] }),
    )

    const res = await callRoute('module-1', 'lesson-2')

    expect(res.status).toBe(404)
  })

  it('returns 404 for a lesson released in the future', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({
        lessons: [makeQueryBuilder({ data: baseLesson({ release_at: '2099-01-01T00:00:00.000Z' }), error: null })],
      }),
    )

    const res = await callRoute('module-1', 'lesson-2')

    expect(res.status).toBe(404)
  })

  it('returns 404 when the parent module is a draft', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({
        lessons: [
          makeQueryBuilder({
            data: baseLesson({
              module: {
                id: 'module-1', slug: 'module-1', title: 'Module 1', description: '', sort_order: 0,
                is_published: false, release_at: null,
                course: { id: 'course-1', slug: 'course-1', title: 'Course 1', is_published: true, release_at: null },
              },
            }),
            error: null,
          }),
        ],
      }),
    )

    const res = await callRoute('module-1', 'lesson-2')

    expect(res.status).toBe(404)
  })

  it('returns 404 when the parent course is a draft', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({
        lessons: [
          makeQueryBuilder({
            data: baseLesson({
              module: {
                id: 'module-1', slug: 'module-1', title: 'Module 1', description: '', sort_order: 0,
                is_published: true, release_at: null,
                course: { id: 'course-1', slug: 'course-1', title: 'Course 1', is_published: false, release_at: null },
              },
            }),
            error: null,
          }),
        ],
      }),
    )

    const res = await callRoute('module-1', 'lesson-2')

    expect(res.status).toBe(404)
  })

  it('returns progress and correct adjacent lessons for a released lesson', async () => {
    const adjacentLessons = [
      { id: 'lesson-1', slug: 'lesson-1', title: 'Lesson 1', sort_order: 0, is_published: true, release_at: null, module: { slug: 'module-1' } },
      { id: 'lesson-2', slug: 'lesson-2', title: 'Lesson 2', sort_order: 1, is_published: true, release_at: null, module: { slug: 'module-1' } },
      { id: 'lesson-3', slug: 'lesson-3', title: 'Lesson 3', sort_order: 2, is_published: true, release_at: null, module: { slug: 'module-1' } },
    ]

    mocks.adminFrom.mockImplementation(
      makeFromMock({
        lessons: [
          makeQueryBuilder({ data: baseLesson(), error: null }),
          makeQueryBuilder({ data: adjacentLessons, error: null }),
        ],
        lesson_progress: [
          makeQueryBuilder({ data: { position_seconds: 45, completed: false, completed_at: null, last_viewed_at: '2026-09-01T00:00:00.000Z' } }),
        ],
      }),
    )

    const res = await callRoute('module-1', 'lesson-2')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.lesson.id).toBe('lesson-2')
    expect(body.lesson.moduleSlug).toBe('module-1')
    expect(body.lesson.progress).toEqual({
      positionSeconds: 45,
      completed: false,
      completedAt: null,
      lastViewedAt: '2026-09-01T00:00:00.000Z',
    })
    expect(body.lesson.prevLesson).toEqual({ slug: 'lesson-1', title: 'Lesson 1' })
    expect(body.lesson.nextLesson).toEqual({ slug: 'lesson-3', title: 'Lesson 3' })
  })
})