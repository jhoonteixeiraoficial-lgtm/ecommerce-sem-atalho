import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authError, makeFromMock, makeQueryBuilder } from '../learning-test-helpers'

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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: AUTH_USER.id, email: AUTH_USER.email } }, error: null })
  mocks.createServerGuards.mockReturnValue({ requireUser: mocks.requireUser })
  mocks.requireUser.mockResolvedValue(AUTH_USER)
  mocks.createAdminClient.mockReturnValue({ from: mocks.adminFrom })
})

describe('GET /api/learning/catalog', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.requireUser.mockRejectedValue(authError(401, 'Authentication required'))

    const res = await GET()

    expect(res.status).toBe(401)
  })

  it('returns 403 when account is suspended or banned', async () => {
    mocks.requireUser.mockRejectedValue(authError(403, 'Access denied: banned'))

    const res = await GET()

    expect(res.status).toBe(403)
  })

  it('returns 503 when authorization lookup fails', async () => {
    mocks.requireUser.mockRejectedValue(authError(503, 'Authorization service unavailable'))

    const res = await GET()

    expect(res.status).toBe(503)
  })

  it('returns 500 when the catalog query fails', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({ courses: [makeQueryBuilder({ data: null, error: { message: 'db down' } })] }),
    )

    const res = await GET()

    expect(res.status).toBe(500)
  })

  it('returns only published, released courses/modules/lessons with computed progress', async () => {
    const courses = [
      {
        id: 'course-1',
        slug: 'course-1',
        title: 'Course 1',
        description: '',
        sort_order: 0,
        is_published: true,
        release_at: null,
        modules: [
          {
            id: 'module-1',
            slug: 'module-1',
            title: 'Module 1',
            description: '',
            sort_order: 0,
            is_published: true,
            release_at: null,
            lessons: [
              { id: 'lesson-1', slug: 'lesson-1', title: 'Lesson 1', description: '', video_url: '', duration_seconds: 60, sort_order: 0, is_published: true, release_at: null },
              { id: 'lesson-2', slug: 'lesson-2', title: 'Lesson 2', description: '', video_url: '', duration_seconds: 60, sort_order: 1, is_published: true, release_at: null },
              { id: 'lesson-draft', slug: 'lesson-draft', title: 'Draft lesson', description: '', video_url: '', duration_seconds: 60, sort_order: 2, is_published: false, release_at: null },
            ],
          },
          {
            id: 'module-draft',
            slug: 'module-draft',
            title: 'Draft module',
            description: '',
            sort_order: 1,
            is_published: false,
            release_at: null,
            lessons: [],
          },
        ],
      },
    ]

    mocks.adminFrom.mockImplementation(
      makeFromMock({
        courses: [makeQueryBuilder({ data: courses, error: null })],
        lesson_progress: [
          makeQueryBuilder({
            data: [{ lesson_id: 'lesson-1', position_seconds: 30, completed: true, completed_at: '2026-09-01T00:00:00.000Z', last_viewed_at: '2026-09-01T00:00:00.000Z' }],
          }),
        ],
      }),
    )

    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.catalog).toHaveLength(1)
    expect(body.catalog[0].modules).toHaveLength(1)
    expect(body.catalog[0].modules[0].lessonCount).toBe(2)
    expect(body.catalog[0].modules[0].completedCount).toBe(1)
    expect(body.catalog[0].modules[0].progressPercentage).toBe(50)
  })
})