import type { AIConfig } from './types'

interface AIContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | AIContentPart[]
}

export interface AIResponse {
  text: string
  provider: string
  model: string
}

type ProviderId = 'groq' | 'gemini' | 'openai' | 'claude' | 'custom'

interface ProviderSpec {
  base_url: string
  models: string[]
  /** aceita imagem na mesma API compatível com OpenAI */
  vision: boolean
  /** exige data URI base64 — não aceita URL remota */
  visionRequiresBase64: boolean
}

/**
 * Catálogo central de provedores/modelos.
 * Alterar modelos aqui evita quebrar o Assertive quando um modelo é descontinuado.
 */
const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  gemini: {
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    // ordem = preferência; usada como fallback controlado
    models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'],
    vision: true,
    // CONFIRMADO: a camada compatível do Gemini rejeita URL remota (400 INVALID_ARGUMENT)
    visionRequiresBase64: true,
  },
  groq: {
    base_url: 'https://api.groq.com/openai/v1',
    models: ['openai/gpt-oss-120b'],
    vision: false,
    visionRequiresBase64: false,
  },
  openai: {
    base_url: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini', 'gpt-4o'],
    vision: true,
    visionRequiresBase64: false,
  },
  claude: {
    base_url: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514'],
    vision: false,
    visionRequiresBase64: false,
  },
  custom: {
    base_url: '',
    models: [],
    vision: false,
    visionRequiresBase64: false,
  },
}

function specOf(provider: string): ProviderSpec {
  return PROVIDERS[(provider as ProviderId) in PROVIDERS ? (provider as ProviderId) : 'custom']
}

function resolve(config: AIConfig) {
  const spec = specOf(config.provider)
  const base_url = config.base_url || spec.base_url
  const models = config.model ? [config.model, ...spec.models.filter(m => m !== config.model)] : spec.models
  return { base_url, models, api_key: config.api_key || '', spec }
}

// ---------------------------------------------------------------- imagem
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/**
 * Converte uma imagem em data URI base64.
 * Necessário porque o Gemini não busca URLs remotas — causa raiz da falha do fluxo por foto.
 */
export async function toDataUri(source: string): Promise<string> {
  if (source.startsWith('data:')) return source

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(source, { signal: controller.signal })
    if (!res.ok) throw new Error(`Não foi possível baixar a imagem (HTTP ${res.status})`)

    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0) throw new Error('A imagem enviada está vazia')
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Imagem muito grande para análise. Envie uma foto de até 8MB.')
    }

    let mime = res.headers.get('content-type')?.split(';')[0].trim() || ''
    if (!mime.startsWith('image/')) {
      // alguns CDNs devolvem octet-stream: detecta pelo magic number
      if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg'
      else if (buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png'
      else if (buf.slice(8, 12).toString('ascii') === 'WEBP') mime = 'image/webp'
      else mime = 'image/jpeg'
    }
    return `data:${mime};base64,${buf.toString('base64')}`
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------- chamada
async function callChat(
  base_url: string,
  api_key: string,
  model: string,
  messages: AIMessage[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number }
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 4096,
    }
    if (opts.json) body.response_format = { type: 'json_object' }

    const res = await fetch(`${base_url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api_key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`${model} → HTTP ${res.status}: ${txt.slice(0, 200)}`)
    }

    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content
    if (typeof text !== 'string' || !text.trim()) throw new Error(`${model} retornou resposta vazia`)
    return text
  } finally {
    clearTimeout(timer)
  }
}

async function callWithModelFallback(
  base_url: string,
  api_key: string,
  models: string[],
  messages: AIMessage[],
  opts: { json?: boolean; temperature?: number; maxTokens?: number }
): Promise<{ text: string; model: string }> {
  let lastError = 'nenhum modelo configurado'
  // limita o fallback a 3 tentativas para não multiplicar custo
  for (const model of models.slice(0, 3)) {
    try {
      const text = await callChat(base_url, api_key, model, messages, opts)
      return { text, model }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'erro desconhecido'
    }
  }
  throw new Error(lastError)
}

// ---------------------------------------------------------------- config
function envConfig(provider: ProviderId, key: string): AIConfig {
  return {
    id: '',
    user_id: '',
    provider,
    api_key: key,
    default_variations: 3,
    default_tone: 'profissional',
    default_margin: 30,
    auto_publish: false,
    created_at: '',
    updated_at: '',
  }
}

/**
 * Ordena os provedores disponíveis respeitando a escolha do usuário,
 * mas garantindo que uma tarefa multimodal só vá para provedores com visão.
 */
function buildChain(userConfig: AIConfig | null, needsVision: boolean): AIConfig[] {
  const chain: AIConfig[] = []

  if (userConfig?.api_key) {
    const spec = specOf(userConfig.provider)
    if (!needsVision || spec.vision) chain.push(userConfig)
  }

  const gemini = process.env.GEMINI_API_KEY
  const groq = process.env.GROQ_API_KEY

  // Gemini é o único provedor multimodal garantido do sistema
  if (gemini) chain.push(envConfig('gemini', gemini))
  if (groq && !needsVision) chain.push(envConfig('groq', groq))

  // remove duplicatas por provider+chave
  const seen = new Set<string>()
  return chain.filter(c => {
    const k = `${c.provider}:${c.api_key}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface GenerateOptions {
  json?: boolean
  temperature?: number
  maxTokens?: number
  /** URL ou data URI de imagens para análise multimodal */
  images?: string[]
}

export async function generate(
  userConfig: AIConfig | null,
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<AIResponse> {
  const images = (options.images || []).filter(Boolean).slice(0, 4)
  const needsVision = images.length > 0
  const chain = buildChain(userConfig, needsVision)

  if (chain.length === 0) {
    throw new Error(
      needsVision
        ? 'Nenhuma IA com suporte a imagem configurada. Configure uma chave do Gemini em Configurações.'
        : 'Nenhuma IA configurada. Adicione uma chave de API em Configurações.'
    )
  }

  let lastError = 'falha desconhecida'

  for (const cfg of chain) {
    const { base_url, models, api_key, spec } = resolve(cfg)
    if (!api_key || !base_url || models.length === 0) continue

    try {
      let content: string | AIContentPart[] = userPrompt

      if (needsVision) {
        const parts: AIContentPart[] = [{ type: 'text', text: userPrompt }]
        for (const img of images) {
          const url = spec.visionRequiresBase64 ? await toDataUri(img) : img
          parts.push({ type: 'image_url', image_url: { url } })
        }
        content = parts
      }

      const messages: AIMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ]

      const { text, model } = await callWithModelFallback(base_url, api_key, models, messages, options)
      return { text, provider: cfg.provider, model }
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'erro desconhecido'
    }
  }

  throw new Error(`Falha ao consultar a IA. Último erro: ${lastError}`)
}

/** Extrai JSON de forma tolerante (remove cercas markdown e texto ao redor). */
export function parseJson<T>(text: string): T {
  const cleaned = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, m => (m.includes('```') ? '' : m))
    .replace(/```[\s\S]*$/i, '')
    .trim()

  const candidates = [cleaned, text.trim()]
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T
    } catch {
      const start = c.search(/[[{]/)
      const end = Math.max(c.lastIndexOf('}'), c.lastIndexOf(']'))
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(c.slice(start, end + 1)) as T
        } catch {
          /* tenta o próximo */
        }
      }
    }
  }
  throw new Error('A IA retornou um formato inválido. Tente novamente.')
}

export async function generateJson<T>(
  userConfig: AIConfig | null,
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<T> {
  const res = await generate(userConfig, systemPrompt, userPrompt, { ...options, json: true })
  return parseJson<T>(res.text)
}

export async function testConnection(config: AIConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const { base_url, models, api_key } = resolve(config)
    if (!api_key) return { ok: false, error: 'Informe uma chave de API.' }
    if (!base_url) return { ok: false, error: 'Informe a URL base do provedor.' }
    if (models.length === 0) return { ok: false, error: 'Informe o nome do modelo.' }
    await callWithModelFallback(
      base_url,
      api_key,
      models,
      [{ role: 'user', content: 'Responda apenas: OK' }],
      { maxTokens: 16 }
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha na conexão' }
  }
}

export function supportsVision(provider: string): boolean {
  return specOf(provider).vision
}

export function availableModels(provider: string): string[] {
  return specOf(provider).models
}

// -------------------------------------------------- compatibilidade legada
export async function generateWithFallback(
  userConfig: AIConfig | null,
  systemPrompt: string,
  userPrompt: string,
  imageUrl?: string
): Promise<AIResponse> {
  return generate(userConfig, systemPrompt, userPrompt, {
    images: imageUrl ? [imageUrl] : undefined,
  })
}
