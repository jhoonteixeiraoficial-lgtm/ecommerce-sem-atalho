-- Fix 1: Allow active members to see other members' profiles
CREATE POLICY "profiles_select_active_members"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = auth.uid()
      AND status = 'active'
    )
  );

-- Fix 2: Fix notification link paths
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_post_owner UUID;
  v_author_name TEXT;
BEGIN
  SELECT user_id INTO v_post_owner
  FROM public.community_posts
  WHERE id = NEW.post_id;
  
  SELECT full_name INTO v_author_name
  FROM public.profiles
  WHERE id = NEW.user_id;
  
  IF v_post_owner != NEW.user_id THEN
    PERFORM public.create_notification(
      v_post_owner,
      'comment',
      'Novo comentário',
      v_author_name || ' comentou no seu post',
      '/membros/comunidade?post=' || NEW.post_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.notify_on_reaction()
RETURNS TRIGGER AS $$
DECLARE
  v_post_owner UUID;
  v_author_name TEXT;
BEGIN
  SELECT user_id INTO v_post_owner
  FROM public.community_posts
  WHERE id = NEW.post_id;
  
  SELECT full_name INTO v_author_name
  FROM public.profiles
  WHERE id = NEW.user_id;
  
  IF v_post_owner != NEW.user_id THEN
    PERFORM public.create_notification(
      v_post_owner,
      'reaction',
      'Nova reação',
      v_author_name || ' reagiu ao seu post',
      '/membros/comunidade?post=' || NEW.post_id
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 3: Add missing index for category filtering
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.community_posts(category);
