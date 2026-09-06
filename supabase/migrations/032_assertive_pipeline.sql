-- Assertive E-commerce IA — pipeline real (ProductTruth, research, DNA, validação)
-- Seguro: apenas adiciona colunas/tabelas, não destrói dados existentes.

-- ============ analyses ============
ALTER TABLE assertive_analyses ADD COLUMN IF NOT EXISTS product_truth JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assertive_analyses ADD COLUMN IF NOT EXISTS research JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assertive_analyses ADD COLUMN IF NOT EXISTS dna JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assertive_analyses ADD COLUMN IF NOT EXISTS domain_id TEXT;
ALTER TABLE assertive_analyses ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE assertive_analyses ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;

-- status real do pipeline
ALTER TABLE assertive_analyses DROP CONSTRAINT IF EXISTS assertive_analyses_status_check;
ALTER TABLE assertive_analyses ADD CONSTRAINT assertive_analyses_status_check
  CHECK (status IN (
    'input','identifying','researching','analyzing','generating',
    'needs_input','ready','validating','ready_to_publish',
    'publishing','published','failed',
    -- legado
    'pending','error'
  ));

-- ============ listings ============
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS family_name TEXT;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS validation JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS completeness JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS scores JSONB DEFAULT '{}'::jsonb;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS image_plan JSONB DEFAULT '[]'::jsonb;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS ml_permalink TEXT;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS available_quantity INT DEFAULT 1;
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS listing_type_id TEXT DEFAULT 'gold_special';
ALTER TABLE assertive_listings ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'new';

ALTER TABLE assertive_listings DROP CONSTRAINT IF EXISTS assertive_listings_status_check;
ALTER TABLE assertive_listings ADD CONSTRAINT assertive_listings_status_check
  CHECK (status IN ('draft','needs_input','ready','validating','ready_to_publish','publishing','published','failed','error'));

-- ============ cache de dados do Mercado Livre ============
CREATE TABLE IF NOT EXISTS assertive_ml_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assertive_ml_cache_expires ON assertive_ml_cache (expires_at);

ALTER TABLE assertive_ml_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only" ON assertive_ml_cache;
CREATE POLICY "service role only" ON assertive_ml_cache
  FOR ALL USING (false) WITH CHECK (false);

-- ============ PKCE / state do OAuth ============
CREATE TABLE IF NOT EXISTS assertive_oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);
ALTER TABLE assertive_oauth_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role only" ON assertive_oauth_states;
CREATE POLICY "service role only" ON assertive_oauth_states
  FOR ALL USING (false) WITH CHECK (false);

-- ============ índices de performance (2k usuários) ============
CREATE INDEX IF NOT EXISTS idx_assertive_analyses_user_created
  ON assertive_analyses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assertive_listings_analysis
  ON assertive_listings (analysis_id);
CREATE INDEX IF NOT EXISTS idx_assertive_listings_user_status
  ON assertive_listings (user_id, status);

-- ============ storage bucket dedicado ============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assertive', 'assertive', true, 15728640,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 15728640,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'];

-- leitura pública (o Mercado Livre precisa baixar as imagens do anúncio)
DROP POLICY IF EXISTS "assertive public read" ON storage.objects;
CREATE POLICY "assertive public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'assertive');

-- escrita apenas na própria pasta do usuário
DROP POLICY IF EXISTS "assertive owner write" ON storage.objects;
CREATE POLICY "assertive owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'assertive' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "assertive owner delete" ON storage.objects;
CREATE POLICY "assertive owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'assertive' AND (storage.foldername(name))[1] = auth.uid()::text);
