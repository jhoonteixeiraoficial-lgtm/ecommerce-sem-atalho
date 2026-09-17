BEGIN;
DO $$
DECLARE k text := 'PUBLIC_SEARCH:v1:MLB:br:' || repeat('e',64);
BEGIN
  IF public.reserve_assertive_search_credits(k, 0) THEN RAISE EXCEPTION 'disabled budget accepted'; END IF;
  IF public.reserve_assertive_search_credits(k, 251) THEN RAISE EXCEPTION 'excessive budget accepted'; END IF;
  IF public.reserve_assertive_search_credits('invalid', 25) THEN RAISE EXCEPTION 'invalid key accepted'; END IF;
  IF NOT public.reserve_assertive_search_credits(k, 25) THEN RAISE EXCEPTION 'first reservation rejected'; END IF;
  IF public.reserve_assertive_search_credits(k, 250) THEN RAISE EXCEPTION 'duplicate query accepted'; END IF;
  IF public.reserve_assertive_search_credits('PUBLIC_SEARCH:v1:MLB:br:' || repeat('f',64), 25) THEN RAISE EXCEPTION 'daily budget exceeded'; END IF;
  IF has_function_privilege('anon','public.reserve_assertive_search_credits(text,integer)','EXECUTE') THEN RAISE EXCEPTION 'anon can spend'; END IF;
  IF has_function_privilege('authenticated','public.reserve_assertive_search_credits(text,integer)','EXECUTE') THEN RAISE EXCEPTION 'user can spend'; END IF;
  IF NOT has_function_privilege('service_role','public.reserve_assertive_search_credits(text,integer)','EXECUTE') THEN RAISE EXCEPTION 'service cannot reserve'; END IF;
END $$;
ROLLBACK;
