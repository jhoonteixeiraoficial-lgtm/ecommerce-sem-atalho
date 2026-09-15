import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------- helpers
function hasSupabaseConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function getSupabase() {
  return createAdminClient()
}

function hashAnalysisKey(analysisId: string, userId: string): bigint {
  let hash = 0
  const combined = analysisId + ':' + userId
  for (let i = 0; i < combined.length; i++) {
    hash = Math.imul(31, hash) + combined.charCodeAt(i)
    hash |= 0
  }
  return BigInt(hash >>> 0)
}

// ---------------------------------------------------------------- advisory locks
/**
 * Tenta adquirir um lock advisory no PostgreSQL.
 * Retorna true se conseguiu, false se já existe outro processo com o lock.
 * O lock é liberado automaticamente ao fim da transação (pg_advisory_xact_lock).
 */
export async function tryAcquireAnalysisLock(
  analysisId: string,
  userId: string
): Promise<boolean> {
  if (!hasSupabaseConfig()) return true

  const supabase = getSupabase()
  const lockKey = hashAnalysisKey(analysisId, userId)

  try {
    const { data, error } = await supabase.rpc('try_acquire_analysis_lock', {
      p_lock_key: lockKey,
    })
    if (error) throw error
    return data === true
  } catch {
    return await fallbackAcquireLock(analysisId, userId)
  }
}

/**
 * Libera o lock advisory (não necessário com pg_advisory_xact_lock,
 * mas útil se usar lock de sessão pg_advisory_lock).
 */
export async function releaseAnalysisLock(
  analysisId: string,
  userId: string
): Promise<void> {
  if (!hasSupabaseConfig()) return

  const supabase = getSupabase()
  const lockKey = hashAnalysisKey(analysisId, userId)

  try {
    await supabase.rpc('release_analysis_lock', { p_lock_key: lockKey })
  } catch {
    // Ignorar erros de liberação
  }
}

// ---------------------------------------------------------------- fallback lock (coluna status)
/**
 * Fallback se a RPC não existir: usa UPDATE com WHERE status='pending'
 * para garantir que apenas um processo pegue a análise.
 */
async function fallbackAcquireLock(analysisId: string, userId: string): Promise<boolean> {
  if (!hasSupabaseConfig()) return true

  const supabase = getSupabase()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('assertive_analyses')
    .update({ status: 'processing', updated_at: now })
    .eq('id', analysisId)
    .eq('user_id', userId)
    .in('status', ['needs_input', 'ready', 'failed'])
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[concurrency] Fallback lock error:', error)
    return false
  }

  return !!data
}

/**
 * Verifica se uma análise já está sendo processada
 */
export async function isAnalysisProcessing(analysisId: string, userId: string): Promise<boolean> {
  if (!hasSupabaseConfig()) return false

  const supabase = getSupabase()
  const { data } = await supabase
    .from('assertive_analyses')
    .select('status')
    .eq('id', analysisId)
    .eq('user_id', userId)
    .maybeSingle()

  return data?.status === 'processing' || data?.status === 'researching' || data?.status === 'generating'
}

/**
 * Marca análise como processando (para o fallback lock)
 */
export async function markAnalysisProcessing(analysisId: string, userId: string): Promise<boolean> {
  return await fallbackAcquireLock(analysisId, userId)
}

/**
 * Reseta status de processando para failed (em caso de erro) ou próximo estágio
 */
export async function resetAnalysisProcessing(
  analysisId: string,
  userId: string,
  newStatus: 'failed' | 'needs_input' | 'ready' = 'failed',
  errorMessage?: string
): Promise<void> {
  if (!hasSupabaseConfig()) return

  const supabase = getSupabase()
  await supabase
    .from('assertive_analyses')
    .update({
      status: newStatus,
      error_message: errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', analysisId)
    .eq('user_id', userId)
    .eq('status', 'processing')
}