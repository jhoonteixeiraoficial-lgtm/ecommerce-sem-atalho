import { describe, expect, it } from 'vitest'
import { classifyAttributes, type MLAttribute } from '../taxonomy'

describe.each([
  ['ferramentas', { id: 'SELLER_PACKAGE_WEIGHT', tags: {}, value_type: 'number_unit' }, { requireSellerPackage: true }, 'required'],
  ['eletrônicos', { id: 'VOLTAGE', tags: { catalog_required: true }, value_type: 'list' }, {}, 'catalog_required'],
  ['casa', { id: 'MATERIAL', tags: { conditional_required: true }, value_type: 'string' }, {}, 'recommended'],
  ['moda', { id: 'SIZE', tags: { required: true, allow_variations: true }, hierarchy: 'CHILD_PK', value_type: 'list' }, {}, 'required'],
  ['alimentos', { id: 'NET_VOLUME', tags: {}, relevance: 9, value_type: 'number_unit' }, {}, 'optional'],
] as const)('schema dinâmico: %s', (_category, raw, options, expectedTier) => {
  it(`classifica ${raw.id} pelos metadados oficiais`, () => {
    const result = classifyAttributes([{ name: raw.id, ...raw } as MLAttribute], options)

    expect(result).toEqual([
      expect.objectContaining({ id: raw.id, tier: expectedTier }),
    ])
  })
})

describe('schema dinâmico: controles do ML', () => {
  it('remove campos internos e read-only em qualquer categoria', () => {
    const result = classifyAttributes([
      { id: 'GTIN_UNAVAILABLE_REASON', name: 'Controle interno', value_type: 'string' },
      { id: 'READ_ONLY', name: 'Somente leitura', value_type: 'string', tags: { read_only: true } },
    ])

    expect(result).toEqual([])
  })
})
