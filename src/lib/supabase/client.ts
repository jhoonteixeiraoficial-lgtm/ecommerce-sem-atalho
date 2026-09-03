import { createBrowserClient } from '@supabase/ssr'

const AUTH_UNAVAILABLE_MESSAGE = 'Serviço de autenticação indisponível. Tente novamente mais tarde.'
const FALLBACK_URL = 'http://127.0.0.1:54321'
const FALLBACK_KEY = 'public-anon-key'

function isConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  return !!(url && key && !url.includes('sua_url') && !key.includes('sua_chave'))
}

export function createClient() {
  const configured = isConfigured()
  return createBrowserClient(
    configured ? process.env.NEXT_PUBLIC_SUPABASE_URL! : FALLBACK_URL,
    configured ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! : FALLBACK_KEY,
  )
}

export async function runBrowserAuthOperation<T>(
  operation: (client: ReturnType<typeof createClient>) => Promise<T>,
): Promise<{ result: T | null; error: string | null }> {
  if (!isConfigured()) {
    return { result: null, error: AUTH_UNAVAILABLE_MESSAGE }
  }

  try {
    return { result: await operation(createClient()), error: null }
  } catch {
    return { result: null, error: AUTH_UNAVAILABLE_MESSAGE }
  }
}
