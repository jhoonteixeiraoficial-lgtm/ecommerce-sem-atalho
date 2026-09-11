import { describe, expect, it } from 'vitest'
import { categoryDiscoveryHint, type ProductTruth } from '../truth'

describe('category discovery context', () => {
  it('explicita tensão ao classificar uma caneta de teste automotiva', () => {
    const truth = {
      name: 'Caneta Para Testar Bicos Injetores 12V e 24V Kitest KA-250',
      category_hint: 'Ferramentas Automotivas > Diagnóstico Automotivo',
      fields: {
        product_type: { value: 'Caneta para teste de bicos injetores', confidence: 'confirmed', source: 'description', evidence: 'texto' },
        function: { value: 'Testar bicos injetores', confidence: 'confirmed', source: 'description', evidence: 'texto' },
        voltage: { value: '12V / 24V', confidence: 'confirmed', source: 'description', evidence: 'texto' },
      },
      uncertain: [],
      evidence: [],
      confidence: 1,
    } as ProductTruth

    expect(categoryDiscoveryHint(truth)).toBe(
      'Ferramentas Automotivas > Diagnóstico Automotivo tensão elétrica voltagem 12V / 24V Caneta para teste de bicos injetores Testar bicos injetores'
    )
  })
})
