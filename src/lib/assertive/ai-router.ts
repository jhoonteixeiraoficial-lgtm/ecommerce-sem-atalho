import { generate, parseJson, type GenerateOptions } from './ai'
import type { AIConfig } from './types'

/**
 * AI Router — o usuário vê apenas "Assertive IA".
 * A plataforma decide o provedor por TAREFA, equilibrando qualidade e custo.
 *
 * Divisão arquitetural:
 *   REASONING -> Claude (pesquisa, cruzamento de evidências, conflitos, decisões factuais)
 *   DRAFT     -> modelo barato (título, descrição, bullets, reescrita)
 *   VISION    -> Gemini (multimodal)
 *   RETRIEVAL -> Gemini Search Grounding (apenas localizar fontes; ver websearch.ts)
 */
export type AITask =
  // ---- raciocínio: qualidade justifica custo
  | 'identify_product'
  | 'product_truth'
  | 'exact_product_matching'
  | 'competitor_analysis'
  | 'source_reconciliation'
  | 'conflict_resolution'
  | 'attribute_enrichment'
  | 'winning_listing_dna'
  | 'seo_strategy'
  | 'ml_error_interpretation'
  // ---- redação: modelo barato basta
  | 'title_draft'
  | 'description_draft'
  | 'text_rewrite'

type Tier = 'reasoning' | 'draft' | 'vision'

const TASK_TIER: Record<AITask, Tier> = {
  identify_product: 'reasoning',
  product_truth: 'reasoning',
  exact_product_matching: 'reasoning',
  competitor_analysis: 'reasoning',
  source_reconciliation: 'reasoning',
  conflict_resolution: 'reasoning',
  attribute_enrichment: 'reasoning',
  winning_listing_dna: 'reasoning',
  seo_strategy: 'reasoning',
  ml_error_interpretation: 'reasoning',
  title_draft: 'draft',
  description_draft: 'draft',
  text_rewrite: 'draft',
}

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages'

export interface RouterResult {
  text: string
  provider: string
  model: string
  tier: Tier
}

/** A API da Anthropic não é compatível com o formato OpenAI: chamada nativa. */
async function callClaude(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const res = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: opts.maxTokens ?? 4096,
        temperature: opts.temperature ?? 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`Claude HTTP ${res.status}: ${txt.slice(0, 200)}`)
    }

    const data = await res.json()
    const text = (data?.content || [])
      .filter((b: { type?: string }) => b?.type === 'text')
      .map((b: { text?: string }) => b.text || '')
      .join('')
      .trim()

    if (!text) throw new Error('Claude retornou resposta vazia')
    return text
  } finally {
    clearTimeout(timer)
  }
}

export function reasoningEngineStatus(): {
  engine: 'claude' | 'gemini_fallback'
  claude_available: boolean
  note: string
} {
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY)
  return {
    engine: hasClaude ? 'claude' : 'gemini_fallback',
    claude_available: hasClaude,
    note: hasClaude
      ? 'Claude ativo como motor de pesquisa e raciocínio.'
      : 'ANTHROPIC_API_KEY ausente: o raciocínio está operando no modelo de fallback, com qualidade inferior em cruzamento de evidências.',
  }
}

/**
 * Executa uma tarefa no provedor adequado.
 * Tarefas de raciocínio tentam Claude primeiro; sem credencial, caem para o
 * fallback disponível para que o produto continue funcionando.
 */
export async function runTask(
  task: AITask,
  userConfig: AIConfig | null,
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<RouterResult> {
  const tier: Tier = options.images?.length ? 'vision' : TASK_TIER[task]

  if (tier === 'reasoning') {
    const claudeKey = process.env.ANTHROPIC_API_KEY
    if (claudeKey) {
      try {
        const text = await callClaude(claudeKey, systemPrompt, userPrompt, {
          maxTokens: options.maxTokens,
          temperature: options.temperature ?? 0.2,
        })
        return { text, provider: 'claude', model: CLAUDE_MODEL, tier }
      } catch {
        // sem quebrar o pipeline: segue para o fallback
      }
    }
  }

  // Tier draft prioriza o provedor mais barato disponível.
  const preferCheap = tier === 'draft'
  const res = await generate(preferCheap ? null : userConfig, systemPrompt, userPrompt, {
    ...options,
    temperature: options.temperature ?? (tier === 'reasoning' ? 0.2 : 0.5),
  })

  return { ...res, tier }
}

export async function runTaskJson<T>(
  task: AITask,
  userConfig: AIConfig | null,
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<T> {
  const res = await runTask(task, userConfig, systemPrompt, userPrompt, { ...options, json: true })
  return parseJson<T>(res.text)
}
