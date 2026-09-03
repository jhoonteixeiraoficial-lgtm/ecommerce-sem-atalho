import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { checkRateLimit, sanitizeInput } from '@/lib/security'

// GET: Fetch all lives (any authenticated user)
export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rateLimitResult = checkRateLimit(`lives-get-${ip}`, 60, 60000)
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    )
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: lives, error } = await supabase
    .from('lives')
    .select('*')
    .order('scheduled_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch lives' }, { status: 500 })
  }

  // For non-admin users, don't expose sensitive fields
  const safeLives = (lives || []).map((live: Record<string, unknown>) => {
    const { stream_key, rtmp_url, ...safeLive } = live
    return safeLive
  })

  return NextResponse.json({ lives: safeLives })
}

// POST: Create new live (admin only)
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rateLimitResult = checkRateLimit(`lives-post-${ip}`, 20, 60000)
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    )
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body;
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, description, scheduled_at, duration_minutes } = body

  if (!title || !scheduled_at) {
    return NextResponse.json({ error: 'Title and scheduled_at are required' }, { status: 400 })
  }

  // Validate scheduled_at is a valid ISO date
  const parsedDate = new Date(scheduled_at)
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduled_at date format' }, { status: 400 })
  }

  // Validate duration_minutes if provided
  if (duration_minutes !== undefined && (typeof duration_minutes !== 'number' || duration_minutes < 1 || duration_minutes > 480)) {
    return NextResponse.json({ error: 'Duration must be between 1 and 480 minutes' }, { status: 400 })
  }

  const { data: live, error } = await supabase
    .from('lives')
    .insert({
      title: sanitizeInput(title),
      description: sanitizeInput(description || ''),
      scheduled_at,
      duration_minutes: duration_minutes || 60,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create live' }, { status: 500 })
  }

  return NextResponse.json({ live }, { status: 201 })
}

// PUT: Update live (admin only)
export async function PUT(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rateLimitResult = checkRateLimit(`lives-put-${ip}`, 20, 60000)
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    )
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body;
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, title, description, scheduled_at, duration_minutes, is_live, replay_url } = body

  if (!id) {
    return NextResponse.json({ error: 'Live ID is required' }, { status: 400 })
  }

  // Validate ID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  // Only allow specific fields to be updated (prevent mass assignment)
  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = sanitizeInput(title)
  if (description !== undefined) updates.description = sanitizeInput(description)
  if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at
  if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes
  if (is_live !== undefined) updates.is_live = is_live
  if (replay_url !== undefined) updates.replay_url = replay_url

  const { data: live, error } = await supabase
    .from('lives')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to update live' }, { status: 500 })
  }

  return NextResponse.json({ live })
}

// DELETE: Delete live (admin only)
export async function DELETE(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const rateLimitResult = checkRateLimit(`lives-delete-${ip}`, 20, 60000)
  
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    )
  }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Live ID is required' }, { status: 400 })
  }

  // Validate ID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
  }

  const { error } = await supabase
    .from('lives')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete live' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
