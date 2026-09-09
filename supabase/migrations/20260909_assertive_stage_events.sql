-- Auditable stage-level telemetry for the Assertive pipeline.
CREATE TABLE IF NOT EXISTS public.assertive_stage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES public.assertive_analyses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('started', 'completed', 'failed', 'retry', 'fallback')),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assertive_stage_events_analysis_created
  ON public.assertive_stage_events (analysis_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assertive_stage_events_user_created
  ON public.assertive_stage_events (user_id, created_at DESC);

ALTER TABLE public.assertive_stage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own assertive stage events" ON public.assertive_stage_events;
CREATE POLICY "Users read own assertive stage events"
  ON public.assertive_stage_events FOR SELECT
  USING (auth.uid() = user_id);
