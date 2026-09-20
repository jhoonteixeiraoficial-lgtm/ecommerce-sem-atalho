import { load } from 'cheerio'

export interface PublicSearchEntry {
  position: number
  organic_position: number | null
  sponsored: boolean
  item_id: string | null
  catalog_product_id: string | null
  url: string
  title: string
  /** primeira foto pública do card (CDN do ML) — âncora do img2img */
  image_url?: string | null
  bestseller_badge: boolean
  sold_quantity: number | null
}
export interface PublicSearchSnapshot {
  available: boolean
  query: string
  observed_at: string
  search_url: string
  entries: PublicSearchEntry[]
  unavailable_reason?: string
}
export function publicSearchUrl(query: string): string {
  return `https://lista.mercadolivre.com.br/${encodeURIComponent(query.trim().replace(/\s+/g, '-'))}`
}

/** Observed page position is evidence, not a claim of sales leadership. */
export function parsePublicSearch(html: string, query: string, observedAt: string): PublicSearchSnapshot {
  const $ = load(html)
  const entries: PublicSearchEntry[] = []
  let organicPosition = 0
  $('.ui-search-layout__item').slice(0, 60).each((index, node) => {
    const card = $(node)
    const link = card.find('a.poly-component__title, h2 a, h3 a').first()
    const title = link.text().trim().slice(0, 300)
    let url: URL
    try { url = new URL(link.attr('href') || '') } catch { return }
    if (url.protocol !== 'https:' || !['www.mercadolivre.com.br', 'produto.mercadolivre.com.br', 'click1.mercadolivre.com.br'].includes(url.hostname)) return
    if (!title || url.username || url.password) return
    const hash = new URLSearchParams(url.hash.slice(1))
    const sponsored = url.hostname === 'click1.mercadolivre.com.br'
      || hash.get('is_advertising') === 'true'
      || card.find('.poly-component__ads-promotions').length > 0
    const wid = hash.get('wid') || url.searchParams.get('wid')
    const pathItem = url.pathname.match(/\/MLB-(\d+)(?:-|\/|$)/)?.[1]
    const itemId = wid && /^MLB\d+$/.test(wid) ? wid : pathItem ? `MLB${pathItem}` : null
    const catalogId = url.pathname.match(/\/p\/(MLB\d+)(?:\/|$)/)?.[1] || null
    if (!itemId && !catalogId) return
    if (!sponsored) organicPosition++
    // Drop tracking but retain variant selection; never follow sponsored redirects.
    url.hash = ''
    const variant = url.searchParams.get('searchVariation')
    url.search = ''
    if (variant && /^\d+$/.test(variant)) url.searchParams.set('searchVariation', variant)
    if (itemId && url.hostname === 'www.mercadolivre.com.br') url.searchParams.set('pdp_filters', `item_id:${itemId}`)
    if (sponsored && itemId) url = new URL(`https://www.mercadolivre.com.br/pdp?item_id=${itemId}`)
    const rawImg = card.find('img').toArray()
      .map(img => $(img).attr('data-src') || $(img).attr('src') || '')
      .find(src => src.includes('http2.mlstatic.com')) || ''
    let imageUrl: string | null = null
    if (rawImg) {
      try {
        const iu = new URL(rawImg)
        if (iu.protocol === 'https:' && iu.hostname === 'http2.mlstatic.com') imageUrl = iu.href
      } catch { /* url inválida */ }
    }
    entries.push({
      position: index + 1, organic_position: sponsored ? null : organicPosition,
      sponsored, item_id: itemId, catalog_product_id: catalogId, url: url.href, title, image_url: imageUrl,
      bestseller_badge: card.find('span').toArray().some(el => /^MAIS VENDIDO$/i.test($(el).text().trim())),
      sold_quantity: null,
    })
  })
  return {
    available: entries.length > 0, query, observed_at: observedAt,
    search_url: publicSearchUrl(query), entries,
    ...(entries.length ? {} : { unavailable_reason: 'A coleta não retornou anúncios verificáveis da busca pública.' }),
  }
}
