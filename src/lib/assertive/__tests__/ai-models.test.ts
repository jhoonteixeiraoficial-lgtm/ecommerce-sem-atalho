import { describe, expect, it } from 'vitest'
import { modelsForTask } from '../ai-models'

describe('task-aware AI model registry', () => {
  it('seleciona apenas modelos com visão para conferir fidelidade visual', () => {
    const models = modelsForTask('visual_fidelity', { GEMINI_API_KEY: 'configured' })

    expect(models.length).toBeGreaterThan(0)
    expect(models.every(model => model.capabilities.vision)).toBe(true)
  })

  it('nunca envia trabalho visual para fallback textual da Groq', () => {
    const models = modelsForTask('visual_fidelity', {
      GEMINI_API_KEY: 'configured',
      GROQ_API_KEY: 'configured',
    })

    expect(models.map(model => model.provider)).not.toContain('groq')
  })

  it('respeita overrides sem perder fallback validado', () => {
    const models = modelsForTask('reasoning', {
      GEMINI_API_KEY: 'configured',
      GEMINI_REASONING_MODEL: 'gemini-custom',
    })

    expect(models[0].model).toBe('gemini-custom')
    expect(models.some(model => model.model === 'gemini-3.1-pro-preview')).toBe(true)
  })
})
