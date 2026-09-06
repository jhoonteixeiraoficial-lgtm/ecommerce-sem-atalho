import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson, invalidInput } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

const configSchema = z.object({
  provider: z.enum(['groq', 'gemini', 'claude', 'openai', 'custom']),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  model: z.string().optional(),
  default_variations: z.number().min(1).max(10).optional(),
  default_tone: z.string().optional(),
  default_margin: z.number().min(0).max(90).optional(),
  auto_publish: z.boolean().optional(),
})

export async function GET(_req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_ai_config')
    .select('*')
    .eq('user_id', authorizedUser.id)
    .single()

  return Response.json(data || { provider: 'groq' })
}

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response
  const parsed = configSchema.safeParse(body.body)
  if (!parsed.success) return invalidInput()

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_ai_config')
    .upsert({
      user_id: authorizedUser.id,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single()

  return Response.json(data)
}

export async function PUT(req: NextRequest) {
  return POST(req)
}
