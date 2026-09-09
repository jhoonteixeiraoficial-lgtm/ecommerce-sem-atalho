import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { observeAnalysisStage, type AnalysisStageEvent } from '../observability'

describe('Assertive stage observability', () => {
  it('registra início, conclusão e duração sem alterar o resultado', async () => {
    const events: AnalysisStageEvent[] = []
    const times = [100, 145]

    const result = await observeAnalysisStage(
      { analysis_id: 'analysis-1', user_id: 'user-1', stage: 'research', metadata: { attempt: 1 } },
      async () => 'ok',
      { write: async event => { events.push(event) }, now: () => times.shift()! }
    )

    expect(result).toBe('ok')
    expect(events).toEqual([
      expect.objectContaining({ event: 'started', stage: 'research' }),
      expect.objectContaining({ event: 'completed', stage: 'research', duration_ms: 45 }),
    ])
  })

  it('registra falha tipada e relança o erro original', async () => {
    const events: AnalysisStageEvent[] = []
    const error = Object.assign(new Error('Mercado Livre indisponível'), { code: 'ML_UNAVAILABLE' })
    const times = [10, 30]

    await expect(observeAnalysisStage(
      { analysis_id: 'analysis-1', user_id: 'user-1', stage: 'preflight' },
      async () => { throw error },
      { write: async event => { events.push(event) }, now: () => times.shift()! }
    )).rejects.toBe(error)

    expect(events.at(-1)).toMatchObject({
      event: 'failed', duration_ms: 20, error_code: 'ML_UNAVAILABLE', error_message: 'Mercado Livre indisponível',
    })
  })

  it('não derruba o pipeline quando apenas a telemetria falha', async () => {
    const task = vi.fn().mockResolvedValue('resultado')
    const result = await observeAnalysisStage(
      { analysis_id: 'analysis-1', user_id: 'user-1', stage: 'generation' },
      task,
      { write: async () => { throw new Error('database unavailable') } }
    )

    expect(result).toBe('resultado')
    expect(task).toHaveBeenCalledOnce()
  })

  it('possui migration com isolamento e índice por análise', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260909_assertive_stage_events.sql'),
      'utf8'
    )

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.assertive_stage_events')
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('analysis_id, created_at')
  })
})
