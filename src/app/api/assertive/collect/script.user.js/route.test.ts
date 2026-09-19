import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), token: vi.fn() }))
vi.mock('@/app/api/community/helpers', () => ({ requireCommunityUser: mocks.auth }))
vi.mock('@/lib/assertive/collect-token', () => ({ getUserCollectToken: mocks.token }))
import { GET } from './route'

beforeEach(() => {
  mocks.auth.mockResolvedValue({ authorizedUser: { id: 'user-a' }, response: null })
  mocks.token.mockResolvedValue('esc_' + 'a'.repeat(48))
})
describe('collector installer', () => {
  it('never sends the full private page and isolates transport from page scripts', async () => {
    const response = await GET(new NextRequest('https://app.example/api/assertive/collect/script.user.js'))
    const script = await response.text()
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(script).not.toContain('document.documentElement.outerHTML')
    expect(script).toContain('@grant        GM_xmlhttpRequest')
    expect(script).toContain('anonymous: true')
    expect(script).toContain('cloneNode(true)')
    expect(script).toContain('sessionStorage')
    expect(script).toContain('capturando dados públicos desta página')
    expect(script).not.toContain('impossível')
    expect(script).toContain('https://app.example')
  })
  it('requires an authenticated app user', async () => {
    mocks.auth.mockResolvedValue({ response: new Response(null, { status: 401 }) })
    expect((await GET(new NextRequest('https://app.example/api/assertive/collect/script.user.js'))).status).toBe(401)
  })
})
