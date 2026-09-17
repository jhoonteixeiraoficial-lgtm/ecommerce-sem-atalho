import { describe, expect, it } from 'vitest'
import { parsePublicSearch } from '../public-search'

const html = `<ol>
<li class="ui-search-layout__item"><a class="poly-component__title" href="https://click1.mercadolivre.com.br/click#is_advertising=true&wid=MLB1234567890">Outro produto</a><span class="poly-component__ads-promotions">Ad</span></li>
<li class="ui-search-layout__item"><span>MAIS VENDIDO</span><a class="poly-component__title" href="https://www.mercadolivre.com.br/garrafa/p/MLB11865004#position=2&wid=MLB4645904805">Garrafa Soprano Cristal 1L Preta</a></li>
<li class="ui-search-layout__item"><a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-6858362292-garrafa-_JM?searchVariation=202865946323#position=3">Garrafa Soprano Cristal</a></li>
</ol>`

describe('public Mercado Livre search evidence', () => {
  it('separates sponsored exposure from observed non-ad ranking and catalog position', () => {
    const result = parsePublicSearch(html, 'garrafa soprano', '2026-09-16T20:00:00.000Z')
    expect(result.available).toBe(true)
    expect(result.entries).toHaveLength(3)
    expect(result.entries[0]).toMatchObject({position:1,sponsored:true,organic_position:null,item_id:'MLB1234567890'})
    expect(result.entries[1]).toMatchObject({position:2,sponsored:false,organic_position:1,item_id:'MLB4645904805',catalog_product_id:'MLB11865004',bestseller_badge:true})
    expect(result.entries[2]).toMatchObject({position:3,organic_position:2,item_id:'MLB6858362292',catalog_product_id:null})
    expect(new URL(result.entries[1].url).searchParams.get('pdp_filters')).toBe('item_id:MLB4645904805')
    expect(result.entries[2].url).toContain('searchVariation=202865946323')
    expect(result.observed_at).toBe('2026-09-16T20:00:00.000Z')
    expect(result.entries[1].sold_quantity).toBeNull()
  })

  it('does not mistake a JavaScript interstitial for successful research', () => {
    const result = parsePublicSearch('<title>Garrafa Mercado Livre</title><p>Please enable JavaScript</p>', 'garrafa', '2026-09-16T20:00:00Z')
    expect(result.available).toBe(false)
    expect(result.entries).toEqual([])
  })

  it('rejects external links, malformed IDs and tracking rank claims', () => {
    const result = parsePublicSearch(`<li class="ui-search-layout__item"><a class="poly-component__title" href="https://evil.example/MLB1234567890">Fake</a></li><li class="ui-search-layout__item"><a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-1234567890-item-_JM#position=1">Real</a></li>`, 'produto', '2026-09-16T20:00:00Z')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].position).toBe(2)
  })
})
