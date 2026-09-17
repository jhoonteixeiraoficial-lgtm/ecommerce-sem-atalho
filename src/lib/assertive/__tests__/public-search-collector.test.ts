import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectPublicSearch } from '../public-search-collector'
const html='<li class="ui-search-layout__item"><a class="poly-component__title" href="https://produto.mercadolivre.com.br/MLB-123-garrafa-_JM">Garrafa</a></li>'
function deps() { return { reserve: vi.fn().mockResolvedValue(true), save: vi.fn().mockResolvedValue(undefined), request: vi.fn().mockResolvedValue(new Response(html, {status:200})) } }
afterEach(()=>vi.unstubAllEnvs())
function enable() {vi.stubEnv('SCRAPINGBEE_API_KEY','test-only');vi.stubEnv('ASSERTIVE_SEARCH_DAILY_CREDITS','25')}
describe('bounded public search collector',()=>{
 it('reports safe failure metadata without logging secrets or response bodies',async()=>{
  enable();const report=vi.fn();const d={...deps(),report}
  d.request.mockResolvedValue(new Response('test-only secret body',{status:403,headers:{'spb-cost':'0'}}))
  await collectPublicSearch('garrafa','key',d)
  expect(report).toHaveBeenLastCalledWith({outcome:'HTTP_ERROR',status:403,credits:0})
  d.request.mockRejectedValue(new DOMException('secret test-only URL','TimeoutError'))
  await collectPublicSearch('garrafa','key',d)
  expect(report).toHaveBeenLastCalledWith({outcome:'TIMEOUT',status:null,credits:null})
  expect(JSON.stringify(report.mock.calls)).not.toContain('test-only')
 })
 it('does not spend by default even with an API key',async()=>{
  vi.stubEnv('SCRAPINGBEE_API_KEY','test-only');vi.stubEnv('ASSERTIVE_SEARCH_DAILY_CREDITS','')
  const d=deps();expect(await collectPublicSearch('garrafa','key',d)).toBeNull();expect(d.reserve).not.toHaveBeenCalled();expect(d.request).not.toHaveBeenCalled()
 })
 it('does not request when global reservation is denied or unavailable',async()=>{
  enable();const d=deps();d.reserve.mockResolvedValue(false)
  expect(await collectPublicSearch('garrafa','key',d)).toBeNull();expect(d.request).not.toHaveBeenCalled()
  d.reserve.mockRejectedValue(new Error('db down'));expect(await collectPublicSearch('garrafa','key',d)).toBeNull();expect(d.request).not.toHaveBeenCalled()
 })
 it('reserves before fetching, caps provider cost, and saves parsed evidence',async()=>{
  enable();const d=deps();const result=await collectPublicSearch('garrafa','key',d)
  expect(result?.available).toBe(true);expect(d.reserve).toHaveBeenCalledWith('key',25)
  expect(d.reserve.mock.invocationCallOrder[0]).toBeLessThan(d.request.mock.invocationCallOrder[0])
  const url=new URL(d.request.mock.calls[0][0]);expect(url.searchParams.get('mode')).toBeNull();expect(url.searchParams.get('render_js')).toBe('true');expect(url.searchParams.get('premium_proxy')).toBe('true');expect(url.searchParams.get('stealth_proxy')).toBe('false');expect(url.searchParams.get('block_resources')).toBe('false')
  expect(d.save).toHaveBeenCalledWith('key',result)
 })
 it('never retries a timeout or saves an interstitial as evidence',async()=>{
  enable();const d=deps();d.request.mockRejectedValue(new Error('timeout'))
  expect(await collectPublicSearch('garrafa','key',d)).toBeNull();expect(d.request).toHaveBeenCalledTimes(1);expect(d.save).not.toHaveBeenCalled()
  d.request.mockResolvedValue(new Response('<h1>Enable Javascript</h1>'))
  expect(await collectPublicSearch('garrafa','key',d)).toBeNull();expect(d.save).not.toHaveBeenCalled()
 })
})
