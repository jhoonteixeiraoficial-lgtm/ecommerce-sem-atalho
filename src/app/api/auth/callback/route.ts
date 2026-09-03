import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/membros/dashboard'

  // Validate redirect URL to prevent open redirect attacks
  const isValidRedirect = (url: string): boolean => {
    try {
      // Only allow relative paths starting with /
      if (!url.startsWith('/')) return false
      
      // Prevent protocol-relative URLs
      if (url.startsWith('//')) return false
      
      // Prevent navigation to external domains
      if (url.includes('://')) return false
      
      // Prevent javascript: URLs
      if (url.toLowerCase().includes('javascript:')) return false
      
      return true
    } catch {
      return false
    }
  }

  const safeRedirect = isValidRedirect(next) ? next : '/membros/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${safeRedirect}`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
