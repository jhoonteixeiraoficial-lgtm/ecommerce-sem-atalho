import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassifiedAttribute } from '../taxonomy'
import type { ProductTruth } from '../truth'

const runTaskJson = vi.hoisted(() => vi.fn())

vi.mock('../ai-router', () => ({
  runTaskJson,
  reasoningEngineStatus: () => ({ engine: 'nenhum' }),
}))
vi.mock('../websearch', () => ({
  searchWeb: vi.fn().mockResolvedValue({ available: false, sources: [], queries: [] }),
  buildManufacturerQuery: vi.fn().mockReturnValue('query'),
}))

import { enrichAttributes } from '../enrichment'

const truth: ProductTruth = {
  name: 'Produto confirmado',
  fields: {},
  uncertain: [],
  evidence: [],
  confidence: 1,
}

const schema: ClassifiedAttribute[] = [{
  id: 'COLOR',
  name: 'Cor',
  value_type: 'list',
  values: [{ id: '1', name: 'Preto' }],
  tags: { required: true },
  tier: 'required',
  fixedValues: true,
  isVariationOnly: false,
  readOnly: false,
}]

describe('attribute enrichment evidence contract', () => {
  beforeEach(() => runTaskJson.mockReset().mockResolvedValue({ unknown: ['COLOR'] }))

  it('mantém atributo gerado por IA como NEEDS_CONFIRMATION', async () => {
    const result = await enrichAttributes({
      config: null,
      truth,
      schema,
      exactProductAttributes: [],
      current: [{ id: 'COLOR', name: 'Cor', value_name: 'Preto', tier: 'required', source: 'ai' }],
      skipWeb: true,
    })

    expect(result.attributes).toEqual([
      expect.objectContaining({ id: 'COLOR', value_name: 'Preto', status: 'NEEDS_CONFIRMATION', source: 'ai' }),
    ])
  })

  it('descarta valor de IA fora da lista oficial e mantém a pergunta', async () => {
    const result = await enrichAttributes({
      config: null,
      truth,
      schema,
      exactProductAttributes: [],
      current: [{ id: 'COLOR', name: 'Cor', value_name: 'Azul inventado', tier: 'required', source: 'ai' }],
      skipWeb: true,
    })

    expect(result.attributes).toEqual([])
    expect(result.remaining).toEqual([
      expect.objectContaining({ field: 'COLOR', options: ['Preto'] }),
    ])
  })
})
