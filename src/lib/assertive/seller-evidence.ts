import { load } from 'cheerio'

export interface SalesEvidence {
  raw: string
  lower_bound: number
  scope: 'SELLER' | 'CATALOG' | 'LISTING'
}
export interface SellerEvidence {
  verified: boolean
  item_id: string | null
  seller_name: string | null
  reputation: 'platinum' | 'gold' | 'silver' | 'leader' | null
  seller_sales: SalesEvidence | null
  product_sales: SalesEvidence | null
  source_url: string
  observed_at: string
  reason?: string
}
function sales(raw: string, scope: SalesEvidence['scope']): SalesEvidence | null {
  const match = raw.trim().match(/^\+?\s*(\d+(?:[.,]\d+)*)\s*(mil|milhão|milhões)?(?:\s+vendidos?)?$/i)
  if (!match) return null
  const amount = Number(match[1].replace(/\./g, '').replace(',', '.'))
  const multiplier = !match[2] ? 1 : match[2].toLowerCase() === 'mil' ? 1000 : 1000000
  const lower_bound = amount * multiplier
  return Number.isSafeInteger(lower_bound) ? { raw: raw.trim(), lower_bound, scope } : null
}

/** Verifies listing binding, not sales leadership or product identity. */
export function parseSellerEvidence(html: string, sourceUrl: string, expectedItemId: string, observedAt: string): SellerEvidence {
  const unavailable = (reason: string): SellerEvidence => ({ verified: false, item_id: null, seller_name: null, reputation: null, seller_sales: null, product_sales: null, source_url: sourceUrl, observed_at: observedAt, reason })
  let url: URL
  try { url = new URL(sourceUrl) } catch { return unavailable('URL inválida') }
  if (url.protocol !== 'https:' || url.username || url.password || !['www.mercadolivre.com.br', 'produto.mercadolivre.com.br'].includes(url.hostname) || !/^MLB\d+$/.test(expectedItemId) || !Number.isFinite(Date.parse(observedAt))) return unavailable('Origem ou identificador inválido')
  const $ = load(html)
  const ids = $('.ui-vpp-denounce__info').toArray().map(node => $(node).text().match(/Anúncio\s*#(\d+)/)?.[1]).filter(Boolean)
  if (!ids.length || ids.some(id => `MLB${id}` !== expectedItemId)) return unavailable('A página não confirma o anúncio solicitado')
  const summaryNames = $('.ui-pdp-seller-summary .ui-pdp-seller-summary__link').toArray().map(node => $(node).text().trim()).filter(Boolean)
  const panels = $('.ui-seller-data')
  const panelNames = panels.find('.ui-seller-data-header__title').toArray().map(node => $(node).text().trim()).filter(Boolean)
  const names = [...summaryNames, ...panelNames]
  if (!summaryNames.length || !panelNames.length || new Set(names.map(name => name.toLocaleLowerCase('pt-BR'))).size !== 1) return unavailable('Vendedor principal ausente ou divergente')
  const panel = panels.first()
  const reputationText = panel.find('.ui-seller-data-status__title').first().text().trim()
  const reputation = /^MercadoLíder Platinum$/i.test(reputationText) ? 'platinum'
    : /^MercadoLíder Gold$/i.test(reputationText) ? 'gold'
    : /^MercadoLíder Silver$/i.test(reputationText) ? 'silver'
    : /^MercadoLíder$/i.test(reputationText) ? 'leader' : null
  const salesNode = panel.find('.ui-seller-data-status__info').toArray().find(node => /^Vendas$/i.test($(node).find('.ui-seller-data-status__info-subtitle').text().trim()))
  const sellerSales = salesNode ? sales($(salesNode).find('.ui-seller-data-status__info-title').text(), 'SELLER') : null
  const subtitle = $('.ui-pdp-subtitle').first().text()
  const sold = subtitle.match(/(\+?\s*\d+(?:[.,]\d+)*\s*(?:milhões|milhão|mil)?\s+vendidos?)/i)?.[1]
  const catalog = /\/p\/MLB\d+(?:\/|$)/.test(url.pathname)
  const listing = /\/MLB-\d+(?:-|\/|$)/.test(url.pathname)
  return { verified: true, item_id: expectedItemId, seller_name: panelNames[0], reputation,
    seller_sales: sellerSales, product_sales: sold && (catalog || listing) ? sales(sold, catalog ? 'CATALOG' : 'LISTING') : null,
    source_url: sourceUrl, observed_at: observedAt }
}
