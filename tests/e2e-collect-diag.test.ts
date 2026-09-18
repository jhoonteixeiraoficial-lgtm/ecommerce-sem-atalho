import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'cheerio'
import { sanitizarHtmlPdp, extrairItemIdDaUrl } from '@/lib/assertive/public-html-sanitize'
import { parseSellerEvidence } from '@/lib/assertive/seller-evidence'

describe.skipIf(!process.env.E2E_RESEARCH)('e2e collect diag', () => {
  it('shows which evidence condition fails', () => {
    const file = process.env.E2E_FIXTURE ?? 'scripts/e2e-pdp-organic.json'
    const { url, html } = JSON.parse(readFileSync(join(__dirname, '..', file), 'utf8'))
    const clean = sanitizarHtmlPdp(html)
    const $ = load(clean)
    const postUrl = process.env.E2E_URL ?? url
    const itemId = extrairItemIdDaUrl(postUrl)
    console.log('idDaUrl:', itemId)
    console.log('denounce:', JSON.stringify($('.ui-vpp-denounce__info').text().trim().slice(0, 60)))
    console.log('summaryLink:', JSON.stringify($('.ui-pdp-seller-summary .ui-pdp-seller-summary__link').toArray().map(n => $(n).text().trim())))
    console.log('headerTitles:', JSON.stringify($('.ui-seller-data .ui-seller-data-header__title').toArray().map(n => $(n).text().trim())))
    const ev = parseSellerEvidence(clean, postUrl, itemId ?? '', new Date().toISOString())
    console.log('VERIFIED:', ev.verified, '| reason:', ev.reason)
  })
})
