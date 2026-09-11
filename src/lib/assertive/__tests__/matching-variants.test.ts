import { describe, expect, it } from 'vitest'
import { evaluateMatch } from '../matching'
import type { ProductTruth } from '../truth'

const truth = {
  name: 'Fone Acme X1 Azul',
  fields: {
    brand: { value: 'Acme', confidence: 'confirmed', source: 'photo', evidence: 'logo' },
    model: { value: 'X1', confidence: 'confirmed', source: 'photo', evidence: 'etiqueta' },
    color: { value: 'Azul', confidence: 'confirmed', source: 'photo', evidence: 'pixels' },
  },
  uncertain: [], evidence: [], confidence: 1,
} as ProductTruth

describe('exact product variant matching', () => {
  it('não usa foto de outra cor mesmo quando marca e modelo coincidem', () => {
    const result = evaluateMatch(truth, {
      title: 'Fone Acme X1 Vermelho',
      attributes: { BRAND: 'Acme', MODEL: 'X1', COLOR: 'Vermelho' },
    })

    expect(result.match_class).not.toBe('EXACT_PRODUCT')
    expect(result.usable_as_fact_source).toBe(false)
    expect(result.reasons).toContain('Cor divergente')
  })

  it('mantém correspondência exata quando a variante confirmada coincide', () => {
    const result = evaluateMatch(truth, {
      title: 'Fone Acme X1 Azul',
      attributes: { BRAND: 'Acme', MODEL: 'X1', COLOR: 'Azul' },
    })

    expect(result.match_class).toBe('EXACT_PRODUCT')
    expect(result.usable_as_fact_source).toBe(true)
  })
})
