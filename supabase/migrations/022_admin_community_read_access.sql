-- community_posts already had an admin read-all bypass (posts_admin_select_all)
-- so an admin without a personal subscription could still see the feed, but it
-- checked the legacy, unmaintained profiles.role column instead of the
-- canonical user_roles table -- which had drifted out of sync in production
-- (an account was 'admin' in user_roles but 'member' in profiles.role).
-- chat_messages, community_comments, and community_reactions never had an
-- admin bypass at all, so any admin without a personal active subscription was
-- silently denied by RLS on those tables (and their realtime postgres_changes
-- events), which looked like a broken chat/community feature.
--
-- Fix: use the canonical public.is_admin() (backed by user_roles +
-- account_status) consistently across all four tables.

drop policy if exists "posts_admin_select_all" on public.community_posts;
create policy "posts_admin_select_all"
  on public.community_posts for select
  using (public.is_admin());

drop policy if exists "chat_admin_select_all" on public.chat_messages;
create policy "chat_admin_select_all"
  on public.chat_messages for select
  using (public.is_admin());

drop policy if exists "comments_admin_select_all" on public.community_comments;
create policy "comments_admin_select_all"
  on public.community_comments for select
  using (public.is_admin());

drop policy if exists "reactions_admin_select_all" on public.community_reactions;
create policy "reactions_admin_select_all"
  on public.community_reactions for select
  using (public.is_admin());
