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
})
