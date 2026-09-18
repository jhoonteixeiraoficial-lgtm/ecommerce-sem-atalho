import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), update: vi.fn(), research: vi.fn(), token: vi.fn(), lock: vi.fn(), release: vi.fn() }))
vi.mock('@/app/api/community/helpers', () => ({ requireCommunityUser: m.auth }))
vi.mock('@/lib/assertive/pipeline', () => ({ loadAnalysis: m.load, updateAnalysis: m.update }))
vi.mock('@/lib/assertive/research', () => ({ researchMarket: m.research }))
vi.mock('@/lib/assertive/publisher', () => ({ getValidMLToken: m.token }))
vi.mock('@/lib/assertive/concurrency', () => ({ tryAcquireAnalysisLock: m.lock, releaseAnalysisLock: m.release }))
vi.mock('@/lib/assertive/dna', () => ({ extractDNA: () => ({ references_analyzed: 1 }) }))
import { POST } from './route'
const context = { params: Promise.resolve({ id: 'analysis-a' }) }
beforeEach(() => {
  vi.clearAllMocks()
  m.auth.mockResolvedValue({ authorizedUser: { id: 'user-a' }, response: null })
  m.load.mockResolvedValue({ id: 'analysis-a', user_id: 'user-a', status: 'needs_input', product_truth: { name: 'Caneta Kitest KA250', fields: {} }, research: { query: 'Caneta Kitest KA250' } })
  m.token.mockResolvedValue('ml-test-token'); m.lock.mockResolvedValue('lease')
  m.research.mockResolvedValue({ competitors: [], public_search: { available: true } })
  m.update.mockResolvedValue(undefined)
})
describe('research refresh', () => {
  it('updates only research and DNA, without regeneration, costs, status or product edits', async () => {
    const response = await POST(new Request('https://app.example'), context)
    expect(response.status).toBe(200)
    expect(m.load).toHaveBeenCalledWith('analysis-a', 'user-a')
    expect(m.research).toHaveBeenCalledWith('ml-test-token', 'Caneta Kitest KA250', expect.objectContaining({ collectorUserId: 'user-a', allowPublicCollection: false }))
    expect(m.update).toHaveBeenCalledWith('analysis-a', 'user-a', { research: { competitors: [], public_search: { available: true } }, dna: { references_analyzed: 1 } })
    expect(m.release).toHaveBeenCalledWith('analysis-a', 'user-a', 'lease')
  })
  it('does not update when another run owns the lock', async () => {
    m.lock.mockResolvedValue(null)
    expect((await POST(new Request('https://app.example'), context)).status).toBe(409)
    expect(m.update).not.toHaveBeenCalled()
  })
  it('does not mutate the existing draft on a refresh failure', async () => {
    m.research.mockRejectedValue(new Error('upstream'))
    expect((await POST(new Request('https://app.example'), context)).status).toBe(503)
    expect(m.update).not.toHaveBeenCalled()
  })
})
