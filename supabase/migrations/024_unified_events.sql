-- Extend lives table into a unified events/agenda system.
-- All new columns have safe defaults so existing rows are unaffected.
-- No columns are removed; no existing data is deleted.

-- Content type: live, conteudo, aula, material, atualizacao, evento_especial
ALTER TABLE public.lives
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'live';

-- Status: agendada, ao_vivo, encerrada, cancelada
ALTER TABLE public.lives
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'agendada';

-- YouTube URL (for lives) and extracted video ID
ALTER TABLE public.lives
ADD COLUMN IF NOT EXISTS youtube_url TEXT NOT NULL DEFAULT '';

ALTER TABLE public.lives
ADD COLUMN IF NOT EXISTS youtube_video_id TEXT NOT NULL DEFAULT '';

-- Optional thumbnail image URL
ALTER TABLE public.lives
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NOT NULL DEFAULT '';

-- CHECK constraints for valid types and statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lives_type_check'
  ) THEN
    ALTER TABLE public.lives
    ADD CONSTRAINT lives_type_check
    CHECK (type IN ('live', 'conteudo', 'aula', 'material', 'atualizacao', 'evento_especial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lives_status_check'
  ) THEN
    ALTER TABLE public.lives
    ADD CONSTRAINT lives_status_check
    CHECK (status IN ('agendada', 'ao_vivo', 'encerrada', 'cancelada'));
  END IF;
END $$;

-- Backfill existing rows: is_live=true → ao_vivo, is_live=false → agendada
UPDATE public.lives
SET status = CASE WHEN is_live THEN 'ao_vivo' ELSE 'agendada' END
WHERE status = 'agendada';

-- Index for calendar queries (date range + type filtering)
CREATE INDEX IF NOT EXISTS idx_lives_scheduled_at_type
ON public.lives (scheduled_at, type);

-- Index for "next event" queries (status + date ascending)
CREATE INDEX IF NOT EXISTS idx_lives_status_scheduled
ON public.lives (status, scheduled_at);
