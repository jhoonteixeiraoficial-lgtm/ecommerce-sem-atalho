import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient, runBrowserAuthOperation } from './client'

describe('browser Supabase configuration fallback', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey
  })

  it('creates a render-safe client when public configuration is absent', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    expect(() => createClient()).not.toThrow()
  })

  it('fails auth operations with a generic message without invoking Supabase', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const operation = vi.fn().mockRejectedValue(new Error('internal endpoint and key details'))

    await expect(runBrowserAuthOperation(operation)).resolves.toEqual({
      result: null,
      error: 'Serviço de autenticação indisponível. Tente novamente mais tarde.',
    })
    expect(operation).not.toHaveBeenCalled()
  })
})
