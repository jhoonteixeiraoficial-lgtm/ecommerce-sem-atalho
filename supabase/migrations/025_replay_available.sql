-- Add replay_available flag to lives table.
-- Uses the existing replay_url as the source of truth: if replay_url is set,
-- the live has a replay. This column is a convenience flag for the UI.
-- Safe, additive, no data loss.

ALTER TABLE public.lives
ADD COLUMN IF NOT EXISTS replay_available BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any live with a non-empty replay_url already has a replay available
UPDATE public.lives
SET replay_available = true
WHERE replay_url IS NOT NULL AND replay_url != '';
