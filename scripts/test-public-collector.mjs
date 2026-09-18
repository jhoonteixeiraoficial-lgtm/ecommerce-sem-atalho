// Teste ao vivo do coletor público (replica 1:1 public-search-collector.ts)
// CUSTA ~25 créditos ScrapingBee se a busca tiver sucesso. Rode só quando necessário.
const SB_KEY = process.env.SCRAPINGBEE_API_KEY
if (!SB_KEY) { console.error('SCRAPINGBEE_API_KEY ausente'); process.exit(1) }

console.log('=== Saldo ScrapingBee (texto cru) ===')
try {
  const res = await fetch(`https://app.scrapingbee.com/api/v1/balance?api_key=${SB_KEY}`)
  const txt = await res.text()
  console.log('HTTP', res.status, '|', txt.slice(0, 300))
} catch (e) { console.log('erro:', e.message) }

const query = process.argv[2] || 'garrafa termica soprano cristal 1l'
const target = `https://lista.mercadolivre.com.br/${query.trim().replace(/\s+/g, '-')}`
console.log('\n=== Coleta da busca pública ===')
console.log('alvo:', target)

const url = new URL('https://app.scrapingbee.com/api/v1/')
url.search = new URLSearchParams({
  api_key: SB_KEY, url: target, render_js: 'true', premium_proxy: 'true', stealth_proxy: 'false',
  country_code: 'br', block_ads: 'false', block_resources: 'false', wait: '1500', timeout: '60000',
}).toString()

let response
try {
  response = await fetch(url, { signal: AbortSignal.timeout(80000), redirect: 'error' })
} catch (e) {
  console.log('FALHA DE REDE/timeout:', e.name, e.message)
  process.exit(0)
}
const status = response.status
const cost = response.headers.get('spb-cost')
console.log('HTTP:', status, '| custo em créditos:', cost || '?')

if (!response.ok) {
  console.log('corpo do erro:', (await response.text()).slice(0, 400))
  process.exit(0)
}

const html = await response.text()
console.log('tamanho do HTML:', html.length)

// mesmas checagens do parsePublicSearch (cheerio, instalado no projeto)
const { load } = await import('cheerio')
const $ = load(html)
const cards = $('.ui-search-layout__item')
console.log('cards .ui-search-layout__item:', cards.length)
let validos = 0
cards.slice(0, 60).each((i, node) => {
  const link = $(node).find('a.poly-component__title, h2 a, h3 a').first()
  let u
  try { u = new URL(link.attr('href') || '') } catch { return }
  if (u.protocol !== 'https:' || !['www.mercadolivre.com.br', 'produto.mercadolivre.com.br', 'click1.mercadolivre.com.br'].includes(u.hostname)) return
  if (!link.text().trim()) return
  validos++
  if (validos <= 3) console.log(`  #${validos}:`, link.text().trim().slice(0, 70))
})
console.log('entradas válidas (mesma regra do parser):', validos)
if (validos === 0) {
  console.log('--- página recebida não é a busca (anti-bot?) trecho inicial: ---')
  console.log(html.slice(0, 500).replace(/\s+/g, ' '))
}

// Se a busca funcionou, testa também a página de um anúncio (PUBLIC_LISTING)
if (validos > 0) {
  let primeiro
  cards.slice(0, 10).each((i, node) => {
    if (primeiro) return
    const link = $(node).find('a.poly-component__title, h2 a, h3 a').first()
    try {
      const u = new URL(link.attr('href') || '')
      if (u.hostname === 'www.mercadolivre.com.br' && /MLB-\d+/.test(u.pathname)) primeiro = u.origin + u.pathname.split('/').slice(0, 4).join('/')
    } catch {}
  })
  if (primeiro) {
    console.log('\n=== Coleta de página de anúncio ===')
    console.log('alvo:', primeiro)
    const u2 = new URL('https://app.scrapingbee.com/api/v1/')
    u2.search = new URLSearchParams({
      api_key: SB_KEY, url: primeiro, render_js: 'true', premium_proxy: 'true', stealth_proxy: 'false',
      country_code: 'br', block_ads: 'false', block_resources: 'false', wait: '1500', timeout: '60000',
    }).toString()
    try {
      const r2 = await fetch(u2, { signal: AbortSignal.timeout(80000), redirect: 'error' })
      console.log('HTTP:', r2.status, '| custo:', r2.headers.get('spb-cost') || '?')
      if (r2.ok) {
        const h2 = await r2.text()
        const $2 = load(h2)
        console.log('título (.ui-pdp-title):', ($2('.ui-pdp-title').first().text() || 'NÃO ENCONTRADO').slice(0, 80))
        console.log('galeria de fotos:', $2('.ui-pdp-gallery__figure img').length)
        console.log('tabela de atributos:', $2('.ui-pdp-specs .andes-table__row').length)
        console.log('descrição:', $2('.ui-pdp-description__content').first().text().trim().slice(0, 100) || 'NÃO ENCONTRADA')
        console.log('vendedor (.ui-pdp-seller-summary/.ui-seller-data):', $2('.ui-pdp-seller-summary,.ui-seller-data').length ? 'presente' : 'ausente')
      } else {
        console.log('corpo do erro:', (await r2.text()).slice(0, 300))
      }
    } catch (e) { console.log('erro:', e.name, e.message) }
  }
}
