import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { testConnection } from '@/lib/assertive/ai'
import { getUserAIConfig } from '@/lib/assertive/pipeline'
import { z } from 'zod'

export const runtime = 'nodejs'
export const maxDuration = 60

const testSchema = z.object({
  provider: z.enum(['groq', 'gemini', 'claude', 'openai', 'custom']),
  // vazio = testar a chave já salva
  api_key: z.string().max(400).optional(),
  base_url: z.string().max(300).optional(),
  model: z.string().max(120).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response

  const parsed = testSchema.safeParse(body.body)
  if (!parsed.success) return Response.json({ ok: false, error: 'Dados inválidos.' }, { status: 400 })

  let api_key = parsed.data.api_key?.trim()
  if (!api_key) {
    const stored = await getUserAIConfig(authorizedUser.id)
    api_key = stored?.api_key
  }

  if (!api_key) {
    return Response.json({ ok: false, error: 'Informe uma chave de API para testar.' })
  }

  const result = await testConnection({
    id: '',
    user_id: authorizedUser.id,
    provider: parsed.data.provider,
    api_key,
    base_url: parsed.data.base_url,
    model: parsed.data.model,
    default_variations: 3,
    default_tone: 'profissional',
    default_margin: 30,
    auto_publish: false,
    created_at: '',
    updated_at: '',
  })

  return Response.json(result)
}
