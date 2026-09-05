-- Add thumbnail_url to lessons for YouTube thumbnail storage
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
