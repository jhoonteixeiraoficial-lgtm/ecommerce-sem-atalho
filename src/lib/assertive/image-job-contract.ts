import type { ImagePlanStep } from './generator'
import type { PhotoRole } from './photos'

export type ImageJobKind = 'REFERENCE_SEARCH' | 'GENERATE_SLOT'
export type ImageJobStatus = 'QUEUED' | 'RUNNING' | 'RETRYABLE' | 'REVIEW' | 'SUCCEEDED' | 'FAILED' | 'DISMISSED'

export interface ImageJobShot {
  title?: string
  description?: string
  required?: boolean
  [key: string]: unknown
}

export interface ImageJob {
  id: string
  user_id: string
  analysis_id: string
  listing_id: string
  kind: ImageJobKind
  position: number | null
  role: PhotoRole | null
  shot: ImageJobShot
  status: ImageJobStatus
  reference_asset_ids: string[]
  output_asset_id: string | null
  generation_nonce: string
  attempt_count: number
  max_attempts: number
  next_attempt_at: string | null
  lock_token: string | null
  locked_at: string | null
  error_code: string | null
  error_message: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ProgressiveImageSlotPlan {
  position: number
  role: PhotoRole
  shot: {
    title: string
    description: string
    required: boolean
  }
}

export interface ImageJobSlot {
  position: number
  role: PhotoRole
  title: string
  description: string
  required: boolean
  status: ImageJobStatus
  asset_id: string | null
  preview_url: string | null
  attempts: number
  error_code: string | null
  error_message: string | null
  auto_verdict: 'ACCEPT' | 'REVIEW' | null
  manual: boolean
}

export interface ImageJobSnapshot {
  listing_id: string
  target_count: 6
  ready_count: number
  visible_count: number
  active_count: number
  reference_status: ImageJobStatus
  reference_count: number
  reference_origins: string[]
  runnable: boolean
  slots: ImageJobSlot[]
}

export interface ImageJobRunResult {
  snapshot: ImageJobSnapshot
  processed_kind: ImageJobKind | null
  processed_position: number | null
}

const DEFAULT_SLOTS: ProgressiveImageSlotPlan[] = [
  {
    position: 0,
    role: 'MAIN',
    shot: {
      title: 'Foto principal',
      description: 'Produto inteiro, centralizado, quadrado e com fundo branco puro',
      required: true,
    },
  },
  {
    position: 1,
    role: 'DETAIL',
    shot: {
      title: 'Detalhe funcional',
      description: 'Primeiro detalhe funcional ou acabamento visível nas referências',
      required: true,
    },
  },
  {
    position: 2,
    role: 'DETAIL',
    shot: {
      title: 'Segundo detalhe',
      description: 'Segundo detalhe ou ângulo comprovado por outra referência',
      required: true,
    },
  },
  {
    position: 3,
    role: 'LIFESTYLE',
    shot: {
      title: 'Produto em uso',
      description: 'Primeiro ambiente coerente sem sugerir acessórios inclusos',
      required: false,
    },
  },
  {
    position: 4,
    role: 'LIFESTYLE',
    shot: {
      title: 'Contexto complementar',
      description: 'Segundo contexto de uso com elementos ambientais separados',
      required: false,
    },
  },
  {
    position: 5,
    role: 'INFORMATIONAL',
    shot: {
      title: 'Vista técnica segura',
      description: 'Enquadramento complementar somente com partes comprovadas nas referências',
      required: false,
    },
  },
]

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function buildProgressiveImageSlots(
  imagePlan: ImagePlanStep[] = [],
  facts: Array<{ label: string; value: string }> = []
): ProgressiveImageSlotPlan[] {
  const byOrder = new Map(
    imagePlan
      .filter(step => Number.isInteger(step.order) && step.order >= 1 && step.order <= 6)
      .map(step => [step.order, step])
  )
  const evidence = normalized(facts.map(fact => `${fact.label} ${fact.value}`).join(' '))
  const packagingSupported = /embalagem|conteudo|inclui|caixa original|\bkit\b/.test(evidence)

  return DEFAULT_SLOTS.map(defaultSlot => {
    const requested = byOrder.get(defaultSlot.position + 1)
    const title = clean(requested?.title, 100)
    const description = clean(requested?.description, 400)
    const requestedText = normalized(`${title} ${description}`)
    const requestsPackaging = /embalagem|conteudo|caixa|acessorio|inclus/.test(requestedText)
    const requestsUnsupportedMeasurement = /medida|dimens(?:ao|oes)|altura|largura|comprimento|peso/.test(requestedText)
      && !/medida|dimens(?:ao|oes)|altura|largura|comprimento|peso|\b(mm|cm|m|g|kg)\b/.test(evidence)
    const unsafe = requestsUnsupportedMeasurement || (requestsPackaging && !packagingSupported)
    const useRequested = Boolean(title && description && !unsafe)
    const role = defaultSlot.position === 5 && useRequested && requestsPackaging
      ? 'PACKAGING'
      : defaultSlot.role

    return {
      position: defaultSlot.position,
      role,
      shot: {
        title: useRequested ? title : defaultSlot.shot.title,
        description: useRequested ? description : defaultSlot.shot.description,
        required: defaultSlot.shot.required,
      },
    }
  })
}
