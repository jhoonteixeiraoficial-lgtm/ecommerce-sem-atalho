import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mlGet: vi.fn(),
  generateJson: vi.fn(),
}))

vi.mock('../ml-api', () => ({ mlGet: mocks.mlGet }))
vi.mock('../ai', () => ({
  generateJson: mocks.generateJson,
  toDataUri: vi.fn(),
}))

import { identifyFromUrl } from '../truth'

const URL = 'https://www.mercadolivre.com.br/kitest-ka250-testador-pulso-bico-fino-12v-24v/up/MLBU3146884103'

describe('identifyFromUrl - URL de user product do Mercado Livre', () => {
  beforeEach(() => {
    mocks.mlGet.mockReset()
    mocks.generateJson.mockReset()
    mocks.generateJson.mockResolvedValue({
      name: 'Testador de Pulso de Bico Injetor Kitest KA-250 12V/24V',
      confidence: 1,
      fields: {},
      uncertain: [],
    })

    mocks.mlGet.mockImplementation(async (path: string) => {
      if (path === '/user-products/MLBU3146884103') {
        return {
          id: 'MLBU3146884103',
          name: 'Kitest Ka250 Testador Pulso Bico Fino 12v 24v',
          family_name: 'Kitest Ka250 Testador Pulso Bico Fino 12v 24v',
          site_id: 'MLB',
          user_id: 1643995837,
          domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
          attributes: [
            { id: 'BRAND', name: 'Marca', values: [{ id: '12177154', name: 'Kitest', struct: null }] },
            {
              id: 'MODEL',
              name: 'Modelo',
              values: [{
                id: null,
                name: 'Caneta de polaridade teste de bicos injetores b=com iluminação lanterna led luz 1 ano de garantia kitest KA-250',
                struct: null,
              }],
            },
            { id: 'GTIN', name: 'Código universal de produto', values: [{ id: null, name: '7898559182505', struct: null }] },
          ],
          pictures: [
            { id: '1', secure_url: 'https://http2.mlstatic.com/D_1-O.jpg' },
            { id: '2', secure_url: 'https://http2.mlstatic.com/D_2-O.jpg' },
            { id: '3', secure_url: 'https://http2.mlstatic.com/D_3-O.jpg' },
            { id: '4', secure_url: 'https://http2.mlstatic.com/D_4-O.jpg' },
            { id: '5', secure_url: 'https://http2.mlstatic.com/D_5-O.jpg' },
          ],
          catalog_product_id: null,
        }
      }
      if (path === '/users/1643995837/items/search?user_product_id=MLBU3146884103') {
        return { seller_id: '1643995837', results: ['MLB4046224913'], paging: { limit: 50, offset: 0, total: 1 } }
      }
      if (path === '/items/MLB4046224913') {
        return {
          id: 'MLB4046224913',
          title: 'Kitest Ka250 Testador Pulso Bico Fino 12v 24v',
          category_id: 'MLB60658',
          domain_id: 'MLB-TOOL_AND_CONSTRUCTION_SUPPLIES',
          user_product_id: 'MLBU3146884103',
          attributes: [
            { id: 'BRAND', name: 'Marca', value_name: 'Kitest' },
            { id: 'GTIN', name: 'Código universal de produto', value_name: '7898559182505' },
          ],
          pictures: [
            { secure_url: 'https://http2.mlstatic.com/D_1-O.jpg' },
            { secure_url: 'https://http2.mlstatic.com/D_2-O.jpg' },
            { secure_url: 'https://http2.mlstatic.com/D_3-O.jpg' },
            { secure_url: 'https://http2.mlstatic.com/D_4-O.jpg' },
            { secure_url: 'https://http2.mlstatic.com/D_5-O.jpg' },
          ],
        }
      }
      throw new Error(`Unexpected ML path: ${path}`)
    })
  })

  it('usa a fonte oficial MLBU e preserva item, categoria, identidade e cinco fotos', async () => {
    const truth = await identifyFromUrl(null, URL, 'ml-token')

    expect(truth.name).toBe('Kitest Ka250 Testador Pulso Bico Fino 12v 24v')
    expect(truth.fields.brand?.value).toBe('Kitest')
    expect(truth.fields.model?.value.replace(/-/g, '').toUpperCase()).toBe('KA250')
    expect(truth.fields.gtin?.value).toBe('7898559182505')
    expect(truth.source_item_id).toBe('MLB4046224913')
    expect(truth.source_category_id).toBe('MLB60658')
    expect(truth.source_domain_id).toBe('MLB-TOOL_AND_CONSTRUCTION_SUPPLIES')
    expect(truth.source_pictures).toHaveLength(5)
    expect(mocks.generateJson).not.toHaveBeenCalled()
  })
})
