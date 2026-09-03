import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  enforceCommunityRateLimit,
  invalidInput,
  readJson,
  requireCommunityUser,
  searchParams,
} from '../helpers'

const getReactionsSchema = z.object({ post_id: z.string().uuid() }).strict()
const toggleReactionSchema = z.object({
  post_id: z.string().uuid(),
  reaction_type: z.enum(['like', 'love', 'fire', 'clap']),
  operation_id: z.string().uuid(),
}).strict()
const REACTION_COLUMNS = 'id, post_id, user_id, reaction_type, created_at'

export async function POST(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'reactions', 'post', 30)
  if (limited) return limited

  const json = await readJson(request)
  if (json.response) return json.response
  const parsed = toggleReactionSchema.safeParse(json.body)
  if (!parsed.success) return invalidInput()

  let data: unknown = null
  let error: unknown = null
  try {
    const result = await createAdminClient().rpc('toggle_community_reaction', {
      p_actor_id: authorizedUser.id,
      p_post_id: parsed.data.post_id,
      p_reaction_type: parsed.data.reaction_type,
      p_operation_id: parsed.data.operation_id,
    })
    data = result.data
    error = result.error
  } catch {
    error = true
  }

  if (error || !data || typeof data !== 'object' || !('removed' in data)) {
    return NextResponse.json({ error: 'Failed to toggle reaction' }, { status: 500 })
  }

  if ((data as { removed?: unknown }).removed === true) return NextResponse.json({ removed: true })
  return NextResponse.json({ reaction: (data as { reaction?: unknown }).reaction }, { status: 201 })
}

export async function GET(request: Request) {
  const context = await requireCommunityUser()
  if (context.response) return context.response
  const { authorizedUser, supabase } = context

  const limited = enforceCommunityRateLimit(authorizedUser.id, 'reactions', 'get', 60)
  if (limited) return limited

  const parsed = getReactionsSchema.safeParse(searchParams(request))
  if (!parsed.success) return invalidInput()

  const { data, error } = await supabase
    .from('community_reactions')
    .select(REACTION_COLUMNS)
    .eq('post_id', parsed.data.post_id)

  if (error) return NextResponse.json({ error: 'Failed to fetch reactions' }, { status: 500 })

  const reactions = data || []
  const grouped = reactions.reduce((acc: Record<string, number>, reaction) => {
    acc[reaction.reaction_type] = (acc[reaction.reaction_type] || 0) + 1
    return acc
  }, {})
  const userReactions = reactions
    .filter((reaction) => reaction.user_id === authorizedUser.id)
    .map((reaction) => reaction.reaction_type)

  return NextResponse.json({ reactions: grouped, userReactions, total: reactions.length })
}
