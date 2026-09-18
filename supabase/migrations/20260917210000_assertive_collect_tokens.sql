-- Coletor do navegador: token por usuário para o userscript enviar páginas
-- do Mercado Livre que o PRÓPRIO usuário visita (coleta passiva) para o app.
-- O token autentica apenas no NOSSO app; nunca toca em credenciais do ML.
CREATE TABLE IF NOT EXISTS public.assertive_collect_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ
);

ALTER TABLE public.assertive_collect_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.assertive_collect_tokens FROM PUBLIC, anon, authenticated;

CREATE POLICY collect_tokens_service_only
  ON public.assertive_collect_tokens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
