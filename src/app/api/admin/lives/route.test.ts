import { beforeEach, describe, expect, it, vi } from 'vitest'

const LIVE_ID = '00000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  serverFrom: vi.fn(),
  adminFrom: vi.fn(),
  liveOrder: vi.fn(),
  credentialIn: vi.fn(),
  insertSingle: vi.fn(),
  updateSingle: vi.fn(),
  deleteEq: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.serverFrom,
  }),
}))

vi.mock('@/lib/auth/server-guards', () => ({
  createServerGuards: () => ({ requireAdmin: mocks.requireAdmin }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/security', () => ({
  checkRateLimit: () => ({ allowed: true }),
  sanitizeInput: (value: string) => value,
}))

import { DELETE, GET, POST, PUT } from './route'

function adminLiveQuery() {
  return {
    select: vi.fn(() => ({ order: mocks.liveOrder })),
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  }
}

function adminCredentialQuery() {
  return {
    select: vi.fn(() => ({ in: mocks.credentialIn })),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'admin-user', email: 'admin@example.test' } },
    error: null,
  })
  mocks.requireAdmin.mockResolvedValue({
    id: 'admin-user',
    email: 'admin@example.test',
    role: 'admin',
    status: 'active',
    accessUntil: null,
  })
  mocks.createAdminClient.mockReturnValue({ from: mocks.adminFrom })
  mocks.adminFrom.mockImplementation((table: string) => {
    if (table === 'lives') return adminLiveQuery()
    if (table === 'live_credentials') return adminCredentialQuery()
    throw new Error(`Unexpected table: ${table}`)
  })

  mocks.serverFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }),
        }),
      }
    }
    return adminLiveQuery()
  })

  mocks.liveOrder.mockResolvedValue({ data: [], error: null })
  mocks.credentialIn.mockResolvedValue({ data: [], error: null })
  mocks.insertSingle.mockResolvedValue({ data: { id: LIVE_ID }, error: null })
  mocks.updateSingle.mockResolvedValue({ data: { id: LIVE_ID }, error: null })
  mocks.deleteEq.mockResolvedValue({ error: null })
  mocks.insert.mockImplementation(() => ({
    select: () => ({ single: mocks.insertSingle }),
  }))
  mocks.update.mockImplementation(() => ({
    eq: () => ({ select: () => ({ single: mocks.updateSingle }) }),
  }))
  mocks.delete.mockImplementation(() => ({ eq: mocks.deleteEq }))
})

describe('admin lives runtime authorization', () => {
  it.each([
    ['GET', () => GET(new Request('https://example.test/api/admin/lives'))],
    ['POST', () => POST(new Request('https://example.test/api/admin/lives', {
      method: 'POST',
      body: JSON.stringify({ title: 'Office hours', scheduled_at: '2026-09-10T18:00:00.000Z' }),
    }))],
    ['PUT', () => PUT(new Request('https://example.test/api/admin/lives', {
      method: 'PUT',
      body: JSON.stringify({ id: LIVE_ID, is_live: true }),
    }))],
    ['DELETE', () => DELETE(new Request(`https://example.test/api/admin/lives?id=${LIVE_ID}`, {
      method: 'DELETE',
    }))],
  ])('rejects %s when canonical admin authorization fails', async (_method, invoke) => {
    mocks.requireAdmin.mockRejectedValue({ status: 403 })

    const response = await invoke()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })
})

describe('GET', () => {
  it('loads metadata and credentials from separate server-only tables after authorization', async () => {
    mocks.liveOrder.mockResolvedValue({
      data: [{
        id: LIVE_ID,
        title: 'Office hours',
        description: '',
        scheduled_at: '2026-09-10T18:00:00.000Z',
        duration_minutes: 60,
        replay_url: '',
        is_live: false,
        viewer_count: 0,
        created_at: '2026-09-01T10:00:00.000Z',
      }],
      error: null,
    })
    mocks.credentialIn.mockResolvedValue({
      data: [{ live_id: LIVE_ID, rtmp_url: 'rtmp://placeholder.test/live', stream_key: 'placeholder-stream-key' }],
      error: null,
    })

    const response = await GET(new Request('https://example.test/api/admin/lives'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      lives: [{
        id: LIVE_ID,
        title: 'Office hours',
        description: '',
        scheduled_at: '2026-09-10T18:00:00.000Z',
        duration_minutes: 60,
        replay_url: '',
        is_live: false,
        viewer_count: 0,
        created_at: '2026-09-01T10:00:00.000Z',
        rtmp_url: 'rtmp://placeholder.test/live',
        stream_key: 'placeholder-stream-key',
      }],
    })
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.createAdminClient).toHaveBeenCalledOnce()
    expect(mocks.adminFrom).toHaveBeenNthCalledWith(1, 'lives')
    expect(mocks.adminFrom).toHaveBeenNthCalledWith(2, 'live_credentials')
  })

  it('returns empty credential fields when no migrated credential row exists', async () => {
    mocks.liveOrder.mockResolvedValue({
      data: [{ id: LIVE_ID, title: 'Office hours' }],
      error: null,
    })

    const response = await GET(new Request('https://example.test/api/admin/lives'))

    await expect(response.json()).resolves.toEqual({
      lives: [{ id: LIVE_ID, title: 'Office hours', rtmp_url: '', stream_key: '' }],
    })
  })
})

describe('POST', () => {
  it('creates only validated live metadata through the server-only client', async () => {
    const response = await POST(new Request('https://example.test/api/admin/lives', {
      method: 'POST',
      body: JSON.stringify({
        title: ' Office hours ',
        description: ' Questions and answers ',
        scheduled_at: '2026-09-10T18:00:00.000Z',
        duration_minutes: 90,
      }),
    }))

    expect(response.status).toBe(201)
    expect(mocks.insert).toHaveBeenCalledWith({
      title: 'Office hours',
      description: 'Questions and answers',
      scheduled_at: '2026-09-10T18:00:00.000Z',
      duration_minutes: 90,
    })
  })

  it.each([
    ['unknown fields', { title: 'Office hours', scheduled_at: '2026-09-10T18:00:00.000Z', stream_key: 'placeholder-key' }],
    ['malformed dates', { title: 'Office hours', scheduled_at: 'next Thursday' }],
    ['non-integer durations', { title: 'Office hours', scheduled_at: '2026-09-10T18:00:00.000Z', duration_minutes: 1.5 }],
    ['out-of-range durations', { title: 'Office hours', scheduled_at: '2026-09-10T18:00:00.000Z', duration_minutes: 481 }],
  ])('rejects %s before writing', async (_case, body) => {
    const response = await POST(new Request('https://example.test/api/admin/lives', {
      method: 'POST',
      body: JSON.stringify(body),
    }))

    expect(response.status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

describe('PUT', () => {
  it('updates only the validated metadata fields', async () => {
    const response = await PUT(new Request('https://example.test/api/admin/lives', {
      method: 'PUT',
      body: JSON.stringify({ id: LIVE_ID, is_live: true, replay_url: 'https://video.example.test/watch/1' }),
    }))

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      is_live: true,
      replay_url: 'https://video.example.test/watch/1',
    })
  })

  it.each([
    ['malformed UUIDs', { id: 'not-a-uuid', is_live: true }],
    ['malformed URLs', { id: LIVE_ID, replay_url: 'not a URL' }],
    ['credential fields', { id: LIVE_ID, stream_key: 'placeholder-key' }],
    ['empty updates', { id: LIVE_ID }],
  ])('rejects %s before writing', async (_case, body) => {
    const response = await PUT(new Request('https://example.test/api/admin/lives', {
      method: 'PUT',
      body: JSON.stringify(body),
    }))

    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('DELETE', () => {
  it('rejects a malformed UUID before deleting', async () => {
    const response = await DELETE(new Request('https://example.test/api/admin/lives?id=not-a-uuid', {
      method: 'DELETE',
    }))

    expect(response.status).toBe(400)
    expect(mocks.delete).not.toHaveBeenCalled()
  })

  it('deletes a validated live through the server-only client', async () => {
    const response = await DELETE(new Request(`https://example.test/api/admin/lives?id=${LIVE_ID}`, {
      method: 'DELETE',
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(mocks.deleteEq).toHaveBeenCalledWith('id', LIVE_ID)
  })
})
