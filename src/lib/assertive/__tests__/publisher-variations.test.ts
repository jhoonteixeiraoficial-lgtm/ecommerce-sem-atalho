import { describe, expect, it } from 'vitest'
import { buildItemPayload } from '../publisher'

describe('buildItemPayload variations', () => {
  it('projeta valores CHILD_PK em uma variação única sem misturá-los aos atributos do item', () => {
    const payload = buildItemPayload({
      title: 'Camiseta básica preta tamanho M',
      category_id: 'MLB1',
      price: 79.9,
      available_quantity: 3,
      pictures: ['https://example.com/camiseta.jpg'],
      attributes: [
        { id: 'BRAND', name: 'Marca', value_name: 'Acme', tier: 'required', source: 'user', status: 'USER_OVERRIDE' },
        { id: 'SIZE', name: 'Tamanho', value_name: 'M', tier: 'required', source: 'user', status: 'USER_OVERRIDE', isVariationOnly: true },
        { id: 'COLOR', name: 'Cor', value_name: 'Preto', tier: 'required', source: 'user', status: 'USER_OVERRIDE', isVariationOnly: true },
      ],
    }, { ml_user_id: 1, nickname: 'seller', site_id: 'MLB', user_product_model: false, tags: [] })

    expect(payload.attributes).toEqual([{ id: 'BRAND', value_name: 'Acme' }])
    expect(payload.variations).toEqual([{
      attribute_combinations: [
        { id: 'SIZE', value_name: 'M' },
        { id: 'COLOR', value_name: 'Preto' },
      ],
      attributes: [],
      price: 79.9,
      available_quantity: 3,
    }])
  })

  it('não cria variação com valor sem confirmação', () => {
    const payload = buildItemPayload({
      title: 'Tênis esportivo',
      category_id: 'MLB2',
      price: 199.9,
      available_quantity: 1,
      pictures: ['https://example.com/tenis.jpg'],
      attributes: [
        { id: 'SIZE', name: 'Tamanho', value_name: '42', tier: 'required', source: 'ai', status: 'NEEDS_CONFIRMATION', isVariationOnly: true },
      ],
    }, null)

    expect(payload.variations).toBeUndefined()
  })

  it('envia atributos de variação no item sem o array legado para sellers User Product', () => {
    const payload = buildItemPayload({
      title: 'Camiseta básica preta tamanho M',
      family_name: 'Camiseta básica',
      category_id: 'MLB1',
      price: 79.9,
      available_quantity: 3,
      pictures: ['https://example.com/camiseta.jpg'],
      attributes: [
        { id: 'BRAND', name: 'Marca', value_name: 'Acme', tier: 'required', source: 'user', status: 'USER_OVERRIDE' },
        { id: 'SIZE', name: 'Tamanho', value_name: 'M', tier: 'required', source: 'user', status: 'USER_OVERRIDE', isVariationOnly: true },
        { id: 'COLOR', name: 'Cor', value_name: 'Preto', tier: 'required', source: 'user', status: 'USER_OVERRIDE', isVariationOnly: true },
      ],
    }, { ml_user_id: 1, nickname: 'seller', site_id: 'MLB', user_product_model: true, tags: ['user_product_seller'] })

    expect(payload.family_name).toBe('Camiseta básica')
    expect(payload.title).toBeUndefined()
    expect(payload.attributes).toEqual([
      { id: 'BRAND', value_name: 'Acme' },
      { id: 'SIZE', value_name: 'M' },
      { id: 'COLOR', value_name: 'Preto' },
    ])
    expect(payload.variations).toBeUndefined()
  })
})
