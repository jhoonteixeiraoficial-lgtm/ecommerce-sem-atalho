import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: { response: null, authorizedUser: { id: 'user-1' } } as Record<string, unknown>,
  getSnapshot: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn(async () => mocks.auth),
}))
vi.mock('@/lib/assertive/image-jobs', () => ({
  getImageJobSnapshot: mocks.getSnapshot,
}))

const { GET } = await import('./route')

describe('GET /api/assertive/listings/[id]/images/jobs', () => {
  beforeEach(() => {
    mocks.auth = { response: null, authorizedUser: { id: 'user-1' } }
    mocks.getSnapshot.mockReset().mockResolvedValue({
      listing_id: 'listing-1',
      target_count: 6,
      ready_count: 0,
      visible_count: 0,
      active_count: 0,
      reference_status: 'SUCCEEDED',
      reference_count: 2,
      reference_origins: ['ML_CATALOG'],
      runnable: true,
      slots: Array.from({ length: 6 }, (_, position) => ({
        position,
        role: position === 0 ? 'MAIN' : 'DETAIL',
        title: `Imagem ${position + 1}`,
        description: 'Composição segura',
        required: position < 3,
        status: 'QUEUED',
        asset_id: null,
        preview_url: null,
        attempts: 0,
        error_code: null,
        error_message: null,
        auto_verdict: null,
        manual: false,
      })),
    })
  })

  it('returns six safe slots without private references', async () => {
    const response = await GET(new Request('http://localhost/images/jobs') as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.slots).toHaveLength(6)
    expect(JSON.stringify(body)).not.toContain('private-reference')
    expect(mocks.getSnapshot).toHaveBeenCalledWith('listing-1', 'user-1')
  })

  it('passes through authentication failures', async () => {
    mocks.auth = {
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
      authorizedUser: null,
    }

    const response = await GET(new Request('http://localhost/images/jobs') as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(401)
    expect(mocks.getSnapshot).not.toHaveBeenCalled()
  })

  it('maps an unknown listing to 404 without exposing database details', async () => {
    mocks.getSnapshot.mockRejectedValue(new Error('Anúncio não encontrado. select secret_table failed'))

    const response = await GET(new Request('http://localhost/images/jobs') as never, {
      params: Promise.resolve({ id: 'missing' }),
    })
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Anúncio não encontrado.' })
    expect(JSON.stringify(body)).not.toContain('secret_table')
  })
})
