import type { ProductTruth } from './truth'

/**
 * Separação fundamental do Assertive:
 *  - EXACT_PRODUCT      -> pode alimentar FATOS (ProductTruth, ficha técnica)
 *  - COMPARABLE_PRODUCT -> só alimenta ESTRATÉGIA (SEO, preço, imagens, estrutura)
 *  - CATEGORY_REFERENCE -> só contexto de categoria
 *
 * Deixar um comparável alimentar fato é contaminação: bug P0.
 */
export type MatchClass = 'EXACT_PRODUCT' | 'COMPARABLE_PRODUCT' | 'CATEGORY_REFERENCE'

export interface MatchEvaluation {
  match_class: MatchClass
  /** 0-100: quão certo estou de que é o MESMO produto */
  product_match_confidence: number
  reasons: string[]
  /** true somente quando pode alimentar ProductTruth */
  usable_as_fact_source: boolean
}

function norm(s: string | undefined | null): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Compara modelos tolerando separadores: "KA-250" == "ka250" == "KA 250". */
function modelEquivalent(a: string, b: string): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // Sufixo de cor/variação: "ka250" == "ka250b" (letra), "ka250" == "ka250v2" (variante)
  // NÃO aceita sufixo puramente numérico: "ka250" != "ka2503" (modelo diferente)
  if (na.length >= 4 && nb.startsWith(na)) {
    const suffix = nb.slice(na.length)
    // Sufixo inválido: começa com número = extensão de modelo diferente
    return suffix.length > 0 && /^[a-z]/.test(suffix)
  }
  if (nb.length >= 4 && na.startsWith(nb)) {
    const suffix = na.slice(nb.length)
    return suffix.length > 0 && /^[a-z]/.test(suffix)
  }
  return false
}

export interface CandidateIdentity {
  title?: string | null
  attributes?: Record<string, string>
  catalog_product_id?: string | null
}

/**
 * Avalia se um candidato é o mesmo produto do ProductTruth.
 * Só identificadores fortes produzem EXACT_PRODUCT.
 */
export function evaluateMatch(truth: ProductTruth, candidate: CandidateIdentity): MatchEvaluation {
  const attrs = candidate.attributes || {}
  const reasons: string[] = []
  let score = 0

  const truthGtin = truth.fields.gtin?.value
  const truthMpn = truth.fields.part_number?.value
  const truthBrand = truth.fields.brand?.value
  const truthModel = truth.fields.model?.value

  const candGtin = attrs.GTIN || attrs.EAN || attrs.UPC
  const candMpn = attrs.MPN || attrs.PART_NUMBER
  const candBrand = attrs.BRAND
  const candModel = attrs.MODEL

  // ---- identificadores fortes
  const gtinMatch = Boolean(truthGtin && candGtin && norm(truthGtin) === norm(candGtin))
  if (gtinMatch) {
    score += 70
    reasons.push('GTIN idêntico')
  }

  const mpnMatch = Boolean(truthMpn && candMpn && norm(truthMpn) === norm(candMpn))
  if (mpnMatch) {
    score += 25
    reasons.push('MPN idêntico')
  }

  const brandMatch = Boolean(truthBrand && candBrand && norm(truthBrand) === norm(candBrand))
  const modelMatch = Boolean(truthModel && candModel && modelEquivalent(truthModel, candModel))

  if (brandMatch && modelMatch) {
    score += 55
    reasons.push('Marca e modelo idênticos')
  } else {
    if (brandMatch) {
      score += 12
      reasons.push('Mesma marca')
    }
    if (modelMatch) {
      score += 18
      reasons.push('Mesmo modelo')
    }
  }

  // ---- reforço fraco: modelo aparece no título
  if (!modelMatch && truthModel && candidate.title) {
    const t = norm(candidate.title)
    if (norm(truthModel).length >= 4 && t.includes(norm(truthModel))) {
      score += 10
      reasons.push('Modelo citado no título')
    }
  }

  score = Math.min(100, score)

  // ---- classificação: exige evidência forte para EXACT
  const strongIdentity = gtinMatch || (brandMatch && modelMatch) || (mpnMatch && brandMatch)
  const match_class: MatchClass = strongIdentity
    ? 'EXACT_PRODUCT'
    : score >= 20
      ? 'COMPARABLE_PRODUCT'
      : 'CATEGORY_REFERENCE'

  if (!strongIdentity && reasons.length === 0) {
    reasons.push('Sem identificador em comum: serve apenas como referência de categoria')
  }

  return {
    match_class,
    product_match_confidence: score,
    reasons,
    // apenas produto exato pode virar fonte de fato
    usable_as_fact_source: match_class === 'EXACT_PRODUCT' && score >= 55,
  }
}

// ---------------------------------------------------------------- matriz
export type MatrixKey =
  | 'BEST_OVERALL'
  | 'BEST_SEO'
  | 'BEST_PRICE'
  | 'BEST_IMAGES'
  | 'BEST_ATTRIBUTES'
  | 'BEST_DESCRIPTION'
  | 'BEST_LOGISTICS'
  | 'BEST_SELLER'

export interface MatrixCandidate {
  product_id: string
  title: string
  price: number | null
  picture_count: number
  attribute_count: number
  short_description: string | null
  competitive_reference_strength: number
  highlight_position: number | null
  shipping: { free_shipping: boolean; fulfillment: boolean }
  seller: { power_seller_status: string | null; transactions_total: number | null } | null
}

/**
 * Não existe "um melhor concorrente": cada dimensão tem seu vencedor.
 * Retorna o product_id campeão em cada categoria, quando houver dado real.
 */
export function buildCompetitorMatrix(
  candidates: MatrixCandidate[]
): Partial<Record<MatrixKey, { product_id: string; title: string; value: string }>> {
  if (!candidates.length) return {}

  const pick = (
    key: MatrixKey,
    list: MatrixCandidate[],
    score: (c: MatrixCandidate) => number | null,
    format: (c: MatrixCandidate) => string
  ) => {
    const scored = list
      .map(c => ({ c, s: score(c) }))
      .filter((x): x is { c: MatrixCandidate; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s)
    if (!scored.length) return null
    return [key, { product_id: scored[0].c.product_id, title: scored[0].c.title, value: format(scored[0].c) }] as const
  }

  const entries = [
    pick('BEST_OVERALL', candidates, c => c.competitive_reference_strength, c => `Força ${c.competitive_reference_strength}`),
    pick(
      'BEST_SEO',
      candidates,
      c => (c.highlight_position !== null ? 1000 - c.highlight_position : null),
      c => `#${c.highlight_position} em mais vendidos`
    ),
    pick(
      'BEST_PRICE',
      candidates,
      c => (c.price !== null && c.price > 0 ? -c.price : null),
      c => `R$ ${c.price?.toFixed(2)}`
    ),
    pick('BEST_IMAGES', candidates, c => c.picture_count || null, c => `${c.picture_count} imagens`),
    pick('BEST_ATTRIBUTES', candidates, c => c.attribute_count || null, c => `${c.attribute_count} atributos`),
    pick(
      'BEST_DESCRIPTION',
      candidates,
      c => c.short_description?.length || null,
      c => `${c.short_description?.length} caracteres`
    ),
    pick(
      'BEST_LOGISTICS',
      candidates,
      c => (c.shipping.fulfillment ? 2 : c.shipping.free_shipping ? 1 : null),
      c => (c.shipping.fulfillment ? 'Mercado Envios Full' : 'Frete grátis')
    ),
    pick(
      'BEST_SELLER',
      candidates,
      c => c.seller?.transactions_total ?? null,
      c => `${c.seller?.transactions_total?.toLocaleString('pt-BR')} transações`
    ),
  ].filter((x): x is NonNullable<typeof x> => x !== null)

  return Object.fromEntries(entries)
}
