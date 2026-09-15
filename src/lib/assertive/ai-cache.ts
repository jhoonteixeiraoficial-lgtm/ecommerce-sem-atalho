import { createAdminClient } from '@/lib/supabase/admin'

// ---------------------------------------------------------------- in-memory cache
const memCache = new Map<string, { payload: unknown; expires: number }>()
const MEM_MAX = 2000

function memGet(key: string): unknown | undefined {
  const hit = memCache.get(key)
  if (!hit) return undefined
  if (hit.expires < Date.now()) {
    memCache.delete(key)
    return undefined
  }
  return hit.payload
}

function memSet(key: string, payload: unknown, ttlSec: number) {
  if (memCache.size >= MEM_MAX) {
    const oldest = memCache.keys().next().value
    if (oldest) memCache.delete(oldest)
  }
  memCache.set(key, { payload, expires: Date.now() + ttlSec * 1000 })
}

// ---------------------------------------------------------------- db cache (persistente)
async function adminClient() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

async function dbCacheGet(key: string): Promise<unknown | undefined> {
  try {
    const supabase = await adminClient()
    const { data } = await supabase
      .from('assertive_ai_cache')
      .select('payload, expires_at')
      .eq('cache_key', key)
      .maybeSingle()
    if (!data) return undefined
    if (new Date(data.expires_at).getTime() < Date.now()) return undefined
    return data.payload
  } catch {
    return undefined
  }
}

async function dbCacheSet(key: string, payload: unknown, ttlSec: number) {
  try {
    const supabase = await adminClient()
    await supabase.from('assertive_ai_cache').upsert(
      {
        cache_key: key,
        payload: payload as Record<string, unknown>,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      },
      { onConflict: 'cache_key' }
    )
  } catch {
    /* cache é best-effort */
  }
}

// ---------------------------------------------------------------- chave determinística
function hashString(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

function buildCacheKey(task: string, prompt: string, options: Record<string, unknown> = {}): string {
  const relevant = {
    task,
    prompt: prompt.slice(0, 2000),
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    json: options.json,
    model: options.model,
    workload: options.workload,
  }
  return `AI:${task}:${hashString(JSON.stringify(relevant))}`
}

// ---------------------------------------------------------------- API pública
export interface AICacheOptions {
  /** TTL em segundos. 0 = não cacheia. Padrão: 1h para reasoning/draft, 24h para vision */
  ttl?: number
  /** Persistir no banco (útil para tarefas idempotentes: identify, dna, enrichment) */
  persist?: boolean
  /** Força refresh ignorando cache */
  forceRefresh?: boolean
}

/**
 * Wrapper que cacheia chamadas de IA.
 * Use: await withAICache(task, prompt, options, () => runTaskJson(...))
 */
export async function withAICache<T>(
  task: string,
  prompt: string,
  options: Record<string, unknown> & { json?: boolean },
  executor: () => Promise<T>,
  cacheOpts: AICacheOptions = {}
): Promise<T> {
  const { ttl = task === 'image_classification' || task === 'visual_understanding' || task === 'visual_fidelity' ? 86400 : 3600, persist = false, forceRefresh = false } = cacheOpts
  const key = buildCacheKey(task, prompt, options)

  if (!forceRefresh && ttl > 0) {
    const hit = memGet(key)
    if (hit !== undefined) return hit as T
    if (persist) {
      const dbHit = await dbCacheGet(key)
      if (dbHit !== undefined) {
        memSet(key, dbHit, Math.min(ttl, 600))
        return dbHit as T
      }
    }
  }

  const result = await executor()

  if (ttl > 0) {
    memSet(key, result, ttl)
    if (persist) await dbCacheSet(key, result, ttl)
  }

  return result
}

/**
 * Gera chave para invalidar cache relacionado a um produto/análise
 */
export function invalidationKeys(analysisId: string, userId: string): string[] {
  return [
    `AI:identify_product:*:${analysisId}:*`,
    `AI:product_truth:*:${analysisId}:*`,
    `AI:exact_product_matching:*:${analysisId}:*`,
    `AI:competitor_analysis:*:${analysisId}:*`,
    `AI:winning_listing_dna:*:${analysisId}:*`,
    `AI:title_draft:*:${analysisId}:*`,
    `AI:description_draft:*:${analysisId}:*`,
  ]
}

/**
 * Limpa cache de memória (útil em testes ou após deploy)
 */
export function clearAIMemoryCache() {
  memCache.clear()
}