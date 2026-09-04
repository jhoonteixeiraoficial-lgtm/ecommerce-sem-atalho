import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authError } from '@/app/api/learning/learning-test-helpers'

const ACTOR_ID = '00000000-0000-4000-8000-000000000900'
const COURSE_ID = '00000000-0000-4000-8000-000000000901'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), createServerGuards: vi.fn(), requireAdmin: vi.fn(), createAdminClient: vi.fn(), rpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/auth/server-guards', () => ({ createServerGuards: mocks.createServerGuards }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { DELETE, PATCH } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: ACTOR_ID } }, error: null })
  mocks.createServerGuards.mockReturnValue({ requireAdmin: mocks.requireAdmin })
  mocks.requireAdmin.mockResolvedValue({ id: ACTOR_ID, role: 'admin', status: 'active' })
  mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({ data: COURSE_ID, error: null })
})

const context = (entity = 'course', id = COURSE_ID) => ({ params: Promise.resolve({ entity, id }) })

describe('PATCH /api/admin/learning/[entity]/[id]', () => {
  it('updates only explicit metadata with one RPC', async () => {
    const response = await PATCH(new Request('https://example.test/api/admin/learning/course/id', {
      method: 'PATCH', body: JSON.stringify({ title: 'Updated course', isPublished: true }),
    }), context())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ id: COURSE_ID })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_learning_action', {
      p_actor_user_id: ACTOR_ID, p_entity: 'course', p_action: 'update', p_entity_id: COURSE_ID,
      p_parent_id: null, p_slug: null, p_title: 'Updated course', p_description: null,
      p_video_url: null, p_duration_seconds: null, p_sort_order: null, p_is_published: true, p_release_at: null,
      p_release_at_set: false,
    })
  })

  it.each([
    ['an immutable parent', 'module', { courseId: COURSE_ID }],
    ['an unknown field', 'course', { title: 'Course', actorUserId: 'attacker' }],
    ['an empty update', 'course', {}],
  ])('rejects %s before constructing the service client', async (_case, entity, body) => {
    const response = await PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify(body) }), context(entity))

    expect(response.status).toBe(400)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('rejects invalid entities and IDs', async () => {
    const response = await PATCH(new Request('https://example.test', { method: 'PATCH', body: JSON.stringify({ title: 'Title' }) }), context('material', 'bad-id'))

    expect(response.status).toBe(400)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/learning/[entity]/[id]', () => {
  it('deletes by validated route identity with one RPC', async () => {
    const response = await DELETE(new Request('https://example.test', { method: 'DELETE' }), context())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith('admin_learning_action', {
      p_actor_user_id: ACTOR_ID, p_entity: 'course', p_action: 'delete', p_entity_id: COURSE_ID,
      p_parent_id: null, p_slug: null, p_title: null, p_description: null,
      p_video_url: null, p_duration_seconds: null, p_sort_order: null, p_is_published: null, p_release_at: null,
      p_release_at_set: false,
    })
  })

  it.each([[401, 'Unauthorized'], [403, 'Forbidden'], [503, 'Service unavailable']] as const)(
    'denies canonical authorization status %s before service-client creation',
    async (status, message) => {
      mocks.requireAdmin.mockRejectedValue(authError(status, 'sensitive detail'))

      const response = await DELETE(new Request('https://example.test', { method: 'DELETE' }), context())

      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toEqual({ error: message })
      expect(mocks.createAdminClient).not.toHaveBeenCalled()
    },
  )

  it.each([['P0001', 400], ['P0002', 409], ['23505', 409], ['XX000', 500]])(
    'maps database code %s to a generic %s response',
    async (code, status) => {
      mocks.rpc.mockResolvedValue({ data: null, error: { code, message: 'sensitive database detail' } })

      const response = await DELETE(new Request('https://example.test', { method: 'DELETE' }), context())

      expect(response.status).toBe(status)
      await expect(response.json()).resolves.toEqual({ error: 'Unable to delete learning content' })
    },
  )
})
