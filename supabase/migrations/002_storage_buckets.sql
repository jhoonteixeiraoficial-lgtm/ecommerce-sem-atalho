-- =============================================
-- ESA - Supabase Storage Buckets (Private)
-- =============================================
-- Execute este SQL no Supabase Dashboard > SQL Editor

-- Criar bucket privado para vídeos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-videos',
  'course-videos',
  false,
  524288000, -- 500MB
  ARRAY['video/mp4', 'video/webm', 'video/ogg']
);

-- Criar bucket privado para PDFs e materiais
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-materials',
  'course-materials',
  false,
  52428800, -- 50MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
);

-- RLS Policies para course-videos
-- Apenas membros ativos podem ler
CREATE POLICY "videos_select_active"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'course-videos'
  AND EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Apenas admins podem inserir
CREATE POLICY "videos_insert_admin"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-videos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Apenas admins podem deletar
CREATE POLICY "videos_delete_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course-videos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- RLS Policies para course-materials
-- Membros ativos podem ler
CREATE POLICY "materials_select_active"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'course-materials'
  AND EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = auth.uid()
    AND status = 'active'
  )
);

-- Admins podem inserir
CREATE POLICY "materials_insert_admin"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'course-materials'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Admins podem deletar
CREATE POLICY "materials_delete_admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'course-materials'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);
