import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAIMemoryCache, withAICache } from '../ai-cache'

describe('AI cache request identity', () => {
  beforeEach(() => clearAIMemoryCache())

  it('keeps identical requests cached but separates different product photos', async () => {
    const producer = vi.fn().mockResolvedValueOnce('photo A').mockResolvedValueOnce('photo B')
    const a = { images: ['https://example.com/a.jpg'], workload: 'vision' }
    const b = { images: ['https://example.com/b.jpg'], workload: 'vision' }
    expect(await withAICache('identify_product', 'identify this product', a, producer)).toBe('photo A')
    expect(await withAICache('identify_product', 'identify this product', a, producer)).toBe('photo A')
    expect(await withAICache('identify_product', 'identify this product', b, producer)).toBe('photo B')
    expect(producer).toHaveBeenCalledTimes(2)
  })

  it('does not reuse a response when product details differ after character 2000', async () => {
    const prefix = 'instrucoes '.repeat(220)
    const first = vi.fn(async () => 'produto A')
    const second = vi.fn(async () => 'produto B')
    await withAICache('identify_product', prefix + 'produto A', {}, first)
    expect(await withAICache('identify_product', prefix + 'produto B', {}, second)).toBe('produto B')
    expect(second).toHaveBeenCalledOnce()
  })

  it('segregates identical prompts across users with different configurations', async () => {
    const producerA = vi.fn().mockResolvedValueOnce('result-user-a')
    const producerB = vi.fn().mockResolvedValueOnce('result-user-b')
    const base = { workload: 'reasoning', temperature: 0.2, json: false }
    const userA = { ...base, scope: { user_id: 'user-a', config_id: 'cfg-a', provider: 'claude', model: 'sonnet' } }
    const userB = { ...base, scope: { user_id: 'user-b', config_id: 'cfg-b', provider: 'gemini', model: 'flash' } }
    expect(await withAICache('identify_product', 'prompt', userA, producerA)).toBe('result-user-a')
    expect(await withAICache('identify_product', 'prompt', userB, producerB)).toBe('result-user-b')
    expect(producerA).toHaveBeenCalledOnce()
    expect(producerB).toHaveBeenCalledOnce()
  })
})

