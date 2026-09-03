-- =============================================
-- ESA Community System - Migration 003
-- =============================================

-- =============================================
-- 1. ATUALIZAR TABELA COMMUNITY_POSTS
-- =============================================
ALTER TABLE public.community_posts 
ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- =============================================
-- 2. TABELA COMMUNITY_COMMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.community_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.community_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select_active_members"
  ON public.community_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "comments_insert_active_members"
  ON public.community_comments FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "comments_update_own"
  ON public.community_comments FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "comments_delete_own"
  ON public.community_comments FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- 3. TABELA COMMUNITY_REACTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.community_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL DEFAULT 'like' CHECK (reaction_type IN ('like', 'love', 'fire', 'clap')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id, reaction_type)
);

ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions_select_active_members"
  ON public.community_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "reactions_insert_active_members"
  ON public.community_reactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "reactions_delete_own"
  ON public.community_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- 4. TABELA CHAT_CHANNELS
-- =============================================
CREATE TABLE IF NOT EXISTS public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  slug TEXT UNIQUE NOT NULL,
  icon TEXT DEFAULT 'message-circle',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "channels_select_active_members"
  ON public.chat_channels FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

-- Insert default channels
INSERT INTO public.chat_channels (name, description, slug, icon) VALUES
  ('Geral', 'Conversa livre entre membros', 'geral', 'message-circle'),
  ('Dúvidas', 'Tire suas dúvidas sobre e-commerce', 'duvidas', 'help-circle'),
  ('Mercado Livre', 'Específico para Mercado Livre', 'mercado-livre', 'shopping-bag'),
  ('Produtos', 'Encontre e discuta produtos', 'produtos', 'package'),
  ('Anúncios', 'Facebook Ads, Google Ads e mais', 'anuncios', 'megaphone'),
  ('Mercado Ads', 'Específico para Mercado Ads', 'mercado-ads', 'target'),
  ('Resultados', 'Compartilhe seus resultados', 'resultados', 'trophy'),
  ('IA', 'Inteligência Artificial para e-commerce', 'ia', 'brain')
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- 5. TABELA CHAT_MESSAGES
-- =============================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_active_members"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "messages_insert_active_members"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "messages_update_own"
  ON public.chat_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "messages_delete_own"
  ON public.chat_messages FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- 6. TABELA CHAT_MESSAGE_READS
-- =============================================
CREATE TABLE IF NOT EXISTS public.chat_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, channel_id)
);

ALTER TABLE public.chat_message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reads_select_own"
  ON public.chat_message_reads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "reads_insert_own"
  ON public.chat_message_reads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reads_update_own"
  ON public.chat_message_reads FOR UPDATE
  USING (auth.uid() = user_id);

-- =============================================
-- 7. TABELA NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('comment', 'reaction', 'mention', 'system')),
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  link TEXT DEFAULT '',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert_own"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================
-- 8. FUNÇÃO: Criar notificação
-- =============================================
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_content TEXT DEFAULT '',
  p_link TEXT DEFAULT ''
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, content, link)
  VALUES (p_user_id, p_type, p_title, p_content, p_link)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 9. FUNÇÃO: Notificar ao comentar
-- =============================================
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_post_owner UUID;
  v_author_name TEXT;
BEGIN
  -- Get post owner
  SELECT user_id INTO v_post_owner
  FROM public.community_posts
  WHERE id = NEW.post_id;
  
  -- Get author name
  SELECT full_name INTO v_author_name
  FROM public.profiles
  WHERE id = NEW.user_id;
  
  -- Don't notify self
  IF v_post_owner != NEW.user_id THEN
    PERFORM public.create_notification(
      v_post_owner,
      'comment',
      'Novo comentário',
      v_author_name || ' comentou no seu post',
      '/comunidade?post=' || NEW.post_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_comment_created
  AFTER INSERT ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_comment();

-- =============================================
-- 10. FUNÇÃO: Notificar ao reagir
-- =============================================
CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS TRIGGER AS $$
DECLARE
  v_post_owner UUID;
  v_author_name TEXT;
BEGIN
  -- Get post owner
  SELECT user_id INTO v_post_owner
  FROM public.community_posts
  WHERE id = NEW.post_id;
  
  -- Get author name
  SELECT full_name INTO v_author_name
  FROM public.profiles
  WHERE id = NEW.user_id;
  
  -- Don't notify self
  IF v_post_owner != NEW.user_id THEN
    PERFORM public.create_notification(
      v_post_owner,
      'reaction',
      'Nova reação',
      v_author_name || ' reagiu ao seu post',
      '/comunidade?post=' || NEW.post_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_reaction_created
  AFTER INSERT ON public.community_reactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_reaction();

-- =============================================
-- 11. FUNÇÃO: Atualizar is_edited
-- =============================================
CREATE OR REPLACE FUNCTION public.update_post_edited()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content != NEW.content THEN
    NEW.is_edited := true;
    NEW.edited_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_post_updated
  BEFORE UPDATE ON public.community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_edited();

CREATE TRIGGER on_comment_updated
  BEFORE UPDATE ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_edited();

CREATE TRIGGER on_message_updated
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_edited();

-- =============================================
-- 12. INDEX para performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.community_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.community_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON public.community_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON public.community_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON public.chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user_channel ON public.chat_message_reads(user_id, channel_id);

-- =============================================
-- 13. HABILITAR REALTIME
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_reactions;
