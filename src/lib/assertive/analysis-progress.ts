import type { ObservedStage } from './observability'

export const PIPELINE_PROGRESS_STEPS: ReadonlyArray<{ key: ObservedStage; label: string }> = [
  { key: 'research', label: 'Pesquisando o Mercado Livre' },
  { key: 'dna', label: 'Analisando referências competitivas' },
  { key: 'category_schema', label: 'Carregando a ficha técnica oficial' },
  { key: 'generation', label: 'Criando título e descrição' },
  { key: 'pricing', label: 'Definindo a estratégia de preço' },
  { key: 'attribute_autofill', label: 'Preenchendo a ficha técnica' },
  { key: 'photos', label: 'Validando as fotos do produto' },
  { key: 'preflight', label: 'Validando o payload no Mercado Livre' },
]

export interface PipelineProgressEvent {
  stage: ObservedStage
  event: 'started' | 'completed' | 'failed' | 'retry' | 'fallback'
  duration_ms?: number | null
  error_code?: string | null
  error_message?: string | null
}

export interface PipelineProgress {
  activeIndex: number
  label: string
  event: PipelineProgressEvent['event'] | 'pending'
  duration_ms?: number | null
  error_message?: string | null
}

export function getPipelineProgress(events: PipelineProgressEvent[], status: string): PipelineProgress {
  const latest = events[0]
  if (latest) {
    const eventIndex = PIPELINE_PROGRESS_STEPS.findIndex(step => step.key === latest.stage)
    if (eventIndex >= 0) {
      const activeIndex = latest.event === 'completed'
        ? Math.min(eventIndex + 1, PIPELINE_PROGRESS_STEPS.length - 1)
        : eventIndex
      return {
        activeIndex,
        label: PIPELINE_PROGRESS_STEPS[activeIndex].label,
        event: latest.event,
        duration_ms: latest.duration_ms,
        error_message: latest.error_message,
      }
    }
  }

  const fallbackStage: ObservedStage = status === 'researching'
    ? 'research'
    : status === 'analyzing'
      ? 'dna'
      : status === 'validating'
        ? 'preflight'
        : 'generation'
  const activeIndex = PIPELINE_PROGRESS_STEPS.findIndex(step => step.key === fallbackStage)
  return { activeIndex, label: PIPELINE_PROGRESS_STEPS[activeIndex].label, event: 'pending' }
}
