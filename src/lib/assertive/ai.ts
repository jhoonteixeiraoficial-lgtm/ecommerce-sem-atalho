import type { AIConfig } from './types'

interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

interface AIResponse {
  text: string
  provider: string
  model: string
}

const PROVIDER_CONFIG: Record<string, { base_url: string; default_model: string }> = {
  groq: { base_url: 'https://api.groq.com/openai/v1', default_model: 'openai/gpt-oss-120b' },
  gemini: { base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', default_model: 'gemini-3.5-flash' },
  openai: { base_url: 'https://api.openai.com/v1', default_model: 'gpt-4o' },
  claude: { base_url: 'https://api.anthropic.com/v1', default_model: 'claude-sonnet-4-20250514' },
  custom: { base_url: '', default_model: '' },
}

const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash']

function getProviderConfig(config: AIConfig) {
  const p = PROVIDER_CONFIG[config.provider] || PROVIDER_CONFIG.custom
  return {
    base_url: config.base_url || p.base_url,
    model: config.model || p.default_model,
    api_key: config.api_key || '',
  }
}

async function callOpenAICompatible(
  base_url: string,
  api_key: string,
  model: string,
  messages: AIMessage[]
): Promise<string> {
  const res = await fetch(`${base_url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api_key}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
  })
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content
}

async function callWithGeminiFallback(
  base_url: string,
  api_key: string,
  preferredModel: string,
  messages: AIMessage[]
): Promise<string> {
  const models = [preferredModel, ...GEMINI_MODELS.filter(m => m !== preferredModel)]
  let lastError = ''
  for (const model of models) {
    try {
      return await callOpenAICompatible(base_url, api_key, model, messages)
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Unknown error'
      continue
    }
  }
  throw new Error(lastError || 'All Gemini models failed')
}

export async function generateText(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string
): Promise<AIResponse> {
  const { base_url, model, api_key } = getProviderConfig(config)
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
  const isGemini = config.provider === 'gemini' || base_url.includes('googleapis')
  const text = isGemini
    ? await callWithGeminiFallback(base_url, api_key, model, messages)
    : await callOpenAICompatible(base_url, api_key, model, messages)
  return { text, provider: config.provider, model }
}

export async function generateWithVision(
  config: AIConfig,
  systemPrompt: string,
  userPrompt: string,
  imageUrl: string
): Promise<AIResponse> {
  const { base_url, model, api_key } = getProviderConfig(config)
  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ]
  const isGemini = config.provider === 'gemini' || base_url.includes('googleapis')
  const text = isGemini
    ? await callWithGeminiFallback(base_url, api_key, model, messages)
    : await callOpenAICompatible(base_url, api_key, model, messages)
  return { text, provider: config.provider, model }
}

export async function testConnection(config: AIConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    await generateText(config, 'You are a test.', 'Reply with "OK" only.')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

function getConfigs(userConfig: AIConfig | null): AIConfig[] {
  const configs: AIConfig[] = []
  if (userConfig?.api_key) configs.push(userConfig)

  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    configs.push({
      id: '', user_id: '', provider: 'groq', api_key: groqKey,
      default_variations: 3, default_tone: 'profissional',
      default_margin: 30, auto_publish: false, created_at: '', updated_at: '',
    })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (geminiKey) {
    configs.push({
      id: '', user_id: '', provider: 'gemini', api_key: geminiKey,
      default_variations: 3, default_tone: 'profissional',
      default_margin: 30, auto_publish: false, created_at: '', updated_at: '',
    })
  }

  return configs
}

export async function generateWithFallback(
  userConfig: AIConfig | null,
  systemPrompt: string,
  userPrompt: string,
  imageUrl?: string
): Promise<AIResponse> {
  const configs = getConfigs(userConfig)
  let lastError: string = 'Nenhuma IA configurada'

  for (const cfg of configs) {
    if (!cfg.api_key) continue
    try {
      if (imageUrl) {
        return await generateWithVision(cfg, systemPrompt, userPrompt, imageUrl)
      }
      return await generateText(cfg, systemPrompt, userPrompt)
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Unknown error'
      continue
    }
  }

  throw new Error(`Todas as IAs falharam. Último erro: ${lastError}`)
}
