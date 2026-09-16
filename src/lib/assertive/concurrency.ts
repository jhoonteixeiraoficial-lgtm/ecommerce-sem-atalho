import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Persistent lease, independent of pipeline stage and pooled DB sessions.
 * The database checks ownership and atomically returns a unique execution token.
 * Its 10-minute lifetime exceeds this route's 300-second execution limit.
 */
export async function tryAcquireAnalysisLock(analysisId: string, userId: string): Promise<string | null> {
  try {
    const { data, error } = await createAdminClient().rpc('acquire_assertive_analysis_lease', {
      p_analysis_id: analysisId,
      p_user_id: userId,
    })
    if (error || (data !== null && (typeof data !== 'string' || !/^[0-9a-f-]{36}$/i.test(data)))) {
      throw new Error('Invalid analysis lease response')
    }
    return data
  } catch {
    // Never start billable work without confirmed mutual exclusion.
    throw new Error('O controle de execução está indisponível. Tente novamente em instantes.')
  }
}

export async function releaseAnalysisLock(analysisId: string, userId: string, token: string): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('release_assertive_analysis_lease', {
      p_analysis_id: analysisId,
      p_user_id: userId,
      p_token: token,
    })
    if (error) throw error
  } catch {
    // The lease expires if the process dies or the release request fails.
    // Do not convert a successful generation into a retryable failure.
    console.error('[assertive] Analysis lease release failed; awaiting expiry')
  }
}
