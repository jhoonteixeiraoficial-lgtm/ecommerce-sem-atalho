-- Move ingest secrets out of the member-readable live rows before removing the
-- old columns. The migration transaction keeps the copy and drop atomic.
create table public.live_credentials (
  live_id uuid primary key references public.lives(id) on delete cascade,
  rtmp_url text not null default '',
  stream_key text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.live_credentials (live_id, rtmp_url, stream_key)
select
  id,
  coalesce(rtmp_url, ''),
  coalesce(stream_key, '')
from public.lives
where nullif(pg_catalog.btrim(coalesce(rtmp_url, '')), '') is not null
   or nullif(pg_catalog.btrim(coalesce(stream_key, '')), '') is not null;

alter table public.lives
  drop column rtmp_url,
  drop column stream_key;

alter table public.live_credentials enable row level security;
revoke all on table public.live_credentials from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.live_credentials to service_role;

-- CREATE OR REPLACE preserves the existing signature and dependent trigger
-- callers. Explicit ownership keeps trigger execution trusted after PUBLIC
-- execute is removed.
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_content text default '',
  p_link text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (user_id, type, title, content, link)
  values (p_user_id, p_type, p_title, p_content, p_link)
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

alter function public.create_notification(uuid, text, text, text, text) owner to postgres;
revoke all on function public.create_notification(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_notification(uuid, text, text, text, text)
  to service_role;

-- UPDATE policies require both ownership and current member access. DELETE
-- policies preserve active canonical admin moderation as a separate branch.
drop policy if exists "posts_update_own" on public.community_posts;
create policy "posts_update_own"
  on public.community_posts for update
  to authenticated
  using (auth.uid() = user_id and public.has_member_access())
  with check (auth.uid() = user_id and public.has_member_access());

drop policy if exists "posts_delete_own" on public.community_posts;
create policy "posts_delete_own"
  on public.community_posts for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.has_member_access())
    or public.is_admin()
  );

drop policy if exists "comments_update_own" on public.community_comments;
create policy "comments_update_own"
  on public.community_comments for update
  to authenticated
  using (auth.uid() = user_id and public.has_member_access())
  with check (auth.uid() = user_id and public.has_member_access());

drop policy if exists "comments_delete_own" on public.community_comments;
create policy "comments_delete_own"
  on public.community_comments for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.has_member_access())
    or public.is_admin()
  );

drop policy if exists "reactions_delete_own" on public.community_reactions;
create policy "reactions_delete_own"
  on public.community_reactions for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.has_member_access())
    or public.is_admin()
  );

drop policy if exists "messages_update_own" on public.chat_messages;
create policy "messages_update_own"
  on public.chat_messages for update
  to authenticated
  using (auth.uid() = user_id and public.has_member_access())
  with check (auth.uid() = user_id and public.has_member_access());

drop policy if exists "messages_delete_own" on public.chat_messages;
create policy "messages_delete_own"
  on public.chat_messages for delete
  to authenticated
  using (
    (auth.uid() = user_id and public.has_member_access())
    or public.is_admin()
  );

-- Personal community resources remain owner-scoped, but ownership is no
-- longer sufficient after suspension, ban, or entitlement expiry.
drop policy if exists "reads_select_own" on public.chat_message_reads;
create policy "reads_select_own"
  on public.chat_message_reads for select
  to authenticated
  using (auth.uid() = user_id and public.has_member_access());

drop policy if exists "reads_insert_own" on public.chat_message_reads;
create policy "reads_insert_own"
  on public.chat_message_reads for insert
  to authenticated
  with check (auth.uid() = user_id and public.has_member_access());

drop policy if exists "reads_update_own" on public.chat_message_reads;
create policy "reads_update_own"
  on public.chat_message_reads for update
  to authenticated
  using (auth.uid() = user_id and public.has_member_access())
  with check (auth.uid() = user_id and public.has_member_access());

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id and public.has_member_access());

drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own"
  on public.notifications for insert
  to authenticated
  with check (auth.uid() = user_id and public.has_member_access());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id and public.has_member_access())
  with check (auth.uid() = user_id and public.has_member_access());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id and public.has_member_access());

-- NOT VALID avoids scanning and rejecting unknown legacy rows while PostgreSQL
-- still enforces each constraint for inserts and updates after this migration.
alter table public.community_posts
  add constraint community_posts_content_check
    check (
      pg_catalog.char_length(content) <= 5000
      and content ~ '[^[:space:]]'
    )
    not valid,
  add constraint community_posts_category_check
    check (category is not null and category in (
      'geral',
      'iniciantes',
      'produtos',
      'fornecedores',
      'anuncios',
      'mercado-ads',
      'resultados',
      'duvidas',
      'ia'
    ))
    not valid;

alter table public.community_comments
  add constraint community_comments_content_check
    check (
      pg_catalog.char_length(content) <= 2000
      and content ~ '[^[:space:]]'
    )
    not valid;

alter table public.chat_messages
  add constraint chat_messages_content_check
    check (
      pg_catalog.char_length(content) <= 1000
      and content ~ '[^[:space:]]'
    )
    not valid;
