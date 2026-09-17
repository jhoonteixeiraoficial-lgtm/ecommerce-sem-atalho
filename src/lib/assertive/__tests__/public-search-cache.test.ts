import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ collect: vi.fn() }))
vi.mock('../public-search-collector', () => ({ collectPublicSearch: mocks.collect }))
beforeEach(() => { mocks.collect.mockReset().mockResolvedValue(null) })
import { loadPublicSearch, publicSearchCacheKey } from '../public-search-cache'

const now = Date.parse('2026-09-17T12:00:00Z')
const snapshot = { available: true, query: 'Garrafa preta 1 litro', observed_at: new Date(now).toISOString(), search_url: 'https://lista.mercadolivre.com.br/Garrafa-preta-1-litro', entries: [{ position: 1, organic_position: 1, sponsored: false, item_id: 'MLB123', catalog_product_id: null, url: 'https://produto.mercadolivre.com.br/MLB-123-garrafa_JM', title: 'Garrafa', bestseller_badge: false, sold_quantity: null }] }

describe('public search cache', () => {
  it('calls the budgeted collector on a cache miss, but not on a hit', async () => {
    const fresh = { ...snapshot, observed_at: new Date().toISOString() }
    mocks.collect.mockResolvedValue(fresh)
    expect(await loadPublicSearch(snapshot.query, async () => null)).toEqual(fresh)
    expect(mocks.collect).toHaveBeenCalledWith(snapshot.query, publicSearchCacheKey(snapshot.query))
    mocks.collect.mockClear()
    await loadPublicSearch(snapshot.query, async () => snapshot, now)
    expect(mocks.collect).not.toHaveBeenCalled()
  })
  it('reuses evidence for the same query without making a provider request', async () => {
    const read = vi.fn().mockResolvedValue(snapshot)
    expect(await loadPublicSearch('  garrafa   PRETA 1 litro ', read, now)).toEqual(snapshot)
    expect(read).toHaveBeenCalledWith(publicSearchCacheKey(snapshot.query))
  })
  it.each([
    { ...snapshot, query: 'garrafa branca 2 litros' },
    { ...snapshot, observed_at: '2026-09-16T12:00:00Z' },
    { ...snapshot, observed_at: '2026-09-18T12:00:00Z' },
    { ...snapshot, entries: [{ ...snapshot.entries[0], url: 'https://evil.example/product' }] },
    { ...snapshot, entries: [{ ...snapshot.entries[0], sponsored: 'false' }] },
    { ...snapshot, entries: [] },
    null,
  ])('rejects unrelated, expired or malformed evidence', async value => {
    expect((await loadPublicSearch(snapshot.query, async () => value, now)).available).toBe(false)
  })
  it('fails closed on storage errors', async () => {
    expect((await loadPublicSearch(snapshot.query, async () => { throw new Error('offline') }, now)).available).toBe(false)
  })
})
