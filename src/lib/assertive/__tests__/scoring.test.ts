import { describe, expect, it } from 'vitest'
import { computeCompleteness } from '../scoring'
import type { ClassifiedAttribute } from '../taxonomy'

const schema: ClassifiedAttribute[] = [{
  id: 'VOLTAGE',
  name: 'Voltagem',
  value_type: 'string',
  tags: { required: true },
  tier: 'required',
  fixedValues: false,
  isVariationOnly: false,
  readOnly: false,
}]

describe('factual completeness', () => {
  it('não conta inferência pendente de confirmação como atributo preenchido', () => {
    const result = computeCompleteness(schema, [{
      id: 'VOLTAGE', name: 'Voltagem', value_name: '220 V', tier: 'required', source: 'ai',
      status: 'NEEDS_CONFIRMATION',
    } as never])

    expect(result).toMatchObject({ percent: 0, filled: 0, required_filled: 0 })
    expect(result.missing_required).toEqual(['Voltagem'])
  })
})
