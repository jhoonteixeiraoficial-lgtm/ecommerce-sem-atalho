export type AIProvider = 'gemini' | 'claude' | 'groq' | 'openai'
export type AIWorkload = 'reasoning' | 'draft' | 'vision' | 'visual_fidelity' | 'image_generation' | 'search'
export type AIModelTier = 'reasoning' | 'draft' | 'vision' | 'image'

export interface AIModelSpec {
  provider: AIProvider
  model: string
  capabilities: {
    json: boolean
    vision: boolean
    imageGeneration: boolean
    grounding: boolean
  }
  tier: AIModelTier
}

type Env = Record<string, string | undefined>

const GEMINI_MODELS: Record<AIWorkload, string[]> = {
  reasoning: ['gemini-3.1-pro-preview', 'gemini-pro-latest'],
  draft: ['gemini-3.8-flash', 'gemini-flash-latest'],
  vision: ['gemini-3.1-pro-preview', 'gemini-3.8-flash'],
  visual_fidelity: ['gemini-3.1-pro-preview', 'gemini-3.8-flash'],
  image_generation: ['gemini-3-pro-image', 'gemini-3.1-flash-image'],
  search: ['gemini-3.1-pro-preview', 'gemini-pro-latest'],
}

function unique(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, all) => all.indexOf(value) === index)
}

export function modelNamesForProvider(
  provider: string,
  workload: AIWorkload,
  env: Env = process.env
): string[] {
  if (provider === 'gemini') {
    const override = workload === 'reasoning'
      ? env.GEMINI_REASONING_MODEL
      : workload === 'draft'
        ? env.GEMINI_DRAFT_MODEL
        : workload === 'search'
          ? env.GEMINI_SEARCH_MODEL
          : workload === 'image_generation'
            ? env.GEMINI_IMAGE_MODEL
            : env.GEMINI_VISION_MODEL
    return unique([override, ...GEMINI_MODELS[workload]])
  }
  if (provider === 'claude') return unique([env.ANTHROPIC_MODEL, 'claude-sonnet-4-20250514'])
  if (provider === 'groq') return unique([env.GROQ_MODEL, 'openai/gpt-oss-120b'])
  if (provider === 'openai') return unique([env.OPENAI_MODEL, workload === 'draft' ? 'gpt-4o-mini' : 'gpt-4o'])
  return []
}

function specs(provider: AIProvider, models: string[], workload: AIWorkload): AIModelSpec[] {
  const visual = workload === 'vision' || workload === 'visual_fidelity'
  const image = workload === 'image_generation'
  const tier: AIModelTier = image ? 'image' : visual ? 'vision' : workload === 'draft' ? 'draft' : 'reasoning'
  return models.map(model => ({
    provider,
    model,
    capabilities: {
      json: !image,
      vision: provider === 'gemini' || provider === 'openai' || provider === 'claude',
      imageGeneration: provider === 'gemini' && image,
      grounding: provider === 'gemini' && workload === 'search',
    },
    tier,
  }))
}

export function modelsForTask(workload: AIWorkload, env: Env = process.env): AIModelSpec[] {
  if (workload === 'image_generation') {
    return env.GEMINI_API_KEY ? specs('gemini', modelNamesForProvider('gemini', workload, env), workload) : []
  }
  if (workload === 'vision' || workload === 'visual_fidelity') {
    return [
      ...(env.GEMINI_API_KEY ? specs('gemini', modelNamesForProvider('gemini', workload, env), workload) : []),
      ...(env.OPENAI_API_KEY ? specs('openai', modelNamesForProvider('openai', workload, env), workload) : []),
      ...(env.ANTHROPIC_API_KEY ? specs('claude', modelNamesForProvider('claude', workload, env), workload) : []),
    ].filter(model => model.capabilities.vision)
  }
  if (workload === 'draft') {
    return [
      ...(env.GEMINI_API_KEY ? specs('gemini', modelNamesForProvider('gemini', workload, env), workload) : []),
      ...(env.GROQ_API_KEY ? specs('groq', modelNamesForProvider('groq', workload, env), workload) : []),
    ]
  }
  return [
    ...(env.GEMINI_API_KEY ? specs('gemini', modelNamesForProvider('gemini', workload, env), workload) : []),
    ...(env.ANTHROPIC_API_KEY ? specs('claude', modelNamesForProvider('claude', workload, env), workload) : []),
    ...(env.GROQ_API_KEY ? specs('groq', modelNamesForProvider('groq', workload, env), workload) : []),
  ]
}
