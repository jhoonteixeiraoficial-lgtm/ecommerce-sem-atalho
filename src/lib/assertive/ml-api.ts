export const ML_BASE = 'https://api.mercadolibre.com'
export const SITE_ID = 'MLB'

export class MLApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string
  ) {
    super(message)
    this.name = 'MLApiError'
  }
}

/**
 * Endpoints confirmados como indisponíveis para aplicações externas (403),
 * mesmo com token OAuth válido. Documentado aqui para não serem reintroduzidos.
 *   GET /sites/MLB/search            -> 403 forbidden
 *   GET /items/{id} (de terceiros)   -> 403 access_denied
 *   GET /user-products/{id} (outros) -> 403 forbidden
 * A descoberta de concorrência usa catálogo + highlights, que são liberados.
 */

// ---------------------------------------------------------------- cache
const memCache = new Map<string, { payload: unknown; expires: number }>()
const MEM_MAX = 500

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

// import dinâmico: mantém este módulo utilizável fora do runtime do Next
async function adminClient() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}

async function dbCacheGet(key: string): Promise<unknown | undefined> {
  try {
    const supabase = await adminClient()
    const { data } = await supabase
      .from('assertive_ml_cache')
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
    await supabase.from('assertive_ml_cache').upsert(
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

// ---------------------------------------------------------------- fetch
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface GetOptions {
  /** TTL do cache em segundos. 0 desativa. */
  ttl?: number
  /** Persiste o cache no banco (dados estáveis: categorias, atributos). */
  persist?: boolean
  timeoutMs?: number
  retries?: number
}

export async function mlGet<T>(path: string, token: string, opts: GetOptions = {}): Promise<T> {
  const { ttl = 0, persist = false, timeoutMs = 12000, retries = 2 } = opts
  const key = `GET:${path}`

  if (ttl > 0) {
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

  let lastErr: MLApiError | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${ML_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.ok) {
        const json = (await res.json()) as T
        if (ttl > 0) {
          memSet(key, json, ttl)
          if (persist) await dbCacheSet(key, json, ttl)
        }
        return json
      }

      const text = await res.text().catch(() => '')
      let body: unknown = text
      try {
        body = JSON.parse(text)
      } catch {
        /* texto puro */
      }
      lastErr = new MLApiError(res.status, body, `ML ${res.status} em ${path}: ${text.slice(0, 180)}`)

      // 429 / 5xx são transitórios: backoff exponencial
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const retryAfter = Number(res.headers.get('retry-after'))
          const wait = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 400 * Math.pow(2, attempt) + Math.random() * 200
          await sleep(Math.min(wait, 5000))
          continue
        }
      }
      throw lastErr
    } catch (e) {
      clearTimeout(timer)
      if (e instanceof MLApiError) throw e
      lastErr = new MLApiError(0, null, e instanceof Error ? e.message : 'Falha de rede na API do Mercado Livre')
      if (attempt < retries) {
        await sleep(400 * Math.pow(2, attempt))
        continue
      }
    }
  }

  throw lastErr ?? new MLApiError(0, null, 'Falha desconhecida na API do Mercado Livre')
}

export async function mlSend<T>(
  path: string,
  token: string,
  method: 'POST' | 'PUT',
  payload: unknown,
  timeoutMs = 20000
): Promise<{ ok: boolean; status: number; data: T }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${ML_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const text = await res.text().catch(() => '')
    let data: unknown = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = text
    }
    return { ok: res.ok, status: res.status, data: data as T }
  } finally {
    clearTimeout(timer)
  }
}

/** Executa promessas com concorrência limitada — evita rajadas na API do ML. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Igual a mapLimit, mas descarta falhas individuais em vez de abortar tudo. */
export async function mapLimitSettled<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = await mapLimit(items, limit, async (item, i) => {
    try {
      return await fn(item, i)
    } catch {
      return null
    }
  })
  return out.filter((x): x is R => x !== null)
}
