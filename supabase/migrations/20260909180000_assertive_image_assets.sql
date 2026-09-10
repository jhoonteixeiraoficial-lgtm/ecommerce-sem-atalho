CREATE TABLE IF NOT EXISTS assertive_image_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  analysis_id UUID REFERENCES assertive_analyses(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ORIGINAL_EVIDENCE','SOURCE_REFERENCE','DERIVED','GENERATED_SCENE','PUBLICATION_RENDITION')),
  origin TEXT NOT NULL CHECK (origin IN ('USER_UPLOAD','ML_OWN_ITEM','ML_CATALOG','COMPETITOR')),
  rights_status TEXT NOT NULL CHECK (rights_status IN ('USER_OWNED','SELLER_OWNED_CONFIRMED','LICENSED','REFERENCE_ONLY','UNKNOWN')),
  storage_bucket TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  public_url TEXT,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INT NOT NULL CHECK (width > 0),
  height INT NOT NULL CHECK (height > 0),
  byte_size INT NOT NULL CHECK (byte_size > 0),
  parent_asset_id UUID REFERENCES assertive_image_assets(id),
  provider TEXT,
  model TEXT,
  fidelity_status TEXT CHECK (fidelity_status IN ('ACCEPT','REVIEW','REJECT')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_key),
  CHECK (kind IN ('ORIGINAL_EVIDENCE','SOURCE_REFERENCE') OR parent_asset_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS assertive_image_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  analysis_id UUID REFERENCES assertive_analyses(id) ON DELETE SET NULL,
  input_asset_id UUID REFERENCES assertive_image_assets(id) NOT NULL,
  output_asset_id UUID REFERENCES assertive_image_assets(id),
  operation TEXT NOT NULL CHECK (operation IN ('NORMALIZE','AI_ENHANCE','AI_SCENE','FIDELITY_CHECK')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','REJECTED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider TEXT,
  model TEXT,
  attempt_count INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6),
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assertive_listing_images (
  listing_id UUID REFERENCES assertive_listings(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES assertive_image_assets(id) NOT NULL,
  position INT NOT NULL CHECK (position >= 0),
  role TEXT NOT NULL,
  shot_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, asset_id),
  UNIQUE (listing_id, position)
);

ALTER TABLE assertive_image_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_image_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assertive_listing_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assertive image assets owner read" ON assertive_image_assets;
CREATE POLICY "assertive image assets owner read" ON assertive_image_assets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "assertive image operations owner read" ON assertive_image_operations;
CREATE POLICY "assertive image operations owner read" ON assertive_image_operations
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "assertive listing images owner read" ON assertive_listing_images;
CREATE POLICY "assertive listing images owner read" ON assertive_listing_images
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM assertive_listings listing
    WHERE listing.id = listing_id AND listing.user_id = auth.uid()
  ));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('assertive-originals', 'assertive-originals', false, 12582912, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "assertive originals owner read" ON storage.objects;
CREATE POLICY "assertive originals owner read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'assertive-originals'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE INDEX IF NOT EXISTS assertive_image_assets_user_idx ON assertive_image_assets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assertive_image_assets_parent_idx ON assertive_image_assets(parent_asset_id);
CREATE INDEX IF NOT EXISTS assertive_image_operations_analysis_idx ON assertive_image_operations(analysis_id, created_at DESC);

CREATE OR REPLACE FUNCTION assertive_replace_listing_images(
  p_listing_id UUID,
  p_user_id UUID,
  p_images JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  image_count INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM assertive_listings
    WHERE id = p_listing_id AND user_id = p_user_id AND status <> 'published'
  ) THEN
    RAISE EXCEPTION 'Anúncio não encontrado ou não editável.';
  END IF;

  IF p_images IS NULL OR jsonb_typeof(p_images) <> 'array' THEN
    RAISE EXCEPTION 'Galeria inválida.';
  END IF;
  image_count := jsonb_array_length(p_images);
  IF image_count > 12 THEN RAISE EXCEPTION 'A galeria excede 12 imagens.'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_images) AS requested(asset_id UUID, position INT, role TEXT, shot_type TEXT)
    LEFT JOIN assertive_image_assets asset ON asset.id = requested.asset_id AND asset.user_id = p_user_id
    WHERE requested.position IS NULL
      OR requested.position < 0
      OR requested.role IS NULL
      OR requested.role NOT IN ('MAIN','DETAIL','PACKAGING','LIFESTYLE','INFORMATIONAL')
      OR asset.id IS NULL
      OR asset.origin = 'COMPETITOR'
      OR asset.rights_status NOT IN ('USER_OWNED','SELLER_OWNED_CONFIRMED','LICENSED')
      OR asset.kind = 'ORIGINAL_EVIDENCE'
      OR asset.parent_asset_id IS NULL
      OR asset.public_url IS NULL
      OR asset.fidelity_status IS DISTINCT FROM 'ACCEPT'
  ) THEN
    RAISE EXCEPTION 'Imagem sem origem, direito ou fidelidade aprovados.';
  END IF;

  IF image_count <> (
    SELECT COUNT(DISTINCT requested.position)
    FROM jsonb_to_recordset(p_images) AS requested(asset_id UUID, position INT, role TEXT, shot_type TEXT)
  ) OR image_count <> (
    SELECT COUNT(DISTINCT requested.asset_id)
    FROM jsonb_to_recordset(p_images) AS requested(asset_id UUID, position INT, role TEXT, shot_type TEXT)
  ) THEN
    RAISE EXCEPTION 'Assets e posições da galeria precisam ser únicos.';
  END IF;

  DELETE FROM assertive_listing_images WHERE listing_id = p_listing_id;
  INSERT INTO assertive_listing_images (listing_id, asset_id, position, role, shot_type)
  SELECT p_listing_id, requested.asset_id, requested.position, requested.role, requested.shot_type
  FROM jsonb_to_recordset(p_images) AS requested(asset_id UUID, position INT, role TEXT, shot_type TEXT);

  UPDATE assertive_listings listing
  SET photos = COALESCE((
        SELECT jsonb_agg(asset.public_url ORDER BY linked.position)
        FROM assertive_listing_images linked
        JOIN assertive_image_assets asset ON asset.id = linked.asset_id
        WHERE linked.listing_id = p_listing_id
      ), '[]'::jsonb),
      attributes = jsonb_set(
        COALESCE(listing.attributes, '{}'::jsonb),
        '{photo_metadata}',
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'asset_id', asset.id,
            'parent_asset_id', asset.parent_asset_id,
            'url', asset.public_url,
            'role', linked.role,
            'source', CASE WHEN asset.provider = 'gemini' THEN 'AI_ENHANCED' ELSE 'USER' END,
            'source_ref', asset.parent_asset_id,
            'score', CASE WHEN asset.provider = 'gemini' THEN 220 ELSE 210 - linked.position END,
            'ai_enhanced', asset.provider = 'gemini',
            'fidelity_status', asset.fidelity_status,
            'label', CASE WHEN asset.provider = 'gemini' THEN 'Melhorada por IA' ELSE 'Original normalizada' END,
            'position', linked.position
          ) ORDER BY linked.position)
          FROM assertive_listing_images linked
          JOIN assertive_image_assets asset ON asset.id = linked.asset_id
          WHERE linked.listing_id = p_listing_id
        ), '[]'::jsonb),
        true
      ),
      validation = '{}'::jsonb,
      validated_payload = NULL,
      validated_payload_hash = NULL,
      status = CASE
        WHEN listing.status = 'ready_to_publish' OR listing.validated_payload IS NOT NULL THEN 'ready'
        ELSE listing.status
      END,
      updated_at = now()
  WHERE listing.id = p_listing_id AND listing.user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION assertive_replace_listing_images(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION assertive_replace_listing_images(UUID, UUID, JSONB) TO service_role;
