import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveAccess } from '@/lib/auth/access'
import { loadAuthorization } from '@/lib/auth/authorization'
import type { AppRole, AccountState } from '@/lib/auth/types'

export interface RouteDecisionInput {
  pathname: string
  authenticated: boolean
  role?: AppRole
  status?: AccountState
  hasMemberAccess?: boolean
  isAdmin?: boolean
}

const PUBLIC_PATHS = ['/login', '/cadastro', '/onboarding', '/banido', '/politicas', '/politicas/privacidade', '/politicas/termos', '/vsl', '/']
const SUBSCRIPTION_BYPASS = ['/membros/perfil', '/membros/suporte', '/membros/assinatura-necessaria']

function isProtectedPath(pathname: string): boolean {
  return pathname.startsWith('/membros/') || pathname.startsWith('/admin') || pathname.startsWith('/api/admin/')
}

export function decideRouteAccess(input: RouteDecisionInput): { redirect: string | null } {
  const { pathname } = input
  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  if (isPublic) {
    return { redirect: null }
  }

  const isProtectedRoute = pathname.startsWith('/membros/')
  const isAdminRoute = pathname.startsWith('/admin')
  const isBanPage = pathname === '/banido'

  if (!isProtectedRoute && !isAdminRoute) {
    return { redirect: null }
  }

  if (!input.authenticated) {
    return { redirect: '/login' }
  }

  if (isBanPage) {
    return { redirect: null }
  }

  if (!input.role || !input.status) {
    return { redirect: '/erro-de-acesso' }
  }

  const role = input.role
  const status = input.status
  const access = resolveAccess({ role, status, accessUntil: input.hasMemberAccess ? '2099-01-01T00:00:00Z' : null })

  if (status === 'banned') {
    return { redirect: '/banido' }
  }

  if (isAdminRoute) {
    if (!access.canUseAdminArea) {
      return { redirect: '/membros/dashboard' }
    }
    return { redirect: null }
  }

  if (isProtectedRoute) {
    if (SUBSCRIPTION_BYPASS.some(p => pathname.startsWith(p))) {
      return { redirect: null }
    }

    if (!access.canUseMemberArea) {
      if (status === 'suspended' || !input.hasMemberAccess) {
        return { redirect: '/membros/assinatura-necessaria' }
      }
      return { redirect: '/login' }
    }
  }

  return { redirect: null }
}

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return !!(url && key && !url.includes('sua_url') && !key.includes('sua_chave'))
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  if (!isSupabaseConfigured()) {
    if (isProtectedPath(request.nextUrl.pathname)) {
      return NextResponse.json({ error: 'Authorization service unavailable' }, { status: 503 })
    }
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl
    const isAdminRoute = pathname.startsWith('/admin')
    const isProtectedRoute = pathname.startsWith('/membros/')
    const isPublicAuthRoute = pathname === '/login' || pathname === '/cadastro' || pathname === '/onboarding'

    if (user && isPublicAuthRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/membros/dashboard'
      return NextResponse.redirect(url)
    }

    if (!user && (isProtectedRoute || isAdminRoute)) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }

    if (user && (isProtectedRoute || isAdminRoute)) {
      const adminSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )

      const authorization = await loadAuthorization(adminSupabase, user.id)
      const role = authorization.role
      const status = authorization.status
      const access = resolveAccess(authorization)
      const hasMemberAccess = access.canUseMemberArea

      const decision = decideRouteAccess({
        pathname,
        authenticated: true,
        role,
        status,
        hasMemberAccess,
        isAdmin: role === 'admin' && status === 'active',
      })

      if (decision.redirect) {
        const url = request.nextUrl.clone()
        url.pathname = decision.redirect
        return NextResponse.redirect(url)
      }
    }
  } catch {
    const { pathname } = request.nextUrl
    if (isProtectedPath(pathname)) {
      return NextResponse.json({ error: 'Authorization service unavailable' }, { status: 503 })
    }
  }

  return supabaseResponse
}
