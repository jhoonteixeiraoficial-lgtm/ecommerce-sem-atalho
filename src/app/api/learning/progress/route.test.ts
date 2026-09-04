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

import { PATCH } from './route'

const AUTH_USER = {
  id: 'member-1',
  email: 'member@test.local',
  role: 'member' as const,
  status: 'active' as const,
  accessUntil: '2099-01-01T00:00:00.000Z',
}

const VALID_LESSON_ID = '00000000-0000-4000-8000-000000000001'

function patchRequest(body: unknown, raw?: string) {
  return new Request('https://example.test/api/learning/progress', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })
}

function baseLesson(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_LESSON_ID,
    duration_seconds: 100,
    is_published: true,
    release_at: null,
    module: {
      id: 'module-1',
      is_published: true,
      release_at: null,
      course: { is_published: true, release_at: null },
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

describe('PATCH /api/learning/progress', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.requireUser.mockRejectedValue(authError(401))

    const res = await PATCH(patchRequest({ lessonId: VALID_LESSON_ID, positionSeconds: 10 }))

    expect(res.status).toBe(401)
  })

  it('returns 403 when the account is suspended or banned', async () => {
    mocks.requireUser.mockRejectedValue(authError(403))

    const res = await PATCH(patchRequest({ lessonId: VALID_LESSON_ID, positionSeconds: 10 }))

    expect(res.status).toBe(403)
  })

  it('returns 503 when authorization lookup fails', async () => {
    mocks.requireUser.mockRejectedValue(authError(503))

    const res = await PATCH(patchRequest({ lessonId: VALID_LESSON_ID, positionSeconds: 10 }))

    expect(res.status).toBe(503)
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await PATCH(patchRequest(undefined, 'not-json'))

    expect(res.status).toBe(400)
  })

  it('returns 400 for a non-UUID lessonId', async () => {
    const res = await PATCH(patchRequest({ lessonId: 'not-a-uuid', positionSeconds: 10 }))

    expect(res.status).toBe(400)
  })

  it('returns 400 for negative positionSeconds', async () => {
    const res = await PATCH(patchRequest({ lessonId: VALID_LESSON_ID, positionSeconds: -5 }))

    expect(res.status).toBe(400)
  })

  it('rejects an attempt to inject another user id or a fabricated completedAt via unknown fields', async () => {
    const res = await PATCH(
      patchRequest({
        lessonId: VALID_LESSON_ID,
        positionSeconds: 10,
        userId: 'someone-else',
        completedAt: '2000-01-01T00:00:00.000Z',
      }),
    )

    expect(res.status).toBe(400)
  })

  it('returns 404 when the lesson does not exist', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({ lessons: [makeQueryBuilder({ data: null, error: { message: 'not found' } })] }),
    )

    const res = await PATCH(patchRequest({ lessonId: VALID_LESSON_ID, positionSeconds: 10 }))

    expect(res.status).toBe(404)
  })

  it('returns 404 when the lesson is a draft', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({ lessons: [makeQueryBuilder({ data: baseLesson({ is_published: false }), error: null })] }),
    )

    const res = await PATCH(patchRequest({ lessonId: VALID_LESSON_ID, positionSeconds: 10 }))

    expect(res.status).toBe(404)
  })

  it('clamps position to the lesson duration and persists the authorized user id', async () => {
    const upsertBuilder = makeQueryBuilder({
      data: { position_seconds: 100, completed: false, completed_at: null, last_viewed_at: '2026-09-01T00:00:00.000Z' },
      error: null,
    })

    mocks.adminFrom.mockImplementation(
      makeFromMock({
        lessons: [makeQueryBuilder({ data: baseLesson(), error: null })],
        lesson_progress: [
          makeQueryBuilder({ data: null }), // no existing progress
          upsertBuilder,
        ],
      }),
    )

    const res = await PATCH(patchRequest({ lessonId: VALID_LESSON_ID, positionSeconds: 999 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.progress.positionSeconds).toBe(100)
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: AUTH_USER.id, lesson_id: VALID_LESSON_ID }),
      { onConflict: 'user_id,lesson_id' },
    )
  })

  it('returns 500 when the upsert fails', async () => {
    mocks.adminFrom.mockImplementation(
      makeFromMock({
        lessons: [makeQueryBuilder({ data: baseLesson(), error: null })],
        lesson_progress: [
          makeQueryBuilder({ data: null }),
          makeQueryBuilder({ data: null, error: { message: 'db down' } }),
        ],
      }),
    )

    const res = await PATCH(patchRequest({ lessonId: VALID_LESSON_ID, positionSeconds: 10 }))

    expect(res.status).toBe(500)
  })
})