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
  it('anexa posição pública somente ao anúncio observado, sem transformar ranking em vendas', () => {
    const snapshot = {
      available: true, query: 'garrafa', observed_at: '2026-09-17T12:00:00Z',
      search_url: 'https://lista.mercadolivre.com.br/garrafa',
      entries: [{ position: 5, organic_position: 1, sponsored: false,
        item_id: 'MLB1', catalog_product_id: 'MLBP1', url: 'https://www.mercadolivre.com.br/p/MLBP1',
        title: 'Garrafa', bestseller_badge: true, sold_quantity: null }],
    }
    const set = buildBenchmarkSet([dossier({}), dossier({item_id: 'MLB2'})], snapshot)
    expect(set.references[0].evidence).toContain('Busca pública: posição observada #5; posição sem publicidade identificada #1 (2026-09-17T12:00:00Z)')
    expect(set.references[1].evidence.some(e => e.includes('Busca pública:'))).toBe(false)
    expect(set.primary?.kind).toBe('STRONGEST_REFERENCE')
    expect(set.official_best_seller_available).toBe(false)
  })

  it('usa OFFICIAL_BEST_SELLER somente quando existe evidência oficial de ranking', () => {
    const set = buildBenchmarkSet([dossier({ highlight_position: 2 })])

    expect(set.primary?.kind).toBe('OFFICIAL_BEST_SELLER')
    expect(set.primary?.evidence).toContain('Mais vendidos da categoria: posição #2')
  })

  it('prioriza o anúncio exato verificado na busca pública sobre referência só de categoria', () => {
    const verified = dossier({item_id:'MLB999',match_class:'EXACT_PRODUCT',competitive_reference_strength:80,public_seller_evidence:{verified:true} as CompetitorDossier['public_seller_evidence']})
    const set=buildBenchmarkSet([dossier({highlight_position:1}),verified])
    expect(set.primary?.item_id).toBe('MLB999')
  })
  it('keeps exact official offers ahead of unrelated bestsellers without inventing public rank', () => {
    const set=buildBenchmarkSet([dossier({highlight_position:1,match_class:'CATEGORY_REFERENCE'}),dossier({item_id:'MLB999',match_class:'EXACT_PRODUCT',competitive_reference_strength:10})])
    expect(set.primary?.item_id).toBe('MLB999')
    expect(set.primary?.kind).toBe('STRONGEST_REFERENCE')
    expect(set.primary?.evidence.some(e=>e.includes('Busca pública:'))).toBe(false)
  })

  it('rotula vencedor heurístico apenas como referência mais forte', () => {
    const set = buildBenchmarkSet([dossier({ highlight_position: null })])
    expect(set.primary?.kind).toBe('STRONGEST_REFERENCE')
  })
})
