-- Rollback-only integration test. No existing user/product rows are modified.
BEGIN;
DO $$
DECLARE
  u uuid;
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  token_a uuid;
  token_b uuid;
  replacement uuid;
BEGIN
  SELECT id INTO u FROM auth.users ORDER BY created_at LIMIT 1;
  IF u IS NULL THEN RAISE EXCEPTION 'Test requires one existing user'; END IF;
  INSERT INTO public.assertive_analyses(id,user_id,product_name,input_type,status)
  VALUES (a,u,'QA transaction-only lease A','description','researching'),
         (b,u,'QA transaction-only lease B','description','researching');
  token_a := public.acquire_assertive_analysis_lease(a,u);
  IF token_a IS NULL THEN RAISE EXCEPTION 'first claim failed'; END IF;
  IF public.acquire_assertive_analysis_lease(a,u) IS NOT NULL THEN RAISE EXCEPTION 'duplicate claim accepted'; END IF;
  token_b := public.acquire_assertive_analysis_lease(b,u);
  IF token_b IS NULL THEN RAISE EXCEPTION 'independent analysis blocked'; END IF;
  IF public.acquire_assertive_analysis_lease(a,gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'foreign ownership accepted'; END IF;
  PERFORM public.release_assertive_analysis_lease(a,u,gen_random_uuid());
  IF public.acquire_assertive_analysis_lease(a,u) IS NOT NULL THEN RAISE EXCEPTION 'wrong token released lease'; END IF;
  UPDATE public.assertive_analysis_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE analysis_id=a;
  replacement := public.acquire_assertive_analysis_lease(a,u);
  IF replacement IS NULL OR replacement=token_a THEN RAISE EXCEPTION 'expired lease not replaced'; END IF;
  PERFORM public.release_assertive_analysis_lease(a,u,token_a);
  IF public.acquire_assertive_analysis_lease(a,u) IS NOT NULL THEN RAISE EXCEPTION 'stale execution released newer lease'; END IF;
  PERFORM public.release_assertive_analysis_lease(a,u,replacement);
  IF public.acquire_assertive_analysis_lease(a,u) IS NULL THEN RAISE EXCEPTION 'valid release did not permit retry'; END IF;
  IF has_function_privilege('anon','public.acquire_assertive_analysis_lease(uuid,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.acquire_assertive_analysis_lease(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'public claim access exposed'; END IF;
  IF NOT has_function_privilege('service_role','public.acquire_assertive_analysis_lease(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'service claim access missing'; END IF;
END $$;
ROLLBACK;
SELECT 'lease ownership, exclusion, expiry, token fencing and grants passed; fixture rolled back' AS result;
