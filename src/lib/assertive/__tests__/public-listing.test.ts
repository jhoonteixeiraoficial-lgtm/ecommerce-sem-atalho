import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { publicListingDossier, parsePublicListing } from '../public-listing'
import type { PublicSearchEntry } from '../public-search'

function specsTable(color: string): string {
  return `<section class="ui-pdp-specs"><table><tbody>`
    + `<tr class="andes-table__row"><th>Marca</th><td>Soprano</td></tr>`
    + `<tr class="andes-table__row"><th>Modelo</th><td>Cristal</td></tr>`
    + `<tr class="andes-table__row"><th>Cor</th><td>${color}</td></tr>`
    + `</tbody></table></section>`
}

function html(specs: string, title: string, denounceId: string, rep = 'MercadoLíder Platinum'): string {
  return `<h1 class="ui-pdp-title">${title}</h1>`
    + '<div class="ui-pdp-seller-summary"><a class="ui-pdp-seller-summary__link">Loja A</a></div>'
    + '<div class="ui-seller-data"><h2 class="ui-seller-data-header__title">Loja A</h2>'
    + `<div class="ui-seller-data-status__title">${rep}</div>`
    + '</div>'
    + specs
    + `<p class="ui-vpp-denounce__info">Anúncio #${denounceId}</p>`
}

const baseEntry: PublicSearchEntry = {
  position: 1, organic_position: 1, sponsored: false, item_id: 'MLB11865004',
  catalog_product_id: 'MLB11865004',
  url: 'https://www.mercadolivre.com.br/p/MLB11865004?pdp_filters=item_id%3AMLB11865004',
  title: 'Garrafa Térmica Cristal 1 Litro Preta Soprano', bestseller_badge: false, sold_quantity: null,
}

const truthBlack = {
  name: 'Garrafa Térmica Cristal 1 Litro Preta Soprano',
  fields: {
    brand: { value: 'Soprano' },
    model: { value: 'Cristal' },
    color: { value: 'Preto', confidence: 'confirmed' },
  },
} as any

describe('publicListingDossier classificação de match', () => {
  it('classifica como EXACT_PRODUCT quando cor e modelo batem', () => {
    const page = parsePublicListing(html(specsTable('Preto'), 'Garrafa Térmica Cristal 1 Litro Preta Soprano', '11865004'), baseEntry.url, 'MLB11865004', new Date().toISOString())
    expect(page?.attributes).toMatchObject({ BRAND: 'Soprano', MODEL: 'Cristal', COLOR: 'Preto' })
    const dossier = publicListingDossier(page!, baseEntry, truthBlack)
    expect(dossier).not.toBeNull()
    expect(dossier!.match_class).toBe('EXACT_PRODUCT')
    expect(dossier!.usable_as_fact_source).toBe(true)
    expect(dossier!.public_seller_evidence?.reputation).toBe('platinum')
  })

  it('rejeita cor errada: nunca classifica página branca como exata de um produto preto', () => {
    const page = parsePublicListing(html(specsTable('Branco'), 'Garrafa Térmica Cristal 1 Litro Branca Soprano', '38088419'), 'https://www.mercadolivre.com.br/p/MLB38088419?pdp_filters=item_id%3AMLB38088419', 'MLB38088419', new Date().toISOString())
    expect(page?.attributes.COLOR).toBe('Branco')
    const entry = { ...baseEntry, item_id: 'MLB38088419', catalog_product_id: 'MLB38088419', url: 'https://www.mercadolivre.com.br/p/MLB38088419?pdp_filters=item_id%3AMLB38088419' }
    const dossier = publicListingDossier(page!, entry, truthBlack)
    expect(dossier).not.toBeNull()
    expect(dossier!.match_class).not.toBe('EXACT_PRODUCT')
    expect(dossier!.usable_as_fact_source).toBe(false)
  })

  it('mantém CATEGORY_REFERENCE quando nenhum ProductTruth é fornecido', () => {
    const page = parsePublicListing(html(specsTable('Preto'), 'Garrafa Térmica Cristal 1 Litro Preta Soprano', '11865004'), baseEntry.url, 'MLB11865004', new Date().toISOString())
    const dossier = publicListingDossier(page!, baseEntry)
    expect(dossier).not.toBeNull()
    expect(dossier!.match_class).toBe('CATEGORY_REFERENCE')
    expect(dossier!.usable_as_fact_source).toBe(false)
  })
})
