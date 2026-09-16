import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generate } from '../ai'
import { runTask, reasoningEngineStatus } from '../ai-router'
import { clearAIMemoryCache } from '../ai-cache'
import { searchWeb } from '../websearch'
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('No DB in cost policy tests') } }))

describe('explicit Groq-only text cost policy', () => {
  beforeEach(() => {
    clearAIMemoryCache()
    vi.stubEnv('ASSERTIVE_TEXT_PROVIDER', 'groq')
    vi.stubEnv('GROQ_API_KEY', 'test-groq')
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude')
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it.each(['identify_product', 'title_draft'] as const)('routes %s only to Groq even when paid keys exist', async task => {
    const calls = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({choices:[{message:{content:'{"title":"Produto factual"}'}}]}), {status:200}))
    const result = await runTask(task, null, 'JSON only', 'product', {json:true})
    expect(result.provider).toBe('groq')
    expect(calls).toHaveBeenCalledOnce()
    expect(String(calls.mock.calls[0][0])).toBe('https://api.groq.com/openai/v1/chat/completions')
  })

  it('never falls back to a paid provider on a Groq quota error', async () => {
    const calls = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('quota exceeded', {status:429}))
    await expect(generate(null, 'system', 'product')).rejects.toThrow('429')
    expect(calls.mock.calls.length).toBeGreaterThan(0)
    expect(calls.mock.calls.every(([url]) => String(url).startsWith('https://api.groq.com/'))).toBe(true)
  })

  it('reports the engine actually selected by the cost policy', () => {
    expect(reasoningEngineStatus().engine).toBe('groq')
  })

  it('keeps image understanding on a vision-capable provider', async () => {
    const calls = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'image result'}}]}), {status:200}))
    const result = await generate(null, 'system', 'photo', { images:['data:image/png;base64,YQ=='] })
    expect(result.provider).toBe('gemini')
    expect(String(calls.mock.calls[0][0])).toContain('generativelanguage.googleapis.com')
  })

  it('does not call paid grounding when supplemental web search is disabled', async () => {
    vi.stubEnv('ASSERTIVE_WEB_SEARCH_ENABLED', 'false')
    const calls = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}',{status:200}))
    const result = await searchWeb('produto')
    expect(result.available).toBe(false)
    expect(result.unavailable_reason).toContain('economia')
    expect(calls).not.toHaveBeenCalled()
  })
})
