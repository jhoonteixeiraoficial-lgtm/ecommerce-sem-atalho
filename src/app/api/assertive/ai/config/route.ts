import { NextRequest } from 'next/server'
import { requireCommunityUser, readJson } from '@/app/api/community/helpers'
import { createAdminClient } from '@/lib/supabase/admin'
import { encrypt, decrypt } from '@/lib/assertive/encryption'
import { availableModels, supportsVision } from '@/lib/assertive/ai'
import { z } from 'zod'

export const runtime = 'nodejs'

const configSchema = z.object({
  provider: z.enum(['groq', 'gemini', 'claude', 'openai', 'custom']),
  api_key: z.string().max(400).optional(),
  base_url: z.string().url().max(300).optional().or(z.literal('')),
  model: z.string().max(120).optional(),
  default_variations: z.number().int().min(1).max(10).optional(),
  default_tone: z.string().max(40).optional(),
  default_margin: z.number().min(0).max(90).optional(),
  auto_publish: z.boolean().optional(),
})

const PROVIDERS = ['gemini', 'groq', 'openai', 'claude', 'custom'] as const

function maskKey(key: string): string {
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}••••${key.slice(-4)}`
}

/** Descriptografa se possível; suporta registros antigos salvos em texto puro. */
export function readStoredKey(stored: string | null | undefined): string {
  if (!stored) return ''
  if (!stored.includes(':')) return stored
  try {
    return decrypt(stored)
  } catch {
    return stored
  }
}

async function currentConfig(userId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('assertive_ai_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  const key = readStoredKey(data?.api_key)

  return {
    provider: data?.provider || 'gemini',
    // a chave nunca volta em texto puro para o navegador
    api_key_masked: key ? maskKey(key) : null,
    has_api_key: Boolean(key),
    base_url: data?.base_url || '',
    model: data?.model || '',
    default_variations: data?.default_variations ?? 3,
    default_tone: data?.default_tone || 'profissional',
    default_margin: data?.default_margin ?? 30,
    auto_publish: data?.auto_publish ?? false,
    providers: PROVIDERS.map(id => ({
      id,
      models: availableModels(id),
      vision: supportsVision(id),
    })),
    // o sistema garante visão mesmo se o provedor do usuário não suportar
    system_vision_available: Boolean(process.env.GEMINI_API_KEY),
  }
}

export async function GET() {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  return Response.json(await currentConfig(auth.authorizedUser.id))
}

export async function POST(req: NextRequest) {
  const auth = await requireCommunityUser()
  if (auth.response) return auth.response
  const { authorizedUser } = auth

  const body = await readJson(req)
  if (body.response) return body.response

  const parsed = configSchema.safeParse(body.body)
  if (!parsed.success) {
    return Response.json({ error: 'Configuração inválida.' }, { status: 400 })
  }

  const { api_key, ...rest } = parsed.data
  const supabase = createAdminClient()

  const payload: Record<string, unknown> = {
    user_id: authorizedUser.id,
    ...rest,
    updated_at: new Date().toISOString(),
  }

  // chave em branco = manter a atual; string preenchida = substituir (criptografada)
  if (typeof api_key === 'string' && api_key.trim()) {
    payload.api_key = encrypt(api_key.trim())
  }

  const { error } = await supabase
    .from('assertive_ai_config')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) return Response.json({ error: 'Não foi possível salvar.' }, { status: 500 })

  return Response.json(await currentConfig(authorizedUser.id))
}

export async function PUT(req: NextRequest) {
  return POST(req)
}
