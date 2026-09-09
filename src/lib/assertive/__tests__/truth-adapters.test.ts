import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mlGet: vi.fn(),
  generateJson: vi.fn(),
  toDataUri: vi.fn(),
}))

vi.mock('../ml-api', () => ({ mlGet: mocks.mlGet }))
vi.mock('../ai', () => ({
  generateJson: mocks.generateJson,
  toDataUri: mocks.toDataUri,
}))

import {
  identifyFromBrandModel,
  identifyFromDescription,
  identifyFromGtin,
  identifyFromPhotos,
  identifyProduct,
} from '../truth'

const catalogProduct = {
  id: 'MLB1234567890',
  name: 'Caneta de polaridade Kitest KA250 12V 24V',
  domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
  category_id: 'MLB60658',
  attributes: [
    { id: 'PRODUCT_TYPE', value_name: 'Caneta de polaridade' },
    { id: 'BRAND', value_name: 'Kitest' },
    { id: 'MODEL', value_name: 'KA250' },
    { id: 'GTIN', value_name: '7898559182505' },
    { id: 'VOLTAGE', value_name: '12V/24V' },
  ],
  pictures: [{ secure_url: 'https://example.com/kitest.jpg' }],
}

describe('adapters de identidade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.toDataUri.mockImplementation(async (url: string) => `data:image/jpeg;base64,${url.split('/').pop()}`)
    mocks.generateJson.mockResolvedValue({
      name: 'Caneta de polaridade Kitest KA250 12V 24V',
      product_type: 'Caneta de polaridade',
      function: 'Testar circuitos elétricos automotivos',
      confidence: 0.93,
      fields: {
        brand: { value: 'Kitest', confidence: 'confirmed', evidence: 'Marca visível' },
        model: { value: 'KA250', confidence: 'confirmed', evidence: 'Modelo visível' },
        product_type: { value: 'Caneta de polaridade', confidence: 'high', evidence: 'Formato visível' },
        function: { value: 'Testar circuitos elétricos automotivos', confidence: 'high', evidence: 'Descrição literal' },
      },
      uncertain: [],
    })
    mocks.mlGet.mockImplementation(async (path: string) => {
      if (path.startsWith('/products/search?')) return { results: [{ id: catalogProduct.id, name: catalogProduct.name }] }
      if (path === `/products/${catalogProduct.id}`) return catalogProduct
      throw new Error(`Unexpected path: ${path}`)
    })
  })

  it('processa oito fotos e consolida uma única identidade canônica', async () => {
    const photos = Array.from({ length: 8 }, (_, index) => `https://example.com/photo-${index + 1}.jpg`)

    const truth = await identifyFromPhotos(null, photos)

    expect(mocks.toDataUri).toHaveBeenCalledTimes(8)
    expect(mocks.generateJson.mock.calls[0][3].images).toHaveLength(8)
    expect(truth.identity).toMatchObject({
      product_type: 'Caneta de polaridade',
      brand: 'Kitest',
      model: 'KA250',
    })
  })

  it('GTIN válido resolve produto exato no catálogo oficial', async () => {
    const truth = await identifyFromGtin(null, '7898559182505', 'token')

    expect(truth.fields.gtin?.value).toBe('7898559182505')
    expect(truth.source_catalog_product_id).toBe('MLB1234567890')
    expect(truth.identity).toMatchObject({ brand: 'Kitest', model: 'KA250', product_type: 'Caneta de polaridade' })
  })

  it('marca e modelo resolvem apenas candidato com ambos os identificadores exatos', async () => {
    const truth = await identifyFromBrandModel(null, 'Kitest', 'KA250', 'token')

    expect(truth.fields.brand).toMatchObject({ value: 'Kitest', source: 'user', status: 'USER_OVERRIDE' })
    expect(truth.fields.model).toMatchObject({ value: 'KA250', source: 'user', status: 'USER_OVERRIDE' })
    expect(truth.source_catalog_product_id).toBe('MLB1234567890')
  })

  it('dispatcher entrega o mesmo contrato para descrição, foto única e múltiplas fotos', async () => {
    const outputs = await Promise.all([
      identifyProduct(null, { type: 'description', description: 'Caneta de polaridade Kitest KA250' }, null),
      identifyProduct(null, { type: 'single_image', photos: ['https://example.com/one.jpg'] }, null),
      identifyProduct(null, { type: 'multi_image', photos: ['https://example.com/one.jpg', 'https://example.com/two.jpg'] }, null),
    ])

    for (const truth of outputs) {
      expect(truth.identity).toEqual(expect.objectContaining({
        name: expect.any(String),
        product_type: expect.any(String),
        confidence: expect.any(Number),
        evidence: expect.any(Array),
        unknowns: expect.any(Array),
        conflicts: expect.any(Array),
      }))
    }
  })

  it('descrição conserva identidade como fato e não como título SEO', async () => {
    const truth = await identifyFromDescription(null, 'Caneta de polaridade Kitest KA250 para circuitos 12V e 24V')

    expect(truth.identity?.product_type).toBe('Caneta de polaridade')
    expect(truth.name).not.toMatch(/frete|oferta|promoção/i)
  })

  it('seleciona o candidato de identidade mais forte antes da pesquisa', async () => {
    mocks.generateJson.mockResolvedValueOnce({
      candidates: [
        {
          name: 'Ferramenta automotiva genérica',
          product_type: 'Ferramenta automotiva',
          confidence: 0.96,
          evidence: ['aparência geral'],
          fields: {},
        },
        {
          name: 'Caneta de polaridade Kitest KA250',
          product_type: 'Caneta de polaridade',
          function: 'Testar circuitos elétricos automotivos',
          confidence: 0.85,
          evidence: ['marca, modelo e GTIN literais'],
          fields: {
            brand: { value: 'Kitest', confidence: 'confirmed', evidence: 'literal' },
            model: { value: 'KA250', confidence: 'confirmed', evidence: 'literal' },
            gtin: { value: '7898559182505', confidence: 'confirmed', evidence: 'literal' },
          },
        },
      ],
    })

    const truth = await identifyFromDescription(null, 'Kitest KA250 GTIN 7898559182505')

    expect(truth.name).toBe('Caneta de polaridade Kitest KA250')
    expect(truth.fields.model?.value).toBe('KA250')
  })
})
