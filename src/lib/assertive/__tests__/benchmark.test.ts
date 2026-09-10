import { describe, expect, it } from 'vitest'
import { buildBenchmarkSet } from '../benchmark'
import type { CompetitorDossier } from '../research'

function dossier(overrides: Partial<CompetitorDossier>): CompetitorDossier {
  return {
    product_id: 'MLBP1',
    item_id: 'MLB1',
    highlight_position: null,
    competitive_reference_strength: 90,
    strength_evidence: ['Alta relevância'],
    match_class: 'COMPARABLE_PRODUCT',
    ...overrides,
  } as CompetitorDossier
}

describe('buildBenchmarkSet', () => {
  it('usa OFFICIAL_BEST_SELLER somente quando existe evidência oficial de ranking', () => {
    const set = buildBenchmarkSet([dossier({ highlight_position: 2 })])

    expect(set.primary?.kind).toBe('OFFICIAL_BEST_SELLER')
    expect(set.primary?.evidence).toContain('Mais vendidos da categoria: posição #2')
  })

  it('rotula vencedor heurístico apenas como referência mais forte', () => {
    const set = buildBenchmarkSet([dossier({ highlight_position: null })])
    expect(set.primary?.kind).toBe('STRONGEST_REFERENCE')
  })
})
