import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerGuards } from '@/lib/auth/server-guards'
import { checkRateLimit } from '@/lib/security'
import { createAdminClient } from '@/lib/supabase/admin'

const liveIdSchema = z.string().uuid()
const scheduledAtSchema = z.string().datetime({ offset: true })
const durationSchema = z.number().int().min(1).max(480)
const replayUrlSchema = z.union([
  z.string().url().refine((value) => value.toLowerCase().startsWith('https://')),
  z.literal(''),
])
const watchUrlSchema = z.union([
  z.string().url().refine((value) => value.toLowerCase().startsWith('https://')),
  z.literal(''),
])
const urlSchema = z.union([
  z.string().url().refine((value) => value.toLowerCase().startsWith('https://')),
  z.literal(''),
])
const eventTypeSchema = z.enum(['live', 'conteudo', 'aula', 'material', 'atualizacao', 'evento_especial'])
const eventStatusSchema = z.enum(['agendada', 'ao_vivo', 'encerrada', 'cancelada'])

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

function extractYouTubeVideoId(url: string): string {
  if (!url) return ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ''
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase()
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0]
    return YOUTUBE_ID_RE.test(id) ? id : ''
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v')
      return id && YOUTUBE_ID_RE.test(id) ? id : ''
    }
    const embedMatch = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch) return embedMatch[1]
    const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
    if (shortsMatch) return shortsMatch[1]
  }
  return ''
}

function prepareYouTubeFields(youtubeUrl: string) {
  const videoId = extractYouTubeVideoId(youtubeUrl)
  return { youtube_url: youtubeUrl, youtube_video_id: videoId }
}

const createLiveSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(''),
  scheduled_at: scheduledAtSchema,
  duration_minutes: durationSchema.default(60),
  watch_url: watchUrlSchema.default(''),
  type: eventTypeSchema.default('live'),
  status: eventStatusSchema.default('agendada'),
  youtube_url: urlSchema.default(''),
  thumbnail_url: urlSchema.default(''),
}).strict()

const updateLiveSchema = z.object({
  id: liveIdSchema,
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  scheduled_at: scheduledAtSchema.optional(),
  duration_minutes: durationSchema.optional(),
  is_live: z.boolean().optional(),
  replay_url: replayUrlSchema.optional(),
  watch_url: watchUrlSchema.optional(),
  type: eventTypeSchema.optional(),
  status: eventStatusSchema.optional(),
  youtube_url: urlSchema.optional(),
  thumbnail_url: urlSchema.optional(),
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'id'),
  { message: 'At least one update field is required' },
)

const LIVE_COLUMNS = 'id, title, description, scheduled_at, duration_minutes, replay_url, watch_url, is_live, viewer_count, created_at, type, status, youtube_url, youtube_video_id, thumbnail_url'
const CREDENTIAL_COLUMNS = 'live_id, rtmp_url, stream_key'

function rateLimit(request: Request, operation: string) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const result = checkRateLimit(`lives-${operation}-${ip}`, operation === 'get' ? 60 : 20, 60000)
  if (result.allowed) return null

  return NextResponse.json(
    { error: 'Too many requests' },
    { status: 429, headers: { 'X-RateLimit-Remaining': '0' } },
  )
}

async function requireCanonicalAdmin() {
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const serverClient = await createClient()
    const { data: { user }, error } = await serverClient.auth.getUser()
    await createServerGuards(user, error).requireAdmin()
    return null
  } catch (error: unknown) {
    const errorStatus = error && typeof error === 'object' && 'status' in error
      ? (error as { status: number }).status
      : 500
    const status = errorStatus === 401 || errorStatus === 403 || errorStatus === 503
      ? errorStatus
      : 500
    const message = status === 401
      ? 'Unauthorized'
      : status === 403
        ? 'Forbidden'
        : 'Service unavailable'
    return NextResponse.json({ error: message }, { status })
  }
}

async function parseJson(request: Request) {
  try {
    return { body: await request.json() as unknown, response: null }
  } catch {
    return {
      body: null,
      response: NextResponse.json({ error: 'Invalid request body' }, { status: 400 }),
    }
  }
}

export async function GET(request: Request) {
  const limited = rateLimit(request, 'get')
  if (limited) return limited

  const forbidden = await requireCanonicalAdmin()
  if (forbidden) return forbidden

  try {
    const admin = createAdminClient()
    const { data: lives, error: livesError } = await admin
      .from('lives')
      .select(LIVE_COLUMNS)
      .order('scheduled_at', { ascending: false })

    if (livesError) {
      return NextResponse.json({ error: 'Failed to fetch lives' }, { status: 500 })
    }

    const liveIds = (lives ?? []).map((live) => live.id)
    const { data: credentials, error: credentialsError } = await admin
      .from('live_credentials')
      .select(CREDENTIAL_COLUMNS)
      .in('live_id', liveIds)

    if (credentialsError) {
      return NextResponse.json({ error: 'Failed to fetch lives' }, { status: 500 })
    }

    const credentialsByLive = new Map(
      (credentials ?? []).map((credential) => [credential.live_id, credential]),
    )
    const authorizedLives = (lives ?? []).map((live) => {
      const credential = credentialsByLive.get(live.id)
      return {
        ...live,
        rtmp_url: credential?.rtmp_url ?? '',
        stream_key: credential?.stream_key ?? '',
      }
    })

    return NextResponse.json({ lives: authorizedLives })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch lives' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, 'post')
  if (limited) return limited

  const forbidden = await requireCanonicalAdmin()
  if (forbidden) return forbidden

  const { body, response } = await parseJson(request)
  if (response) return response

  const parsed = createLiveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid live data' }, { status: 400 })
  }

  try {
    const youtubeFields = prepareYouTubeFields(parsed.data.youtube_url)
    const insertData = { ...parsed.data, ...youtubeFields }
    const { data: live, error } = await createAdminClient()
      .from('lives')
      .insert(insertData)
      .select(LIVE_COLUMNS)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to create live' }, { status: 500 })
    }

    return NextResponse.json({ live }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create live' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const limited = rateLimit(request, 'put')
  if (limited) return limited

  const forbidden = await requireCanonicalAdmin()
  if (forbidden) return forbidden

  const { body, response } = await parseJson(request)
  if (response) return response

  const parsed = updateLiveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid live data' }, { status: 400 })
  }

  const { id, ...updates } = parsed.data
  try {
    const admin = createAdminClient()

    if (updates.status === 'ao_vivo' || updates.is_live === true) {
      const { data: credentials, error: credentialsError } = await admin
        .from('live_credentials')
        .select(CREDENTIAL_COLUMNS)
        .eq('live_id', id)
        .maybeSingle()

      if (credentialsError) {
        return NextResponse.json({ error: 'Failed to update live' }, { status: 500 })
      }

      if (!credentials?.rtmp_url?.trim() || !credentials.stream_key?.trim()) {
        return NextResponse.json({ error: 'Streaming setup required' }, { status: 409 })
      }
    }

    const updatePayload: Record<string, unknown> = { ...updates }
    if (updates.youtube_url !== undefined) {
      const youtubeFields = prepareYouTubeFields(updates.youtube_url)
      updatePayload.youtube_url = youtubeFields.youtube_url
      updatePayload.youtube_video_id = youtubeFields.youtube_video_id
    }

    const { data: live, error } = await admin
      .from('lives')
      .update(updatePayload)
      .eq('id', id)
      .select(LIVE_COLUMNS)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update live' }, { status: 500 })
    }

    return NextResponse.json({ live })
  } catch {
    return NextResponse.json({ error: 'Failed to update live' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const limited = rateLimit(request, 'delete')
  if (limited) return limited

  const forbidden = await requireCanonicalAdmin()
  if (forbidden) return forbidden

  const id = new URL(request.url).searchParams.get('id')
  const parsedId = liveIdSchema.safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'Invalid live ID' }, { status: 400 })
  }

  try {
    const { error } = await createAdminClient()
      .from('lives')
      .delete()
      .eq('id', parsedId.data)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete live' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete live' }, { status: 500 })
  }
}
