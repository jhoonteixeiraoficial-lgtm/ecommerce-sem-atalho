import {afterEach,describe,it,expect,vi} from 'vitest'
import {collectPublicListingPage} from '../public-listing-collector'
const url='https://produto.mercadolivre.com.br/MLB-123-garrafa-_JM'
const html='<h1 class="ui-pdp-title">Garrafa</h1><div class="ui-pdp-seller-summary"><a class="ui-pdp-seller-summary__link">Loja</a></div><div class="ui-seller-data"><h2 class="ui-seller-data-header__title">Loja</h2></div><p class="ui-vpp-denounce__info">Anúncio #123</p><script>private data</script>'
afterEach(()=>vi.unstubAllEnvs())
function deps(){vi.stubEnv('SCRAPINGBEE_API_KEY','fake');vi.stubEnv('ASSERTIVE_SEARCH_DAILY_CREDITS','100');return {reserve:vi.fn().mockResolvedValue(true),request:vi.fn().mockResolvedValue(new Response(html)),save:vi.fn().mockResolvedValue(undefined)}}
describe('automated listing collection',()=>{
 it('reserves global allowance and persists only verified public evidence',async()=>{
  const d=deps();const page=await collectPublicListingPage(url,'MLB123',d)
  expect(page?.url).toBe(url);expect(page?.html).not.toContain('private data');expect(d.save).toHaveBeenCalledTimes(1)
  expect(d.reserve).toHaveBeenCalledWith(expect.stringMatching(/^PUBLIC_SEARCH:v1:MLB:br:[a-f0-9]{64}$/),100)
  expect(d.reserve.mock.invocationCallOrder[0]).toBeLessThan(d.request.mock.invocationCallOrder[0])
 })
 it('rejects unsafe URLs before spending and refuses a mismatched seller page',async()=>{
  const d=deps();expect(await collectPublicListingPage('https://evil.example','MLB123',d)).toBeNull();expect(d.reserve).not.toHaveBeenCalled()
  expect(await collectPublicListingPage(url,'MLB999',d)).toBeNull();expect(d.save).not.toHaveBeenCalled()
 })
 it('does not bypass a denied reservation or retry a failed response',async()=>{
  const d=deps();d.reserve.mockResolvedValue(false);expect(await collectPublicListingPage(url,'MLB123',d)).toBeNull();expect(d.request).not.toHaveBeenCalled()
  d.reserve.mockResolvedValue(true);d.request.mockResolvedValue(new Response('blocked',{status:403}));expect(await collectPublicListingPage(url,'MLB123',d)).toBeNull();expect(d.request).toHaveBeenCalledTimes(1)
 })
})
