-- Durable mutual exclusion across PostgREST transactions and serverless instances.
-- Additive: does not modify or remove existing analyses, listings or user data.
-- Each lease lasts 10 minutes; the worker route is limited to 300 seconds.
CREATE TABLE public.assertive_analysis_leases (
  analysis_id uuid PRIMARY KEY REFERENCES public.assertive_analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.assertive_analysis_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assertive_analysis_leases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.assertive_analysis_leases TO service_role;
CREATE POLICY analysis_leases_service_only ON public.assertive_analysis_leases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE FUNCTION public.acquire_assertive_analysis_lease(p_analysis_id uuid, p_user_id uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.assertive_analysis_leases AS leases(analysis_id,user_id,token,expires_at)
  SELECT p_analysis_id,p_user_id,gen_random_uuid(),clock_timestamp()+interval '10 minutes'
  WHERE EXISTS (
    SELECT 1 FROM public.assertive_analyses a WHERE a.id=p_analysis_id AND a.user_id=p_user_id
  )
  ON CONFLICT (analysis_id) DO UPDATE
    SET token=EXCLUDED.token, expires_at=EXCLUDED.expires_at
    WHERE leases.user_id=p_user_id AND leases.expires_at<=clock_timestamp()
  RETURNING token;
$$;

CREATE FUNCTION public.release_assertive_analysis_lease(p_analysis_id uuid, p_user_id uuid, p_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.assertive_analysis_leases
  WHERE analysis_id=p_analysis_id AND user_id=p_user_id AND token=p_token;
$$;

REVOKE ALL ON FUNCTION public.acquire_assertive_analysis_lease(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_assertive_analysis_lease(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_assertive_analysis_lease(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_assertive_analysis_lease(uuid,uuid,uuid) TO service_role;
