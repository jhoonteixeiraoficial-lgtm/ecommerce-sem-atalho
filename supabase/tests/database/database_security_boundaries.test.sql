begin;

select plan(31);

create or replace function pg_temp.assert_community_blocked(
  post_id uuid,
  comment_id uuid,
  reaction_id uuid,
  message_id uuid,
  channel_id uuid
)
returns void
language plpgsql
as $$
declare
  affected integer;
  statement text;
begin
  if (select count(*) from public.community_posts where id = post_id) <> 0
    or (select count(*) from public.community_comments where id = comment_id) <> 0
    or (select count(*) from public.community_reactions where id = reaction_id) <> 0
    or (select count(*) from public.chat_messages where id = message_id) <> 0
  then
    raise exception 'inactive account could read community content';
  end if;

  update public.community_posts set content = content where id = post_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a post'; end if;

  delete from public.community_posts;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a post'; end if;

  update public.community_comments set content = content where id = comment_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a comment'; end if;

  delete from public.community_comments;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a comment'; end if;

  delete from public.community_reactions;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a reaction'; end if;

  update public.chat_messages set content = content where id = message_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a message'; end if;

  delete from public.chat_messages;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a message'; end if;

  foreach statement in array array[
    format(
      'insert into public.community_posts (user_id, content) values (%L, ''blocked fixture'')',
      auth.uid()
    ),
    format(
      'insert into public.community_comments (post_id, user_id, content) values (%L, %L, ''blocked fixture'')',
      '00000000-0000-0000-0000-000000001305',
      auth.uid()
    ),
    format(
      'insert into public.community_reactions (post_id, user_id, reaction_type) values (%L, %L, ''clap'')',
      '00000000-0000-0000-0000-000000001305',
      auth.uid()
    ),
    format(
      'insert into public.chat_messages (channel_id, user_id, content) values (%L, %L, ''blocked fixture'')',
      channel_id,
      auth.uid()
    )
  ] loop
    begin
      execute statement;
      raise exception 'inactive account inserted community content';
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end;
$$;

create or replace function pg_temp.assert_active_owner_operations(
  post_id uuid,
  comment_id uuid,
  reaction_id uuid,
  message_id uuid,
  read_id uuid,
  notification_id uuid,
  new_channel_id uuid,
  delete_post_id uuid,
  delete_comment_id uuid,
  delete_message_id uuid,
  delete_notification_id uuid
)
returns void
language plpgsql
as $$
declare
  affected integer;
begin
  update public.community_posts set content = 'active post updated' where id = post_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not update one post'; end if;

  update public.community_comments set content = 'active comment updated' where id = comment_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not update one comment'; end if;

  update public.chat_messages set content = 'active message updated' where id = message_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not update one message'; end if;

  delete from public.community_reactions where id = reaction_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not delete one reaction'; end if;

  delete from public.community_comments where id = delete_comment_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not delete one comment'; end if;

  delete from public.chat_messages where id = delete_message_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not delete one message'; end if;

  delete from public.community_posts where id = delete_post_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not delete one post'; end if;

  update public.chat_message_reads
  set last_read_at = statement_timestamp()
  where id = read_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not update one message read'; end if;

  update public.notifications set is_read = true where id = notification_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not update one notification'; end if;

  delete from public.notifications where id = delete_notification_id;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'active owner did not delete one notification'; end if;

  insert into public.community_posts (id, user_id, content)
  values ('00000000-0000-0000-0000-000000001310', auth.uid(), 'active insert fixture');

  insert into public.chat_messages (id, channel_id, user_id, content)
  values (
    '00000000-0000-0000-0000-000000004310',
    new_channel_id,
    auth.uid(),
    'active insert fixture'
  );

  insert into public.chat_message_reads (user_id, channel_id)
  values (auth.uid(), new_channel_id);

  insert into public.notifications (user_id, type, title)
  values (auth.uid(), 'system', 'active insert fixture');
end;
$$;

create or replace function pg_temp.assert_cross_owner_blocked(
  target_user_id uuid,
  post_id uuid,
  comment_id uuid,
  reaction_id uuid,
  message_id uuid,
  read_id uuid,
  notification_id uuid,
  channel_id uuid
)
returns void
language plpgsql
as $$
declare
  affected integer;
  statement text;
begin
  update public.community_posts set content = 'cross-owner update' where id = post_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner post update succeeded'; end if;

  update public.community_comments set content = 'cross-owner update' where id = comment_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner comment update succeeded'; end if;

  update public.chat_messages set content = 'cross-owner update' where id = message_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner message update succeeded'; end if;

  delete from public.community_posts where id = post_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner post delete succeeded'; end if;

  delete from public.community_comments where id = comment_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner comment delete succeeded'; end if;

  delete from public.community_reactions where id = reaction_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner reaction delete succeeded'; end if;

  delete from public.chat_messages where id = message_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner message delete succeeded'; end if;

  update public.chat_message_reads set last_read_at = statement_timestamp() where id = read_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner message-read update succeeded'; end if;

  update public.notifications set is_read = true where id = notification_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-owner notification update succeeded'; end if;

  foreach statement in array array[
    format(
      'insert into public.community_posts (user_id, content) values (%L, ''cross-owner fixture'')',
      target_user_id
    ),
    format(
      'insert into public.community_comments (post_id, user_id, content) values (%L, %L, ''cross-owner fixture'')',
      post_id,
      target_user_id
    ),
    format(
      'insert into public.community_reactions (post_id, user_id, reaction_type) values (%L, %L, ''clap'')',
      post_id,
      target_user_id
    ),
    format(
      'insert into public.chat_messages (channel_id, user_id, content) values (%L, %L, ''cross-owner fixture'')',
      channel_id,
      target_user_id
    ),
    format(
      'insert into public.chat_message_reads (user_id, channel_id) values (%L, %L)',
      target_user_id,
      channel_id
    ),
    format(
      'insert into public.notifications (user_id, type, title) values (%L, ''system'', ''cross-owner fixture'')',
      target_user_id
    )
  ] loop
    begin
      execute statement;
      raise exception 'cross-owner insert succeeded';
    exception when insufficient_privilege then
      null;
    end;
  end loop;
end;
$$;

create or replace function pg_temp.assert_admin_moderation()
returns void
language plpgsql
as $$
declare
  affected integer;
begin
  delete from public.community_reactions where id = '00000000-0000-0000-0000-000000003302';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'admin did not delete one reaction'; end if;

  delete from public.community_comments where id = '00000000-0000-0000-0000-000000002302';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'admin did not delete one comment'; end if;

  delete from public.chat_messages where id = '00000000-0000-0000-0000-000000004302';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'admin did not delete one message'; end if;

  delete from public.community_posts where id = '00000000-0000-0000-0000-000000001302';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'admin did not delete one post'; end if;
end;
$$;

create or replace function pg_temp.assert_personal_resources_blocked(
  read_id uuid,
  notification_id uuid,
  new_channel_id uuid
)
returns void
language plpgsql
as $$
declare
  affected integer;
  denied boolean;
begin
  if (select count(*) from public.chat_message_reads where id = read_id) <> 0
    or (select count(*) from public.notifications where id = notification_id) <> 0
  then
    raise exception 'inactive account could read personal resources';
  end if;

  update public.chat_message_reads set last_read_at = last_read_at where id = read_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a message read'; end if;

  update public.notifications set is_read = true where id = notification_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account updated a notification'; end if;

  delete from public.notifications where id = notification_id;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'inactive account deleted a notification'; end if;

  denied := false;
  begin
    insert into public.chat_message_reads (user_id, channel_id)
    values (auth.uid(), new_channel_id);
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'inactive account inserted a message read'; end if;

  denied := false;
  begin
    insert into public.notifications (user_id, type, title)
    values (auth.uid(), 'system', 'fixture');
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'inactive account inserted a notification'; end if;
end;
$$;

create or replace function pg_temp.assert_invalid_content_rejected(statements text[])
returns void
language plpgsql
as $$
declare
  statement text;
  denied boolean;
begin
  foreach statement in array statements loop
    denied := false;
    begin
      execute statement;
    exception when check_violation then
      denied := true;
    end;
    if not denied then raise exception 'invalid write succeeded: %', statement; end if;
  end loop;
end;
$$;

insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-000000000301', 'boundary-active@test.local'),
  ('00000000-0000-0000-0000-000000000302', 'boundary-suspended@test.local'),
  ('00000000-0000-0000-0000-000000000303', 'boundary-banned@test.local'),
  ('00000000-0000-0000-0000-000000000304', 'boundary-expired@test.local'),
  ('00000000-0000-0000-0000-000000000305', 'boundary-admin@test.local');

update public.user_roles
set role = 'admin'
where user_id = '00000000-0000-0000-0000-000000000305';

update public.account_status
set status = 'suspended', reason = 'test fixture'
where user_id = '00000000-0000-0000-0000-000000000302';

update public.account_status
set status = 'banned', reason = 'test fixture'
where user_id = '00000000-0000-0000-0000-000000000303';

insert into public.subscriptions (user_id, plan, status, current_period_end)
values
  ('00000000-0000-0000-0000-000000000301', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000302', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000303', 'comunidade', 'active', statement_timestamp() + interval '1 day'),
  ('00000000-0000-0000-0000-000000000304', 'comunidade', 'active', statement_timestamp() - interval '1 day');

insert into public.chat_channels (id, name, slug)
values
  ('00000000-0000-0000-0000-000000000701', 'Boundary fixtures', 'boundary-fixtures'),
  ('00000000-0000-0000-0000-000000000702', 'Boundary new reads', 'boundary-new-reads');

insert into public.community_posts (id, user_id, content)
values
  ('00000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000000301', 'active fixture'),
  ('00000000-0000-0000-0000-000000001302', '00000000-0000-0000-0000-000000000302', 'suspended fixture'),
  ('00000000-0000-0000-0000-000000001303', '00000000-0000-0000-0000-000000000303', 'banned fixture'),
  ('00000000-0000-0000-0000-000000001304', '00000000-0000-0000-0000-000000000304', 'expired fixture'),
  ('00000000-0000-0000-0000-000000001305', '00000000-0000-0000-0000-000000000305', 'admin fixture'),
  ('00000000-0000-0000-0000-000000001306', '00000000-0000-0000-0000-000000000301', 'active delete fixture');

insert into public.community_comments (id, post_id, user_id, content)
values
  ('00000000-0000-0000-0000-000000002301', '00000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000000301', 'active fixture'),
  ('00000000-0000-0000-0000-000000002302', '00000000-0000-0000-0000-000000001302', '00000000-0000-0000-0000-000000000302', 'suspended fixture'),
  ('00000000-0000-0000-0000-000000002303', '00000000-0000-0000-0000-000000001303', '00000000-0000-0000-0000-000000000303', 'banned fixture'),
  ('00000000-0000-0000-0000-000000002304', '00000000-0000-0000-0000-000000001304', '00000000-0000-0000-0000-000000000304', 'expired fixture'),
  ('00000000-0000-0000-0000-000000002306', '00000000-0000-0000-0000-000000001306', '00000000-0000-0000-0000-000000000301', 'active delete fixture');

insert into public.community_reactions (id, post_id, user_id, reaction_type)
values
  ('00000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000001301', '00000000-0000-0000-0000-000000000301', 'like'),
  ('00000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-000000001302', '00000000-0000-0000-0000-000000000302', 'like'),
  ('00000000-0000-0000-0000-000000003303', '00000000-0000-0000-0000-000000001303', '00000000-0000-0000-0000-000000000303', 'like'),
  ('00000000-0000-0000-0000-000000003304', '00000000-0000-0000-0000-000000001304', '00000000-0000-0000-0000-000000000304', 'like');

insert into public.chat_messages (id, channel_id, user_id, content)
values
  ('00000000-0000-0000-0000-000000004301', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000301', 'active fixture'),
  ('00000000-0000-0000-0000-000000004302', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000302', 'suspended fixture'),
  ('00000000-0000-0000-0000-000000004303', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000303', 'banned fixture'),
  ('00000000-0000-0000-0000-000000004304', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000304', 'expired fixture'),
  ('00000000-0000-0000-0000-000000004306', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000301', 'active delete fixture');

insert into public.chat_message_reads (id, user_id, channel_id)
values
  ('00000000-0000-0000-0000-000000005301', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000005302', '00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000005303', '00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000701'),
  ('00000000-0000-0000-0000-000000005304', '00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000701');

insert into public.notifications (id, user_id, type, title)
values
  ('00000000-0000-0000-0000-000000006301', '00000000-0000-0000-0000-000000000301', 'system', 'active fixture'),
  ('00000000-0000-0000-0000-000000006302', '00000000-0000-0000-0000-000000000302', 'system', 'suspended fixture'),
  ('00000000-0000-0000-0000-000000006303', '00000000-0000-0000-0000-000000000303', 'system', 'banned fixture'),
  ('00000000-0000-0000-0000-000000006304', '00000000-0000-0000-0000-000000000304', 'system', 'expired fixture'),
  ('00000000-0000-0000-0000-000000006306', '00000000-0000-0000-0000-000000000301', 'system', 'active delete fixture');

select has_table('public', 'live_credentials', 'live credentials are stored in a separate relation');
select hasnt_column('public', 'lives', 'stream_key', 'member-readable lives have no stream key column');
select hasnt_column('public', 'lives', 'rtmp_url', 'member-readable lives have no ingest URL column');
select col_is_pk('public', 'live_credentials', 'live_id', 'live credentials are keyed by live ID');
select fk_ok('public', 'live_credentials', 'live_id', 'public', 'lives', 'id', 'live credentials follow the live lifecycle');

select is(
  (
    select pg_catalog.array_agg(privileges.privilege_type order by privileges.privilege_type)
    from pg_catalog.pg_class as relations
    cross join lateral pg_catalog.aclexplode(relations.relacl) as privileges
    where relations.oid = 'public.live_credentials'::regclass
      and privileges.grantee = 'service_role'::regrole
  ),
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'service role has only CRUD privileges on live credentials'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as relations
    cross join lateral pg_catalog.aclexplode(relations.relacl) as privileges
    where relations.oid = 'public.live_credentials'::regclass
      and privileges.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)
  ) and not exists (
    select 1
    from pg_catalog.pg_attribute as columns
    cross join lateral pg_catalog.aclexplode(columns.attacl) as privileges
    where columns.attrelid = 'public.live_credentials'::regclass
      and columns.attnum > 0
      and not columns.attisdropped
      and privileges.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)
  ),
  'browser roles have no table or column privileges on live credentials'
);

select ok(
  coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.live_credentials')), false),
  'live credentials have RLS enabled as defense in depth'
);

select ok(
  coalesce((
    select prosecdef
      and proowner = 'postgres'::regrole
      and proconfig = array['search_path=""']
    from pg_catalog.pg_proc
    where oid = to_regprocedure('public.create_notification(uuid,text,text,text,text)')
  ), false),
  'create_notification is postgres-owned SECURITY DEFINER with an empty search path'
);

select ok(
  has_function_privilege('service_role', 'public.create_notification(uuid,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text)', 'EXECUTE')
    and not exists (
      select 1
      from pg_catalog.pg_proc as functions
      cross join lateral pg_catalog.aclexplode(functions.proacl) as privileges
      where functions.oid = to_regprocedure('public.create_notification(uuid,text,text,text,text)')
        and privileges.grantee = 0
        and privileges.privilege_type = 'EXECUTE'
    ),
  'only the trusted service role can directly execute create_notification'
);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
set local role authenticated;
select lives_ok(
  $$
    insert into public.community_comments (post_id, user_id, content)
    values (
      '00000000-0000-0000-0000-000000001305',
      '00000000-0000-0000-0000-000000000301',
      'trigger flow fixture'
    )
  $$,
  'trusted notification trigger flow still works for an entitled member'
);
reset role;

select is(
  (select count(*)::integer from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000305' and type = 'comment'),
  1,
  'comment trigger creates exactly one notification'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
set local role authenticated;
select lives_ok(
  $$
    insert into public.community_reactions (post_id, user_id, reaction_type)
    values (
      '00000000-0000-0000-0000-000000001305',
      '00000000-0000-0000-0000-000000000301',
      'love'
    )
  $$,
  'trusted reaction notification trigger works after RPC hardening'
);

select lives_ok(
  $$ select pg_temp.assert_active_owner_operations(
    '00000000-0000-0000-0000-000000001301',
    '00000000-0000-0000-0000-000000002301',
    '00000000-0000-0000-0000-000000003301',
    '00000000-0000-0000-0000-000000004301',
    '00000000-0000-0000-0000-000000005301',
    '00000000-0000-0000-0000-000000006301',
    '00000000-0000-0000-0000-000000000702',
    '00000000-0000-0000-0000-000000001306',
    '00000000-0000-0000-0000-000000002306',
    '00000000-0000-0000-0000-000000004306',
    '00000000-0000-0000-0000-000000006306'
  ) $$,
  'active owner can update, insert, and delete owned community resources'
);

select lives_ok(
  $$ select pg_temp.assert_cross_owner_blocked(
    '00000000-0000-0000-0000-000000000303',
    '00000000-0000-0000-0000-000000001303',
    '00000000-0000-0000-0000-000000002303',
    '00000000-0000-0000-0000-000000003303',
    '00000000-0000-0000-0000-000000004303',
    '00000000-0000-0000-0000-000000005303',
    '00000000-0000-0000-0000-000000006303',
    '00000000-0000-0000-0000-000000000701'
  ) $$,
  'active member cannot operate on another user resources'
);
reset role;

select is(
  (select count(*)::integer from public.notifications
   where user_id = '00000000-0000-0000-0000-000000000305' and type = 'reaction'),
  1,
  'reaction trigger creates exactly one notification'
);

select is(
  (
    select posts.content || ':' || comments.content || ':' || messages.content || ':' ||
      (select count(*)::text from public.community_reactions where id = '00000000-0000-0000-0000-000000003301') || ':' ||
      (select count(*)::text from public.community_posts where id in (
        '00000000-0000-0000-0000-000000001306',
        '00000000-0000-0000-0000-000000001310'
      )) || ':' ||
      (select count(*)::text from public.chat_messages where id in (
        '00000000-0000-0000-0000-000000004306',
        '00000000-0000-0000-0000-000000004310'
      ))
    from public.community_posts as posts
    cross join public.community_comments as comments
    cross join public.chat_messages as messages
    where posts.id = '00000000-0000-0000-0000-000000001301'
      and comments.id = '00000000-0000-0000-0000-000000002301'
      and messages.id = '00000000-0000-0000-0000-000000004301'
  ),
  'active post updated:active comment updated:active message updated:0:1:1',
  'active owner community operations persist their exact state changes'
);

select is(
  (
    select
      (select count(*) from public.chat_message_reads
       where user_id = '00000000-0000-0000-0000-000000000301'
         and channel_id = '00000000-0000-0000-0000-000000000702')::text || ':' ||
      (select is_read::text from public.notifications
       where id = '00000000-0000-0000-0000-000000006301') || ':' ||
      (select count(*) from public.notifications
       where user_id = '00000000-0000-0000-0000-000000000301'
         and title = 'active insert fixture')::text || ':' ||
      (select count(*) from public.notifications
       where id = '00000000-0000-0000-0000-000000006306')::text
  ),
  '1:true:1:0',
  'active owner personal-resource operations persist their exact state changes'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
set local role authenticated;
select lives_ok(
  $$ select pg_temp.assert_community_blocked(
    '00000000-0000-0000-0000-000000001302',
    '00000000-0000-0000-0000-000000002302',
    '00000000-0000-0000-0000-000000003302',
    '00000000-0000-0000-0000-000000004302',
    '00000000-0000-0000-0000-000000000701'
  ) $$,
  'suspended member cannot read, update, or delete community resources'
);
select lives_ok(
  $$ select pg_temp.assert_personal_resources_blocked(
    '00000000-0000-0000-0000-000000005302',
    '00000000-0000-0000-0000-000000006302',
    '00000000-0000-0000-0000-000000000702'
  ) $$,
  'suspended member cannot operate on message reads or notifications'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000303', true);
set local role authenticated;
select lives_ok(
  $$ select pg_temp.assert_community_blocked(
    '00000000-0000-0000-0000-000000001303',
    '00000000-0000-0000-0000-000000002303',
    '00000000-0000-0000-0000-000000003303',
    '00000000-0000-0000-0000-000000004303',
    '00000000-0000-0000-0000-000000000701'
  ) $$,
  'banned member cannot read, update, or delete community resources'
);
select lives_ok(
  $$ select pg_temp.assert_personal_resources_blocked(
    '00000000-0000-0000-0000-000000005303',
    '00000000-0000-0000-0000-000000006303',
    '00000000-0000-0000-0000-000000000702'
  ) $$,
  'banned member cannot operate on message reads or notifications'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000304', true);
set local role authenticated;
select lives_ok(
  $$ select pg_temp.assert_community_blocked(
    '00000000-0000-0000-0000-000000001304',
    '00000000-0000-0000-0000-000000002304',
    '00000000-0000-0000-0000-000000003304',
    '00000000-0000-0000-0000-000000004304',
    '00000000-0000-0000-0000-000000000701'
  ) $$,
  'expired member cannot read, update, or delete community resources'
);
select lives_ok(
  $$ select pg_temp.assert_personal_resources_blocked(
    '00000000-0000-0000-0000-000000005304',
    '00000000-0000-0000-0000-000000006304',
    '00000000-0000-0000-0000-000000000702'
  ) $$,
  'expired member cannot operate on message reads or notifications'
);
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000305', true);
set local role authenticated;
select lives_ok(
  $$ select pg_temp.assert_admin_moderation() $$,
  'active admin retains community moderation capability'
);
reset role;

select is(
  (
    select
      (select count(*) from public.community_posts where id = '00000000-0000-0000-0000-000000001302') +
      (select count(*) from public.community_comments where id = '00000000-0000-0000-0000-000000002302') +
      (select count(*) from public.community_reactions where id = '00000000-0000-0000-0000-000000003302') +
      (select count(*) from public.chat_messages where id = '00000000-0000-0000-0000-000000004302')
  )::integer,
  0,
  'admin moderation removes every targeted row'
);

select lives_ok(
  $test$
    select pg_temp.assert_invalid_content_rejected(array[
      'insert into public.community_posts (user_id, content) values (''00000000-0000-0000-0000-000000000301'', ''   '')',
      'insert into public.community_posts (user_id, content) values (''00000000-0000-0000-0000-000000000301'', repeat(''p'', 5001))',
      'insert into public.community_posts (user_id, content, category) values (''00000000-0000-0000-0000-000000000301'', ''valid'', ''invalid'')',
      'insert into public.community_posts (user_id, content, category) values (''00000000-0000-0000-0000-000000000301'', ''valid'', null)',
      'insert into public.community_comments (post_id, user_id, content) values (''00000000-0000-0000-0000-000000001301'', ''00000000-0000-0000-0000-000000000301'', ''   '')',
      'insert into public.community_comments (post_id, user_id, content) values (''00000000-0000-0000-0000-000000001301'', ''00000000-0000-0000-0000-000000000301'', repeat(''c'', 2001))',
      'insert into public.chat_messages (channel_id, user_id, content) values (''00000000-0000-0000-0000-000000000701'', ''00000000-0000-0000-0000-000000000301'', ''   '')',
      'insert into public.chat_messages (channel_id, user_id, content) values (''00000000-0000-0000-0000-000000000701'', ''00000000-0000-0000-0000-000000000301'', repeat(''m'', 1001))'
    ])
  $test$,
  'database constraints reject blank, oversized, and invalid-category community writes'
);

select lives_ok(
  $test$
    select pg_temp.assert_invalid_content_rejected(array[
      'insert into public.community_posts (user_id, content) values (''00000000-0000-0000-0000-000000000301'', chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || '' '')',
      'insert into public.community_comments (post_id, user_id, content) values (''00000000-0000-0000-0000-000000001301'', ''00000000-0000-0000-0000-000000000301'', chr(9) || chr(10) || chr(11) || chr(12) || chr(13))',
      'insert into public.chat_messages (channel_id, user_id, content) values (''00000000-0000-0000-0000-000000000701'', ''00000000-0000-0000-0000-000000000301'', chr(9) || chr(10) || chr(11) || chr(12) || chr(13))'
    ])
  $test$,
  'database constraints reject tab, newline, and other PostgreSQL whitespace-only content'
);

select lives_ok(
  $test$
    select pg_temp.assert_invalid_content_rejected(array[
      'insert into public.community_posts (user_id, content) values (''00000000-0000-0000-0000-000000000301'', repeat('' '', 5000) || ''x'' || repeat('' '', 5000))',
      'insert into public.community_comments (post_id, user_id, content) values (''00000000-0000-0000-0000-000000001301'', ''00000000-0000-0000-0000-000000000301'', repeat('' '', 2000) || ''x'' || repeat('' '', 2000))',
      'insert into public.chat_messages (channel_id, user_id, content) values (''00000000-0000-0000-0000-000000000701'', ''00000000-0000-0000-0000-000000000301'', repeat('' '', 1000) || ''x'' || repeat('' '', 1000))'
    ])
  $test$,
  'database constraints bound raw stored length despite valid trimmed content'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint
    where conrelid in (
      'public.community_posts'::regclass,
      'public.community_comments'::regclass,
      'public.chat_messages'::regclass
    )
      and conname like '%_content_check'
      and not convalidated
  ),
  3,
  'content constraints remain NOT VALID for unknown legacy rows'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint
    where conrelid = 'public.community_posts'::regclass
      and conname = 'community_posts_category_check'
      and not convalidated
  ),
  1,
  'category constraint remains NOT VALID for unknown legacy rows'
);

select * from finish();
rollback;
