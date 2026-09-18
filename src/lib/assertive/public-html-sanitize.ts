import { load } from 'cheerio'

/**
 * Reduz o HTML de uma página de anúncio (PDP) apenas aos fragmentos que os
 * parsers do Assertive usam — mesma técnica do coletor ScrapingBee.
 * Remove scripts/estilos/eventos antes de qualquer persistência.
 */
const FRAGMENTOS_PDP = [
  '.ui-pdp-title',
  '.ui-pdp-subtitle',
  '.ui-pdp-seller-summary',
  '.ui-seller-data',
  '.ui-vpp-denounce__info',
  '.ui-pdp-specs',
  '.ui-pdp-gallery__figure',
  '.ui-pdp-description__content',
].join(',')

export function sanitizarHtmlPdp(html: string): string {
  const $ = load(html)
  $('script,style,input,iframe,form,textarea,noscript,link,meta').remove()
  $('[hidden], [aria-hidden="true"]').remove()
  $('*').each((_, element) => {
    for (const attribute of Object.keys('attribs' in element ? element.attribs : {})) {
      if (/^on/i.test(attribute)) $(element).removeAttr(attribute)
    }
  })
  return $(FRAGMENTOS_PDP)
    .toArray()
    .map(node => $.html(node))
    .join('\n')
}

/** Página de verificação anti-bot do ML (nunca é evidência útil). */
export function ehPaginaAntiBot(html: string): boolean {
  return html.includes('suspicious-traffic-frontend') || html.includes('account-verification')
}

/** Extrai o id MLB presente na URL de um anúncio/catálogo. */
export function extrairItemIdDaUrl(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  const porFiltro = url.searchParams.get('pdp_filters')?.match(/item_id:(MLB\d+)/)?.[1]
  if (porFiltro) return porFiltro
  const porParametro = url.searchParams.get('item_id')
  if (porParametro && /^MLB\d+$/.test(porParametro)) return porParametro
  const porPathItem = url.pathname.match(/\/MLB-(\d+)(?:-|\/|$)/)?.[1]
  if (porPathItem) return `MLB${porPathItem}`
  const porPathCatalogo = url.pathname.match(/\/p\/(MLB\d+)(?:\/|$)/)?.[1]
  return porPathCatalogo || null
}
