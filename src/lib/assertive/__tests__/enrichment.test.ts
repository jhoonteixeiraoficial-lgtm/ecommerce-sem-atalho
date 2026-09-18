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

  it('replaces an unconfirmed AI guess with the exact catalog fact', async () => {
    const result=await enrichAttributes({config:null,truth,schema,skipWeb:true,
      exactProductAttributes:[{title:'Produto exato',attributes:{COLOR:'Preto'}}],
      current:[{id:'COLOR',name:'Cor',value_name:'Preto',tier:'required',source:'ai',status:'NEEDS_CONFIRMATION'}]})
    expect(result.attributes).toEqual([expect.objectContaining({id:'COLOR',status:'AUTO_FILLED',source:'catalog'})])
    expect(result.stats.from_exact_product).toBe(1)
  })

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

  it('não promove um GTIN apenas inferido porque o checksum é válido', async () => {
    const result = await enrichAttributes({
      config: null,
      truth: {
        ...truth,
        fields: {
          gtin: {
            value: '7898559182505',
            confidence: 'high',
            source: 'inference',
            evidence: 'Sugestão visual sem leitura literal',
            status: 'NEEDS_CONFIRMATION',
          },
        },
      },
      schema: [{
        id: 'GTIN', name: 'Código universal de produto', value_type: 'string',
        tier: 'required', fixedValues: false, isVariationOnly: false, readOnly: false,
      }],
      exactProductAttributes: [],
      skipWeb: true,
    })

    expect(result.attributes).toEqual([
      expect.objectContaining({ id: 'GTIN', status: 'NEEDS_CONFIRMATION' }),
    ])
  })

  it('preserva user override mesmo quando catálogo exato tenta sobrescrever', async () => {
    const result = await enrichAttributes({
      config: null,
      truth,
      schema,
      exactProductAttributes: [{ title: 'Produto exato', attributes: { COLOR: 'Preto' } }],
      current: [{ id: 'COLOR', name: 'Cor', value_name: 'Azul', tier: 'required', source: 'user' }],
      skipWeb: true,
    })

    expect(result.attributes).toEqual([
      expect.objectContaining({ id: 'COLOR', value_name: 'Azul', status: 'USER_OVERRIDE', source: 'user' }),
    ])
    expect(result.stats.from_exact_product).toBe(0)
  })

  it('prioriza ProductTruth sobre catálogo exato', async () => {
    const truthWithColor: ProductTruth = {
      name: 'Produto com truth',
      fields: { color: { value: 'Vermelho', source: 'user', confidence: 'confirmed', status: 'CONFIRMED', evidence: 'Cor confirmada pelo vendedor' } },
      uncertain: [],
      evidence: [],
      confidence: 1,
    }

    const result = await enrichAttributes({
      config: null,
      truth: truthWithColor,
      schema,
      exactProductAttributes: [{ title: 'Produto exato', attributes: { COLOR: 'Preto' } }],
      skipWeb: true,
    })

    expect(result.attributes).toEqual([
      expect.objectContaining({ id: 'COLOR', value_name: 'Vermelho', status: 'CONFIRMED', source: 'truth' }),
    ])
    expect(result.stats.from_exact_product).toBe(0)
  })
})
