ALTER TABLE public.assertive_image_assets
  DROP CONSTRAINT IF EXISTS assertive_image_assets_origin_check;

ALTER TABLE public.assertive_image_assets
  ADD CONSTRAINT assertive_image_assets_origin_check
  CHECK (origin IN (
    'USER_UPLOAD',
    'ML_OWN_ITEM',
    'ML_CATALOG',
    'COMPETITOR',
    'WEB_REFERENCE',
    'AI_GENERATED'
  ));

CREATE TABLE IF NOT EXISTS public.assertive_image_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_id UUID NOT NULL REFERENCES public.assertive_analyses(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.assertive_listings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('REFERENCE_SEARCH', 'GENERATE_SLOT')),
  position INT CHECK (position BETWEEN 0 AND 5),
  role TEXT CHECK (role IN ('MAIN', 'DETAIL', 'PACKAGING', 'LIFESTYLE', 'INFORMATIONAL')),
  shot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED',
    'RUNNING',
    'RETRYABLE',
    'REVIEW',
    'SUCCEEDED',
    'FAILED',
    'DISMISSED'
  )),
  reference_asset_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  output_asset_id UUID REFERENCES public.assertive_image_assets(id) ON DELETE SET NULL,
  generation_nonce UUID NOT NULL DEFAULT gen_random_uuid(),
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  next_attempt_at TIMESTAMPTZ,
  lock_token UUID,
  locked_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'REFERENCE_SEARCH' AND position IS NULL AND role IS NULL)
    OR (kind = 'GENERATE_SLOT' AND position IS NOT NULL AND role IS NOT NULL)
  ),
  CHECK (status <> 'RUNNING' OR (lock_token IS NOT NULL AND locked_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS assertive_image_jobs_reference_unique
  ON public.assertive_image_jobs(listing_id)
  WHERE kind = 'REFERENCE_SEARCH';

CREATE UNIQUE INDEX IF NOT EXISTS assertive_image_jobs_listing_slot_unique
  ON public.assertive_image_jobs(listing_id, position)
  WHERE kind = 'GENERATE_SLOT';

CREATE INDEX IF NOT EXISTS assertive_image_jobs_claim_idx
  ON public.assertive_image_jobs(listing_id, status, next_attempt_at, position);

ALTER TABLE public.assertive_image_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assertive image jobs owner read" ON public.assertive_image_jobs;
CREATE POLICY "assertive image jobs owner read"
  ON public.assertive_image_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.assertive_image_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.assertive_image_jobs TO authenticated;
GRANT ALL ON TABLE public.assertive_image_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.assertive_validate_image_job_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.assertive_listings AS listing
    JOIN public.assertive_analyses AS analysis
      ON analysis.id = listing.analysis_id
    WHERE listing.id = NEW.listing_id
      AND listing.user_id = NEW.user_id
      AND listing.analysis_id = NEW.analysis_id
      AND analysis.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Assertive image job ownership rejected' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.assertive_validate_image_job_owner() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_validate_image_job_owner() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS assertive_image_jobs_owner_guard ON public.assertive_image_jobs;
CREATE TRIGGER assertive_image_jobs_owner_guard
  BEFORE INSERT OR UPDATE OF user_id, analysis_id, listing_id
  ON public.assertive_image_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.assertive_validate_image_job_owner();

CREATE OR REPLACE FUNCTION public.assertive_claim_image_job(
  p_listing_id UUID,
  p_user_id UUID,
  p_lock_token UUID
) RETURNS SETOF public.assertive_image_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_listing_id IS NULL OR p_user_id IS NULL OR p_lock_token IS NULL THEN
    RAISE EXCEPTION 'Assertive image job claim rejected' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_listing_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.assertive_listings AS listing
    WHERE listing.id = p_listing_id
      AND listing.user_id = p_user_id
      AND listing.status NOT IN ('publishing', 'published')
  ) THEN
    RETURN;
  END IF;

  UPDATE public.assertive_image_jobs AS expired_job
  SET status = 'FAILED',
      next_attempt_at = NULL,
      lock_token = NULL,
      locked_at = NULL,
      error_code = 'IMAGE_WORKER_TIMEOUT',
      error_message = 'A última tentativa expirou antes de concluir.',
      updated_at = pg_catalog.now()
  WHERE expired_job.listing_id = p_listing_id
    AND expired_job.user_id = p_user_id
    AND expired_job.status = 'RUNNING'
    AND expired_job.attempt_count >= expired_job.max_attempts
    AND expired_job.locked_at < pg_catalog.now() - interval '3 minutes';

  RETURN QUERY
  WITH candidate AS (
    SELECT job.id
    FROM public.assertive_image_jobs AS job
    WHERE job.listing_id = p_listing_id
      AND job.user_id = p_user_id
      AND job.attempt_count < job.max_attempts
      AND (
        job.status = 'QUEUED'
        OR (
          job.status = 'RETRYABLE'
          AND COALESCE(job.next_attempt_at, pg_catalog.now()) <= pg_catalog.now()
        )
        OR (
          job.status = 'RUNNING'
          AND job.locked_at < pg_catalog.now() - interval '3 minutes'
        )
      )
      AND (
        job.kind = 'REFERENCE_SEARCH'
        OR (
          EXISTS (
            SELECT 1
            FROM public.assertive_image_jobs AS reference_job
            WHERE reference_job.listing_id = job.listing_id
              AND reference_job.user_id = job.user_id
              AND reference_job.kind = 'REFERENCE_SEARCH'
              AND reference_job.status = 'SUCCEEDED'
          )
          AND (
            SELECT count(*)
            FROM public.assertive_image_jobs AS active_job
            WHERE active_job.listing_id = job.listing_id
              AND active_job.user_id = job.user_id
              AND active_job.kind = 'GENERATE_SLOT'
              AND active_job.status = 'RUNNING'
              AND active_job.locked_at >= pg_catalog.now() - interval '3 minutes'
          ) < 2
        )
      )
    ORDER BY
      CASE WHEN job.kind = 'REFERENCE_SEARCH' THEN 0 ELSE 1 END,
      job.position NULLS FIRST,
      job.created_at,
      job.id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.assertive_image_jobs AS claimed
  SET status = 'RUNNING',
      attempt_count = claimed.attempt_count + 1,
      next_attempt_at = NULL,
      lock_token = p_lock_token,
      locked_at = pg_catalog.now(),
      error_code = NULL,
      error_message = NULL,
      updated_at = pg_catalog.now()
  FROM candidate
  WHERE claimed.id = candidate.id
  RETURNING claimed.*;
END;
$$;

ALTER FUNCTION public.assertive_claim_image_job(UUID, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_claim_image_job(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assertive_claim_image_job(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.assertive_complete_reference_job(
  p_job_id UUID,
  p_user_id UUID,
  p_lock_token UUID,
  p_asset_ids UUID[]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_job public.assertive_image_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL
    OR p_user_id IS NULL
    OR p_lock_token IS NULL
    OR p_asset_ids IS NULL
    OR pg_catalog.cardinality(p_asset_ids) NOT BETWEEN 1 AND 8
    OR pg_catalog.cardinality(p_asset_ids) <> (
      SELECT count(DISTINCT requested.asset_id)
      FROM pg_catalog.unnest(p_asset_ids) AS requested(asset_id)
    )
  THEN
    RAISE EXCEPTION 'Assertive reference completion rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT job.*
  INTO claimed_job
  FROM public.assertive_image_jobs AS job
  JOIN public.assertive_listings AS listing
    ON listing.id = job.listing_id
   AND listing.user_id = job.user_id
  WHERE job.id = p_job_id
    AND job.user_id = p_user_id
    AND job.kind = 'REFERENCE_SEARCH'
    AND job.status = 'RUNNING'
    AND job.lock_token = p_lock_token
    AND listing.status NOT IN ('publishing', 'published')
  FOR UPDATE OF job;

  IF NOT FOUND OR pg_catalog.cardinality(p_asset_ids) <> (
    SELECT count(*)
    FROM public.assertive_image_assets AS asset
    WHERE asset.id = ANY(p_asset_ids)
      AND asset.user_id = p_user_id
      AND (
        asset.analysis_id = claimed_job.analysis_id
        OR (
          asset.analysis_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.assertive_analyses AS analysis
            WHERE analysis.id = claimed_job.analysis_id
              AND analysis.user_id = p_user_id
              AND (analysis.input_data -> 'photo_asset_ids')
                @> pg_catalog.jsonb_build_array(asset.id::text)
          )
        )
      )
      AND (
        (
          asset.kind = 'SOURCE_REFERENCE'
          AND asset.rights_status IN ('REFERENCE_ONLY', 'SELLER_OWNED_CONFIRMED', 'LICENSED')
        )
        OR (
          asset.kind = 'ORIGINAL_EVIDENCE'
          AND asset.origin = 'USER_UPLOAD'
          AND asset.rights_status = 'USER_OWNED'
        )
        OR (
          asset.kind IN ('DERIVED', 'PUBLICATION_RENDITION')
          AND asset.origin = 'USER_UPLOAD'
          AND asset.rights_status IN ('USER_OWNED', 'SELLER_OWNED_CONFIRMED', 'LICENSED')
        )
      )
  ) THEN
    RAISE EXCEPTION 'Assertive reference completion rejected' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.assertive_image_jobs AS job
  SET reference_asset_ids = p_asset_ids,
      updated_at = pg_catalog.now()
  WHERE job.listing_id = claimed_job.listing_id
    AND job.user_id = p_user_id
    AND job.kind = 'GENERATE_SLOT';

  UPDATE public.assertive_image_jobs AS job
  SET status = 'SUCCEEDED',
      reference_asset_ids = p_asset_ids,
      next_attempt_at = NULL,
      lock_token = NULL,
      locked_at = NULL,
      error_code = NULL,
      error_message = NULL,
      updated_at = pg_catalog.now()
  WHERE job.id = claimed_job.id;
END;
$$;

ALTER FUNCTION public.assertive_complete_reference_job(UUID, UUID, UUID, UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_complete_reference_job(UUID, UUID, UUID, UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assertive_complete_reference_job(UUID, UUID, UUID, UUID[])
  TO service_role;

CREATE OR REPLACE FUNCTION public.assertive_refresh_listing_image_state(
  p_listing_id UUID,
  p_user_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_attributes JSONB;
  review_state JSONB;
  required_asset_ids JSONB;
  confirmed_asset_ids JSONB;
  photo_metadata JSONB;
  photo_urls JSONB;
BEGIN
  SELECT COALESCE(listing.attributes, '{}'::jsonb)
  INTO current_attributes
  FROM public.assertive_listings AS listing
  WHERE listing.id = p_listing_id
    AND listing.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assertive listing image state rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(job.output_asset_id ORDER BY job.position), '[]'::jsonb)
  INTO required_asset_ids
  FROM public.assertive_image_jobs AS job
  WHERE job.listing_id = p_listing_id
    AND job.user_id = p_user_id
    AND job.kind = 'GENERATE_SLOT'
    AND job.output_asset_id IS NOT NULL
    AND job.status IN ('REVIEW', 'SUCCEEDED');

  SELECT COALESCE(pg_catalog.jsonb_agg(job.output_asset_id ORDER BY job.position), '[]'::jsonb)
  INTO confirmed_asset_ids
  FROM public.assertive_image_jobs AS job
  WHERE job.listing_id = p_listing_id
    AND job.user_id = p_user_id
    AND job.kind = 'GENERATE_SLOT'
    AND job.output_asset_id IS NOT NULL
    AND job.status = 'SUCCEEDED';

  SELECT
    COALESCE(pg_catalog.jsonb_agg(asset.public_url ORDER BY linked.position), '[]'::jsonb),
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'asset_id', asset.id,
        'parent_asset_id', asset.parent_asset_id,
        'url', asset.public_url,
        'role', linked.role,
        'source', CASE
          WHEN asset.kind = 'GENERATED_SCENE' THEN 'AI_GENERATED'
          WHEN asset.provider = 'gemini' THEN 'AI_ENHANCED'
          ELSE 'USER'
        END,
        'source_ref', asset.parent_asset_id,
        'score', CASE WHEN asset.provider = 'gemini' THEN 220 ELSE 210 - linked.position END,
        'ai_enhanced', asset.provider = 'gemini',
        'fidelity_status', asset.fidelity_status,
        'label', CASE
          WHEN asset.kind = 'GENERATED_SCENE' THEN 'Gerada por IA'
          WHEN asset.metadata ->> 'operation' = 'SAFE_CROP' THEN 'Recorte da foto original'
          WHEN asset.provider = 'gemini' THEN 'Melhorada por IA'
          ELSE 'Original normalizada'
        END,
        'position', linked.position
      ) ORDER BY linked.position
    ), '[]'::jsonb)
  INTO photo_urls, photo_metadata
  FROM public.assertive_listing_images AS linked
  JOIN public.assertive_image_assets AS asset
    ON asset.id = linked.asset_id
  WHERE linked.listing_id = p_listing_id;

  review_state := COALESCE(current_attributes -> 'image_review', '{}'::jsonb);
  review_state := pg_catalog.jsonb_set(
    review_state,
    '{required_asset_ids}',
    required_asset_ids,
    true
  );
  review_state := pg_catalog.jsonb_set(
    review_state,
    '{confirmed_asset_ids}',
    confirmed_asset_ids,
    true
  );

  current_attributes := pg_catalog.jsonb_set(
    current_attributes,
    '{photo_metadata}',
    photo_metadata,
    true
  );
  current_attributes := pg_catalog.jsonb_set(
    current_attributes,
    '{image_review}',
    review_state,
    true
  );
  current_attributes := pg_catalog.jsonb_set(
    current_attributes,
    '{publication_requirements}',
    'null'::jsonb,
    true
  );

  UPDATE public.assertive_listings AS listing
  SET photos = photo_urls,
      attributes = current_attributes,
      validation = '{}'::jsonb,
      validated_payload = NULL,
      validated_payload_hash = NULL,
      status = 'needs_input',
      updated_at = pg_catalog.now()
  WHERE listing.id = p_listing_id
    AND listing.user_id = p_user_id;
END;
$$;

ALTER FUNCTION public.assertive_refresh_listing_image_state(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_refresh_listing_image_state(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assertive_upsert_listing_image_slot(
  p_listing_id UUID,
  p_user_id UUID,
  p_position INT,
  p_asset_id UUID,
  p_lock_token UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed_job public.assertive_image_jobs%ROWTYPE;
  generated_asset public.assertive_image_assets%ROWTYPE;
BEGIN
  IF p_position NOT BETWEEN 0 AND 5
    OR p_listing_id IS NULL
    OR p_user_id IS NULL
    OR p_asset_id IS NULL
    OR p_lock_token IS NULL
  THEN
    RAISE EXCEPTION 'Assertive image slot rejected' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_listing_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.assertive_listings AS listing
    WHERE listing.id = p_listing_id
      AND listing.user_id = p_user_id
      AND listing.status NOT IN ('publishing', 'published')
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Assertive image slot rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT job.*
  INTO claimed_job
  FROM public.assertive_image_jobs AS job
  WHERE job.listing_id = p_listing_id
    AND job.user_id = p_user_id
    AND job.kind = 'GENERATE_SLOT'
    AND job.position = p_position
    AND job.status = 'RUNNING'
    AND job.lock_token = p_lock_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assertive image slot rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT asset.*
  INTO generated_asset
  FROM public.assertive_image_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.user_id = p_user_id
    AND asset.analysis_id = claimed_job.analysis_id
    AND asset.kind = 'GENERATED_SCENE'
    AND asset.origin = 'AI_GENERATED'
    AND asset.rights_status = 'LICENSED'
    AND asset.public_url IS NOT NULL
    AND asset.fidelity_status = 'ACCEPT'
    AND asset.metadata ? 'truth_brief_hash'
    AND asset.metadata ? 'prompt_hash'
    AND asset.metadata @> '{"review_required":true}'::jsonb;

  IF NOT FOUND OR EXISTS (
    SELECT 1
    FROM public.assertive_listing_images AS linked
    WHERE linked.listing_id = p_listing_id
      AND linked.asset_id = p_asset_id
      AND linked.position <> p_position
  ) THEN
    RAISE EXCEPTION 'Assertive image slot rejected' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.assertive_listing_images AS linked
  WHERE linked.listing_id = p_listing_id
    AND linked.position = p_position;

  INSERT INTO public.assertive_listing_images (
    listing_id,
    asset_id,
    position,
    role,
    shot_type
  ) VALUES (
    p_listing_id,
    p_asset_id,
    p_position,
    claimed_job.role,
    NULLIF(claimed_job.shot ->> 'title', '')
  );

  UPDATE public.assertive_image_jobs AS job
  SET status = 'REVIEW',
      output_asset_id = p_asset_id,
      lock_token = NULL,
      locked_at = NULL,
      next_attempt_at = NULL,
      error_code = NULL,
      error_message = NULL,
      updated_at = pg_catalog.now()
  WHERE job.id = claimed_job.id;

  PERFORM public.assertive_refresh_listing_image_state(p_listing_id, p_user_id);
END;
$$;

ALTER FUNCTION public.assertive_upsert_listing_image_slot(UUID, UUID, INT, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_upsert_listing_image_slot(UUID, UUID, INT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assertive_upsert_listing_image_slot(UUID, UUID, INT, UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.assertive_confirm_image_slot(
  p_listing_id UUID,
  p_user_id UUID,
  p_position INT,
  p_asset_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_job_id UUID;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_listing_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.assertive_listings AS listing
    WHERE listing.id = p_listing_id
      AND listing.user_id = p_user_id
      AND listing.status NOT IN ('publishing', 'published')
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Assertive image confirmation rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT job.id
  INTO selected_job_id
  FROM public.assertive_image_jobs AS job
  WHERE job.listing_id = p_listing_id
    AND job.user_id = p_user_id
    AND job.kind = 'GENERATE_SLOT'
    AND job.position = p_position
    AND job.status = 'REVIEW'
    AND job.output_asset_id = p_asset_id
  FOR UPDATE;

  IF selected_job_id IS NULL THEN
    RAISE EXCEPTION 'Assertive image confirmation rejected' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.assertive_image_jobs AS job
  SET status = 'SUCCEEDED',
      updated_at = pg_catalog.now()
  WHERE job.id = selected_job_id;

  PERFORM public.assertive_refresh_listing_image_state(p_listing_id, p_user_id);
END;
$$;

ALTER FUNCTION public.assertive_confirm_image_slot(UUID, UUID, INT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_confirm_image_slot(UUID, UUID, INT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assertive_confirm_image_slot(UUID, UUID, INT, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.assertive_attach_manual_image_slot(
  p_listing_id UUID,
  p_user_id UUID,
  p_position INT,
  p_asset_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_job public.assertive_image_jobs%ROWTYPE;
  selected_asset public.assertive_image_assets%ROWTYPE;
BEGIN
  IF p_position NOT BETWEEN 0 AND 5
    OR p_listing_id IS NULL
    OR p_user_id IS NULL
    OR p_asset_id IS NULL
  THEN
    RAISE EXCEPTION 'Assertive manual image slot rejected' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_listing_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.assertive_listings AS listing
    WHERE listing.id = p_listing_id
      AND listing.user_id = p_user_id
      AND listing.status NOT IN ('publishing', 'published')
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Assertive manual image slot rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT job.*
  INTO selected_job
  FROM public.assertive_image_jobs AS job
  WHERE job.listing_id = p_listing_id
    AND job.user_id = p_user_id
    AND job.kind = 'GENERATE_SLOT'
    AND job.position = p_position
    AND job.status <> 'RUNNING'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assertive manual image slot rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT asset.*
  INTO selected_asset
  FROM public.assertive_image_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.user_id = p_user_id
    AND (asset.analysis_id IS NULL OR asset.analysis_id = selected_job.analysis_id)
    AND asset.kind IN ('DERIVED', 'PUBLICATION_RENDITION')
    AND asset.origin = 'USER_UPLOAD'
    AND asset.rights_status = 'USER_OWNED'
    AND asset.parent_asset_id IS NOT NULL
    AND asset.public_url IS NOT NULL
    AND asset.fidelity_status = 'ACCEPT'
    AND (
      p_position <> 0
      OR asset.metadata @> '{"white_cover":{"passed":true}}'::jsonb
    );

  IF NOT FOUND OR EXISTS (
    SELECT 1
    FROM public.assertive_listing_images AS linked
    WHERE linked.listing_id = p_listing_id
      AND linked.asset_id = p_asset_id
      AND linked.position <> p_position
  ) THEN
    RAISE EXCEPTION 'Assertive manual image slot rejected' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.assertive_listing_images AS linked
  WHERE linked.listing_id = p_listing_id
    AND linked.position = p_position;

  INSERT INTO public.assertive_listing_images (
    listing_id,
    asset_id,
    position,
    role,
    shot_type
  ) VALUES (
    p_listing_id,
    p_asset_id,
    p_position,
    selected_job.role,
    NULLIF(selected_job.shot ->> 'title', '')
  );

  UPDATE public.assertive_image_jobs AS job
  SET status = 'SUCCEEDED',
      output_asset_id = p_asset_id,
      lock_token = NULL,
      locked_at = NULL,
      next_attempt_at = NULL,
      error_code = NULL,
      error_message = NULL,
      metadata = COALESCE(job.metadata, '{}'::jsonb) || '{"manual":true}'::jsonb,
      updated_at = pg_catalog.now()
  WHERE job.id = selected_job.id;

  PERFORM public.assertive_refresh_listing_image_state(p_listing_id, p_user_id);
END;
$$;

ALTER FUNCTION public.assertive_attach_manual_image_slot(UUID, UUID, INT, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_attach_manual_image_slot(UUID, UUID, INT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assertive_attach_manual_image_slot(UUID, UUID, INT, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.assertive_reset_image_slot(
  p_listing_id UUID,
  p_user_id UUID,
  p_position INT,
  p_status TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_job public.assertive_image_jobs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('QUEUED', 'DISMISSED') THEN
    RAISE EXCEPTION 'Assertive image slot reset rejected' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_listing_id::text, 0)
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.assertive_listings AS listing
    WHERE listing.id = p_listing_id
      AND listing.user_id = p_user_id
      AND listing.status NOT IN ('publishing', 'published')
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'Assertive image slot reset rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT job.*
  INTO selected_job
  FROM public.assertive_image_jobs AS job
  WHERE job.listing_id = p_listing_id
    AND job.user_id = p_user_id
    AND job.kind = 'GENERATE_SLOT'
    AND job.position = p_position
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assertive image slot reset rejected' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.assertive_listing_images AS linked
  WHERE linked.listing_id = p_listing_id
    AND linked.position = p_position;

  UPDATE public.assertive_image_jobs AS job
  SET status = p_status,
      output_asset_id = NULL,
      generation_nonce = gen_random_uuid(),
      attempt_count = CASE WHEN p_status = 'QUEUED' THEN 0 ELSE job.attempt_count END,
      next_attempt_at = NULL,
      lock_token = NULL,
      locked_at = NULL,
      error_code = NULL,
      error_message = NULL,
      updated_at = pg_catalog.now()
  WHERE job.id = selected_job.id;

  IF p_status = 'QUEUED' THEN
    UPDATE public.assertive_image_jobs AS reference_job
    SET status = 'QUEUED',
        reference_asset_ids = '{}'::uuid[],
        attempt_count = 0,
        next_attempt_at = NULL,
        lock_token = NULL,
        locked_at = NULL,
        error_code = NULL,
        error_message = NULL,
        updated_at = pg_catalog.now()
    WHERE reference_job.listing_id = p_listing_id
      AND reference_job.user_id = p_user_id
      AND reference_job.kind = 'REFERENCE_SEARCH'
      AND reference_job.status IN ('FAILED', 'DISMISSED')
      AND NOT EXISTS (
        SELECT 1
        FROM public.assertive_image_assets AS asset
        WHERE asset.id = ANY(reference_job.reference_asset_ids)
          AND asset.user_id = p_user_id
          AND asset.analysis_id = reference_job.analysis_id
          AND (
            (
              asset.kind = 'SOURCE_REFERENCE'
              AND asset.rights_status IN ('REFERENCE_ONLY', 'SELLER_OWNED_CONFIRMED', 'LICENSED')
            )
            OR (
              asset.kind = 'ORIGINAL_EVIDENCE'
              AND asset.origin = 'USER_UPLOAD'
              AND asset.rights_status = 'USER_OWNED'
            )
          )
      );
  END IF;

  PERFORM public.assertive_refresh_listing_image_state(p_listing_id, p_user_id);
END;
$$;

ALTER FUNCTION public.assertive_reset_image_slot(UUID, UUID, INT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_reset_image_slot(UUID, UUID, INT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assertive_reset_image_slot(UUID, UUID, INT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.assertive_bootstrap_image_jobs(
  p_listing_id UUID,
  p_user_id UUID,
  p_slots JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_analysis_id UUID;
BEGIN
  IF p_listing_id IS NULL
    OR p_user_id IS NULL
    OR p_slots IS NULL
    OR pg_catalog.jsonb_typeof(p_slots) <> 'array'
    OR pg_catalog.jsonb_array_length(p_slots) <> 6
    OR 6 <> (
      SELECT count(DISTINCT requested.position)
      FROM pg_catalog.jsonb_to_recordset(p_slots)
        AS requested(position INT, role TEXT, shot JSONB)
      WHERE requested.position BETWEEN 0 AND 5
        AND requested.role IN ('MAIN', 'DETAIL', 'PACKAGING', 'LIFESTYLE', 'INFORMATIONAL')
        AND (
          (requested.position = 0 AND requested.role = 'MAIN')
          OR (requested.position > 0 AND requested.role <> 'MAIN')
        )
    )
  THEN
    RAISE EXCEPTION 'Assertive image job bootstrap rejected' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_listing_id::text, 0)
  );

  SELECT listing.analysis_id
  INTO selected_analysis_id
  FROM public.assertive_listings AS listing
  WHERE listing.id = p_listing_id
    AND listing.user_id = p_user_id
    AND listing.status NOT IN ('publishing', 'published')
  FOR UPDATE;

  IF selected_analysis_id IS NULL THEN
    RAISE EXCEPTION 'Assertive image job bootstrap rejected' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.assertive_image_jobs (
    user_id,
    analysis_id,
    listing_id,
    kind,
    position,
    role,
    shot,
    status
  ) VALUES (
    p_user_id,
    selected_analysis_id,
    p_listing_id,
    'REFERENCE_SEARCH',
    NULL,
    NULL,
    '{}'::jsonb,
    'QUEUED'
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.assertive_image_jobs (
    user_id,
    analysis_id,
    listing_id,
    kind,
    position,
    role,
    shot,
    status,
    output_asset_id
  )
  SELECT
    p_user_id,
    selected_analysis_id,
    p_listing_id,
    'GENERATE_SLOT',
    requested.position,
    requested.role,
    COALESCE(requested.shot, '{}'::jsonb),
    CASE
      WHEN linked.asset_id IS NULL THEN 'QUEUED'
      WHEN COALESCE((listing.attributes #> '{image_review,required_asset_ids}') ? linked.asset_id::text, false)
        AND NOT COALESCE((listing.attributes #> '{image_review,confirmed_asset_ids}') ? linked.asset_id::text, false)
      THEN 'REVIEW'
      ELSE 'SUCCEEDED'
    END,
    linked.asset_id
  FROM pg_catalog.jsonb_to_recordset(p_slots)
    AS requested(position INT, role TEXT, shot JSONB)
  JOIN public.assertive_listings AS listing
    ON listing.id = p_listing_id
   AND listing.user_id = p_user_id
  LEFT JOIN public.assertive_listing_images AS linked
    ON linked.listing_id = p_listing_id
   AND linked.position = requested.position
  ON CONFLICT DO NOTHING;

  PERFORM public.assertive_refresh_listing_image_state(p_listing_id, p_user_id);
END;
$$;

ALTER FUNCTION public.assertive_bootstrap_image_jobs(UUID, UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assertive_bootstrap_image_jobs(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assertive_bootstrap_image_jobs(UUID, UUID, JSONB)
  TO service_role;
