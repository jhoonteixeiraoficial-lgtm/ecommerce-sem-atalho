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

const categories = [
  'geral',
  'iniciantes',
  'produtos',
  'fornecedores',
  'anuncios',
  'mercado-ads',
  'resultados',
  'duvidas',
  'ia',
] as const
const contentSchema = z.string().min(1).max(5000).refine((value) => value.trim().length > 0)
const imageUrlSchema = z.string().max(2048).refine((value) => {
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
})
const paginationSchema = z.string().regex(/^[1-9]\d*$/).transform(Number)
const getPostsSchema = z.object({
  category: z.enum(['all', ...categories]).optional(),
  page: paginationSchema.default('1'),
  limit: paginationSchema.refine((value) => value <= 100).default('20'),
}).strict()
const createPostSchema = z.object({
  content: contentSchema,
  category: z.enum(categories),
  image_url: imageUrlSchema.optional(),
}).strict()
const updatePostSchema = z.object({
  id: z.string().uuid(),
  content: contentSchema,
}).strict()
const deletePostSchema = z.object({ id: z.string().uuid() }).strict()

const POST_COLUMNS = 'id, user_id, content, category, image_url, is_pinned, is_edited, edited_at, created_at, community_comments(count), community_reactions(count)'

function sanitizedContent(content: string) {
  const sanitized = sanitizeInput(content)
  return sanitized.length > 0 ? sanitized : null
}

export async function GET(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'posts', 'get', 60)
  if (limited) return limited

  const parsed = getPostsSchema.safeParse(searchParams(request))
  if (!parsed.success) return invalidInput()

  const offset = (parsed.data.page - 1) * parsed.data.limit
  let query = supabase
    .from('community_posts')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false })
    .range(offset, offset + parsed.data.limit - 1)

  if (parsed.data.category && parsed.data.category !== 'all') {
    query = query.eq('category', parsed.data.category)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })

  const userIds = [...new Set((data || []).map((post) => post.user_id))]
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, avatar_url').in('id', userIds)
    : { data: [], error: null }

  if (profilesError) {
    return NextResponse.json({ error: 'Failed to fetch post authors' }, { status: 500 })
  }

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]))
  const posts = (data || []).map((post) => ({
    ...post,
    profiles: profilesById.get(post.user_id) || { full_name: 'Usuário', avatar_url: '' },
  }))

  return NextResponse.json({ posts })
}

export async function POST(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'posts', 'post', 10)
  if (limited) return limited

  const json = await readJson(request)
  if (json.response) return json.response
  const parsed = createPostSchema.safeParse(json.body)
  if (!parsed.success) return invalidInput()

  const content = sanitizedContent(parsed.data.content)
  if (!content) return invalidInput()

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      user_id: authorizedUser.id,
      content,
      category: parsed.data.category,
      image_url: parsed.data.image_url ?? '',
    })
    .select(POST_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create post' }, { status: 500 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('id', authorizedUser.id)
    .single()

  return NextResponse.json({
    post: {
      ...data,
      profiles: profile || { full_name: 'Usuário', avatar_url: '' },
      community_comments: [{ count: 0 }],
      community_reactions: [{ count: 0 }],
    },
  }, { status: 201 })
}

export async function PUT(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'posts', 'put', 20)
  if (limited) return limited

  const json = await readJson(request)
  if (json.response) return json.response
  const parsed = updatePostSchema.safeParse(json.body)
  if (!parsed.success) return invalidInput()

  const content = sanitizedContent(parsed.data.content)
  if (!content) return invalidInput()

  const { data, error } = await supabase
    .from('community_posts')
    .update({ content })
    .eq('id', parsed.data.id)
    .eq('user_id', authorizedUser.id)
    .select(POST_COLUMNS)
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  return NextResponse.json({ post: data })
}

export async function DELETE(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'posts', 'delete', 20)
  if (limited) return limited

  const parsed = deletePostSchema.safeParse(searchParams(request))
  if (!parsed.success) return invalidInput()

  const { data, error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', authorizedUser.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  return NextResponse.json({ success: true })
}
