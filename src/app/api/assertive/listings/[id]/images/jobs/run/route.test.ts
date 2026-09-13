import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: { response: null, authorizedUser: { id: 'user-1' } } as Record<string, unknown>,
  listing: {} as Record<string, unknown> | null,
  analysis: {} as Record<string, unknown> | null,
  ensureJobs: vi.fn(),
  runNext: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/app/api/community/helpers', () => ({
  requireCommunityUser: vi.fn(async () => mocks.auth),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        const chain: Record<string, unknown> = {}
        chain.eq = () => chain
        chain.maybeSingle = async () => ({
          data: table === 'assertive_listings' ? mocks.listing : mocks.analysis,
          error: null,
        })
        return chain
      },
    }),
  }),
}))
vi.mock('@/lib/assertive/image-jobs', () => ({
  ensureProgressiveImageJobs: mocks.ensureJobs,
}))
vi.mock('@/lib/assertive/progressive-images', () => ({
  runNextProgressiveImageJob: mocks.runNext,
}))
vi.mock('@/lib/assertive/copy-brief', () => ({
  buildCopyBrief: vi.fn().mockReturnValue({ facts: [{ id: 'brand', label: 'Marca', value: 'Bosch' }] }),
}))

const { POST } = await import('./route')

describe('POST /api/assertive/listings/[id]/images/jobs/run', () => {
  beforeEach(() => {
    vi.stubEnv('ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED', 'true')
    mocks.auth = { response: null, authorizedUser: { id: 'user-1' } }
    mocks.listing = {
      id: 'listing-1',
      user_id: 'user-1',
      analysis_id: 'analysis-1',
      status: 'needs_input',
      image_plan: [],
    }
    mocks.analysis = {
      id: 'analysis-1',
      user_id: 'user-1',
      product_truth: { name: 'Furadeira Bosch', fields: {}, uncertain: [], evidence: [], confidence: 1 },
    }
    mocks.ensureJobs.mockReset().mockResolvedValue(undefined)
    mocks.runNext.mockReset().mockResolvedValue({
      processed_kind: 'GENERATE_SLOT',
      processed_position: 2,
      snapshot: { listing_id: 'listing-1', target_count: 6, slots: [] },
    })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('bootstraps eligible drafts and runs at most one claimed job per POST', async () => {
    const response = await POST(new Request('http://localhost/images/jobs/run', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.processed_jobs).toBe(1)
    expect(body.processed_position).toBe(2)
    expect(mocks.ensureJobs).toHaveBeenCalledOnce()
    expect(mocks.runNext).toHaveBeenCalledOnce()
    expect(mocks.runNext).toHaveBeenCalledWith({ listingId: 'listing-1', userId: 'user-1' })
  })

  it('rejects published or publishing listings before claiming work', async () => {
    mocks.listing = { ...mocks.listing, status: 'published' }

    const response = await POST(new Request('http://localhost/images/jobs/run', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(409)
    expect(mocks.ensureJobs).not.toHaveBeenCalled()
    expect(mocks.runNext).not.toHaveBeenCalled()
  })

  it('returns retryable provider outcomes as a sanitized 200 snapshot', async () => {
    mocks.runNext.mockResolvedValue({
      processed_kind: 'GENERATE_SLOT',
      processed_position: 0,
      snapshot: {
        listing_id: 'listing-1',
        slots: [{ position: 0, status: 'RETRYABLE', error_code: 'IMAGE_PROVIDER_UNAVAILABLE', error_message: 'Tente novamente.' }],
      },
    })

    const response = await POST(new Request('http://localhost/images/jobs/run', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.snapshot.slots[0].error_code).toBe('IMAGE_PROVIDER_UNAVAILABLE')
    expect(JSON.stringify(body)).not.toContain('provider payload')
  })

  it('does not claim work after the rollback flag is disabled', async () => {
    vi.stubEnv('ASSERTIVE_PROGRESSIVE_IMAGE_PIPELINE_ENABLED', 'false')

    const response = await POST(new Request('http://localhost/images/jobs/run', { method: 'POST' }) as never, {
      params: Promise.resolve({ id: 'listing-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'IMAGE_PIPELINE_DISABLED' })
    expect(mocks.ensureJobs).not.toHaveBeenCalled()
    expect(mocks.runNext).not.toHaveBeenCalled()
  })
})
