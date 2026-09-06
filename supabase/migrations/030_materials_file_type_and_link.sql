-- Add file_type column to materials table
-- 'upload' = file stored in Supabase Storage
-- 'link' = external URL (Google Drive, website, etc.)
ALTER TABLE public.materials
  ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'upload';

-- Update storage bucket to accept all file types and increase size limit to 500MB
UPDATE storage.buckets
SET
  file_size_limit = 524288000,
  allowed_mime_types = NULL
WHERE id = 'course-materials';
