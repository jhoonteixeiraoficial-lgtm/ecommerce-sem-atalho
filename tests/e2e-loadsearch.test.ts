import { describe, it } from 'vitest'
import { loadPublicSearch } from '@/lib/assertive/public-search-cache'

describe.skipIf(!process.env.E2E_RESEARCH)('e2e loadPublicSearch', () => {
  it('reads browser-scoped cache', async () => {
    const userId = 'd8c3528e-471e-4835-85a6-c9effb38fdf2'
    const query = 'Garrafa térmica Soprano Cristal 1L preta'
    const snap = await loadPublicSearch(query, undefined, Date.now(), { userId, allowCollection: false })
    console.log('available:', snap.available, '| entries:', snap.entries.length, '| reason:', snap.unavailable_reason)
    const own = await loadPublicSearch(query)
    console.log('global read available:', own.available)
  })
})
