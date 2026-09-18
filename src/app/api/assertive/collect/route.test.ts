import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ token: vi.fn(), upsert: vi.fn() }))
vi.mock('@/lib/assertive/collect-token', () => ({ resolveCollectToken: mocks.token }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ upsert: mocks.upsert }) }) }))
vi.mock('@/lib/security', () => ({ checkRateLimit: () => ({ allowed: true }) }))
import { POST } from './route'

const listing = `<h1 class="ui-pdp-title">Caneta Kitest KA250</h1>
<div class="ui-pdp-seller-summary"><a class="ui-pdp-seller-summary__link">Loja A</a></div>
<div class="ui-seller-data"><h2 class="ui-seller-data-header__title">Loja A</h2></div>
<p class="ui-vpp-denounce__info">Anúncio #300</p>
<section class="ui-pdp-specs"><table><tr class="andes-table__row"><th>Marca</th><td>Kitest</td></tr><tr class="andes-table__row"><th>Modelo</th><td>KA250</td></tr></table></section>`
const url = 'https://produto.mercadolivre.com.br/MLB-300-caneta_JM'
function request(body: unknown) {
  return new NextRequest('https://app.example/api/assertive/collect', { method: 'POST', headers: { authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
beforeEach(() => { vi.clearAllMocks(); mocks.token.mockResolvedValue('user-a'); mocks.upsert.mockResolvedValue({ error: null }) })
describe('browser ingestion', () => {
  it('accepts a small sanitized page only in the uploader namespace', async () => {
    const res = await POST(request({ kind: 'listing', url, html: listing }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, item_id: 'MLB300' })
    expect(mocks.upsert.mock.calls).toHaveLength(2)
    for (const [row] of mocks.upsert.mock.calls) {
      expect(row.cache_key).toContain('BROWSER:user-a:')
      expect(row.payload.source).toBe('BROWSER_USER')
    }
  })
  it('rejects URL/listing mismatches instead of accepting another seller offer', async () => {
    const res = await POST(request({ kind: 'listing', url: url.replace('300', '999'), html: listing + '<!--' + 'x'.repeat(1000) + '-->' }))
    expect(res.status).toBe(422)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('does not interpret filtered or paginated search as default first-page ranking', async () => {
    const html = '<li class="ui-search-layout__item"><h2><a href="' + url + '">Caneta</a></h2></li>' + '<!--' + 'x'.repeat(1000) + '-->'
    const res = await POST(request({ kind: 'search', url: 'https://lista.mercadolivre.com.br/caneta_Desde_51', html }))
    expect(res.status).toBe(422)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('rejects missing authorization', async () => {
    mocks.token.mockResolvedValue(null)
    expect((await POST(request({ kind: 'listing', url, html: listing }))).status).toBe(401)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
