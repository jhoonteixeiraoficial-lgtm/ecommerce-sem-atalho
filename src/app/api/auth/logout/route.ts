import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/security'

export async function POST(request: Request) {
  // Rate limiting: 10 requests per minute per IP
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rateLimitResult = checkRateLimit(`logout-${ip}`, 10, 60000)
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    )
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url))
}
