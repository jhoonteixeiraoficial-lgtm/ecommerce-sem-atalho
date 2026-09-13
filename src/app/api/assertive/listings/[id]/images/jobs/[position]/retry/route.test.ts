import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listing: { id: 'listing-1', status: 'needs_input' } as Record<string, unknown> | null,
  retryJob: vi.fn(),
  getSnapshot: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({ response: null, authorizedUser: { id: 'user-1' } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.maybeSingle = async () => ({ data: mocks.listing, error: null })
        return chain
      },
    }),
  }),
}))
vi.mock('@/lib/assertive/image-jobs', () => ({
  retryImageJob: mocks.retryJob,
  getImageJobSnapshot: mocks.getSnapshot,
}))

const { POST } = await import('./route')

describe('POST /api/assertive/listings/[id]/images/jobs/[position]/retry', () => {
  beforeEach(() => {
    mocks.listing = { id: 'listing-1', status: 'needs_input' }
    mocks.retryJob.mockReset().mockResolvedValue(undefined)
    mocks.getSnapshot.mockReset().mockResolvedValue({ listing_id: 'listing-1', runnable: true, slots: [] })
  })

  it('resets exactly one valid position and returns the new snapshot', async () => {
    const response = await POST(new Request('http://localhost/images/jobs/5/retry', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1', position: '5' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.runnable).toBe(true)
    expect(mocks.retryJob).toHaveBeenCalledWith('listing-1', 'user-1', 5)
  })

  it('rejects malformed positions without touching a job', async () => {
    const response = await POST(new Request('http://localhost/images/jobs/01/retry', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1', position: '01' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.retryJob).not.toHaveBeenCalled()
  })

  it('returns 404 for a listing outside the authenticated owner scope', async () => {
    mocks.listing = null

    const response = await POST(new Request('http://localhost/images/jobs/0/retry', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1', position: '0' }),
    })

    expect(response.status).toBe(404)
    expect(mocks.retryJob).not.toHaveBeenCalled()
  })
})
