import { describe, expect, it } from 'vitest'
import { buildBlockingQuestions } from '../blocking-questions'
import type { PublicationRequirements } from '../publication-requirements'
import type { ClassifiedAttribute } from '../taxonomy'

function schema(id: string, values?: string[]): ClassifiedAttribute {
  return {
    id,
    name: id,
    value_type: values ? 'list' : 'string',
    values: values?.map(value => ({ id: value, name: value })),
    tier: 'required',
    fixedValues: Boolean(values),
    isVariationOnly: false,
    readOnly: false,
  }
}

describe('buildBlockingQuestions', () => {
  it('pergunta somente blockers oficiais ainda não resolvidos e limita a rodada a três', () => {
    const requirements = {
      blockers: ['BRAND', 'MODEL', 'COLOR', 'VOLTAGE', 'GTIN'].map((id, index) => ({
        attribute_id: id,
        name: id,
        level: 'blocking_required' as const,
        source: index < 2 ? 'ml_validation' as const : 'category_schema' as const,
        is_blocker: true,
        requires_confirmation: false,
      })),
    } as PublicationRequirements

    const questions = buildBlockingQuestions(
      requirements,
      [schema('BRAND'), schema('MODEL'), schema('COLOR', ['Preto', 'Azul']), schema('VOLTAGE'), schema('GTIN')],
      []
    )

    expect(questions).toHaveLength(3)
    expect(questions.every(question => question.blocking)).toBe(true)
    expect(questions.map(question => question.field)).toEqual(['BRAND', 'MODEL', 'COLOR'])
  })

  it('não pergunta atributo apenas recomendado', () => {
    const requirements = { blockers: [], recommended_missing: [{ attribute_id: 'MATERIAL' }] } as unknown as PublicationRequirements
    expect(buildBlockingQuestions(requirements, [schema('MATERIAL')], [])).toEqual([])
  })
})
