import type { CompetitorDossier } from './research'
import type { MatchClass } from './matching'
import type { PublicSearchSnapshot } from './public-search'

export type BenchmarkKind = 'OFFICIAL_BEST_SELLER' | 'STRONGEST_REFERENCE'

export interface BenchmarkReference {
  product_id: string
  item_id: string | null
  kind: BenchmarkKind
  exactness: MatchClass
  strength: number
  evidence: string[]
}

export interface BenchmarkSet {
  primary: BenchmarkReference | null
  references: BenchmarkReference[]
  official_best_seller_available: boolean
}

export function buildBenchmarkSet(competitors: CompetitorDossier[], publicSearch?: PublicSearchSnapshot): BenchmarkSet {
  const ranked = [...competitors].sort((a, b) => {
    const verifiedExact = (d: CompetitorDossier) => Number(d.match_class === 'EXACT_PRODUCT' && Boolean(d.public_seller_evidence?.verified || d.public_offer_verified))
    const publicPriority = verifiedExact(b) - verifiedExact(a)
    if (publicPriority) return publicPriority
    const exactPriority = Number(b.match_class === 'EXACT_PRODUCT') - Number(a.match_class === 'EXACT_PRODUCT')
    if (exactPriority) return exactPriority
    if (a.highlight_position !== null && b.highlight_position !== null) {
      return a.highlight_position - b.highlight_position
    }
    if (a.highlight_position !== null) return -1
    if (b.highlight_position !== null) return 1
    return b.competitive_reference_strength - a.competitive_reference_strength
  })
  const references = ranked.map(competitor => ({
    product_id: competitor.product_id,
    item_id: competitor.item_id,
    kind: competitor.highlight_position === null
      ? 'STRONGEST_REFERENCE' as const
      : 'OFFICIAL_BEST_SELLER' as const,
    exactness: competitor.match_class,
    strength: competitor.competitive_reference_strength,
    evidence: competitor.highlight_position === null
      ? [...competitor.strength_evidence]
      : [
          ...competitor.strength_evidence,
          `Mais vendidos da categoria: posição #${competitor.highlight_position}`,
        ].filter((value, index, values) => values.indexOf(value) === index),
  }))

  // A catalog can contain multiple sellers: only join the exact listing ID.
  if (publicSearch?.available) {
    for (const reference of references) {
      const observed = reference.item_id
        ? publicSearch.entries.find(entry => entry.item_id === reference.item_id && !entry.sponsored)
        : undefined
      if (!observed) continue
      reference.evidence.push(`Busca pública: posição observada #${observed.position}; posição sem publicidade identificada #${observed.organic_position} (${publicSearch.observed_at})`)
    }
  }

  return {
    primary: references[0] || null,
    references,
    official_best_seller_available: references.some(reference => reference.kind === 'OFFICIAL_BEST_SELLER'),
  }
}
