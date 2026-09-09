import { describe, expect, it } from 'vitest'
import { applyUserAnswers, enrichFromCatalog, type ProductTruth } from '../truth'

function baseTruth(): ProductTruth {
  return {
    name: 'Caneta de polaridade Kitest KA250',
    fields: {
      brand: { value: 'Kitest', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte oficial', status: 'CONFIRMED' },
      gtin: { value: '7898559182505', confidence: 'confirmed', source: 'ml_item', evidence: 'fonte oficial', status: 'CONFIRMED' },
    },
    uncertain: [],
    evidence: ['fonte oficial'],
    confidence: 1,
  }
}

describe('ProductTruth - hierarquia de evidência', () => {
  it('GTIN idêntico permite enriquecer fatos do produto exato sem exigir modelo prévio', () => {
    const result = enrichFromCatalog(baseTruth(), {
      BRAND: 'Kitest',
      MODEL: 'KA250',
      GTIN: '7898559182505',
      COLOR: 'Vermelho',
    }, 'Caneta de polaridade Kitest KA250')

    expect(result.fields.model).toMatchObject({ value: 'KA250', source: 'ml_catalog', status: 'AUTO_FILLED' })
    expect(result.fields.color?.value).toBe('Vermelho')
  })

  it('marca isolada nunca autoriza herdar ficha de comparável', () => {
    const result = enrichFromCatalog(baseTruth(), {
      BRAND: 'Kitest',
      MODEL: 'KA300',
      COLOR: 'Azul',
    }, 'Produto comparável Kitest KA300')

    expect(result.fields.model).toBeUndefined()
    expect(result.fields.color).toBeUndefined()
  })

  it('USER_OVERRIDE vence catálogo e mantém conflito explícito', () => {
    const overridden = applyUserAnswers(baseTruth(), { color: 'Vermelho' })
    const result = enrichFromCatalog(overridden, {
      BRAND: 'Kitest',
      GTIN: '7898559182505',
      COLOR: 'Azul',
    }, 'Caneta de polaridade Kitest KA250')

    expect(result.fields.color).toMatchObject({ value: 'Vermelho', source: 'user', status: 'USER_OVERRIDE' })
    expect(result.fields.color?.conflict).toContainEqual(expect.objectContaining({ value: 'Azul', source: 'ml_catalog' }))
  })
})
