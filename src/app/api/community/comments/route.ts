import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sanitizeInput } from '@/lib/security'
import {
  enforceCommunityRateLimit,
  invalidInput,
  readJson,
  requireCommunityUser,
  searchParams,
} from '../helpers'

const contentSchema = z.string().min(1).max(2000).refine((value) => value.trim().length > 0)
const getCommentsSchema = z.object({ post_id: z.string().uuid() }).strict()
const createCommentSchema = z.object({
  post_id: z.string().uuid(),
  content: contentSchema,
  parent_comment_id: z.string().uuid().nullable().optional(),
}).strict()
const updateCommentSchema = z.object({
  id: z.string().uuid(),
  content: contentSchema,
}).strict()
const deleteCommentSchema = z.object({ id: z.string().uuid() }).strict()
const COMMENT_COLUMNS = 'id, post_id, user_id, parent_comment_id, content, is_edited, edited_at, created_at'

function sanitizedContent(content: string) {
  const sanitized = sanitizeInput(content)
  return sanitized.length > 0 ? sanitized : null
}

export async function GET(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'comments', 'get', 60)
  if (limited) return limited

  const parsed = getCommentsSchema.safeParse(searchParams(request))
  if (!parsed.success) return invalidInput()

  const { data, error } = await supabase
    .from('community_comments')
    .select(COMMENT_COLUMNS)
    .eq('post_id', parsed.data.post_id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })

  const userIds = [...new Set((data || []).map((comment) => comment.user_id))]
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [], error: null }

  if (profilesError) {
    return NextResponse.json({ error: 'Failed to fetch comment authors' }, { status: 500 })
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const comments = (data || []).map((comment) => ({
    ...comment,
    profiles: profilesById.get(comment.user_id) || { full_name: 'Usuário', avatar_url: '' },
  }))

  return NextResponse.json({ comments })
}

export async function POST(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'comments', 'post', 20)
  if (limited) return limited

  const json = await readJson(request)
  if (json.response) return json.response
  const parsed = createCommentSchema.safeParse(json.body)
  if (!parsed.success) return invalidInput()

  const content = sanitizedContent(parsed.data.content)
  if (!content) return invalidInput()

  const { data, error } = await supabase
    .from('community_comments')
    .insert({
      post_id: parsed.data.post_id,
      user_id: authorizedUser.id,
      content,
      parent_comment_id: parsed.data.parent_comment_id ?? null,
    })
    .select(COMMENT_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', authorizedUser.id)
    .single()

  return NextResponse.json({
    comment: {
      ...data,
      profiles: profile || { full_name: 'Usuário', avatar_url: '' },
    },
  }, { status: 201 })
}

export async function PUT(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'comments', 'put', 20)
  if (limited) return limited

  const json = await readJson(request)
  if (json.response) return json.response
  const parsed = updateCommentSchema.safeParse(json.body)
  if (!parsed.success) return invalidInput()

  const content = sanitizedContent(parsed.data.content)
  if (!content) return invalidInput()

  const { data, error } = await supabase
    .from('community_comments')
    .update({ content })
    .eq('id', parsed.data.id)
    .eq('user_id', authorizedUser.id)
    .select(COMMENT_COLUMNS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  return NextResponse.json({ comment: data })
}

export async function DELETE(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'comments', 'delete', 20)
  if (limited) return limited

  const parsed = deleteCommentSchema.safeParse(searchParams(request))
  if (!parsed.success) return invalidInput()

  const { data, error } = await supabase
    .from('community_comments')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', authorizedUser.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
