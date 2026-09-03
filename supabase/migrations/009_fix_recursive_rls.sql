-- Remove recursive profile policies that make every authenticated query fail.
DROP POLICY IF EXISTS "profiles_admin_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_active_members" ON public.profiles;
DROP POLICY IF EXISTS "banned_users_blocked" ON public.profiles;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND COALESCE(is_banned, false) = false
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = auth.uid()
      AND status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND COALESCE(is_banned, false) = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_active_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_subscription() TO authenticated;

CREATE POLICY "profiles_select_members"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.is_admin()
    OR public.has_active_subscription()
  );

-- Community policies use SECURITY DEFINER helpers instead of recursively
-- reading profiles/subscriptions through RLS.
DROP POLICY IF EXISTS "posts_select_active_members" ON public.community_posts;
DROP POLICY IF EXISTS "posts_insert_active_members" ON public.community_posts;
CREATE POLICY "posts_select_active_members"
  ON public.community_posts FOR SELECT
  TO authenticated
  USING (public.has_active_subscription() OR public.is_admin());
CREATE POLICY "posts_insert_active_members"
  ON public.community_posts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_active_subscription() OR public.is_admin())
  );

DROP POLICY IF EXISTS "comments_select_active_members" ON public.community_comments;
DROP POLICY IF EXISTS "comments_insert_active_members" ON public.community_comments;
CREATE POLICY "comments_select_active_members"
  ON public.community_comments FOR SELECT
  TO authenticated
  USING (public.has_active_subscription() OR public.is_admin());
CREATE POLICY "comments_insert_active_members"
  ON public.community_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_active_subscription() OR public.is_admin())
  );

DROP POLICY IF EXISTS "reactions_select_active_members" ON public.community_reactions;
DROP POLICY IF EXISTS "reactions_insert_active_members" ON public.community_reactions;
CREATE POLICY "reactions_select_active_members"
  ON public.community_reactions FOR SELECT
  TO authenticated
  USING (public.has_active_subscription() OR public.is_admin());
CREATE POLICY "reactions_insert_active_members"
  ON public.community_reactions FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_active_subscription() OR public.is_admin())
  );

DROP POLICY IF EXISTS "channels_select_active_members" ON public.chat_channels;
CREATE POLICY "channels_select_active_members"
  ON public.chat_channels FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (public.has_active_subscription() OR public.is_admin())
  );

DROP POLICY IF EXISTS "messages_select_active_members" ON public.chat_messages;
DROP POLICY IF EXISTS "messages_insert_active_members" ON public.chat_messages;
CREATE POLICY "messages_select_active_members"
  ON public.chat_messages FOR SELECT
  TO authenticated
  USING (public.has_active_subscription() OR public.is_admin());
CREATE POLICY "messages_insert_active_members"
  ON public.chat_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.has_active_subscription() OR public.is_admin())
  );
