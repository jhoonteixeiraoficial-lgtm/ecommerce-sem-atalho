import { mlGet, mapLimitSettled, SITE_ID } from './ml-api'
import { discoverDomain, getCategoryTrends } from './taxonomy'

const HOUR = 3600
const SIX_HOURS = 21600

// ---------------------------------------------------------------- tipos crus
interface CatalogSearchItem {
  id: string
  domain_id?: string
  name?: string
  attributes?: Array<{ id: string; value_name?: string }>
}

interface CatalogProduct {
  id: string
  status?: string
  domain_id?: string
  name?: string
  family_name?: string
  short_description?: { content?: string }
  main_features?: Array<{ text?: string }>
  attributes?: Array<{ id: string; name?: string; value_name?: string; value_id?: string }>
  pictures?: Array<{ url?: string; max_width?: number; max_height?: number }>
  buy_box_winner?: { item_id?: string; price?: number; seller_id?: number } | null
  settings?: { listing_strategy?: string; exclusive?: boolean }
  parent_id?: string
  children_ids?: string[]
}

interface CatalogProductItem {
  item_id: string
  seller_id: number
  price: number
  category_id?: string
  currency_id?: string
  condition?: string
  listing_type_id?: string
  official_store_id?: number | null
  tags?: string[]
  warranty?: string
  shipping?: {
    free_shipping?: boolean
    mode?: string
    logistic_type?: string
    tags?: string[]
  }
  seller_address?: {
    city?: { name?: string }
    state?: { id?: string; name?: string }
  }
  sale_terms?: Array<{ id?: string; value_name?: string }>
}

interface MLUser {
  id: number
  nickname?: string
  seller_reputation?: {
    level_id?: string | null
    power_seller_status?: string | null
    transactions?: { total?: number }
  }
}

// ---------------------------------------------------------------- dossiê
export interface SellerSignals {
  id: string
  nickname: string
  /** ex.: "5_green" — valor oficial do ML, sem interpretação. */
  level_id: string | null
  /** ex.: "platinum" | "gold" | "silver" */
  power_seller_status: string | null
  /** total histórico de transações do vendedor (oficial). */
  transactions_total: number | null
  official_store: boolean
}

export interface CompetitorDossier {
  product_id: string
  item_id: string | null
  domain_id: string | null
  category_id: string | null
  title: string
  family_name: string | null
  price: number | null
  price_range: { min: number; max: number } | null
  currency_id: string
  condition: string | null
  listing_type_id: string | null
  warranty: string | null
  seller: SellerSignals | null
  offers_count: number
  pictures: string[]
  picture_count: number
  attributes: Record<string, string>
  attribute_count: number
  short_description: string | null
  main_features: string[]
  shipping: {
    free_shipping: boolean
    logistic_type: string | null
    fulfillment: boolean
    mode: string | null
  }
  region: { city: string | null; state: string | null } | null
  /** posição real no ranking BEST_SELLER da categoria (1 = melhor). null se ausente. */
  highlight_position: number | null
  /** posição no resultado de relevância da busca de catálogo. */
  search_position: number | null
  catalog_required: boolean
  /** score interno do Assertive — NÃO é número oficial de vendas. */
  strength_score: number
  strength_evidence: string[]
}

export interface RegionalRadar {
  status: 'SUPPORTED' | 'PARTIAL' | 'NOT_SUPPORTED'
  note: string
  states: Array<{ state: string; count: number }>
  fulfillment_pct: number
  free_shipping_pct: number
}

export interface ResearchResult {
  query: string
  domain_id: string | null
  domain_name: string | null
  category_id: string | null
  category_name: string | null
  keywords: string[]
  competitors: CompetitorDossier[]
  candidates_found: number
  price_stats: {
    min: number
    max: number
    median: number
    avg: number
    sample_size: number
  } | null
  regional: RegionalRadar
  warnings: string[]
}

// ---------------------------------------------------------------- fetchers
async function searchCatalog(token: string, query: string): Promise<CatalogSearchItem[]> {
  const data = await mlGet<{ results?: CatalogSearchItem[] }>(
    `/products/search?status=active&site_id=${SITE_ID}&q=${encodeURIComponent(query.slice(0, 150))}`,
    token,
    { ttl: SIX_HOURS, persist: true }
  )
  return data.results || []
}

async function getHighlights(
  token: string,
  categoryId: string
): Promise<Array<{ id: string; position: number; type: string }>> {
  try {
    const data = await mlGet<{ content?: Array<{ id: string; position: number; type: string }> }>(
      `/highlights/${SITE_ID}/category/${categoryId}`,
      token,
      { ttl: SIX_HOURS, persist: true }
    )
    return data.content || []
  } catch {
    return []
  }
}

async function getProduct(token: string, productId: string): Promise<CatalogProduct> {
  return mlGet<CatalogProduct>(`/products/${productId}`, token, { ttl: HOUR, persist: true })
}

async function getProductItems(token: string, productId: string): Promise<CatalogProductItem[]> {
  try {
    const data = await mlGet<{ results?: CatalogProductItem[] }>(
      `/products/${productId}/items`,
      token,
      { ttl: HOUR }
    )
    return data.results || []
  } catch {
    return []
  }
}

async function getSeller(token: string, sellerId: number): Promise<MLUser | null> {
  try {
    return await mlGet<MLUser>(`/users/${sellerId}`, token, { ttl: SIX_HOURS, persist: true })
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- score
const POWER_SELLER_WEIGHT: Record<string, number> = {
  platinum: 14,
  gold: 10,
  silver: 6,
}

function scoreDossier(d: CompetitorDossier): { score: number; evidence: string[] } {
  let score = 0
  const evidence: string[] = []

  if (d.highlight_position !== null) {
    const pts = Math.max(6, 30 - (d.highlight_position - 1) * 1.5)
    score += pts
    evidence.push(`Mais vendidos da categoria: posição #${d.highlight_position}`)
  }

  if (d.search_position !== null) {
    const pts = Math.max(3, 18 - d.search_position * 1.5)
    score += pts
    if (d.search_position <= 3) evidence.push(`Alta relevância na busca de catálogo (#${d.search_position + 1})`)
  }

  const rep = d.seller?.power_seller_status
  if (rep && POWER_SELLER_WEIGHT[rep]) {
    score += POWER_SELLER_WEIGHT[rep]
    evidence.push(`Vendedor ${rep} (MercadoLíder)`)
  }
  if (d.seller?.level_id === '5_green') {
    score += 6
    evidence.push('Reputação verde nível 5')
  }
  if (d.seller?.transactions_total && d.seller.transactions_total > 1000) {
    score += 6
    evidence.push(`${d.seller.transactions_total.toLocaleString('pt-BR')} transações históricas do vendedor`)
  }
  if (d.seller?.official_store) {
    score += 5
    evidence.push('Loja oficial')
  }

  if (d.offers_count > 1) {
    score += Math.min(d.offers_count, 8)
    evidence.push(`${d.offers_count} vendedores disputam este produto de catálogo`)
  }

  if (d.shipping.fulfillment) {
    score += 8
    evidence.push('Mercado Envios Full')
  } else if (d.shipping.free_shipping) {
    score += 4
    evidence.push('Frete grátis')
  }

  score += Math.min(d.attribute_count, 20) * 0.5
  score += Math.min(d.picture_count, 10) * 0.6
  if (d.short_description) score += 3
  if (d.catalog_required) {
    score += 4
    evidence.push('Produto exige catálogo (concorrência por buy box)')
  }

  return { score: Math.round(score * 10) / 10, evidence }
}

// ---------------------------------------------------------------- montagem
function buildDossier(
  product: CatalogProduct,
  items: CatalogProductItem[],
  sellers: Map<number, MLUser | null>,
  highlightPos: number | null,
  searchPos: number | null
): CompetitorDossier {
  const attributes: Record<string, string> = {}
  for (const a of product.attributes || []) {
    if (a.value_name) attributes[a.id] = a.value_name
  }

  const prices = items.map(i => i.price).filter(p => typeof p === 'number' && p > 0)
  const best = items.find(i => i.price === Math.min(...prices)) || items[0] || null
  const sellerRaw = best ? sellers.get(best.seller_id) : null

  const seller: SellerSignals | null = best
    ? {
        id: String(best.seller_id),
        nickname: sellerRaw?.nickname || `Vendedor ${best.seller_id}`,
        level_id: sellerRaw?.seller_reputation?.level_id ?? null,
        power_seller_status: sellerRaw?.seller_reputation?.power_seller_status ?? null,
        transactions_total: sellerRaw?.seller_reputation?.transactions?.total ?? null,
        official_store: Boolean(best.official_store_id),
      }
    : null

  const logistic = best?.shipping?.logistic_type ?? null

  const dossier: CompetitorDossier = {
    product_id: product.id,
    item_id: best?.item_id ?? product.buy_box_winner?.item_id ?? null,
    domain_id: product.domain_id ?? null,
    category_id: best?.category_id ?? null,
    title: product.name || product.family_name || product.id,
    family_name: product.family_name ?? null,
    price: prices.length ? Math.min(...prices) : null,
    price_range: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
    currency_id: best?.currency_id || 'BRL',
    condition: best?.condition ?? null,
    listing_type_id: best?.listing_type_id ?? null,
    warranty:
      best?.warranty ||
      best?.sale_terms?.find(t => t.id === 'WARRANTY_TYPE' || t.id === 'WARRANTY_TIME')?.value_name ||
      null,
    seller,
    offers_count: items.length,
    pictures: (product.pictures || []).map(p => p.url).filter((u): u is string => Boolean(u)),
    picture_count: (product.pictures || []).length,
    attributes,
    attribute_count: Object.keys(attributes).length,
    short_description: product.short_description?.content?.trim() || null,
    main_features: (product.main_features || [])
      .map(f => f.text?.trim())
      .filter((t): t is string => Boolean(t)),
    shipping: {
      free_shipping: Boolean(best?.shipping?.free_shipping),
      logistic_type: logistic,
      fulfillment: logistic === 'fulfillment',
      mode: best?.shipping?.mode ?? null,
    },
    region: best?.seller_address
      ? {
          city: best.seller_address.city?.name ?? null,
          state: best.seller_address.state?.name ?? null,
        }
      : null,
    highlight_position: highlightPos,
    search_position: searchPos,
    catalog_required: product.settings?.listing_strategy === 'catalog_required',
    strength_score: 0,
    strength_evidence: [],
  }

  const { score, evidence } = scoreDossier(dossier)
  dossier.strength_score = score
  dossier.strength_evidence = evidence
  return dossier
}

function buildRegionalRadar(competitors: CompetitorDossier[]): RegionalRadar {
  const counts = new Map<string, number>()
  let ful = 0
  let free = 0

  for (const c of competitors) {
    const st = c.region?.state
    if (st) counts.set(st, (counts.get(st) || 0) + 1)
    if (c.shipping.fulfillment) ful++
    if (c.shipping.free_shipping) free++
  }

  const states = [...counts.entries()]
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count)

  const total = competitors.length || 1

  return {
    status: states.length ? 'PARTIAL' : 'NOT_SUPPORTED',
    note: states.length
      ? 'A API oficial não expõe ranking por região do comprador. O Assertive usa os sinais logísticos reais disponíveis (origem do vendedor, tipo de logística e Full) para estimar vantagem regional.'
      : 'Sem dados logísticos suficientes nas referências analisadas.',
    states,
    fulfillment_pct: Math.round((ful / total) * 100),
    free_shipping_pct: Math.round((free / total) * 100),
  }
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// ---------------------------------------------------------------- entrada
export interface ResearchOptions {
  /** quantos candidatos entram na fase 2 (análise profunda) */
  deepLimit?: number
  categoryHint?: string | null
}

/**
 * Pesquisa de mercado em duas fases.
 * Fase 1 (barata): catálogo por relevância + ranking de mais vendidos da categoria.
 * Fase 2 (profunda): apenas nas melhores referências, busca ofertas reais e reputação.
 */
export async function researchMarket(
  token: string,
  query: string,
  opts: ResearchOptions = {}
): Promise<ResearchResult> {
  const deepLimit = opts.deepLimit ?? 8
  const warnings: string[] = []

  // --- categoria/domínio oficiais
  const domains = await discoverDomain(token, query).catch(() => [])
  const primary = domains[0] || null
  const categoryId = opts.categoryHint || primary?.category_id || null

  // --- fase 1: candidatos
  const [searchResults, highlights] = await Promise.all([
    searchCatalog(token, query).catch(() => [] as CatalogSearchItem[]),
    categoryId ? getHighlights(token, categoryId) : Promise.resolve([]),
  ])

  const highlightPos = new Map<string, number>()
  for (const h of highlights) {
    // USER_PRODUCT pertence a outro vendedor e não é acessível por aplicações externas.
    if (h.type === 'PRODUCT') highlightPos.set(h.id, h.position)
  }

  const searchPos = new Map<string, number>()
  searchResults.forEach((r, i) => searchPos.set(r.id, i))

  // domínio dominante nos resultados da busca — filtra ruído do catálogo
  const domainCount = new Map<string, number>()
  for (const r of searchResults) {
    if (r.domain_id) domainCount.set(r.domain_id, (domainCount.get(r.domain_id) || 0) + 1)
  }
  const dominantDomain =
    primary?.domain_id ||
    [...domainCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ||
    null

  const candidateIds = new Set<string>()
  for (const r of searchResults.slice(0, 16)) {
    if (!dominantDomain || !r.domain_id || r.domain_id === dominantDomain) candidateIds.add(r.id)
  }
  // reforça com os campeões de venda da categoria
  for (const [id] of [...highlightPos.entries()].sort((a, b) => a[1] - b[1]).slice(0, 10)) {
    candidateIds.add(id)
  }

  if (candidateIds.size === 0) {
    return {
      query,
      domain_id: primary?.domain_id ?? null,
      domain_name: primary?.domain_name ?? null,
      category_id: categoryId,
      category_name: primary?.category_name ?? null,
      keywords: [],
      competitors: [],
      candidates_found: 0,
      price_stats: null,
      regional: buildRegionalRadar([]),
      warnings: [
        'Nenhuma referência de catálogo encontrada para este produto no Mercado Livre. Isso pode indicar um nicho pouco explorado ou que o nome do produto precisa ser mais específico.',
      ],
    }
  }

  // --- fase 2: pré-seleção pelos sinais baratos, depois análise profunda
  const preRanked = [...candidateIds].sort((a, b) => {
    const ha = highlightPos.get(a) ?? 999
    const hb = highlightPos.get(b) ?? 999
    const sa = searchPos.get(a) ?? 999
    const sb = searchPos.get(b) ?? 999
    return ha + sa - (hb + sb)
  })

  const toAnalyze = preRanked.slice(0, Math.max(deepLimit, 6) + 4)

  const dossiers = await mapLimitSettled(toAnalyze, 4, async id => {
    const product = await getProduct(token, id)
    if (product.status && product.status !== 'active') return null
    if (dominantDomain && product.domain_id && product.domain_id !== dominantDomain) return null

    const items = await getProductItems(token, id)
    const sellerIds = [...new Set(items.map(i => i.seller_id))].slice(0, 4)
    const sellerEntries = await mapLimitSettled(sellerIds, 3, async sid => {
      const u = await getSeller(token, sid)
      return [sid, u] as [number, MLUser | null]
    })
    return buildDossier(
      product,
      items,
      new Map(sellerEntries),
      highlightPos.get(id) ?? null,
      searchPos.get(id) ?? null
    )
  })

  const valid = dossiers.filter((d): d is CompetitorDossier => d !== null)
  valid.sort((a, b) => b.strength_score - a.strength_score)
  const competitors = valid.slice(0, deepLimit)

  if (competitors.length && competitors.every(c => c.price === null)) {
    warnings.push(
      'As referências encontradas não possuem ofertas ativas no momento — os preços não puderam ser confirmados.'
    )
  }

  const prices = competitors.map(c => c.price).filter((p): p is number => typeof p === 'number' && p > 0)
  const keywords = categoryId
    ? (await getCategoryTrends(token, categoryId)).map(t => t.keyword).slice(0, 25)
    : []

  return {
    query,
    domain_id: primary?.domain_id ?? dominantDomain,
    domain_name: primary?.domain_name ?? null,
    category_id: categoryId,
    category_name: primary?.category_name ?? null,
    keywords,
    competitors,
    candidates_found: candidateIds.size,
    price_stats: prices.length
      ? {
          min: Math.min(...prices),
          max: Math.max(...prices),
          median: median(prices),
          avg: prices.reduce((a, b) => a + b, 0) / prices.length,
          sample_size: prices.length,
        }
      : null,
    regional: buildRegionalRadar(competitors),
    warnings,
  }
}
