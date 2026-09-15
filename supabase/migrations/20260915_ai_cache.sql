-- Migration: 20260915_ai_cache.sql
-- Adiciona tabela de cache para chamadas de IA (Gemini/Claude)
-- Reduz custos evitando chamadas duplicadas para prompts idênticos

CREATE TABLE IF NOT EXISTS public.assertive_ai_cache (
    cache_key TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para limpeza eficiente de expirados
CREATE INDEX IF NOT EXISTS idx_assertive_ai_cache_expires_at
    ON public.assertive_ai_cache (expires_at);

-- RLS: apenas service role pode acessar (cache é interno do sistema)
ALTER TABLE public.assertive_ai_cache ENABLE ROW LEVEL SECURITY;

-- Policy: apenas service role
CREATE POLICY "Service role only" ON public.assertive_ai_cache
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- Função para limpar cache expirado (pode ser chamada via cron job)
CREATE OR REPLACE FUNCTION public.cleanup_ai_cache()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
    DELETE FROM public.assertive_ai_cache
    WHERE expires_at < NOW();
$$;

-- Comentário na tabela
COMMENT ON TABLE public.assertive_ai_cache IS
'Cache persistente para respostas de IA (Gemini/Claude).
Chave = hash(task + prompt + opções relevantes).
TTL padrão: 1h (reasoning/draft), 24h (vision).
Persistido apenas para tarefas idempotentes (identify, dna, enrichment, drafts).';