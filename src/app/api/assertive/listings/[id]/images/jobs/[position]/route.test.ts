import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listing: { id: 'listing-1', status: 'needs_input' } as Record<string, unknown> | null,
  dismissJob: vi.fn(),
  attachManual: vi.fn(),
  getSnapshot: vi.fn(),
  body: { asset_id: 'manual-1' } as Record<string, unknown>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn().mockResolvedValue({ response: null, authorizedUser: { id: 'user-1' } }),
  readJson: vi.fn(async () => ({ body: mocks.body, response: null })),
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
  dismissImageJob: mocks.dismissJob,
  attachManualImageSlot: mocks.attachManual,
  getImageJobSnapshot: mocks.getSnapshot,
}))

const { DELETE, PUT } = await import('./route')

describe('DELETE /api/assertive/listings/[id]/images/jobs/[position]', () => {
  beforeEach(() => {
    mocks.listing = { id: 'listing-1', status: 'needs_input' }
    mocks.dismissJob.mockReset().mockResolvedValue(undefined)
    mocks.attachManual.mockReset().mockResolvedValue(undefined)
    mocks.getSnapshot.mockReset().mockResolvedValue({ listing_id: 'listing-1', slots: [] })
    mocks.body = { asset_id: 'manual-1' }
  })

  it('dismisses only the requested slot and retains asset history', async () => {
    const response = await DELETE(new Request('http://localhost/images/jobs/3', { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: 'listing-1', position: '3' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.dismissJob).toHaveBeenCalledWith('listing-1', 'user-1', 3)
    expect(mocks.getSnapshot).toHaveBeenCalledWith('listing-1', 'user-1')
  })

  it('rejects positions outside zero through five', async () => {
    const response = await DELETE(new Request('http://localhost/images/jobs/6', { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: 'listing-1', position: '6' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.dismissJob).not.toHaveBeenCalled()
  })

  it('does not mutate published listings', async () => {
    mocks.listing = { id: 'listing-1', status: 'published' }

    const response = await DELETE(new Request('http://localhost/images/jobs/0', { method: 'DELETE' }) as never, {
      params: Promise.resolve({ id: 'listing-1', position: '0' }),
    })

    expect(response.status).toBe(409)
    expect(mocks.dismissJob).not.toHaveBeenCalled()
  })

  it('assigns one uploaded rendition to the requested fixed position', async () => {
    const response = await PUT(new Request('http://localhost/images/jobs/1', { method: 'PUT' }) as never, {
      params: Promise.resolve({ id: 'listing-1', position: '1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.attachManual).toHaveBeenCalledWith('listing-1', 'user-1', 1, 'manual-1')
    expect(mocks.getSnapshot).toHaveBeenCalledWith('listing-1', 'user-1')
  })

  it('rejects a malformed manual asset identifier', async () => {
    mocks.body = { asset_id: '' }

    const response = await PUT(new Request('http://localhost/images/jobs/1', { method: 'PUT' }) as never, {
      params: Promise.resolve({ id: 'listing-1', position: '1' }),
    })

    expect(response.status).toBe(400)
    expect(mocks.attachManual).not.toHaveBeenCalled()
  })
})
