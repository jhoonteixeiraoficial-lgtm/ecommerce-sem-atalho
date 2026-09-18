import 'server-only'
import { randomBytes } from 'node:crypto'

/**
 * Token pessoal que autoriza o userscript (coletor do navegador) a enviar
 * páginas públicas do Mercado Livre para o app. O token NÃO é credencial do
 * Mercado Livre — só autentica o usuário no nosso endpoint de coleta.
 */

const PREFIX = 'esc_'

function novoToken(): string {
  return PREFIX + randomBytes(24).toString('hex')
}

async function admin() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

/** Retorna o token do usuário, criando um na primeira chamada. */
export async function getUserCollectToken(userId: string): Promise<string> {
  const supabase = await admin()
  const { data, error: readError } = await supabase
    .from('assertive_collect_tokens')
    .select('token')
    .eq('user_id', userId)
    .maybeSingle()
  if (readError) throw new Error('Não foi possível consultar o token de coleta.')
  if (data?.token) return data.token as string

  const token = novoToken()
  const { error } = await supabase
    .from('assertive_collect_tokens')
    .upsert({ user_id: userId, token }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (error) throw new Error('Não foi possível gerar o token de coleta.')
  // Another installer may have created the token concurrently. GET must not rotate it.
  const { data: saved, error: savedError } = await supabase
    .from('assertive_collect_tokens').select('token').eq('user_id', userId).single()
  if (savedError || !saved?.token) throw new Error('Não foi possível consultar o token de coleta.')
  return saved.token as string
}

/** Gera um novo token (invalida o anterior). */
export async function rotateUserCollectToken(userId: string): Promise<string> {
  const supabase = await admin()
  const token = novoToken()
  const { error } = await supabase
    .from('assertive_collect_tokens')
    .upsert(
      { user_id: userId, token, rotated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  if (error) throw new Error('Não foi possível renovar o token de coleta.')
  return token
}

/** Resolve o token do userscript para o dono. Token inválido → null. */
export async function resolveCollectToken(
  authorization: string | null
): Promise<string | null> {
  if (!authorization) return null
  const match = authorization.match(/^Bearer\s+(esc_[a-f0-9]{48})$/i)
  if (!match) return null
  const supabase = await admin()
  const { data } = await supabase
    .from('assertive_collect_tokens')
    .select('user_id')
    .eq('token', match[1])
    .maybeSingle()
  return data?.user_id ?? null
}
