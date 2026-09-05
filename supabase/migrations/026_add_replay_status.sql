-- Add 'replay' to the valid status values for lives.
-- DROP old constraint, ADD new one with 'replay' included.
-- Idempotent: uses IF EXISTS / IF NOT EXISTS patterns.

ALTER TABLE public.lives
  DROP CONSTRAINT IF EXISTS lives_status_check;

ALTER TABLE public.lives
  ADD CONSTRAINT lives_status_check
  CHECK (status IN ('agendada', 'ao_vivo', 'encerrada', 'cancelada', 'replay'));
