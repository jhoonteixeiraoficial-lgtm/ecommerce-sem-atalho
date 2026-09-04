import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authError, makeFromMock, makeQueryBuilder } from '../../learning-test-helpers'

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

function callRoute(moduleSlug: string) {
  return GET(new Request('https://example.test/api/learning/modules/x'), {
    params: Promise.resolve({ moduleSlug }),
  })
}

function baseModule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'module-1',
    slug: 'module-1',
    title: 'Module 1',
    description: '',
    sort_order: 0,
    is_published: true,
    release_at: null,
    course: { id: 'course-1', slug: 'course-1', title: 'Course 1', is_published: true, release_at: null },
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

describe('GET /api/learning/modules/[moduleSlug]', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.requireUser.mockRejectedValue(authError(401))

    const res = await callRoute('module-1')

    expect(res.status).toBe(401)
  })

  it('returns 403 when the account is suspended or banned', async () => {
    mocks.requireUser.mockRejectedValue(authError(403))
    expect((await callRoute('module-1')).status).toBe(403)
  })

  it('returns 503 when authorization lookup fails', async () => {
    mocks.requireUser.mockRejectedValue(authError(503))
    expect((await callRoute('module-1')).status).toBe(503)
  })

  it('returns 400 for a malformed module slug before creating a service client', async () => {
    const res = await callRoute('Not a slug!')
    expect(res.status).toBe(400)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('returns 404 when the module does not exist', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({ modules: [makeQueryBuilder({ data: null, error: { code: 'PGRST116', message: 'not found' } })] }),
    )

    const res = await callRoute('missing-module')

    expect(res.status).toBe(404)
  })

  it('returns 500 when the module query fails', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({ modules: [makeQueryBuilder({ data: null, error: { code: 'XX000', message: 'db down' } })] }),
    )
    expect((await callRoute('module-1')).status).toBe(500)
  })

  it('returns 404 for a draft module', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({ modules: [makeQueryBuilder({ data: baseModule({ is_published: false }), error: null })] }),
    )

    const res = await callRoute('module-1')

    expect(res.status).toBe(404)
  })

  it('returns 404 for a module released in the future', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({
        modules: [makeQueryBuilder({ data: baseModule({ release_at: '2099-01-01T00:00:00.000Z' }), error: null })],
      }),
    )

    const res = await callRoute('module-1')

    expect(res.status).toBe(404)
  })

  it('returns 404 when the parent course is a draft', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({
        modules: [
          makeQueryBuilder({
            data: baseModule({ course: { id: 'course-1', slug: 'course-1', title: 'Course 1', is_published: false, release_at: null } }),
            error: null,
          }),
        ],
      }),
    )

    const res = await callRoute('module-1')

    expect(res.status).toBe(404)
  })

  it('returns 404 when the parent course is released in the future', async () => {
    mocks.adminFrom.mockImplementation(makeFromMock({ modules: [makeQueryBuilder({
      data: baseModule({ course: { id: 'course-1', slug: 'course-1', title: 'Course 1', is_published: true, release_at: '2099-01-01T00:00:00.000Z' } }),
      error: null,
    })] }))
    expect((await callRoute('module-1')).status).toBe(404)
  })

  it('returns 500 when the lessons query fails', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({
        modules: [makeQueryBuilder({ data: baseModule(), error: null })],
        lessons: [makeQueryBuilder({ data: null, error: { message: 'db down' } })],
      }),
    )

    const res = await callRoute('module-1')

    expect(res.status).toBe(500)
  })

  it('returns 500 when the progress query fails', async () => {
    mocks.adminFrom.mockImplementation(makeFromMock({
      modules: [makeQueryBuilder({ data: baseModule(), error: null })],
      lessons: [makeQueryBuilder({ data: [{ id: 'lesson-1', slug: 'lesson-1', title: 'Lesson 1', description: '', video_url: '', duration_seconds: 60, sort_order: 0, is_published: true, release_at: null }], error: null })],
      lesson_progress: [makeQueryBuilder({ data: null, error: { message: 'db down' } })],
    }))
    expect((await callRoute('module-1')).status).toBe(500)
  })

  it('returns published lessons with progress and the course slug', async () => {
    const lessons = [
      { id: 'lesson-1', slug: 'lesson-1', title: 'Lesson 1', description: '', video_url: '', duration_seconds: 60, sort_order: 0, is_published: true, release_at: null },
      { id: 'lesson-draft', slug: 'lesson-draft', title: 'Draft lesson', description: '', video_url: '', duration_seconds: 60, sort_order: 1, is_published: false, release_at: null },
    ]

    const moduleBuilder = makeQueryBuilder({ data: baseModule(), error: null })
    const lessonsBuilder = makeQueryBuilder({ data: lessons, error: null })
    mocks.adminFrom.mockImplementation(
      makeFromMock({
        modules: [moduleBuilder],
        lessons: [lessonsBuilder],
        lesson_progress: [
          makeQueryBuilder({
            data: [{ lesson_id: 'lesson-1', position_seconds: 15, completed: false, completed_at: null, last_viewed_at: '2026-09-01T00:00:00.000Z' }],
          }),
        ],
      }),
    )

    const res = await callRoute('module-1')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.module.courseSlug).toBe('course-1')
    expect(body.module.lessons).toHaveLength(1)
    expect(body.module.lessons[0].id).toBe('lesson-1')
    expect(body.module.lessons[0].progress).toEqual({
      positionSeconds: 15,
      completed: false,
      completedAt: null,
      lastViewedAt: '2026-09-01T00:00:00.000Z',
    })
    expect(moduleBuilder.eq).toHaveBeenCalledWith('is_published', true)
    expect(moduleBuilder.eq).toHaveBeenCalledWith('course.is_published', true)
    expect(moduleBuilder.or).toHaveBeenCalledWith(expect.stringContaining('release_at.is.null'))
    expect(moduleBuilder.or).toHaveBeenCalledWith(expect.stringContaining('release_at.is.null'), { referencedTable: 'course' })
    expect(lessonsBuilder.eq).toHaveBeenCalledWith('is_published', true)
    expect(lessonsBuilder.or).toHaveBeenCalledWith(expect.stringContaining('release_at.is.null'))
    expect(body.module).toEqual({
      id: 'module-1', slug: 'module-1', title: 'Module 1', description: '', sortOrder: 0,
      isPublished: true, releaseAt: null, courseSlug: 'course-1',
      lessons: [{
        id: 'lesson-1', slug: 'lesson-1', title: 'Lesson 1', description: '', videoUrl: '',
        durationSeconds: 60, sortOrder: 0, isPublished: true, releaseAt: null,
        moduleSlug: 'module-1', progress: { positionSeconds: 15, completed: false, completedAt: null, lastViewedAt: '2026-09-01T00:00:00.000Z' },
        prevLesson: null, nextLesson: null,
      }],
    })
  })
})
