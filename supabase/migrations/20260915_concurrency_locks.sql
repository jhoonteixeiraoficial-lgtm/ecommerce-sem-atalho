-- Migration: 20260915_concurrency_locks.sql
-- Funções RPC para locks advisory PostgreSQL (concorrência de análises)

-- ----------------------------------------------------------------
-- Tenta adquirir lock advisory (transação-level, auto-libera no commit/rollback)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_acquire_analysis_lock(p_lock_key bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  acquired boolean;
BEGIN
  -- pg_try_advisory_xact_lock tenta adquirir lock no nível de transação
  -- Libera automaticamente no fim da transação (commit ou rollback)
  SELECT pg_try_advisory_xact_lock(p_lock_key) INTO acquired;
  RETURN acquired;
END;
$$;

-- ----------------------------------------------------------------
-- Libera lock advisory de sessão (se usado pg_advisory_lock)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_analysis_lock(p_lock_key bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_unlock(p_lock_key);
END;
$$;

-- ----------------------------------------------------------------
-- Verifica se lock está ativo (para debug/monitoring)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_analysis_locked(p_lock_key bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  locked boolean;
BEGIN
  -- Tenta adquirir sem bloquear; se falhar, já está lockado
  SELECT NOT pg_try_advisory_xact_lock(p_lock_key) INTO locked;
  -- Se conseguiu, libera imediatamente (era só teste)
  IF NOT locked THEN
    PERFORM pg_advisory_unlock(p_lock_key);
  END IF;
  RETURN locked;
END;
$$;

-- ----------------------------------------------------------------
-- Grants para service_role
-- ----------------------------------------------------------------
REVOKE ALL ON FUNCTION public.try_acquire_analysis_lock(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_analysis_lock(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_analysis_locked(bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.try_acquire_analysis_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_analysis_lock(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_analysis_locked(bigint) TO service_role;

-- ----------------------------------------------------------------
-- Comentários
-- ----------------------------------------------------------------
COMMENT ON FUNCTION public.try_acquire_analysis_lock(bigint) IS
'Tenta adquirir lock advisory PostgreSQL para análise. Retorna true se conseguiu, false se outro processo já tem o lock.
Lock é no nível de transação (xact) - auto-libera no commit/rollback.
Chave = hash(analysis_id + user_id) como bigint.';

COMMENT ON FUNCTION public.release_analysis_lock(bigint) IS
'Libera lock advisory de sessão (se usado pg_advisory_lock em vez de xact).';

COMMENT ON FUNCTION public.is_analysis_locked(bigint) IS
'Verifica se lock está ativo (útil para debugging).';