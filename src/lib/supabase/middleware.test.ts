import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { decideRouteAccess, updateSession, type RouteDecisionInput } from './middleware'

function input(overrides: Partial<RouteDecisionInput> = {}): RouteDecisionInput {
  return {
    pathname: '/membros/dashboard',
    authenticated: true,
    role: 'member',
    status: 'active',
    hasMemberAccess: true,
    isAdmin: false,
    ...overrides,
  }
}

describe('decideRouteAccess', () => {
  it('redirects unauthenticated users to /login for protected routes', () => {
    expect(decideRouteAccess(input({ pathname: '/admin', authenticated: false }))).toEqual({
      redirect: '/login',
    })
  })

  it('redirects unauthenticated users to /login for member routes', () => {
    expect(decideRouteAccess(input({ pathname: '/membros/dashboard', authenticated: false }))).toEqual({
      redirect: '/login',
    })
  })

  it('allows unauthenticated users through on public routes', () => {
    expect(decideRouteAccess(input({ pathname: '/login', authenticated: false }))).toEqual({
      redirect: null,
    })
  })

  it('redirects members away from admin routes', () => {
    expect(decideRouteAccess(input({ pathname: '/admin', role: 'member', status: 'active', hasMemberAccess: true }))).toEqual({
      redirect: '/membros/dashboard',
    })
  })

  it('allows active admins into admin routes', () => {
    expect(decideRouteAccess(input({ pathname: '/admin', role: 'admin', status: 'active', isAdmin: true }))).toEqual({
      redirect: null,
    })
  })

  it('redirects banned members to /banido', () => {
    expect(decideRouteAccess(input({ pathname: '/membros/dashboard', status: 'banned' }))).toEqual({
      redirect: '/banido',
    })
  })

  it('redirects banned admins to /banido', () => {
    expect(decideRouteAccess(input({ pathname: '/admin', role: 'admin', status: 'banned', isAdmin: true }))).toEqual({
      redirect: '/banido',
    })
  })

  it('redirects members without subscription to /membros/assinatura-necessaria', () => {
    expect(decideRouteAccess(input({ pathname: '/membros/aulas', hasMemberAccess: false }))).toEqual({
      redirect: '/membros/assinatura-necessaria',
    })
  })

  it('allows active members with subscription into member routes', () => {
    expect(decideRouteAccess(input({ pathname: '/membros/aulas', hasMemberAccess: true }))).toEqual({
      redirect: null,
    })
  })

  it('allows admins into member routes without subscription', () => {
    expect(decideRouteAccess(input({ pathname: '/membros/aulas', role: 'admin', status: 'active', hasMemberAccess: false, isAdmin: true }))).toEqual({
      redirect: null,
    })
  })

  it('does not redirect banned users to /banido when already on /banido', () => {
    expect(decideRouteAccess(input({ pathname: '/banido', status: 'banned' }))).toEqual({
      redirect: null,
    })
  })

  it('allows subscription-bypass routes for members without subscription', () => {
    expect(decideRouteAccess(input({ pathname: '/membros/perfil', hasMemberAccess: false }))).toEqual({
      redirect: null,
    })
  })

  it('allows /api/admin/* to pass through for middleware (handlers self-guard)', () => {
    expect(decideRouteAccess(input({ pathname: '/api/admin/users', role: 'admin', status: 'active', isAdmin: true }))).toEqual({
      redirect: null,
    })
  })

  it('redirects suspended members to /membros/assinatura-necessaria', () => {
    expect(decideRouteAccess(input({ pathname: '/membros/aulas', status: 'suspended', hasMemberAccess: false }))).toEqual({
      redirect: '/membros/assinatura-necessaria',
    })
  })

  it('redirects suspended admins away from admin routes', () => {
    expect(decideRouteAccess(input({ pathname: '/admin', role: 'admin', status: 'suspended', isAdmin: true }))).toEqual({
      redirect: '/membros/dashboard',
    })
  })

  it('fails closed when a protected request lacks canonical authorization rows', () => {
    expect(decideRouteAccess(input({ role: undefined, status: undefined }))).toEqual({
      redirect: '/erro-de-acesso',
    })
  })
})

describe('updateSession without Supabase public configuration', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
  })

  it('returns 503 for a protected member route', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const response = await updateSession(new NextRequest('https://example.test/membros/dashboard'))

    expect(response.status).toBe(503)
  })

  it('keeps a public auth route available', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    const response = await updateSession(new NextRequest('https://example.test/login'))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
