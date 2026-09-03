import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sanitizeInput } from '@/lib/security'
import {
  boundedIntegerParam,
  enforceCommunityRateLimit,
  invalidInput,
  publicCommunityProfile,
  readJson,
  requireCommunityUser,
  searchParams,
} from '../helpers'

const contentSchema = z.string().min(1).max(1000).refine((value) => value.trim().length > 0)
const getChatSchema = z.object({
  channel_id: z.string().uuid().optional(),
  page: boundedIntegerParam(10_000).default('1'),
  limit: boundedIntegerParam(100).default('50'),
}).strict().refine(
  (value) => value.channel_id !== undefined || (value.page === 1 && value.limit === 50),
  { message: 'Pagination requires a channel' },
)
const createMessageSchema = z.object({
  channel_id: z.string().uuid(),
  content: contentSchema,
}).strict()
const updateMessageSchema = z.object({
  id: z.string().uuid(),
  content: contentSchema,
}).strict()
const deleteMessageSchema = z.object({ id: z.string().uuid() }).strict()
const CHANNEL_COLUMNS = 'id, name, description, slug, icon, is_active, created_at'
const MESSAGE_COLUMNS = 'id, channel_id, user_id, content, is_edited, edited_at, created_at'

function sanitizedContent(content: string) {
  const sanitized = sanitizeInput(content)
  return sanitized.length > 0 ? sanitized : null
}

export async function GET(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'chat', 'get', 100)
  if (limited) return limited

  const parsed = getChatSchema.safeParse(searchParams(request))
  if (!parsed.success) return invalidInput()

  if (!parsed.data.channel_id) {
    const { data: channels, error } = await supabase
      .from('chat_channels')
      .select(CHANNEL_COLUMNS)
      .eq('is_active', true)
      .order('name')

    if (error) return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
    return NextResponse.json({ channels })
  }

  const offset = (parsed.data.page - 1) * parsed.data.limit
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('channel_id', parsed.data.channel_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + parsed.data.limit - 1)

  if (error) return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })

  const userIds = [...new Set((data || []).map((message) => message.user_id))]
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('community_profiles').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [], error: null }

  if (profilesError) {
    return NextResponse.json({ error: 'Failed to fetch message authors' }, { status: 500 })
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const messages = (data || []).reverse().map((message) => ({
    ...message,
    profiles: publicCommunityProfile(profilesById.get(message.user_id)),
  }))

  return NextResponse.json({ messages })
}

export async function POST(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'chat', 'post', 30)
  if (limited) return limited

  const json = await readJson(request)
  if (json.response) return json.response
  const parsed = createMessageSchema.safeParse(json.body)
  if (!parsed.success) return invalidInput()

  const content = sanitizedContent(parsed.data.content)
  if (!content) return invalidInput()

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      channel_id: parsed.data.channel_id,
      user_id: authorizedUser.id,
      content,
    })
    .select(MESSAGE_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create message' }, { status: 500 })

  const { data: profile } = await supabase
    .from('community_profiles')
    .select('id, full_name, avatar_url')
    .eq('id', authorizedUser.id)
    .single()

  return NextResponse.json({
    message: {
      ...data,
      profiles: publicCommunityProfile(profile),
    },
  }, { status: 201 })
}

export async function PUT(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'chat', 'put', 20)
  if (limited) return limited

  const json = await readJson(request)
  if (json.response) return json.response
  const parsed = updateMessageSchema.safeParse(json.body)
  if (!parsed.success) return invalidInput()

  const content = sanitizedContent(parsed.data.content)
  if (!content) return invalidInput()

  const { data, error } = await supabase
    .from('chat_messages')
    .update({ content })
    .eq('id', parsed.data.id)
    .eq('user_id', authorizedUser.id)
    .select(MESSAGE_COLUMNS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  return NextResponse.json({ message: data })
}

export async function DELETE(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'chat', 'delete', 20)
  if (limited) return limited

  const parsed = deleteMessageSchema.safeParse(searchParams(request))
  if (!parsed.success) return invalidInput()

  const { data, error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', authorizedUser.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
