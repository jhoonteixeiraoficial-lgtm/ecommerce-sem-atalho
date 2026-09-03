-- Staging rehearsal only. This intentionally does not restore legacy write
-- policies or any policy that trusts profiles.role/subscriptions.status.
drop trigger if exists on_auth_user_authorization_created on auth.users;
drop function if exists public.handle_new_user_authorization();

drop policy if exists "subscriptions_admin_select_all" on public.subscriptions;
drop policy if exists "profiles_update_safe_own" on public.profiles;
drop policy if exists "modules_select_active_members" on public.modules;
drop policy if exists "modules_admin_all" on public.modules;
drop policy if exists "lessons_select_active_members" on public.lessons;
drop policy if exists "lessons_admin_all" on public.lessons;
drop policy if exists "materials_select_active_members" on public.materials;
drop policy if exists "materials_admin_all" on public.materials;
drop policy if exists "lives_select_active_members" on public.lives;
drop policy if exists "lives_admin_all" on public.lives;
drop policy if exists "videos_select_active" on storage.objects;
drop policy if exists "videos_insert_admin" on storage.objects;
drop policy if exists "videos_delete_admin" on storage.objects;
drop policy if exists "materials_select_active" on storage.objects;
drop policy if exists "materials_insert_admin" on storage.objects;
drop policy if exists "materials_delete_admin" on storage.objects;

drop policy if exists "profiles_select_members" on public.profiles;
drop policy if exists "posts_select_active_members" on public.community_posts;
drop policy if exists "posts_insert_active_members" on public.community_posts;
drop policy if exists "comments_select_active_members" on public.community_comments;
drop policy if exists "comments_insert_active_members" on public.community_comments;
drop policy if exists "reactions_select_active_members" on public.community_reactions;
drop policy if exists "reactions_insert_active_members" on public.community_reactions;
drop policy if exists "channels_select_active_members" on public.chat_channels;
drop policy if exists "messages_select_active_members" on public.chat_messages;
drop policy if exists "messages_insert_active_members" on public.chat_messages;

drop function if exists public.has_active_subscription();
drop function if exists public.has_member_access();
drop function if exists public.is_admin();

drop table if exists public.admin_audit_log;
drop table if exists public.account_status;
drop table if exists public.user_roles;

drop type if exists public.account_state;
drop type if exists public.app_role;
