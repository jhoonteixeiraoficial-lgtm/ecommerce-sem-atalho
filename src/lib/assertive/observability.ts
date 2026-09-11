export type ObservedStage =
  | 'identity'
  | 'research'
  | 'category_schema'
  | 'dna'
  | 'attribute_autofill'
  | 'photos'
  | 'image_enhancement'
  | 'image_generation'
  | 'generation'
  | 'pricing'
  | 'preflight'

export interface AnalysisStageEvent {
  analysis_id: string
  user_id: string
  stage: ObservedStage
  event: 'started' | 'completed' | 'failed' | 'retry' | 'fallback'
  duration_ms?: number
  error_code?: string
  error_message?: string
  metadata?: Record<string, unknown>
}

interface ObserveOptions {
  write?: (event: AnalysisStageEvent) => Promise<void>
  now?: () => number
}

async function persistAnalysisStageEvent(event: AnalysisStageEvent): Promise<void> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { error } = await createAdminClient()
    .from('assertive_stage_events')
    .insert({
      ...event,
      duration_ms: event.duration_ms == null ? null : Math.max(0, Math.round(event.duration_ms)),
      error_message: event.error_message?.slice(0, 1000),
    })
  if (error) throw new Error(`Falha ao registrar estágio: ${error.message}`)
}

export async function recordAnalysisStageEvent(event: AnalysisStageEvent): Promise<boolean> {
  try {
    await persistAnalysisStageEvent(event)
    return true
  } catch {
    return false
  }
}

function errorDetails(error: unknown): { error_code: string; error_message: string } {
  const value = error as { code?: unknown; name?: unknown; message?: unknown }
  const code = typeof value?.code === 'string' && value.code.trim()
    ? value.code.trim().slice(0, 100)
    : typeof value?.name === 'string' && value.name !== 'Error'
      ? value.name.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase().slice(0, 100)
      : 'UNEXPECTED_ERROR'
  return {
    error_code: code,
    error_message: error instanceof Error ? error.message : String(error || 'Falha desconhecida'),
  }
}

export async function observeAnalysisStage<T>(
  context: Omit<AnalysisStageEvent, 'event' | 'duration_ms' | 'error_code' | 'error_message'>,
  task: () => Promise<T>,
  options: ObserveOptions = {}
): Promise<T> {
  const now = options.now || Date.now
  const write = options.write || persistAnalysisStageEvent
  const safeWrite = async (event: AnalysisStageEvent) => {
    try {
      await write(event)
    } catch {
      // Telemetria nunca pode derrubar a operação observada.
    }
  }
  const startedAt = now()
  await safeWrite({ ...context, event: 'started' })
  try {
    const result = await task()
    await safeWrite({ ...context, event: 'completed', duration_ms: now() - startedAt })
    return result
  } catch (error) {
    await safeWrite({
      ...context,
      event: 'failed',
      duration_ms: now() - startedAt,
      ...errorDetails(error),
    })
    throw error
  }
}
