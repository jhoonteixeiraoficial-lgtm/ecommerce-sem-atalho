import { load } from 'cheerio'
import { parseSellerEvidence, type SellerEvidence } from './seller-evidence'
import type { PublicSearchEntry } from './public-search'
import type { CompetitorDossier } from './research'
import { evaluateMatch, type MatchClass } from './matching'
import type { ProductTruth } from './truth'

export interface PublicListing {
  seller: SellerEvidence
  title: string
  attributes: Record<string, string>
  pictures: string[]
  description: string | null
}
const attributeIds: Record<string, string> = {
  marca: 'BRAND', modelo: 'MODEL', cor: 'COLOR', 'capacidade da garrafa termica': 'CAPACITY', capacidade: 'CAPACITY',
  'codigo universal de produto': 'GTIN', 'unidades por embalagem': 'UNITS_PER_PACK', 'unidades por kit': 'UNITS_PER_PACK',
  voltagem: 'VOLTAGE', linha: 'LINE', material: 'MATERIAL',
}
export function parsePublicListing(html: string, url: string, itemId: string, observedAt: string): PublicListing | null {
  const seller = parseSellerEvidence(html, url, itemId, observedAt)
  if (!seller.verified) return null
  const $ = load(html)
  const title = $('.ui-pdp-title').first().text().trim()
  if (!title) return null
  const attributes: Record<string, string> = {}
  $('.ui-pdp-specs .andes-table__row').each((_, node) => {
    const label = $(node).find('th').text().trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const id = attributeIds[label]; const value = $(node).find('td').text().trim()
    if (id && value) attributes[id] = value.slice(0, 300)
  })
  const pictures = [...new Set($('.ui-pdp-gallery__figure img').toArray().flatMap(node => {
    const raw = $(node).attr('data-zoom') || $(node).attr('data-src') || $(node).attr('src')
    try {
      const u = new URL(raw || '')
      return u.protocol === 'https:' && u.hostname === 'http2.mlstatic.com' && !u.username && !u.password ? [u.href] : []
    } catch { return [] }
  }))].slice(0, 12)
  return { seller, title, attributes, pictures, description: $('.ui-pdp-description__content').first().text().trim().slice(0, 10000) || null }
}

/**
 * Constrói um dossiê a partir de uma página pública verificada.
 * A classe de match é calculada via evaluateMatch contra o product truth para que
 * o dossiê possa virar fonte de fato quando a página comprova o mesmo produto.
 */
export function publicListingDossier(
  page: PublicListing,
  entry: PublicSearchEntry,
  truthLike?: Pick<ProductTruth, 'name' | 'fields'> | null,
): CompetitorDossier | null {
  const s = page.seller
  if (!s.verified || !entry.item_id || s.item_id !== entry.item_id || entry.sponsored) return null
  const evidence = [`Busca pública: posição #${entry.position}; sem publicidade identificada #${entry.organic_position}`, `Vendedor verificado: ${s.seller_name}`]
  if (s.reputation) evidence.push(`MercadoLíder: ${s.reputation}`)
  if (s.seller_sales) evidence.push(`Vendas da loja: ${s.seller_sales.raw} (não são vendas deste anúncio)`)
  if (s.product_sales) evidence.push(`${s.product_sales.scope === 'CATALOG' ? 'Vendas agregadas do catálogo' : 'Vendas do anúncio'}: ${s.product_sales.raw}`)

  const evaluation = truthLike
    ? evaluateMatch(truthLike as ProductTruth, { title: page.title, attributes: page.attributes })
    : { match_class: 'CATEGORY_REFERENCE' as MatchClass, product_match_confidence: 0, usable_as_fact_source: false, reasons: [] as string[] }

  // Força interna de referência, nunca uma contagem oficial de vendas.
  const strength = 40 + Math.max(0, 20 - (entry.organic_position || 60))
    + (s.reputation === 'platinum' ? 14 : s.reputation ? 6 : 0)
    + (s.seller_sales && s.seller_sales.lower_bound >= 1000 ? 6 : 0)

  return {
    product_id: entry.catalog_product_id || entry.item_id,
    item_id: entry.item_id,
    domain_id: null,
    category_id: null,
    title: page.title,
    family_name: null,
    price: null,
    price_range: null,
    currency_id: 'BRL',
    condition: null,
    listing_type_id: null,
    warranty: null,
    seller: null,
    offers_count: 1,
    pictures: page.pictures,
    picture_count: page.pictures.length,
    attributes: page.attributes,
    attribute_count: Object.keys(page.attributes).length,
    short_description: page.description,
    main_features: [],
    shipping: { free_shipping: false, logistic_type: null, fulfillment: false, mode: null },
    region: null,
    highlight_position: null,
    search_position: null,
    catalog_required: false,
    competitive_reference_strength: strength,
    strength_evidence: evidence,
    product_match_confidence: evaluation.product_match_confidence,
    match_class: evaluation.match_class,
    match_reasons: evaluation.reasons,
    usable_as_fact_source: evaluation.usable_as_fact_source,
    exposure: 'ORGANIC',
    source_url: s.source_url,
    public_seller_evidence: s,
    public_offer_verified: true,
  }
}
