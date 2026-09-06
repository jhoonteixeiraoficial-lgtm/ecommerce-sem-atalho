import { mlSend, mlGet } from './ml-api'
import { decrypt, encrypt } from './encryption'
// import dinâmico: mantém o módulo utilizável em scripts fora do runtime do Next
async function adminClient() {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  return createAdminClient()
}
import type { ListingAttribute } from './generator'

const ML_BASE = 'https://api.mercadolibre.com'

// ---------------------------------------------------------------- token
export async function refreshMLToken(
  refreshToken: string
): Promise<{ access_token: string; refresh_token: string; expires_at: string } | null> {
  try {
    // O Mercado Livre exige application/x-www-form-urlencoded neste endpoint.
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_CLIENT_ID || '',
      client_secret: process.env.ML_CLIENT_SECRET || '',
      refresh_token: refreshToken,
    })

    const res = await fetch(`${ML_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.access_token) return null

    return {
      access_token: data.access_token,
      // o ML rotaciona o refresh token a cada uso
      refresh_token: data.refresh_token || refreshToken,
      expires_at: new Date(Date.now() + (data.expires_in ?? 21600) * 1000).toISOString(),
    }
  } catch {
    return null
  }
}

export class MLNotConnectedError extends Error {
  code = 'ML_NOT_CONNECTED'
  constructor(message = 'Conecte sua conta do Mercado Livre para continuar.') {
    super(message)
    this.name = 'MLNotConnectedError'
  }
}

export async function getValidMLToken(userId: string): Promise<string | null> {
  const supabase = await adminClient()
  const { data } = await supabase
    .from('assertive_ml_connections')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  // renova com 5 minutos de folga
  const expiresAt = new Date(data.expires_at).getTime()
  if (expiresAt - 5 * 60 * 1000 > Date.now()) {
    try {
      return decrypt(data.access_token)
    } catch {
      return null
    }
  }

  let currentRefresh: string
  try {
    currentRefresh = decrypt(data.refresh_token)
  } catch {
    return null
  }

  const refreshed = await refreshMLToken(currentRefresh)
  if (!refreshed) return null

  await supabase
    .from('assertive_ml_connections')
    .update({
      access_token: encrypt(refreshed.access_token),
      refresh_token: encrypt(refreshed.refresh_token),
      expires_at: refreshed.expires_at,
    })
    .eq('id', data.id)

  return refreshed.access_token
}

export async function requireMLToken(userId: string): Promise<string> {
  const token = await getValidMLToken(userId)
  if (!token) throw new MLNotConnectedError()
  return token
}

// ---------------------------------------------------------------- conta
export interface SellerCapabilities {
  ml_user_id: number
  nickname: string
  site_id: string
  /** conta opera no modelo novo de itens (exige family_name) */
  user_product_model: boolean
  tags: string[]
}

export async function getSellerCapabilities(token: string): Promise<SellerCapabilities> {
  const me = await mlGet<{
    id: number
    nickname?: string
    site_id?: string
    tags?: string[]
  }>('/users/me', token, { ttl: 900 })

  const tags = me.tags || []
  return {
    ml_user_id: me.id,
    nickname: me.nickname || '',
    site_id: me.site_id || 'MLB',
    user_product_model: tags.includes('user_product_seller'),
    tags,
  }
}

// ---------------------------------------------------------------- payload
export interface ListingPayloadInput {
  title: string
  family_name?: string
  category_id: string
  price: number
  available_quantity: number
  condition?: string
  listing_type_id?: string
  currency_id?: string
  attributes: ListingAttribute[]
  pictures: string[]
  free_shipping?: boolean
  warranty_type?: string
  warranty_time?: string
}

/**
 * Atributos de embalagem exigidos pelo Mercado Livre em contas no modelo novo.
 * São medidas físicas reais — nunca devem ser inventadas pelo sistema.
 */
export const SELLER_PACKAGE_ATTRIBUTES = [
  'SELLER_PACKAGE_HEIGHT',
  'SELLER_PACKAGE_WIDTH',
  'SELLER_PACKAGE_LENGTH',
  'SELLER_PACKAGE_WEIGHT',
] as const

export interface MLItemPayload {
  /** Ausente em contas no modelo novo: o ML monta o título a partir de family_name + ficha. */
  title?: string
  category_id: string
  price: number
  currency_id: string
  available_quantity: number
  buying_mode: string
  condition: string
  listing_type_id: string
  pictures: Array<{ source: string }>
  attributes: Array<{ id: string; value_id?: string; value_name?: string }>
  shipping?: { mode: string; local_pick_up: boolean; free_shipping: boolean }
  sale_terms?: Array<{ id: string; value_name: string }>
  family_name?: string
}

export function buildItemPayload(
  input: ListingPayloadInput,
  capabilities: SellerCapabilities | null
): MLItemPayload {
  const attributes = input.attributes
    .filter(a => a.value_name?.trim())
    .map(a => (a.value_id ? { id: a.id, value_id: a.value_id } : { id: a.id, value_name: a.value_name }))

  const sale_terms: Array<{ id: string; value_name: string }> = []
  if (input.warranty_type) sale_terms.push({ id: 'WARRANTY_TYPE', value_name: input.warranty_type })
  if (input.warranty_time) sale_terms.push({ id: 'WARRANTY_TIME', value_name: input.warranty_time })

  const payload: MLItemPayload = {
    category_id: input.category_id,
    price: Number(input.price),
    currency_id: input.currency_id || 'BRL',
    available_quantity: Math.max(1, Math.floor(input.available_quantity || 1)),
    buying_mode: 'buy_it_now',
    condition: input.condition || 'new',
    listing_type_id: input.listing_type_id || 'gold_special',
    pictures: input.pictures.filter(Boolean).slice(0, 12).map(source => ({ source })),
    attributes,
  }

  payload.shipping = {
    mode: 'me2',
    local_pick_up: false,
    free_shipping: input.free_shipping ?? false,
  }
  if (sale_terms.length) payload.sale_terms = sale_terms

  if (capabilities?.user_product_model) {
    // Modelo novo: family_name é obrigatório e title é rejeitado pela API.
    payload.family_name = (input.family_name || input.title).trim().slice(0, 60)
  } else {
    payload.title = input.title.trim()
  }

  return payload
}

// ---------------------------------------------------------------- validação
export interface ValidationIssue {
  code: string
  message: string
  field?: string
  attribute_id?: string
  /** todos os atributos citados pela API neste problema */
  attribute_ids?: string[]
  /** valor que o próprio Mercado Livre indicou para o atributo */
  suggested_value?: { value_id?: string; value_name?: string }
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  raw?: unknown
}

interface MLCause {
  code?: string
  message?: string
  type?: string
  references?: string[]
  department?: string
  cause_id?: number
}

const FRIENDLY: Array<{ test: RegExp; message: (c: MLCause) => string }> = [
  {
    test: /item\.attributes\.missing|missing.*attribute/i,
    message: c => `Atributo obrigatório faltando: ${c.references?.join(', ') || 'não identificado'}`,
  },
  {
    test: /body\.required_fields/i,
    message: c => `Campo obrigatório faltando no anúncio: ${extractBracketList(c.message)}`,
  },
  {
    test: /item\.title/i,
    message: () => 'O título não foi aceito pelo Mercado Livre. Reduza o tamanho e remova termos promocionais.',
  },
  {
    test: /item\.price|price.*invalid/i,
    message: () => 'Preço inválido para esta categoria.',
  },
  {
    test: /item\.pictures|picture/i,
    message: () => 'Problema nas imagens: envie fotos acessíveis publicamente, com no mínimo 500x500 pixels.',
  },
  {
    test: /category.*(invalid|not.*leaf|listing)/i,
    message: () => 'A categoria escolhida não aceita publicação direta. Selecione outra categoria.',
  },
  {
    test: /listing_type/i,
    message: () => 'O tipo de anúncio não está disponível para esta conta ou categoria.',
  },
]

function extractBracketList(msg?: string): string {
  const m = msg?.match(/\[([^\]]+)\]/)
  return m ? m[1] : (msg || 'desconhecido')
}

/**
 * O Mercado Livre às vezes informa exatamente qual valor falta, no formato:
 *   Attribute [UNITS_PER_PACK] to be added with values [(null,1)]
 * Aplicar esse valor é seguir a instrução oficial da API — não é inventar dado.
 */
function parseSuggestion(message?: string): { id: string; value_id?: string; value_name?: string } | null {
  if (!message) return null
  const m = message.match(/Attribute\s+\[([A-Z0-9_]+)\]\s+to be added with values?\s+\[\(([^,]*),([^)]*)\)\]/i)
  if (!m) return null
  const clean = (s: string) => {
    const t = s.trim()
    return !t || t.toLowerCase() === 'null' ? undefined : t
  }
  return { id: m[1], value_id: clean(m[2]), value_name: clean(m[3]) }
}

function parseCauses(data: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const root = data as { cause?: MLCause[]; message?: string; error?: string } | null
  const causes = Array.isArray(root?.cause) ? root!.cause! : []

  for (const c of causes) {
    const code = c.code || c.message || 'unknown'
    const friendly = FRIENDLY.find(f => f.test.test(code) || (c.message && f.test.test(c.message)))
    const suggestion = parseSuggestion(c.message)

    // ids de atributo vêm ora em references, ora listados dentro da mensagem
    const fromMessage = (c.message?.match(/\[([A-Za-z0-9_,\s]+)\]/g) || [])
      .flatMap(chunk =>
        chunk
          .slice(1, -1)
          .split(',')
          .map(s => s.trim().toUpperCase())
          .filter(s => /^[A-Z][A-Z0-9_]{2,}$/.test(s))
      )
    const fromRefs = (c.references || []).filter(r => /^[A-Z0-9_]{3,}$/.test(r) && r !== 'body')
    const attribute_ids = [...new Set([...(suggestion ? [suggestion.id] : []), ...fromRefs, ...fromMessage])]

    issues.push({
      code,
      message: friendly ? friendly.message(c) : c.message || code,
      field: c.references?.[0],
      attribute_id: attribute_ids[0],
      attribute_ids,
      suggested_value: suggestion
        ? { value_id: suggestion.value_id, value_name: suggestion.value_name }
        : undefined,
      severity: c.type === 'warning' ? 'warning' : 'error',
    })
  }

  if (!issues.length && root?.message) {
    issues.push({ code: root.error || 'error', message: root.message, severity: 'error' })
  }

  return issues
}

/** Valida o anúncio no Mercado Livre sem criar nada. Fonte da verdade oficial. */
export async function validateListing(
  token: string,
  payload: MLItemPayload
): Promise<ValidationResult> {
  const { ok, status, data } = await mlSend<unknown>('/items/validate', token, 'POST', payload)

  // 204/200 = payload aceito
  if (ok) return { valid: true, issues: [], raw: data }

  if (status === 401 || status === 403) {
    return {
      valid: false,
      issues: [
        {
          code: 'unauthorized',
          message: 'Sua conexão com o Mercado Livre expirou. Reconecte a conta.',
          severity: 'error',
        },
      ],
      raw: data,
    }
  }

  const issues = parseCauses(data)
  return {
    valid: issues.length > 0 && issues.every(i => i.severity === 'warning'),
    issues: issues.length
      ? issues
      : [{ code: `http_${status}`, message: `O Mercado Livre recusou o anúncio (HTTP ${status}).`, severity: 'error' }],
    raw: data,
  }
}

// ---------------------------------------------------------------- publicação
export interface PublishResult {
  success: boolean
  item_id?: string
  permalink?: string
  status?: string
  issues?: ValidationIssue[]
  error?: string
}

export async function publishListing(
  token: string,
  payload: MLItemPayload,
  description: string
): Promise<PublishResult> {
  const created = await mlSend<{ id?: string; permalink?: string; status?: string }>(
    '/items',
    token,
    'POST',
    payload
  )

  if (!created.ok || !created.data?.id) {
    const issues = parseCauses(created.data)
    return {
      success: false,
      issues,
      error: issues[0]?.message || `Falha ao publicar (HTTP ${created.status})`,
    }
  }

  const itemId = created.data.id

  // A descrição é um recurso separado na API atual.
  if (description.trim()) {
    await mlSend(`/items/${itemId}/description`, token, 'POST', {
      plain_text: description.trim(),
    }).catch(() => null)
  }

  return {
    success: true,
    item_id: itemId,
    permalink: created.data.permalink,
    status: created.data.status,
  }
}
