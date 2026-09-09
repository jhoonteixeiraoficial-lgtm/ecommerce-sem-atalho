import { describe, expect, it } from 'vitest'
import { getPipelineProgress, PIPELINE_PROGRESS_STEPS } from '../analysis-progress'

describe('analysis progress projection', () => {
  it('usa o evento persistido mais recente em vez de avanço por temporizador', () => {
    const progress = getPipelineProgress([
      { stage: 'attribute_autofill', event: 'started' },
      { stage: 'generation', event: 'completed', duration_ms: 1200 },
    ], 'generating')

    expect(progress).toMatchObject({
      activeIndex: PIPELINE_PROGRESS_STEPS.findIndex(step => step.key === 'attribute_autofill'),
      label: 'Preenchendo a ficha técnica',
      event: 'started',
    })
  })

  it('mantém fallback pelo status enquanto ainda não há eventos', () => {
    expect(getPipelineProgress([], 'analyzing').activeIndex).toBe(
      PIPELINE_PROGRESS_STEPS.findIndex(step => step.key === 'dna')
    )
  })
})
