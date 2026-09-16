import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
import { tryAcquireAnalysisLock, releaseAnalysisLock } from '../concurrency'

const analysis = '11111111-1111-4111-8111-111111111111'
const user = '22222222-2222-4222-8222-222222222222'
const token = '33333333-3333-4333-8333-333333333333'

describe('durable analysis lease client', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('acquires a database lease with JSON-safe arguments', async () => {
    mocks.rpc.mockImplementation(async (_name, args) => {
      JSON.stringify(args)
      return { data: token, error: null }
    })
    expect(await tryAcquireAnalysisLock(analysis, user)).toBe(token)
    expect(mocks.rpc).toHaveBeenCalledWith('acquire_assertive_analysis_lease', {
      p_analysis_id: analysis, p_user_id: user,
    })
  })

  it('returns null when another request already owns the lease', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    expect(await tryAcquireAnalysisLock(analysis, user)).toBeNull()
  })

  it('fails closed on a missing function instead of starting unprotected work', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'function unavailable' } })
    await expect(tryAcquireAnalysisLock(analysis, user)).rejects.toThrow('controle de execução')
  })

  it('rejects an invalid lease response', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    await expect(tryAcquireAnalysisLock(analysis, user)).rejects.toThrow('controle de execução')
  })

  it('releases only the lease token owned by this execution', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })
    await releaseAnalysisLock(analysis, user, token)
    expect(mocks.rpc).toHaveBeenCalledWith('release_assertive_analysis_lease', {
      p_analysis_id: analysis, p_user_id: user, p_token: token,
    })
  })
})
