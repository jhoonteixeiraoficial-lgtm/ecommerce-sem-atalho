CREATE OR REPLACE FUNCTION public.assertive_replace_listing_images(
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
    SELECT 1 FROM public.assertive_listings
    WHERE id = p_listing_id AND user_id = p_user_id AND status <> 'published'
  ) THEN
    RAISE EXCEPTION 'Anuncio nao encontrado ou nao editavel.';
  END IF;

  IF p_images IS NULL OR jsonb_typeof(p_images) <> 'array' THEN
    RAISE EXCEPTION 'Galeria invalida.';
  END IF;
  image_count := jsonb_array_length(p_images);
  IF image_count > 12 THEN RAISE EXCEPTION 'A galeria excede 12 imagens.'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_images) AS requested(asset_id UUID, position INT, role TEXT, shot_type TEXT)
    LEFT JOIN public.assertive_image_assets asset ON asset.id = requested.asset_id AND asset.user_id = p_user_id
    WHERE requested.position IS NULL
      OR requested.position < 0
      OR requested.role IS NULL
      OR requested.role NOT IN ('MAIN','DETAIL','PACKAGING','LIFESTYLE','INFORMATIONAL')
      OR asset.id IS NULL
      OR asset.origin = 'COMPETITOR'
      OR asset.rights_status NOT IN ('USER_OWNED','SELLER_OWNED_CONFIRMED','LICENSED')
      OR asset.kind = 'ORIGINAL_EVIDENCE'
      OR (
        asset.parent_asset_id IS NULL
        AND NOT (
          asset.kind = 'GENERATED_SCENE'
          AND asset.origin = 'AI_GENERATED'
          AND asset.metadata ? 'truth_brief_hash'
          AND asset.metadata ? 'prompt_hash'
          AND asset.metadata @> '{"review_required":true}'::jsonb
        )
      )
      OR asset.public_url IS NULL
      OR asset.fidelity_status IS DISTINCT FROM 'ACCEPT'
  ) THEN
    RAISE EXCEPTION 'Imagem sem origem, direito, proveniencia ou fidelidade aprovados.';
  END IF;

  IF image_count <> (
    SELECT COUNT(DISTINCT requested.position)
    FROM jsonb_to_recordset(p_images) AS requested(asset_id UUID, position INT, role TEXT, shot_type TEXT)
  ) OR image_count <> (
    SELECT COUNT(DISTINCT requested.asset_id)
    FROM jsonb_to_recordset(p_images) AS requested(asset_id UUID, position INT, role TEXT, shot_type TEXT)
  ) THEN
    RAISE EXCEPTION 'Assets e posicoes da galeria precisam ser unicos.';
  END IF;

  DELETE FROM public.assertive_listing_images WHERE listing_id = p_listing_id;
  INSERT INTO public.assertive_listing_images (listing_id, asset_id, position, role, shot_type)
  SELECT p_listing_id, requested.asset_id, requested.position, requested.role, requested.shot_type
  FROM jsonb_to_recordset(p_images) AS requested(asset_id UUID, position INT, role TEXT, shot_type TEXT);

  UPDATE public.assertive_listings listing
  SET photos = COALESCE((
        SELECT jsonb_agg(asset.public_url ORDER BY linked.position)
        FROM public.assertive_listing_images linked
        JOIN public.assertive_image_assets asset ON asset.id = linked.asset_id
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
          ) ORDER BY linked.position)
          FROM public.assertive_listing_images linked
          JOIN public.assertive_image_assets asset ON asset.id = linked.asset_id
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

REVOKE ALL ON FUNCTION public.assertive_replace_listing_images(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assertive_replace_listing_images(UUID, UUID, JSONB) TO service_role;
