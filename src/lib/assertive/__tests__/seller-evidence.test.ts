import { describe, expect, it } from 'vitest'
import { parseSellerEvidence } from '../seller-evidence'
const html = `<h1 class="ui-pdp-title">Garrafa Soprano</h1><div class="ui-pdp-subtitle">Novo | +10 mil vendidos</div><div class="ui-pdp-seller-summary"><a class="ui-pdp-seller-summary__link">VIABRASIL</a></div><div class="ui-seller-data"><h2 class="ui-seller-data-header__title">VIABRASIL</h2><p class="ui-seller-data-status__title">MercadoLíder Platinum</p><div class="ui-seller-data-status__info"><p class="ui-seller-data-status__info-title">+50 mil</p><p class="ui-seller-data-status__info-subtitle">Vendas</p></div></div><p class="ui-vpp-denounce__info">Anúncio #4645904805</p><aside class="ui-pdp-other-sellers-item__seller">OUTRO +250 mil vendas</aside>`
const url='https://www.mercadolivre.com.br/produto/p/MLB11865004?pdp_filters=item_id%3AMLB4645904805'
const parse=(body=html, source=url, expected='MLB4645904805') => parseSellerEvidence(body, source, expected, '2026-09-17T12:00:00Z')
describe('seller evidence', () => {
 it('separates catalog sales from seller sales and ignores competing offers', () => {
   expect(parse()).toMatchObject({ verified: true, item_id: 'MLB4645904805', seller_name: 'VIABRASIL', reputation: 'platinum', seller_sales: { lower_bound: 50000, raw: '+50 mil', scope: 'SELLER' }, product_sales: { lower_bound: 10000, scope: 'CATALOG' } })
 })
 it('does not verify a seller using the URL alone when displayed listing differs', () => {
   expect(parse(html.replace('Anúncio #4645904805','Anúncio #999')).verified).toBe(false)
 })
 it('does not verify missing identity or conflicting seller sections', () => {
   expect(parse(html.replace('Anúncio #4645904805','')).verified).toBe(false)
   expect(parse(html.replace('>VIABRASIL</h2>','>OUTRO</h2>')).verified).toBe(false)
 })
 it('labels listing sales separately on a non-catalog page', () => {
   expect(parse(html,'https://produto.mercadolivre.com.br/MLB-4645904805-garrafa-_JM').product_sales?.scope).toBe('LISTING')
 })
 it('rejects foreign hosts and invalid identifiers', () => {
   expect(parse(html,'https://evil.example/product').verified).toBe(false)
   expect(parse(html,url,'4645904805').verified).toBe(false)
 })
})
