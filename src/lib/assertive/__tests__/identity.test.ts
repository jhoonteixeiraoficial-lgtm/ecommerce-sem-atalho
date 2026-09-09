import { describe, expect, it } from 'vitest'
import {
  buildCanonicalIdentity,
  isPlausibleSellerSku,
  rankIdentityCandidates,
  sameIdentityToken,
} from '../identity'

describe('CanonicalProductIdentity', () => {
  it('separa produto, função e identificadores sem transformar descrição em SKU', () => {
    const identity = buildCanonicalIdentity({
      name: 'Kitest Ka250 Testador Pulso Bico Fino 12v 24v',
      categoryHint: 'Ferramentas automotivas',
      evidence: ['User product oficial MLBU3146884103'],
      fields: {
        brand: { value: 'Kitest' },
        model: { value: 'KA250' },
        gtin: { value: '7898559182505' },
        sku: { value: 'Canela de Polaridade' },
        voltage: { value: '12V/24V' },
      },
      sourceAttributes: [{
        id: 'MODEL',
        value_name: 'Caneta de polaridade teste de bicos injetores com iluminação lanterna led luz 1 ano de garantia kitest KA-250',
      }],
    })

    expect(identity).toMatchObject({
      product_type: 'Caneta de polaridade',
      brand: 'Kitest',
      model: 'KA250',
      gtin: '7898559182505',
      seller_sku: null,
      voltage: '12V/24V',
    })
    expect(identity.function?.toLowerCase()).toContain('bicos injetores')
    expect(identity.evidence).toContain('User product oficial MLBU3146884103')
  })

  it('não considera CANETA e CANELA o mesmo token', () => {
    expect(sameIdentityToken('CANETA', 'CANELA')).toBe(false)
  })

  it('aceita somente SKU com formato de identificador', () => {
    expect(isPlausibleSellerSku('KA250-RED-01')).toBe(true)
    expect(isPlausibleSellerSku('Canela de Polaridade')).toBe(false)
    expect(isPlausibleSellerSku('Caneta de Polaridade')).toBe(false)
  })

  it('ranqueia candidato com identificador exato acima de texto parecido', () => {
    const ranked = rankIdentityCandidates([
      {
        name: 'Caneta teste automotivo genérica',
        product_type: 'Caneta de polaridade',
        confidence: 0.94,
        evidence: ['texto visual parecido'],
      },
      {
        name: 'Caneta de polaridade Kitest KA250',
        product_type: 'Caneta de polaridade',
        brand: 'Kitest',
        model: 'KA250',
        gtin: '7898559182505',
        confidence: 0.86,
        evidence: ['GTIN e modelo literais'],
      },
    ])

    expect(ranked[0].name).toBe('Caneta de polaridade Kitest KA250')
    expect(ranked[0].identity_score).toBeGreaterThan(ranked[1].identity_score)
  })
})
