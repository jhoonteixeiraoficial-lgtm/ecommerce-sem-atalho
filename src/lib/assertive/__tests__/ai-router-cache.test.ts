import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AIConfig } from '../types'
const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('../ai', () => ({ generate: mocks.generate, parseJson: JSON.parse }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('No DB in unit tests') } }))
import { runTask } from '../ai-router'
import { clearAIMemoryCache } from '../ai-cache'

describe('router cache request isolation', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    clearAIMemoryCache()
    mocks.generate.mockReset().mockImplementation(async () => ({ text: `result-${mocks.generate.mock.calls.length}`, provider: 'gemini', model: 'test', latency_ms: 1, attempts: 1 }))
  })
  afterEach(() => vi.unstubAllEnvs())

  it('preserves system and user message boundaries in the cache key', async () => {
    const first = await runTask('title_draft', null, 'policy|||product', 'A')
    const second = await runTask('title_draft', null, 'policy', 'product|||A')
    expect(second.text).not.toBe(first.text)
    expect(mocks.generate).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['tenant', { user_id: 'user-2' }],
    ['model', { model: 'different-model' }],
    ['provider', { provider: 'custom' }],
    ['endpoint', { base_url: 'https://other.example/api' }],
  ])('does not share results across changed %s configuration', async (_label, changed) => {
    const config = { id: 'config-1', user_id: 'user-1', provider: 'gemini', model: 'model-a' } as AIConfig
    const first = await runTask('identify_product', config, 'system', 'product')
    const repeated = await runTask('identify_product', config, 'system', 'product')
    expect(repeated.text).toBe(first.text)
    const second = await runTask('identify_product', { ...config, ...changed } as AIConfig, 'system', 'product')
    expect(second.text).not.toBe(first.text)
    expect(mocks.generate).toHaveBeenCalledTimes(2)
  })
})
