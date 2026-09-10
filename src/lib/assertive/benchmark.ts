import type { CompetitorDossier } from './research'
import type { MatchClass } from './matching'

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

export function buildBenchmarkSet(competitors: CompetitorDossier[]): BenchmarkSet {
  const ranked = [...competitors].sort((a, b) => {
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

  return {
    primary: references[0] || null,
    references,
    official_best_seller_available: references.some(reference => reference.kind === 'OFFICIAL_BEST_SELLER'),
  }
}
