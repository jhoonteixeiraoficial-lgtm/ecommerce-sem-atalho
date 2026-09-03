-- Add streaming columns to lives table
ALTER TABLE public.lives 
ADD COLUMN IF NOT EXISTS stream_key TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS rtmp_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS viewer_count INT DEFAULT 0;

-- Admin can manage lives
CREATE POLICY "lives_admin_all"
  ON public.lives FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
