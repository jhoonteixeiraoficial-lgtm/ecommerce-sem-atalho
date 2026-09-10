import { describe, expect, it } from 'vitest'
import { computeEffectiveRequirements } from '../publication-requirements'
import type { ClassifiedAttribute } from '../taxonomy'

const requiredColor: ClassifiedAttribute = {
  id: 'COLOR',
  name: 'Cor',
  value_type: 'string',
  tags: { required: true },
  tier: 'required',
  fixedValues: false,
  isVariationOnly: false,
  readOnly: false,
}

describe('effective publication requirements', () => {
  it('mantém atributo inferido como blocker até confirmação do vendedor', () => {
    const result = computeEffectiveRequirements([requiredColor], [], [{
      id: 'COLOR',
      name: 'Cor',
      value_name: 'Preto',
      tier: 'required',
      source: 'ai',
      status: 'NEEDS_CONFIRMATION',
    }])

    expect(result.product_payload_ready).toBe(false)
    expect(result.blockers).toEqual([
      expect.objectContaining({
        attribute_id: 'COLOR',
        current_value: 'Preto',
        requires_confirmation: true,
        is_blocker: true,
      }),
    ])
  })

  it('inclui blocker retornado pelo ML mesmo quando não veio no schema da categoria', () => {
    const result = computeEffectiveRequirements([], [{
      code: 'item.attributes.missing',
      message: 'SELLER_PACKAGE_WEIGHT is required',
      attribute_ids: ['SELLER_PACKAGE_WEIGHT'],
      severity: 'error',
    }], [])

    expect(result.product_payload_ready).toBe(false)
    expect(result.blockers).toEqual([
      expect.objectContaining({
        attribute_id: 'SELLER_PACKAGE_WEIGHT',
        source: 'ml_validation',
        is_blocker: true,
      }),
    ])
  })

  it('mantém AUTO_FILLED sem evidência como blocker', () => {
    const result = computeEffectiveRequirements([requiredColor], [], [{
      id: 'COLOR',
      name: 'Cor',
      value_name: 'Preto',
      tier: 'required',
      source: 'catalog',
      status: 'AUTO_FILLED',
    }])

    expect(result.blockers).toEqual([
      expect.objectContaining({ attribute_id: 'COLOR', is_blocker: true, requires_confirmation: true }),
    ])
  })
})
