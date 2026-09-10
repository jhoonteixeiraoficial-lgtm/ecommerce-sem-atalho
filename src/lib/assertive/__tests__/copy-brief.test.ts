import { describe, expect, it } from 'vitest'
import { buildCopyBrief } from '../copy-brief'
import type { ProductTruth } from '../truth'

describe('buildCopyBrief', () => {
  it('inclui somente fatos publicáveis e nunca valores factuais de concorrentes', () => {
    const truth = {
      name: 'Caneta de Polaridade Kitest KA250 12V 24V',
      fields: {
        product_type: { value: 'Caneta de Polaridade', confidence: 'confirmed', source: 'ml_item', evidence: 'Fonte oficial' },
        brand: { value: 'Kitest', confidence: 'confirmed', source: 'ml_item', evidence: 'Fonte oficial' },
        model: { value: 'KA250', confidence: 'confirmed', source: 'ml_item', evidence: 'Fonte oficial' },
        voltage: { value: '48 V', confidence: 'high', source: 'inference', evidence: 'Suposição', status: 'NEEDS_CONFIRMATION' },
      },
      uncertain: [],
      evidence: ['Fonte oficial'],
      confidence: 1,
    } as ProductTruth

    const brief = buildCopyBrief({
      truth,
      category: { id: 'MLB1', name: 'Ferramentas', path_from_root: [], settings: { max_title_length: 55 } },
      keywords: ['teste elétrico'],
      titleShapes: ['TIPO + MARCA + MODELO'],
      descriptionShapes: ['Aplicação', 'Especificações'],
    })

    expect(brief.facts.map(fact => fact.value)).toEqual(expect.arrayContaining(['Caneta de Polaridade', 'Kitest', 'KA250']))
    expect(brief.facts.map(fact => fact.value)).not.toContain('48 V')
    expect(brief.category.title_limit).toBe(55)
  })
})
