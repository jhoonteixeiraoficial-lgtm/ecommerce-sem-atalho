-- =============================================
-- ESA User Bans System - Migration 008
-- =============================================

-- =============================================
-- 1. ADicionar colunas de ban à tabela profiles
-- =============================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS ban_reason TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

-- =============================================
-- 2. Policy: Banidos não acessam áreas protegidas
-- =============================================
-- Admins always bypass this check
CREATE POLICY "banned_users_blocked"
  ON public.profiles FOR SELECT
  USING (
    NOT is_banned
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =============================================
-- 3. Index para performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON public.profiles(is_banned);
