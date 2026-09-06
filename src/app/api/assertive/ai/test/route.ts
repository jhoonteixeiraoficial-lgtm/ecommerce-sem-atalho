import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson, invalidInput } from '@/app/api/community/helpers'
import { testConnection } from '@/lib/assertive/ai'
import { z } from 'zod'

const testSchema = z.object({
  provider: z.enum(['groq', 'gemini', 'claude', 'openai', 'custom']),
  api_key: z.string().min(1),
  base_url: z.string().optional(),
  model: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response
  const parsed = testSchema.safeParse(body.body)
  if (!parsed.success) return invalidInput()

  const result = await testConnection({
    id: '',
    user_id: authorizedUser.id,
    ...parsed.data,
    default_variations: 3,
    default_tone: 'profissional',
    default_margin: 30,
    auto_publish: false,
    created_at: '',
    updated_at: '',
  })

  return Response.json(result)
}
