import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authError, makeQueryBuilder } from '@/app/api/learning/learning-test-helpers'

const ACTOR_ID = '00000000-0000-4000-8000-000000000900'
const COURSE_ID = '00000000-0000-4000-8000-000000000901'
const MODULE_ID = '00000000-0000-4000-8000-000000000902'
const LESSON_ID = '00000000-0000-4000-8000-000000000903'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), createServerGuards: vi.fn(), requireAdmin: vi.fn(),
  createAdminClient: vi.fn(), from: vi.fn(), rpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/auth/server-guards', () => ({ createServerGuards: mocks.createServerGuards }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { GET, POST } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID, email: 'admin@test.local' } }, error: null })
  mocks.createServerGuards.mockReturnValue({ requireAdmin: mocks.requireAdmin })
  mocks.requireAdmin.mockResolvedValue({ id: ACTOR_ID, email: 'admin@test.local', role: 'admin', status: 'active', accessUntil: null })
  mocks.createAdminClient.mockReturnValue({ from: mocks.from, rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: LESSON_ID, error: null })
})

describe('GET /api/admin/learning', () => {
  it.each([[401, 'Unauthorized'], [403, 'Forbidden'], [503, 'Service unavailable']] as const)(
    'returns a generic %s response and never constructs the service client',
    async (status, message) => {
      mocks.requireAdmin.mockRejectedValue(authError(status, 'sensitive detail'))

      const response = await GET()

      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toEqual({ error: message })
      expect(mocks.createAdminClient).not.toHaveBeenCalled()
    },
  )

  it('passes the auth lookup result to the canonical guard', async () => {
    const authFailure = { message: 'auth unavailable' }
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: authFailure })
    mocks.from.mockReturnValue(makeQueryBuilder({ data: [], error: null }))

    await GET()

    expect(mocks.createServerGuards).toHaveBeenCalledWith(null, authFailure)
  })

  it('returns every state as an explicit camelCase tree', async () => {
    const query = makeQueryBuilder({
      data: [{
        id: COURSE_ID, slug: 'course', title: 'Course', description: 'Course description', sort_order: 0,
        is_published: false, release_at: '2099-01-01T00:00:00.000Z', created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z',
        ignored_column: 'never expose',
        modules: [{
          id: MODULE_ID, course_id: COURSE_ID, slug: 'module', title: 'Module', description: '', sort_order: 1,
          is_published: true, release_at: null, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z',
          lessons: [{
            id: LESSON_ID, module_id: MODULE_ID, slug: 'lesson', title: 'Lesson', description: '', video_url: 'https://video.example.test/1',
            duration_seconds: 300, sort_order: 2, is_published: false, release_at: null, thumbnail_url: null,
            created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z', ignored_column: 'never expose',
          }],
        }],
      }],
      error: null,
    })
    mocks.from.mockReturnValue(query)

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ courses: [{
      id: COURSE_ID, slug: 'course', title: 'Course', description: 'Course description', sortOrder: 0,
      isPublished: false, releaseAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
      modules: [{
        id: MODULE_ID, courseId: COURSE_ID, slug: 'module', title: 'Module', description: '', sortOrder: 1,
        isPublished: true, releaseAt: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
        lessons: [{
          id: LESSON_ID, moduleId: MODULE_ID, slug: 'lesson', title: 'Lesson', description: '', videoUrl: 'https://video.example.test/1',
          durationSeconds: 300, sortOrder: 2, isPublished: false, releaseAt: null, thumbnailUrl: null,
          createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
        }],
      }],
    }] })
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.createAdminClient.mock.invocationCallOrder[0])
  })

  it('maps database failures to a generic 500', async () => {
    mocks.from.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'sensitive database error' } }))

    const response = await GET()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to load learning content' })
  })
})

describe('POST /api/admin/learning', () => {
  const lesson = {
    entity: 'lesson', action: 'create', moduleId: MODULE_ID, slug: 'lesson', title: 'Lesson', description: '',
    videoUrl: 'https://video.example.test/1', durationSeconds: 300, sortOrder: 0, isPublished: false, releaseAt: null,
  }

  it('creates validated metadata with one service-only RPC and the guarded actor ID', async () => {
    const response = await POST(new Request('https://example.test/api/admin/learning', {
      method: 'POST', body: JSON.stringify(lesson),
    }))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: LESSON_ID })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_learning_action', {
      p_actor_user_id: ACTOR_ID, p_entity: 'lesson', p_action: 'create', p_entity_id: null,
      p_parent_id: MODULE_ID, p_slug: 'lesson', p_title: 'Lesson', p_description: '',
      p_video_url: 'https://video.example.test/1', p_duration_seconds: 300, p_sort_order: 0,
      p_is_published: false, p_release_at: null, p_release_at_set: true, p_thumbnail_url: null,
    })
  })

  it('rejects malformed or unknown fields before constructing the service client', async () => {
    const response = await POST(new Request('https://example.test/api/admin/learning', {
      method: 'POST', body: JSON.stringify({ ...lesson, actorUserId: 'attacker' }),
    }))

    expect(response.status).toBe(400)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['P0001', 400],
    ['P0002', 409],
    ['23505', 409],
    ['XX000', 500],
  ])('maps database code %s to %s without exposing details', async (code, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'sensitive database detail' } })

    const response = await POST(new Request('https://example.test/api/admin/learning', {
      method: 'POST', body: JSON.stringify(lesson),
    }))

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toEqual({ error: 'Unable to create learning content' })
  })
})
