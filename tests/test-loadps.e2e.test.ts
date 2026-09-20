import { describe, it } from 'vitest'
import { loadPublicSearch } from '@/lib/assertive/public-search-cache'

describe.skipIf(!process.env.DRIVE_LISTING)('loadPublicSearch fuzzy', () => {
  it('cruza com a captura correta', async () => {
    const snap = await loadPublicSearch('Bota de borracha galocha impermeável s', undefined, Date.now(), {
      userId: 'd8c3528e-471e-4835-85a6-c9effb38fdf2',
      allowCollection: false,
    })
    console.log('resultado:', snap.available, '| query:', snap.query, '| entradas:', snap.entries.length, '| com_img:', snap.entries.filter(e => e.image_url).length)
  }, 60_000)
})
