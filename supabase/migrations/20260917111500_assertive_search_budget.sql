-- Additive spending guard. No user data changes, deletes or external requests.
CREATE TABLE public.assertive_search_budget (
  budget_day date PRIMARY KEY,
  reserved_credits integer NOT NULL DEFAULT 0 CHECK (reserved_credits BETWEEN 0 AND 250)
);
CREATE TABLE public.assertive_search_reservations (
  cache_key text PRIMARY KEY,
  reserved_at timestamptz NOT NULL
);
ALTER TABLE public.assertive_search_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assertive_search_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assertive_search_budget, public.assertive_search_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.assertive_search_budget, public.assertive_search_reservations TO service_role;
CREATE POLICY search_budget_service_read ON public.assertive_search_budget FOR SELECT TO service_role USING (true);
CREATE POLICY search_reservations_service_read ON public.assertive_search_reservations FOR SELECT TO service_role USING (true);

CREATE FUNCTION public.reserve_assertive_search_credits(p_key text, p_daily_limit integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t timestamptz;
  d date;
  used integer;
BEGIN
  IF p_key IS NULL OR p_key !~ '^PUBLIC_SEARCH:v1:MLB:br:[a-f0-9]{64}$'
    OR p_daily_limit IS NULL OR p_daily_limit < 25 OR p_daily_limit > 250 THEN RETURN false; END IF;
  -- One transaction-scoped lock serializes only this short reservation, not scraping.
  PERFORM pg_catalog.pg_advisory_xact_lock(741025, 1);
  t := pg_catalog.clock_timestamp();
  d := (t AT TIME ZONE 'UTC')::date;
  IF EXISTS (SELECT 1 FROM public.assertive_search_reservations WHERE cache_key=p_key AND reserved_at > t - interval '6 hours') THEN RETURN false; END IF;
  INSERT INTO public.assertive_search_budget(budget_day) VALUES(d) ON CONFLICT DO NOTHING;
  SELECT reserved_credits INTO used FROM public.assertive_search_budget WHERE budget_day=d;
  IF used + 25 > p_daily_limit THEN RETURN false; END IF;
  UPDATE public.assertive_search_budget SET reserved_credits=reserved_credits+25 WHERE budget_day=d;
  INSERT INTO public.assertive_search_reservations(cache_key,reserved_at) VALUES(p_key,t)
    ON CONFLICT(cache_key) DO UPDATE SET reserved_at=EXCLUDED.reserved_at;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_assertive_search_credits(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_assertive_search_credits(text,integer) TO service_role;
